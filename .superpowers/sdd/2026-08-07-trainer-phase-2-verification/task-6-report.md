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

## Fix round 1/5 oficial

Se cerraron los dos hallazgos Important de la revisión oficial sin modificar el Minor diferido:

- La ubicación directa ahora se valida contra la unión de las modalidades aprobadas visibles y las modalidades pendientes o propuestas efectivas. Esto cubre tanto `online -> hybrid` como `hybrid -> online`: mientras cualquiera de los dos estados requiera presencialidad, no se puede borrar `general_location`. La transición administrativa vuelve a validar la combinación final antes de mutar perfil, solicitud, evento, auditoría o notificación.
- La creación y reutilización del borrador `initial` pasó a `save_trainer_application_draft(jsonb)`, una RPC owner-safe y transaccional que deriva el propietario de `auth.uid()`, usa el mismo advisory lock `trainer-profile:<user_id>` que submit, guardado de perfil y aprobación, comprueba cuenta/onboarding y rechaza cualquier `trainer_profile` existente. La Server Action conserva su guard temprano pero persiste exclusivamente por la RPC. `authenticated` ya no tiene privilegio INSERT directo sobre `trainer_applications`; RLS queda como defensa secundaria. No se usa metadata de Auth.
- Se añadió una fixture comprometida y una carrera PostgreSQL real con dos conexiones `dblink`: aprobación inicial y guardado de borrador se lanzan simultáneamente. La aprobación termina una vez, se crea un solo perfil y queda exactamente una solicitud `initial`; el guardado concurrente pierde de forma segura. El cambio en `scripts/test-trainer-verification-db.mjs` fue necesario para crear esa fixture fuera de la transacción pgTAP, de modo que ambas conexiones pudieran verla y competir de verdad.

### Evidencia RED

Primer ciclo de la ronda oficial:

```text
pnpm vitest run src/app/actions/__tests__/trainerProfile.test.ts src/app/actions/__tests__/trainerApplications.test.ts
Tests  2 failed | 18 passed (20)

pnpm test:db:verification
1..168
12 assertions failed (incluidas preservaciones en cascada)
```

La re-revisión detectó dos huecos residuales y se escribieron regresiones antes de corregirlos:

```text
pnpm vitest run src/app/actions/__tests__/trainerProfile.test.ts src/app/actions/__tests__/trainerApplications.test.ts
Tests  2 failed | 19 passed (21)

pnpm test:db:verification
1..173
4 assertions failed: RPC/privilegio y modalidad aprobada/preservación
```

### Evidencia GREEN final

Ejecutado sobre el estado exacto previo al commit del fix:

```text
pnpm vitest run src/lib/coaching/__tests__/access.test.ts "src/app/(app)/coach/__tests__/workspace.test.tsx" src/app/actions/__tests__/trainerProfile.test.ts src/components/coaching/__tests__/trainerProfileForm.test.tsx src/app/actions/__tests__/adminTrainers.test.ts src/app/actions/__tests__/trainerApplications.test.ts
Test Files  6 passed (6)
Tests       52 passed (52)

pnpm test:db:verification
1..177
PASS: all pgTAP assertions passed

pnpm test
Test Files  138 passed (138)
Tests       1205 passed (1205)

pnpm type-check
Exit code: 0

pnpm lint
Exit code: 0

git diff --check
Exit code: 0
```

La re-revisión independiente final devolvió **PASS**, sin findings Critical ni Important. Confirmó la unión de modalidades aprobadas/efectivas, la validación final administrativa, el advisory lock compartido, el uso de la RPC desde la Server Action, la ausencia del privilegio INSERT directo y la carrera `dblink` contra aprobación.
