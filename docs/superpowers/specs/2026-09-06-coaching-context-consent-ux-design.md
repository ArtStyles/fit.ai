# Contexto visible de acompañamiento y consentimiento guiado

**Fecha:** 2026-09-06

**Estado:** Diseño aprobado

**Producto:** Vekira

## 1. Resumen

Vekira mostrará la relación cliente-entrenador como un estado de producto persistente, no
como información que solo aparece al entrar al perfil público del profesional. El entrenador
contratado quedará señalado en el directorio y el Dashboard personal incorporará un resumen
compacto del acompañamiento con la siguiente acción relevante.

El envío de rutinas dejará de convertir todos los fallos en un supuesto problema de
consentimiento. La aplicación distinguirá relación inactiva, cuenta suspendida, rutina ya
activa, propuesta pendiente, plantilla incompleta y consentimiento ausente. Si una relación
activa histórica o inconsistente carece realmente del permiso `training_profile`, solo el
cliente podrá volver a confirmarlo desde `/coaching` mediante una acción explícita y
auditable.

## 2. Estado actual y causa raíz

### 2.1 Directorio

`/trainers` entrega a `TrainerDirectory` exclusivamente la proyección pública
`active_trainer_directory`. Esa vista contiene identidad, especialidades y servicios activos,
pero no conoce al usuario que está mirando ni consulta `coaching_relationships`. Por ello la
card de un entrenador contratado es visualmente idéntica a cualquier otra.

### 2.2 Acompañamiento personal

`/coaching` ya es el centro canónico: muestra entrenador, servicio, estado de relación,
solicitudes, consentimientos y propuestas. La navegación personal también incluye
`Mi entrenador`, pero el Dashboard no consulta ni representa ninguna relación profesional.
Una persona puede usar Inicio cada día sin encontrar una confirmación visible de que tiene un
servicio activo.

Esta entrega activa de forma deliberada la futura sección de acompañamiento mencionada en el
diseño de navegación del 2026-09-05. Para este alcance aprobado, sustituye únicamente la
decisión anterior que la dejaba fuera; no cambia el resto de aquella arquitectura de
navegación.

### 2.3 Consentimiento y envío de rutina

El cliente acepta `training-profile-v1` al solicitar el servicio. Cuando el entrenador acepta,
la base de datos crea la relación activa y el consentimiento `training_profile` en la misma
transacción. `body_measurements` es un permiso independiente y opcional; no debe bloquear una
rutina.

La acción `proposeTrainerAssignment` sustituye actualmente cualquier error de la RPC por el
mismo mensaje: “Verifica que el acompañamiento siga activo y que el cliente haya dado su
consentimiento”. Ese texto también aparece si ya existe una rutina activa, la plantilla está
incompleta o una cuenta dejó de estar activa. Además, el selector ofrece todas las relaciones
visibles sin indicar si ya tienen rutina o una propuesta pendiente.

Si falta de verdad `training_profile`, `/coaching` dice que aún no está autorizado, pero solo
ofrece revocarlo. No existe una ruta de recuperación para que el cliente confirme nuevamente
el permiso.

## 3. Objetivos aprobados

1. Señalar sin ambigüedad al entrenador contratado dentro del directorio.
2. Mostrar el acompañamiento en Inicio con identidad, servicio, estado y siguiente acción.
3. Mantener `/coaching` como único centro detallado; no duplicar allí toda la gestión.
4. Explicar que los datos de entrenamiento son necesarios y las medidas corporales opcionales.
5. Mostrar al entrenador la causa real que impide enviar una rutina.
6. Permitir al cliente reparar explícitamente un consentimiento de entrenamiento ausente en
   una relación todavía activa.
7. Preservar RLS, autoridad de las RPC y trazabilidad profesional.

## 4. Arquitectura de datos de lectura

Se añadirá un cargador de servidor compartido, `loadClientCoachingSummary`, que recibirá el
cliente Supabase autenticado y el ID del usuario. El cargador consultará únicamente filas que
el cliente puede leer mediante las políticas existentes:

- su relación `active` o `paused_by_platform` más reciente;
- el perfil público y slug del entrenador;
- el nombre del servicio mediante la RPC pública autenticada existente;
- sus consentimientos de esa relación;
- sus asignaciones `proposed` o `active`.

El resultado tendrá este contrato estable:

```ts
export type ClientCoachingSummary = {
  relationshipId: string
  relationshipStatus: 'active' | 'paused_by_platform'
  trainerUserId: string
  trainerName: string
  trainerAvatarUrl: string | null
  trainerSlug: string | null
  serviceId: string
  serviceName: string
  startedAt: string
  trainingConsentActive: boolean
  assignmentStatus: 'proposed' | 'active' | null
}
```

El cargador será la única fuente para la marca del directorio y la tarjeta del Dashboard. La
vista pública `active_trainer_directory` no recibirá estado del espectador: mezclar datos
personalizados en esa proyección compartida introduciría riesgo de fuga o caché cruzada.

Cuando falle una dependencia secundaria de identidad o servicio, el resumen conservará la
relación con textos seguros. Un fallo al leer la propia relación devolverá un error no
destructivo y nunca inventará que existe o no existe un contrato.

## 5. Directorio de entrenadores

La card cuyo `trainer.userId` coincida con `summary.trainerUserId` tendrá:

- borde y superficie violeta sutiles, sin depender solo del color;
- sello textual `Tu entrenador`;
- banda `Acompañamiento activo` o `Acompañamiento pausado`;
- nombre del servicio contratado;
- CTA principal `Ver acompañamiento` hacia `/coaching`;
- acceso secundario `Ver perfil` hacia el perfil público.

El sello `Verificado` permanece. Las demás cards no cambian de estado ni reciben datos
privados. No se mostrarán solicitudes pendientes, relaciones finalizadas ni IDs internos en
el directorio.

Las cards dejarán de ser un único enlace envolvente para poder ofrecer dos destinos válidos
sin enlaces anidados. El nombre y el CTA de perfil llevarán al perfil; el CTA de
acompañamiento aparecerá solo en la card correspondiente.

## 6. Resumen profesional en Inicio

El Dashboard incorporará `CoachingSummaryCard` inmediatamente después de su título accesible
y antes de música, avisos y recorrido semanal. Solo aparecerá cuando exista una relación
activa o pausada.

La tarjeta mostrará:

- etiqueta `Tu acompañamiento`;
- avatar y nombre público del entrenador;
- servicio contratado;
- un estado textual calculado por prioridad;
- un CTA único hacia `/coaching`.

Estados y acciones:

| Condición | Estado visible | CTA |
| --- | --- | --- |
| Relación pausada | `Acompañamiento pausado` | `Revisar acompañamiento` |
| Falta `training_profile` | `Falta autorizar tus datos de entrenamiento` | `Completar autorización` |
| Asignación propuesta | `Rutina pendiente de revisión` | `Revisar rutina` |
| Asignación activa | `Rutina activa con tu entrenador` | `Ver acompañamiento` |
| Ninguna asignación | `Tu entrenador está preparando el siguiente paso` | `Ver acompañamiento` |

No incluirá botones para finalizar, consentimientos avanzados ni historial. Esos controles
permanecen en `/coaching`. Tampoco se añadirá un dock fijo que compita con la barra inferior o
`ActiveWorkoutDock`.

## 7. Flujo guiado de consentimiento

### 7.1 Cliente

`ConsentManager` separará dos bloques con lenguaje directo:

- `Datos para preparar tu rutina — Necesario`;
- `Medidas corporales — Opcional`.

Si el consentimiento necesario está activo, se mostrará `Autorización activa` y la acción
destructiva existente para revocar y finalizar. Si falta en una relación activa, se mostrará
primero una tarjeta de acción:

```text
Falta un paso para recibir tu rutina
Confirma que tu entrenador puede consultar tus datos de entrenamiento mientras dure este
acompañamiento. Tus medidas corporales no se incluyen.
```

El botón `Autorizar datos de entrenamiento` llamará una nueva RPC estricta. Nunca se otorgará
el permiso silenciosamente ni desde la cuenta del entrenador.

### 7.2 Base de datos

La migración 058 añadirá:

```sql
public.grant_training_profile_consent(
  p_relationship_id uuid,
  p_consent_version text,
  p_idempotency_key uuid
) returns table (relationship_id uuid, changed boolean)
```

La función derivará al cliente de `auth.uid()`, bloqueará su relación, exigirá estado `active`,
validará cliente y entrenador activos, y devolverá `changed = false` si ya existe un grant
activo. Si falta, insertará una nueva fila versionada, registrará
`training_profile_consent_granted` y notificará al entrenador. La fila de relación serializa
intentos concurrentes antes de comprobar el índice único de alcance activo.

La RPC será `SECURITY DEFINER`, fijará `search_path = public, pg_temp`, tendrá owner
`postgres`, revocará ejecución ambiental y concederá acceso solo a `authenticated` y
`service_role`. El preflight profesional avanzará a 58 y comprobará firma, owner, ACL y
marcador antes de permitir fixtures o despliegues.

### 7.3 Entrenador

Una relación que aparece en el selector profesional ya está sujeta a la política de
consentimiento vigente. Se etiquetará `Listo para recibir rutina`. Las relaciones con una
propuesta pendiente o una rutina activa seguirán visibles, pero no podrán seleccionarse para
crear otra propuesta y explicarán la acción correcta.

La acción de servidor mapeará por separado los códigos conocidos:

- `TRAINER_ASSIGNMENT_CONSENT_REQUIRED` → pedir al cliente que revise Acompañamiento;
- `COACHING_RELATIONSHIP_NOT_ACTIVE` → relación pausada o finalizada;
- `TRAINER_ASSIGNMENT_ACTIVE_EXISTS` → gestionar la rutina activa;
- `TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE` → completar días y ejercicios;
- `TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE` → plantilla no disponible;
- cuentas inactivas → indicar que la cuenta correspondiente no está disponible.

Los errores desconocidos conservarán un mensaje seguro y no revelarán IDs ni detalles de
otros usuarios.

## 8. Accesibilidad y responsive

- Todos los CTA tendrán una altura mínima de 44 px y foco visible.
- Estado, contrato y consentimiento siempre tendrán texto; el color será complementario.
- Nombre y servicio usarán `min-w-0` y truncado controlado, sin ocultar el estado.
- En 320, 360, 390, 412 y 1280 px no habrá desbordamiento horizontal.
- En móvil, identidad y CTA de la tarjeta del Dashboard se apilarán si no caben; el CTA podrá
  ocupar todo el ancho.
- Los avisos persistentes no usarán `role="status"`; solo los resultados de acciones usarán
  `aria-live` o `role="alert"`.
- El avatar será decorativo porque el nombre textual permanece visible.

## 9. Pruebas

La implementación seguirá TDD y cubrirá:

1. el cargador devuelve la relación propia y deriva correctamente consentimiento/asignación;
2. la card del entrenador contratado muestra sello, servicio y los dos destinos;
3. otra card no recibe estado personalizado;
4. el Dashboard representa los cinco estados definidos;
5. la composición coloca el resumen antes del recorrido semanal;
6. el gestor de consentimiento ofrece otorgar cuando falta y revocar cuando está activo;
7. la acción llama la RPC nueva con versión e idempotencia exactas;
8. cada código conocido de propuesta produce el mensaje correcto;
9. el selector impide duplicar una propuesta o una rutina activa;
10. pgTAP valida propiedad, estado, idempotencia, concurrencia, auditoría, notificación y ACL;
11. los contratos TypeScript, preflight, runner y documentación quedan alineados en 58.

## 10. Fuera de alcance

- Chat o mensajería directa entre cliente y entrenador.
- Pagos, renovación o facturación del servicio.
- Mostrar solicitudes pendientes o relaciones históricas en las cards del directorio.
- Duplicar finalización, permisos detallados o historial dentro del Dashboard.
- Permitir al entrenador conceder consentimiento en nombre del cliente.
- Modificar el contenido de una rutina profesional ya activa fuera del flujo de revisión
  existente.
- Añadir, quitar o reordenar destinos de la navegación personal o profesional.

## 11. Despliegue y límites

La aplicación que invoca `grant_training_profile_consent` no debe desplegarse antes de la
migración 058. El orden será: aplicar migración, ejecutar pgTAP/preflight 58, desplegar
aplicación y realizar un smoke autenticado con cliente y entrenador de prueba.

Un commit o push del SQL no demuestra que la migración esté aplicada remotamente. Las pruebas
locales tampoco demuestran el estado de Supabase, una sesión real desplegada ni un dispositivo
físico; esas fronteras se informarán por separado.

## 12. Criterios de aceptación

1. El cliente identifica a su entrenador desde `/trainers` sin abrir el perfil.
2. Inicio confirma visiblemente quién presta el servicio y qué paso sigue.
3. `/coaching` continúa siendo el centro detallado y muestra el consentimiento requerido con
   lenguaje comprensible.
4. Una relación activa sin grant puede repararse únicamente mediante confirmación explícita
   del cliente.
5. El entrenador no recibe un mensaje de consentimiento cuando la causa real es otra.
6. No se puede iniciar una propuesta redundante para un cliente con propuesta o rutina activa.
7. Los límites de privacidad, RLS e inmutabilidad de rutinas permanecen intactos.
8. Pruebas focalizadas, tipos, lint, suite general y verificación responsive concluyen o sus
   límites ambientales se reportan con evidencia.
