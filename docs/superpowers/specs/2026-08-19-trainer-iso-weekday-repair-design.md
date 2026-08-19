# Reparación ISO de días en rutinas profesionales

**Fecha:** 2026-08-19 · **Estado:** Diseño aprobado · **Producto:** Vekira
**Migración final:** `049_trainer_iso_weekday_repair.sql`

## 1. Resumen

Las rutinas profesionales usan dos representaciones del mismo día:

- las plantillas y sus snapshots usan ISO 8601 (`1=lunes` … `7=domingo`);
- `workouts.day_of_week` también está restringido por el esquema real a ISO
  8601 (`CHECK (day_of_week BETWEEN 1 AND 7)`).

Sin embargo, las funciones que materializan propuestas y revisiones restan uno
al día del snapshot. Esto provoca dos fallos distintos: una rutina de lunes
intenta insertar `0` y viola el `CHECK`; una rutina de martes a domingo puede
quedar almacenada un día antes. Las proyecciones de seguimiento endurecidas en
la migración 045 repiten esa resta al buscar el workout materializado.

La solución será una migración aditiva y transaccional que:

1. establece ISO `1..7` como única convención, sin conversiones;
2. repara únicamente materializaciones profesionales existentes usando su
   snapshot inmutable como fuente de verdad;
3. reemplaza las cuatro funciones afectadas conservando firmas, permisos y
   contratos;
4. añade una defensa de base de datos para impedir nuevas divergencias;
5. actualiza el preflight operativo, el harness PostgreSQL y la documentación.

No se editarán las migraciones 043, 045, 046, 047-product ni 048 ya desplegadas. La 049 será la capa
correctiva para instalaciones existentes y nuevas.

## 2. Evidencia y causa raíz

La convención válida está definida en:

- `supabase/migrations/004_ai_plan_fields.sql`: `workouts.day_of_week` tiene
  rango `1..7`;
- `supabase/migrations/043_trainer_programming.sql`:
  `trainer_template_workouts.day_of_week` tiene rango `1..7` y el snapshot
  conserva ese valor en `dayOfWeek`;
- `src/lib/coaching/programs.ts`: la validación de snapshots acepta `1..7`.

Las inconsistencias están en:

- `propose_trainer_assignment`: inserta `snapshot.dayOfWeek - 1`;
- `publish_trainer_assignment_revision`: inserta
  `snapshot.dayOfWeek - 1`;
- `get_coach_clients_summary`: busca el workout con
  `snapshot.dayOfWeek - 1`;
- `get_coach_client_insights`: repite la búsqueda desplazada.

El harness `scripts/test-trainer-programming-db.mjs` crea
`workouts.day_of_week` sin el `CHECK` de producción. Además, fixtures de las
pruebas 043/044 almacenan explícitamente el día desplazado. Por eso la suite
actual puede estar verde mientras la propuesta de un lunes falla en el esquema
real.

## 3. Objetivos

1. Permitir propuestas y revisiones profesionales para cualquier día ISO,
   incluidos lunes (`1`) y domingo (`7`).
2. Hacer que snapshot, plan materializado, autorización de sesión y proyecciones
   de seguimiento compartan la misma convención.
3. Reparar datos existentes sin modificar snapshots, auditoría ni historial de
   sesiones.
4. Fallar de forma atómica si un registro no puede relacionarse de manera
   inequívoca con su snapshot.
5. Evitar que una regresión futura vuelva a persistir días desplazados.
6. Cubrir el esquema real y la reejecución de migraciones en pruebas.

## 4. Fuera de alcance

- cambiar a la convención JavaScript `0..6`;
- reescribir plantillas o snapshots profesionales inmutables;
- modificar planes personales;
- alterar sesiones completadas, `progress_logs` o snapshots de autorización ya
  emitidos;
- rediseñar el calendario, la zona horaria o la selección de “hoy”;
- cambiar firmas públicas de RPC o payloads consumidos por la aplicación;
- corregir en esta migración otras inconsistencias de ajustes o medidas.

## 5. Invariante canónica

Para todo workout de un plan con `source_type = 'trainer_assigned'`:

```text
workouts.day_of_week
  = trainer_assignment_versions.snapshot.workouts[*].dayOfWeek
  ∈ {1, 2, 3, 4, 5, 6, 7}
```

La identidad entre una fila materializada y su entrada de snapshot se resuelve
por:

```text
workout.plan_id = version.materialized_plan_id
workout.plan_id = plan.id
plan.trainer_assignment_version_id = version.id
workout.order_in_plan = snapshotWorkout.orderInPlan
```

`orderInPlan` es la clave correcta para la reparación porque la tabla
materializada no conserva `sourceTemplateWorkoutId`, mientras que la plantilla
impone unicidad tanto de día como de orden. No se inferirá el día aplicando
`+1`: el snapshot publicado es la evidencia autoritativa.

## 6. Alternativas consideradas

### A. Cambiar todo el sistema a `0..6`

Se descarta. Obliga a retirar el `CHECK`, contradice la validación de dominio y
amplía el cambio a calendario, sesiones y datos personales.

### B. Corregir solo las cuatro expresiones

Es el hotfix mínimo, pero deja datos ya desplazados y no impide una regresión
posterior. También conserva el punto ciego del harness.

### C. Migración aditiva con reparación exacta y defensa de integridad

Es la opción elegida. Conserva interfaces, corrige los datos recuperables y
hace que una futura desviación falle en la base de datos antes de persistirse.

## 7. Diseño de la migración 049

### 7.1 Transacción y concurrencia

La migración completa se ejecutará en una sola transacción. Antes del preflight
y del backfill adquirirá locks `SHARE ROW EXCLUSIVE`, compatibles con lectura,
sobre `trainer_plan_assignments`, `trainer_assignment_versions`,
`workout_plans` y `workouts`, siempre en ese orden.

El objetivo es esperar a que terminen publicaciones iniciadas antes del
despliegue y bloquear nuevas materializaciones durante la reparación. Las
lecturas normales podrán continuar. Si el volumen remoto hace que el lock no
pueda obtenerse dentro de la ventana aprobada, se abortará sin cambios y se
reintentará con las publicaciones profesionales pausadas.

### 7.2 Preflight de datos

Antes de ejecutar cualquier `UPDATE`, la migración comprobará para cada plan
profesional materializado:

1. que existe exactamente una versión enlazada en ambas direcciones;
2. que `snapshot.schemaVersion = 1` y `snapshot.workouts` es un array;
3. que cada entrada tiene `dayOfWeek` y `orderInPlan` enteros en `1..7`;
4. que no hay días ni órdenes duplicados dentro de la versión;
5. que cada workout materializado coincide con exactamente una entrada por
   `order_in_plan`;
6. que no existen entradas de snapshot sin workout ni workouts sin entrada;
7. que el número de workouts coincide en ambas representaciones.

Las conversiones JSON solo se harán después de validar el formato textual, para
que un valor malformado produzca un error de dominio controlado y no un cast
opaco. Cualquier anomalía lanzará
`TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED` con conteos agregados, nunca IDs,
nombres ni snapshots. La transacción quedará sin cambios.

### 7.3 Backfill dirigido

Una CTE construirá la relación esperada
`(workout_id, expected_day_of_week)` desde plan, versión y snapshot. Después:

- se habilitará localmente
  `app.trainer_prescription_mutation = 'authorized'` para atravesar únicamente
  el guard de recetas bloqueadas en la sesión confiable de migración;
- se actualizará `workouts.day_of_week` al valor exacto del snapshot;
- el `UPDATE` se limitará a `source_type = 'trainer_assigned'` y a filas cuyo
  valor sea distinto con `IS DISTINCT FROM`;
- no se tocarán nombre, orden, ejercicios, versión, estado ni timestamps de
  dominio.

En un esquema real no deberían existir lunes materializados como `0` porque el
`CHECK` los rechazó. Sí pueden existir días `1..6` desplazados desde snapshots
`2..7`; todos se recuperan de forma inequívoca mediante el snapshot.

La operación no insertará un evento profesional por workout: es una reparación
de proyección, no una acción del entrenador. El despliegue registrará solo los
conteos agregados de filas examinadas y corregidas.

### 7.4 Postcondiciones

Antes del commit se repetirán las validaciones y se abortará si:

- queda alguna diferencia entre snapshot y materialización;
- algún workout profesional queda fuera de `1..7`;
- cambió una fila de plan personal;
- la cardinalidad profesional difiere de la observada tras adquirir los locks.

La reejecución debe producir cero actualizaciones y conservar exactamente los
mismos datos.

### 7.5 Funciones reemplazadas

La migración copiará las definiciones finales vigentes y modificará únicamente
la semántica del día:

| Función | Cambio |
|---|---|
| `propose_trainer_assignment(UUID, UUID, TEXT, TEXT)` | insertar `dayOfWeek` sin restar uno |
| `publish_trainer_assignment_revision(UUID, UUID, TEXT, TEXT)` | insertar `dayOfWeek` sin restar uno |
| `get_coach_clients_summary()` | unir por igualdad ISO exacta |
| `get_coach_client_insights(UUID, DATE, DATE)` | unir por igualdad ISO exacta |

Se conservarán `SECURITY DEFINER`, `search_path`, owner `postgres`, firmas,
idempotencia, locks, payloads y códigos de error. Al final se reaplicarán de
forma explícita los `REVOKE` y `GRANT` actuales para que `CREATE OR REPLACE` no
deje permisos dependientes del estado previo.

### 7.6 Defensa de integridad

La 049 añadirá un trigger `BEFORE INSERT OR UPDATE OF plan_id, day_of_week,
order_in_plan` sobre `workouts`.

Para planes personales será un no-op. Para un plan profesional, el trigger:

1. resolverá la versión enlazada por `trainer_assignment_version_id`;
2. buscará exactamente una entrada de snapshot por `orderInPlan`;
3. validará que su día sea ISO `1..7`;
4. exigirá igualdad exacta con `NEW.day_of_week`.

Una divergencia lanzará `TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH`. Este guard no
reemplaza la validación de snapshot; protege la frontera de persistencia incluso
si una RPC antigua o una reparación manual vuelve a introducir una resta.

El trigger tendrá owner y ACL cerradas igual que los guards existentes. Su
creación será reejecutable mediante `CREATE OR REPLACE FUNCTION` y
`DROP TRIGGER IF EXISTS` seguido de `CREATE TRIGGER`.

### 7.7 Orden interno

La secuencia dentro de la transacción será:

1. adquirir los locks;
2. ejecutar el preflight de datos;
3. autorizar localmente el mantenimiento y aplicar el backfill;
4. comprobar las postcondiciones;
5. reemplazar las cuatro funciones;
6. instalar el trigger defensivo;
7. actualizar el preflight operativo y reaplicar owner/ACL;
8. hacer commit.

### 7.8 Preflight operativo

`trainer_security_preflight()` se redefinirá para devolver `49` y comprobar,
además del catálogo actual:

- `release_session_authorization(UUID, UUID)` de la migración 046;
- la función y el trigger de integridad ISO de la 049;
- las cuatro RPC/proyecciones reemplazadas.

El preflight seguirá siendo de solo lectura y no expondrá datos. El runbook
añadirá una consulta operativa privilegiada que devuelve exclusivamente el
conteo de divergencias; el único resultado aceptable será cero.

## 8. Sesiones e historial

Las autorizaciones ya emitidas y las sesiones completadas conservan su snapshot
original. No se reescribirán `session_authorizations.session_context_snapshot`,
`progress_logs.session_context_snapshot` ni resultados de ejercicios.

La corrección afecta la programación viva y las autorizaciones futuras. Una
autorización en curso sigue identificando el mismo `workout_id`, `plan_id` y
versión, por lo que puede finalizar bajo su snapshot congelado sin mezclar
versiones. Esto preserva la garantía existente de continuidad de sesión.

## 9. Pruebas

### 9.1 Contratos estáticos

Se añadirá una prueba de la migración 049 que verifique:

- presencia de preflight, backfill, postcondición y trigger;
- reemplazo de las cuatro funciones y conservación de ACL;
- ausencia de `dayOfWeek - 1` en las definiciones finales;
- marcador operativo `49`;
- inclusión de la 049 al final del runner y del contrato de reejecución.

Las pruebas no exigirán editar 043/045: esos archivos son historia desplegada.

### 9.2 Harness PostgreSQL

`scripts/test-trainer-programming-db.mjs` deberá reproducir el esquema real con:

```sql
CHECK (day_of_week BETWEEN 1 AND 7)
```

El runner aplicará 040–049 en orden, incluidas
`047_product_notification_preferences_insert.sql` y
`048_profile_weight_measurement_sync.sql`, y ejecutará las pruebas de comportamiento
solo después de que la 049 haya sustituido las funciones antiguas. Para probar
la recuperación, sembrará antes de la 049 una versión no-lunes válida para el
`CHECK`, por ejemplo snapshot `dayOfWeek=7` y materialización `day_of_week=6`.

En la prueba de reejecución, 040–049 se volverán a aplicar en orden y la 049 será
siempre la última capa. El snapshot de preservación antes/después deberá ser
idéntico.

### 9.3 pgTAP de comportamiento

Casos mínimos:

1. propuesta con lunes: vive y materializa `1`;
2. propuesta con domingo: vive y materializa `7`;
3. revisión: conserva exactamente todos los días del nuevo snapshot;
4. backfill legado: corrige `6 → 7` desde snapshot sin tocar datos personales;
5. dato ambiguo o snapshot malformado: toda la migración falla sin cambios;
6. resumen e insights: resuelven el workout materializado por igualdad ISO;
7. trigger defensivo: rechaza una inserción profesional desplazada;
8. reejecución: no cambia filas ni auditoría;
9. continuidad: una autorización previa conserva su snapshot al publicarse o
   repararse el plan vivo.

Los fixtures existentes de `044_trainer_insights_test.sql` que usan `- 1` se
actualizarán a igualdad ISO.

### 9.4 Verificación de repositorio

Antes de integrar:

```text
pnpm test:db:trainers
pnpm test
pnpm type-check
pnpm lint
git diff --check
```

El test Docker es obligatorio porque la unidad TypeScript no puede validar
constraints, triggers, locks ni reparación transaccional.

## 10. Despliegue

1. Confirmar backup/PITR y una restauración reciente según el runbook.
2. Pausar propuestas y publicaciones de revisiones si el piloto está activo.
3. Ejecutar la auditoría de solo lectura; si hay ambigüedades, detener y
   resolverlas antes del despliegue.
4. Aplicar 046, 047, 048 y 049 en orden mediante el migrador normal; no editar 043/045/046/047/048.
5. Confirmar `trainer_security_preflight() = 49` y divergencias `= 0`.
6. Ejecutar smoke con una plantilla sintética que incluya lunes y domingo.
7. Reanudar publicaciones y observar códigos de error agregados, sin PII.

La aplicación puede desplegarse después de la base de datos porque no cambian
firmas ni payloads. Si el lock excede la ventana operativa, la transacción se
aborta y las escrituras permanecen pausadas hasta un nuevo intento.

## 11. Rollback y respuesta a incidentes

Antes del commit de la migración, cualquier fallo revierte funciones y datos de
forma automática.

Después de un despliegue exitoso no se restaurará la resta ni se aplicará una
down migration de datos. Eso reintroduciría el defecto y podría corromper días
ya correctos. El rollback operativo será:

1. detener nuevas propuestas y revisiones;
2. mantener aplicadas las migraciones hasta la 049 y los datos reparados;
3. volver a una versión de aplicación compatible si fuera necesario;
4. investigar con conteos agregados y restauración aislada;
5. corregir hacia delante con otra migración revisada.

No se borrarán snapshots, planes, sesiones ni auditoría.

## 12. Documentación que debe actualizar la implementación

- `README.md`: lista completa y ordenada de migraciones hasta la 049;
- `docs/operations/trainer-marketplace-runbook.md`: orden 040–049, preflight
  `49`, auditoría ISO, smoke lunes/domingo y rollback hacia delante;
- `docs/operations/trainer-pilot-checklist.md`: puerta de salida con 040–049,
  preflight `49` e integridad ISO igual a cero.

## 13. Criterios de aceptación

La reparación estará lista cuando:

- lunes y domingo se materialicen como `1` y `7` bajo el `CHECK` real;
- toda materialización profesional coincida exactamente con su snapshot;
- las proyecciones de coach resuelvan el workout correcto;
- planes personales, snapshots y sesiones históricas permanezcan intactos;
- una escritura profesional desplazada sea rechazada por la base de datos;
- la migración falle limpiamente ante datos ambiguos y sea no-op al reejecutar;
- el preflight remoto devuelva `49` y la auditoría de divergencias devuelva
  cero;
- las suites PostgreSQL, unitarias, tipos y lint terminen en verde;
- runbook, checklist y README describan el estado real del esquema.

## 14. Riesgos residuales

- Un snapshot histórico malformado bloqueará la migración. Es intencional: se
  requiere una reparación específica revisada, no una inferencia silenciosa.
- El lock puede esperar en una base con publicaciones activas. La mitigación es
  una ventana corta y pausar esas dos operaciones.
- Los snapshots de sesiones antiguas pueden mostrar el día con el que fueron
  autorizadas. Se conservan como evidencia histórica; solo la programación viva
  queda corregida.
- Las migraciones antiguas siguen conteniendo la resta. La ejecución ordenada y
  el trigger de la 049 aseguran que la capa final sea correcta y que una
  reejecución incompleta no pueda persistir datos desplazados.
