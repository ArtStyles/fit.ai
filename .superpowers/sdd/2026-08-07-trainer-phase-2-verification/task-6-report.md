# Task 6 — Guard profesional y editor del perfil aprobado

## Resultado

Se implementó el espacio profesional protegido, sus estados vacíos reales y la edición del perfil con dos caminos explícitos:

- `bio`, foto profesional, ubicación general e idiomas se actualizan directamente.
- nombre profesional, especialidades, modalidades y experiencia se envían a revisión sin reemplazar la versión sensible aprobada.

La autorización profesional depende exclusivamente de `trainer_profiles.status = 'active'`, después del control normal de autenticación, onboarding y suspensión global. No se usa metadata de Auth como autorización.

## Diseño implementado

- `getTrainerAccess(userId)` consulta el perfil por `user_id` y solo concede acceso a un perfil activo.
- `requireActiveTrainerContext()` ejecuta primero `requireAppUserContext()` y redirige a `/coach/apply` cuando no existe un perfil profesional activo.
- Resumen, Clientes, Rutinas y Solicitudes llaman al guard antes de cualquier consulta y presentan estados vacíos sin datos ficticios.
- Perfil consulta, después del guard, la revisión `profile_update` abierta del propietario y muestra por separado la versión aprobada y la propuesta.
- `updateTrainerProfile(formData)` ignora identificadores aportados por el cliente, usa el contexto autorizado y delega la persistencia en `save_trainer_profile_changes`.
- La RPC bloquea la fila del perfil activo, actualiza inmediatamente solo los campos directos y crea o reutiliza una única revisión abierta para cambios sensibles.
- `trainer_applications` distingue `initial` y `profile_update`, referencia el perfil fuente y referencia una solicitud aprobada que contiene las credenciales. No se duplican metadatos ni objetos de credenciales.
- La solicitud de actualización copia una instantánea completa y el contacto de la solicitud fuente, registra un evento y genera una notificación administrativa deduplicada.
- La cola administrativa identifica el tipo de solicitud y resuelve credenciales por `credential_source_application_id`.
- La aprobación usa el flujo atómico existente: aplica los campos sensibles revisados y preserva los campos directos que hayan cambiado después de crear la solicitud.

## Evidencia TDD

### RED observado

- Guard: 7/7 fallaron inicialmente porque el módulo no existía.
- Rutas: las cuatro rutas iniciales fallaron por archivos ausentes; luego Perfil falló hasta incorporar su guard y consulta posterior.
- Acción: 4/4 fallaron inicialmente porque el módulo no existía.
- Formulario: falló inicialmente por módulo ausente; después se añadieron ciclos RED/GREEN para conservar valores sensibles ocultos durante revisión y reutilizar la propuesta enviada.
- Cola administrativa: 2 pruebas fallaron antes de exponer `applicationKind` y resolver la referencia de credenciales.
- PostgreSQL: la suite falló primero por columnas/RPC ausentes. La prueba de aprobación se volvió a ejecutar con la preservación de campos directos retirada deliberadamente y falló exactamente porque la instantánea antigua revertía dichos campos; al restaurar la corrección pasó.
- Concurrencia: la primera colocación de las pruebas `dblink` detectó un bloqueo con DDL transaccional; se movió el escenario antes de esos triggers para probar la serialización real sin un bloqueo artificial del harness.

### GREEN final

Ejecutado sobre el estado exacto previo al commit:

```text
pnpm vitest run <6 archivos focales>
Test Files  6 passed (6)
Tests       41 passed (41)

pnpm test:db:verification
1..157
PASS: all pgTAP assertions passed

pnpm test
Test Files  138 passed (138)
Tests       1202 passed (1202)

pnpm type-check
Exit code: 0

pnpm lint
Exit code: 0

git diff --check
Exit code: 0
```

## Cobertura relevante

- Perfil ausente, solicitud pendiente sin perfil, perfil inactivo, suspendido y activo.
- Suspensión global antes de la consulta profesional.
- Orden guard-before-query en todas las rutas profesionales.
- Ausencia de ejemplos falsos en estados vacíos.
- Validación de formulario y propagación de errores de la RPC.
- Actualización directa, creación/reutilización de revisión, instantánea y contacto fuente.
- Rechazo de perfil inactivo, ownership corrupto, fuente no aprobada y fuente sin credenciales.
- Dos envíos concurrentes producen una sola revisión y una sola notificación.
- Revisión administrativa por referencia y aprobación que preserva cambios directos posteriores.
- Carrera real entre guardado directo y aprobación mediante dos conexiones `dblink` simultáneas.

## Correcciones de la revisión independiente

La primera revisión detectó cuatro riesgos importantes. Cada uno recibió una reproducción RED y una corrección GREEN:

- Una aprobación de `profile_update` ya no puede reactivar silenciosamente un perfil suspendido o inactivo; vuelve a exigir el perfil fuente activo en el momento de decidir y preserva su estado.
- `/coach/apply`, las acciones de solicitud inicial, las políticas RLS y las RPC de credenciales aíslan `application_kind = 'initial'`; una actualización de perfil no puede crear, preparar ni retirar credenciales.
- Si el propietario devuelve una propuesta editable exactamente a los valores sensibles aprobados, la revisión vieja se retira y deja de poder aprobarse.
- Guardado y decisión administrativa adquieren primero el mismo advisory lock transaccional por entrenador. La prueba RED reprodujo `deadlock detected`; la prueba GREEN usa dos conexiones reales concurrentes y comprueba que ambas operaciones terminan conservando los campos directos.

La re-revisión confirmó los cuatro arreglos. Detectó además que incluir explícitamente `application_kind` en el INSERT inicial requería un privilegio de columna no concedido; un último ciclo RED/GREEN eliminó ese valor explícito para usar el default seguro de PostgreSQL, conservando el filtro `initial` y la comprobación RLS. El chequeo dirigido final terminó en PASS.

## Auto-revisión

- No hay referencias a `user_metadata` ni `app_metadata` en el guard, rutas, acción, formulario o RPC nuevos.
- El cliente no puede elegir `user_id`, `profile_id`, solicitud fuente ni fuente de credenciales.
- La función se revoca de `public`, `anon` y `service_role`; solo `authenticated` recibe ejecución y la función vuelve a validar propietario y cuenta activa.
- Los campos sensibles del perfil activo permanecen intactos hasta una decisión administrativa.
- No se añadieron políticas de lectura pública de perfiles ni datos ficticios fuera del alcance.
- `git diff --check` no detectó errores. Git únicamente informó avisos locales de conversión LF/CRLF en archivos ya rastreados.
- Vitest emitió el aviso preexistente de que `vite-tsconfig-paths` puede sustituirse por la opción nativa de Vite; no afecta el resultado de las pruebas ni forma parte de esta tarea.
