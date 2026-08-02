# Continuidad histórica y ciclo seguro de planes

## Contexto confirmado

La aplicación trata las sesiones completadas como dependientes de entidades editables del plan. Cuando una rutina se elimina, `progress_logs.workout_id` queda en `NULL`, y las vistas de historial, calendario, progreso, dashboard y coach excluyen esas sesiones.

La auditoría agregada de producción del 2 de agosto de 2026 encontró:

- 27 sesiones completadas en total.
- 19 sesiones con `workout_id = NULL`, pertenecientes a un usuario.
- 49 registros de ejercicios asociados a esas 19 sesiones, sin sesiones vacías.
- 7 sesiones con `session_result_snapshot`; 12 son anteriores a ese snapshot.
- 0 claves foráneas rotas, 0 usuarios con varios planes activos y 0 cuentas free sobre el límite.

Los registros de ejercicios y las métricas son recuperables. El nombre exacto de una rutina ya eliminada no siempre puede reconstruirse y usará un fallback explícito.

## Objetivos

1. Una sesión completada debe seguir visible y contabilizada después de regenerar, activar, archivar o retirar un plan.
2. Las sesiones nuevas deben conservar el contexto visible que existía al completarlas, aunque luego cambien nombres, ejercicios o planes.
3. Cambiar de plan durante una semana debe conservar la evidencia ya realizada en el timeline y usar el plan nuevo para las sesiones todavía no realizadas.
4. Generar, activar, retirar y reemplazar planes no puede dejar al usuario sin plan activo por un fallo parcial.
5. Una sesión autorizada antes de un cambio de plan debe poder guardarse exactamente una vez después del cambio.
6. La regeneración debe usar el plan esperado, conservar su familia/versionado y ser idempotente por operación.
7. Las 19 sesiones ocultas detectadas deben reaparecer sin alterar sus métricas ni fechas.

## No objetivos

- No se reconstruirán nombres históricos que ya no existen en ninguna tabla o snapshot.
- No se cambiarán los límites comerciales free/pro, excepto para contar familias guardadas en lugar de versiones históricas.
- No se rediseñará visualmente toda la aplicación; solo los estados necesarios para representar evidencia de un plan anterior.
- No se eliminarán físicamente versiones históricas en este alcance.

## Alternativas consideradas

### A. Snapshot inmutable, familias de planes y archivado lógico — seleccionada

Cada sesión guarda un snapshot de contexto; las versiones de un mismo plan comparten `family_id`; reemplazar una versión la marca como superada y retirar un plan archiva su familia sin borrar rutinas. Todas las operaciones de ciclo de vida críticas se serializan en PostgreSQL.

Ventajas: resuelve la causa raíz, recupera datos existentes, conserva nombres futuros, evita carreras y separa claramente planificación de evidencia. Desventaja: requiere migración, cambios de lectura y nuevas pruebas de integración.

### B. Conservar para siempre todas las rutinas borradas

Se podría prohibir el borrado de cualquier workout que tenga logs y mantener las consultas actuales.

Ventaja: cambio pequeño. Desventajas: el historial seguiría mostrando nombres mutables, la UI continuaría dependiendo de entidades de planificación, quedarían rutinas huérfanas y no se recuperarían las 19 sesiones ya ocultas sin cambiar lectores.

### C. Quitar únicamente los filtros `workout_id IS NOT NULL`

Ventaja: restaura inmediatamente sesiones y métricas. Desventajas: no conserva nombres futuros, no corrige carreras de activación, sesiones en curso, idempotencia ni linaje. Se usará como parte del hotfix, no como solución completa.

## Modelo de datos

### Contexto inmutable de sesión

`progress_logs` incorporará `session_context_snapshot JSONB`. Su contrato versión 1 será:

```ts
interface SessionContextSnapshotV1 {
  version: 1
  workout: {
    id: string
    name: string
    focus: string | null
    dayOfWeek: number | null
  }
  plan: {
    id: string
    familyId: string
    name: string
    weekNumber: number | null
  } | null
  exercises: Array<{
    exerciseId: string
    name: string
    nameEs: string | null
    muscleGroups: string[]
    muscleGroupsEs: string[]
    isCompound: boolean
  }>
}
```

`workout_id` seguirá siendo una referencia opcional al origen, pero ningún lector podrá exigir que exista. `session_result_snapshot` mantendrá exclusivamente PRs y sugerencias de progresión.

La migración hará backfill de `session_context_snapshot` para sesiones cuyo workout todavía existe. Las sesiones ya desasociadas se mostrarán con el fallback traducido “Entrenamiento” y conservarán ejercicio, fecha, duración, volumen, RPE y notas.

### Familias y versiones de planes

`workout_plans` incorporará:

- `family_id UUID NOT NULL DEFAULT gen_random_uuid()` para agrupar versiones.
- `superseded_at TIMESTAMPTZ` para versiones sustituidas por regeneración o ajuste.
- `retired_at TIMESTAMPTZ` para familias retiradas por el usuario.
- `generation_request_id UUID` con unicidad por usuario para idempotencia.

Los planes existentes recibirán una familia estable. Una regeneración o ajuste hereda `family_id`; un plan inicial, manual, importado o copiado crea una familia nueva. La biblioteca muestra una sola versión vigente por familia y los límites se aplican a familias no retiradas, no a versiones.

No se borrarán físicamente planes, workouts ni ejercicios del plan como parte del flujo normal. `parent_plan_id` conservará el linaje entre versiones.

### Autorización de sesiones en curso

Se añadirá `session_authorizations` con:

- `client_session_id UUID PRIMARY KEY`
- `user_id`, `workout_id`, `plan_id`
- `started_at`, `expires_at`, `consumed_at`
- `context_snapshot JSONB`

`authorize_session_start` validará propiedad, plan activo, ventana de entrenamiento y reglas de duplicados antes de iniciar. La autorización durará 12 horas. `save_session_log_atomic` exigirá una autorización coincidente, guardará su snapshot y la consumirá en la misma transacción. Los reintentos con el mismo `client_session_id` devolverán el log ya creado.

## Flujo de generación y ciclo de vida

### Regeneración o ajuste

1. El cliente crea un `requestId` estable para la operación.
2. El servidor carga y valida el plan activo; una regeneración semanal sin plan activo falla sin modificar estado.
3. El motor genera la versión candidata usando el historial global de ejercicios y la adherencia de la versión fuente.
4. `create_engine_plan` toma un advisory lock por usuario.
5. Dentro de la misma transacción valida que el plan activo siga siendo `expectedParentPlanId`.
6. Si `requestId` ya existe, devuelve la misma versión.
7. Inserta la nueva versión con la misma familia, marca la fuente como superada, desactiva la fuente y activa la nueva.
8. Registra el evento de generación dentro de la transacción.

Una generación inicial crea otra familia guardada y respeta el límite de dos familias para cuentas free.

### Activación

`activate_plan` será un RPC transaccional con advisory lock. Validará propiedad y que la versión sea la vigente y no retirada. Solo después desactivará el plan anterior y activará el seleccionado. Un fallo conserva el estado anterior.

### Retiro

`retire_plan_family` marcará todas las versiones de la familia con `retired_at` y nunca borrará workouts. Si se retira el plan activo, activará en la misma transacción la versión vigente más reciente de otra familia; si no existe, dejará al usuario explícitamente sin plan.

La UI pedirá confirmación e informará que el historial no se elimina.

### Creación manual

El plan y sus workouts se crearán inicialmente inactivos. Solo cuando todos existan se llamará al RPC de activación. Si falla la creación, el plan anterior seguirá activo y el plan incompleto podrá limpiarse porque todavía no tiene sesiones.

## Lectura histórica y continuidad semanal

Todos los lectores incluirán `progress_logs` aunque `workout_id` sea nulo:

- Historial y detalle.
- Calendario y su RPC.
- Progreso y gráficas por ejercicio.
- Dashboard y su RPC.
- Contexto del coach.
- Cálculos de racha, volumen y récords.

El nombre/foco se resolverá con prioridad:

1. `session_context_snapshot`.
2. Relación actual con `workouts` para registros antiguos.
3. Fallback traducido “Entrenamiento”.

En el dashboard, una sesión completada se representa por su fecha real aunque pertenezca a una versión anterior. En días futuros se muestra la rutina del plan activo. Si ya hubo una sesión ese día, la nueva rutina no se marca falsamente como completada, pero el día se presenta como “entrenamiento realizado” y no ofrece iniciar otra sesión.

## Recuperación de datos existentes

La migración no inventará nombres. Para las 19 sesiones ocultas:

- Se eliminarán los filtros que las excluyen.
- Se conservarán sus 49 registros de ejercicios.
- Se recalcularán volumen, récords, calendario y racha a partir de esos registros.
- Las 7 con snapshot de resultado conservarán PRs/progresiones.
- Las 12 restantes usarán los cálculos históricos actuales.
- El título será “Entrenamiento” cuando no haya otra fuente verificable.

La migración incluirá consultas de auditoría que comprueben antes y después el total de logs, logs desasociados y exercise logs vinculados. Ninguna operación de backfill eliminará filas.

## Manejo de errores y concurrencia

- Los errores de lectura del plan activo detienen generación.
- Los errores de archivado, activación o límites revierten toda la transacción.
- Un `expectedParentPlanId` obsoleto devuelve conflicto y obliga a recargar.
- La idempotencia usa `generation_request_id`, no una ventana temporal ambigua.
- La autorización de sesión evita perder un entrenamiento por cambio de plan y evita dobles guardados.
- Los fallos inesperados se registran sin incluir perfil, notas médicas ni contenido libre.

## Estrategia de pruebas

### Migración y contratos

- La migración no contiene `DELETE`, `TRUNCATE` ni cascadas nuevas.
- Backfill conserva el número de `progress_logs` y `exercise_logs`.
- Los RPC incluyen locks, validación de usuario y transacciones implícitas.
- Tipos TypeScript coinciden con el esquema nuevo.

### Dominio y lectores

- Resolver snapshot, relación legacy y fallback.
- Incluir logs con `workout_id = NULL` en historial, calendario, progreso, dashboard y coach.
- Recuperar volumen, racha y récords de sesiones desasociadas.
- Mostrar evidencia de plan anterior sin marcar como completada una rutina nueva diferente.

### Ciclo de vida

- Completar en plan A, regenerar a A2 y conservar historial.
- Completar en A, activar B y conservar historial/timeline.
- Retirar A y conservar historial.
- Un fallo de activación mantiene A activo.
- Dos regeneraciones con el mismo `requestId` crean una sola versión.
- Una regeneración basada en un padre obsoleto no sustituye el plan actual.
- Una cuenta free cuenta familias, no versiones.

### Sesión en curso

- Autorizar en A, activar B, completar A y guardar exactamente una vez.
- Reintentar el guardado devuelve el mismo log.
- Una autorización vencida o ajena es rechazada.

### Aceptación end-to-end

El recorrido obligatorio será: completar rutina A → regenerar/cambiar/retirar A → comprobar Historial, Calendario, Progreso, Dashboard y detalle → confirmar que fecha, ejercicios, volumen, racha y navegación permanecen disponibles.

## Despliegue

1. Ejecutar auditoría previa de solo lectura.
2. Aplicar migración aditiva y backfill.
3. Desplegar lectores compatibles con snapshot y legacy.
4. Desplegar ciclo de vida atómico y autorizaciones.
5. Ejecutar smoke test con cuenta de prueba.
6. Repetir auditoría y confirmar que las 19 sesiones aparecen y que los conteos físicos no disminuyeron.

El cambio es compatible hacia atrás durante el despliegue: los lectores aceptan snapshot nulo y las sesiones antiguas siguen usando relaciones o fallback.
