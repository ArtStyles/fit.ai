# Trainer Phase 2 Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir solicitudes abiertas para ser entrenador, revision administrativa con correcciones o entrevista, aprobacion explicita y acceso al espacio profesional solo para perfiles activos.

**Architecture:** La cuenta base nunca cambia de rol. Una solicitud privada conserva datos, credenciales y eventos de revision; la aprobacion crea un `trainer_profile` separado. Los guards consultan ese perfil en servidor y PostgreSQL. El selector Personal/Entrenador cambia navegacion mediante cookie, no autenticacion.

**Tech Stack:** Next.js 14 Server Actions/App Router, React 18, TypeScript, Supabase Auth/PostgreSQL/Storage, Vitest y Playwright.

## Global Constraints

- Cualquier usuario con cuenta activa y onboarding completo puede solicitar; nadie se autoaprueba.
- No solicitar ni almacenar documento de identidad gubernamental.
- Contacto, credenciales, disponibilidad, enlaces de entrevista y notas internas nunca aparecen en el perfil publico.
- Aceptar PDF, JPEG o PNG de hasta 10 MB por credencial; los objetos viven en un bucket privado.
- El solicitante solo ve notas marcadas como publicas; notas internas solo usan `service_role`.
- Las transiciones invalidas fallan tanto en TypeScript como en RPC.
- Entrevista es opcional y selectiva; no se envia correo automatico ni se integra videollamada.
- Solo `trainer_profiles.status='active'` habilita rutas `/coach/*` y el selector de espacio.
- La aprobacion o rechazo debe ser idempotente y quedar auditado/notificado.
- `trainer_applications.application_kind` distingue `initial|profile_update`; solo la segunda puede reutilizar por referencia credenciales de una solicitud aprobada del mismo entrenador.
- No crear servicios, solicitudes de clientes ni acceso a progreso en esta fase.

---

## File Map

- `supabase/migrations/041_trainer_verification.sql`: solicitudes, credenciales, eventos, entrevistas, perfil y RLS.
- `src/lib/coaching/status.ts`: estados y transiciones puras.
- `src/lib/coaching/access.ts`: carga y guard de capacidad profesional.
- `src/app/actions/trainerApplications.ts`: borrador, credenciales, envio, correccion y retiro.
- `src/app/actions/adminTrainers.ts`: revision, entrevista, cambios, aprobacion y rechazo.
- `src/app/(app)/coach/apply/**`: formulario y seguimiento del solicitante.
- `src/app/(app)/admin/trainers/**`: cola y expediente privado.
- `src/app/(app)/coach/profile/**`: edicion del perfil profesional aprobado.
- `src/components/navigation/WorkspaceSwitcher.tsx`: cambio Personal/Entrenador.
- `src/app/actions/workspace.ts`: valida y persiste `vekira_workspace`.
- `src/app/(app)/coach/**`: shell inicial protegido.

### Task 1: Modelar estados, tablas privadas y perfil profesional

**Files:**
- Create: `src/lib/coaching/status.ts`
- Create: `src/lib/coaching/__tests__/status.test.ts`
- Create: `supabase/migrations/041_trainer_verification.sql`
- Create: `src/lib/coaching/__tests__/verificationMigration.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `TrainerApplicationStatus`, `TrainerProfileStatus`, `canTransitionApplication(from,to,actor)`.
- Produces tablas `trainer_applications`, `trainer_application_credentials`, `trainer_application_events`, `trainer_interviews` y `trainer_profiles`.

- [ ] **Step 1: Escribir las pruebas rojas de maquina de estados**

Codificar la matriz aprobada:

```ts
expect(canTransitionApplication('draft', 'submitted', 'applicant')).toBe(true)
expect(canTransitionApplication('submitted', 'under_review', 'admin')).toBe(true)
expect(canTransitionApplication('under_review', 'interview_required', 'admin')).toBe(true)
expect(canTransitionApplication('changes_requested', 'submitted', 'applicant')).toBe(true)
expect(canTransitionApplication('approved', 'draft', 'applicant')).toBe(false)
expect(canTransitionApplication('rejected', 'approved', 'applicant')).toBe(false)
```

Agregar una prueba estatica que exija RLS, unicidad de `slug`, indice parcial de una solicitud abierta por usuario y bucket privado `trainer-credentials`.

- [ ] **Step 2: Ejecutar pruebas y confirmar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/status.test.ts src/lib/coaching/__tests__/verificationMigration.test.ts
```

- [ ] **Step 3: Implementar tipos y migracion**

La solicitud debe contener como minimo:

```ts
type TrainerApplicationDraft = {
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
  contactEmail: string
  contactPhone: string | null
  preferredContact: 'email' | 'phone' | 'whatsapp'
  timezone: string
  interviewAvailability: string
}
```

`trainer_application_events` guarda `from_status`, `to_status`, `public_note`, `internal_note`, actor y fecha. `trainer_interviews` guarda propuesta, zona horaria, medio, URL externa opcional, estado y resultado. `trainer_profiles` usa `user_id` unico, `slug` unico y estados `active|suspended|inactive`.

- [ ] **Step 4: Crear las politicas**

- Solicitante: CRUD solo de su borrador/correccion y lectura de sus credenciales/eventos sin `internal_note` mediante una vista segura.
- Publico autenticado: ninguna lectura directa de solicitudes, credenciales o entrevistas.
- Perfil profesional: propietario puede leer el suyo; la lectura publica de activos se habilitara en fase 3.
- Administracion: acceso por `service_role` desde guards existentes.

- [ ] **Step 5: Actualizar tipos y confirmar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/status.test.ts src/lib/coaching/__tests__/verificationMigration.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add src/lib/coaching/status.ts src/lib/coaching/__tests__ supabase/migrations/041_trainer_verification.sql src/types/database.ts
git commit -m "feat(coaches): add verification data model"
```

### Task 2: Implementar borrador, credenciales y envio

**Files:**
- Create: `src/lib/coaching/applicationValidation.ts`
- Create: `src/lib/coaching/__tests__/applicationValidation.test.ts`
- Create: `src/app/actions/trainerApplications.ts`
- Create: `src/app/actions/__tests__/trainerApplications.test.ts`

**Interfaces:**
- Produces: `saveTrainerApplicationDraft(formData)`, `uploadTrainerCredential(formData)`, `removeTrainerCredential(formData)`, `submitTrainerApplication(formData)` y `withdrawTrainerApplication(formData)`.
- Consumes: usuario autenticado, tablas de fase 2, storage privado y `createProductNotification` de fase 1.

- [ ] **Step 1: Escribir pruebas rojas de validacion**

Cubrir longitudes, foto profesional propia o avatar existente, email, telefono opcional, zona IANA, maximo 10 especialidades, idiomas, ubicacion general, modalidad valida, credencial URL `https`, MIME/tamaño permitido y rechazo explicito de campos como `government_id`.

El envio solo es valido con perfil completo y al menos una credencial por documento o enlace.

- [ ] **Step 2: Ejecutar pruebas y confirmar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/applicationValidation.test.ts src/app/actions/__tests__/trainerApplications.test.ts
```

- [ ] **Step 3: Implementar acciones con ownership e idempotencia**

Normalizar el path de storage como:

```ts
export function trainerCredentialPath(userId: string, applicationId: string, credentialId: string, extension: string) {
  return `${userId}/${applicationId}/${credentialId}.${extension}`
}
```

No confiar en `userId` del formulario. `submitTrainerApplication` usa RPC para cambiar `draft|changes_requested -> submitted`, registrar evento/auditoria y crear una notificacion administrativa deduplicada.

- [ ] **Step 4: Ejecutar pruebas y confirmar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/applicationValidation.test.ts src/app/actions/__tests__/trainerApplications.test.ts
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/applicationValidation.ts src/lib/coaching/__tests__/applicationValidation.test.ts src/app/actions/trainerApplications.ts src/app/actions/__tests__/trainerApplications.test.ts
git commit -m "feat(coaches): add trainer application actions"
```

### Task 3: Construir solicitud y seguimiento del postulante

**Files:**
- Create: `src/app/(app)/coach/apply/page.tsx`
- Create: `src/app/(app)/coach/apply/loading.tsx`
- Create: `src/components/coaching/ApplicationForm.tsx`
- Create: `src/components/coaching/CredentialFields.tsx`
- Create: `src/components/coaching/ApplicationTimeline.tsx`
- Create: `src/components/coaching/__tests__/applicationForm.test.tsx`

**Interfaces:**
- Consumes: acciones de la tarea 2 y vista segura de eventos.
- Produces: formulario reanudable, carga de credenciales, resumen de contacto y linea de estado.

- [ ] **Step 1: Escribir prueba roja de experiencia**

Exigir etiquetas accesibles, errores por campo, guardado de borrador, confirmacion antes de enviar, representacion de `changes_requested`, `interview_required`, `approved` y `rejected`, y ausencia total de campos de identidad gubernamental/precio.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/components/coaching/__tests__/applicationForm.test.tsx
```

- [ ] **Step 3: Implementar las pantallas**

En entrevista mostrar fecha en zona del solicitante, medio y enlace seguro `https`. Mostrar texto claro: la coordinacion usa los datos de contacto suministrados y no existe mensajeria privada en el MVP.

- [ ] **Step 4: Ejecutar GREEN y type-check**

```bash
pnpm vitest run src/components/coaching/__tests__/applicationForm.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/app/\(app\)/coach/apply src/components/coaching
git commit -m "feat(coaches): add trainer application experience"
```

### Task 4: Implementar cola administrativa y expediente privado

**Files:**
- Create: `src/lib/auth/adminTrainers.ts`
- Create: `src/app/(app)/admin/trainers/page.tsx`
- Create: `src/app/(app)/admin/trainers/[applicationId]/page.tsx`
- Create: `src/components/admin/TrainerApplicationReview.tsx`
- Create: `src/components/admin/__tests__/trainerApplicationReview.test.tsx`
- Modify: `src/app/(app)/admin/page.tsx`

**Interfaces:**
- Consumes: `requireAdminUserContext()`, credenciales firmadas de corta duracion y datos privados de solicitud.
- Produces: cola filtrable por estado y expediente con contacto, credenciales, disponibilidad e historial.

- [ ] **Step 1: Escribir prueba roja de privacidad administrativa**

Verificar que la lista solo presenta nombre, fecha, estado y especialidades; contacto, URL firmada y notas internas solo aparecen en `[applicationId]`. Exigir que los enlaces firmados expiren en 5 minutos o menos.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/components/admin/__tests__/trainerApplicationReview.test.tsx
```

- [ ] **Step 3: Implementar consultas y UI**

Agregar entrada “Entrenadores” al dashboard admin. Reutilizar `PageTopBar`, `Card`, `Dialog` y `SubmitButton`. No consultar datos fisicos, planes ni progreso del solicitante.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/components/admin/__tests__/trainerApplicationReview.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/auth/adminTrainers.ts src/app/\(app\)/admin src/components/admin/TrainerApplicationReview.tsx src/components/admin/__tests__/trainerApplicationReview.test.tsx
git commit -m "feat(admin): add trainer verification queue"
```

### Task 5: Implementar decisiones, correcciones e entrevista

**Files:**
- Create: `src/app/actions/adminTrainers.ts`
- Create: `src/app/actions/__tests__/adminTrainers.test.ts`
- Modify: `supabase/migrations/041_trainer_verification.sql`
- Modify: `src/components/admin/TrainerApplicationReview.tsx`

**Interfaces:**
- Produces: `startTrainerReview`, `requestTrainerChanges`, `scheduleTrainerInterview`, `recordTrainerInterviewOutcome`, `approveTrainerApplication` y `rejectTrainerApplication`.
- Consumes: RPC transaccional `transition_trainer_application(...)`.

- [ ] **Step 1: Escribir pruebas rojas de autorizacion y transicion**

Cubrir admin requerido, UUID valido, nota publica obligatoria al pedir cambios/rechazar, fecha futura al programar, URL `https`, reintento idempotente y aprobacion que crea exactamente un perfil activo.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/adminTrainers.test.ts src/lib/coaching/__tests__/status.test.ts
```

- [ ] **Step 3: Implementar la RPC atomica**

La aprobacion debe bloquear la solicitud, validar estado, crear/activar `trainer_profiles`, escribir evento y auditoria, y crear notificacion `trainer_application_status` con dedupe `trainer-application:<id>:approved`. El rechazo nunca crea perfil.

La entrevista usa el mismo patron con dedupe por id de entrevista. Guardar contacto y enlace para coordinacion externa; no enviar mensajes desde Vekira.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/adminTrainers.test.ts src/lib/coaching/__tests__/status.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/app/actions/adminTrainers.ts src/app/actions/__tests__/adminTrainers.test.ts supabase/migrations/041_trainer_verification.sql src/components/admin/TrainerApplicationReview.tsx
git commit -m "feat(admin): add trainer approval workflow"
```

### Task 6: Crear guard profesional y editor de perfil aprobado

**Files:**
- Create: `src/lib/coaching/access.ts`
- Create: `src/lib/coaching/__tests__/access.test.ts`
- Create: `src/app/actions/trainerProfile.ts`
- Create: `src/app/actions/__tests__/trainerProfile.test.ts`
- Create: `src/app/(app)/coach/profile/page.tsx`
- Create: `src/components/coaching/TrainerProfileForm.tsx`
- Create: `src/components/coaching/__tests__/trainerProfileForm.test.tsx`
- Create: `src/app/(app)/coach/page.tsx`
- Create: `src/app/(app)/coach/clients/page.tsx`
- Create: `src/app/(app)/coach/programs/page.tsx`
- Create: `src/app/(app)/coach/requests/page.tsx`
- Modify: `supabase/migrations/041_trainer_verification.sql`
- Modify: `supabase/tests/041_trainer_verification_test.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `getTrainerAccess(userId)` y `requireActiveTrainerContext()`.
- Consume `trainer_profiles.status`; no usa metadata de Auth como autorizacion.
- Produce `updateTrainerProfile(formData)` y una RPC owner-safe que aplica campos directos o crea/reutiliza una solicitud `profile_update` enviada, sin mutar los campos sensibles aprobados.

- [ ] **Step 1: Escribir pruebas rojas del guard y de revision de perfil**

Cubrir ausencia de perfil, solicitud pendiente, perfil inactivo, suspendido, activo y cuenta globalmente suspendida. Solo el ultimo caso activo devuelve contexto profesional.

Cubrir ademas que bio, foto, ubicacion e idiomas actualizan directamente el perfil; cambiar nombre, especialidades, modalidades o experiencia crea o reutiliza una solicitud abierta con `application_kind='profile_update'`, `source_profile_id` y `credential_source_application_id`. La RPC debe copiar una instantanea completa del perfil aprobado, contacto desde su solicitud fuente y dejar la revision `submitted`, mientras el perfil activo conserva los valores sensibles anteriores.

PostgreSQL debe rechazar una revision si el perfil no esta activo, la solicitud o credencial fuente pertenece a otro usuario, la solicitud fuente no esta aprobada o no posee credenciales. Dos envios concurrentes producen una sola solicitud abierta y una sola notificacion administrativa deduplicada.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/access.test.ts src/app/actions/__tests__/trainerProfile.test.ts src/components/coaching/__tests__/trainerProfileForm.test.tsx
pnpm test:db:verification
```

- [ ] **Step 3: Implementar guard y rutas**

`requireActiveTrainerContext` autentica, aplica suspension global y consulta el perfil por `user_id`. Las rutas profesionales llaman al guard antes de cualquier query. En esta fase Resumen, Clientes, Rutinas y Solicitudes muestran estados vacios reales.

Perfil permite editar directamente bio, foto, ubicacion general e idiomas. Cambiar nombre profesional, especialidades, modalidades o experiencia usa una RPC transaccional owner-safe para crear o reutilizar una revision `profile_update`; no duplica credenciales ni objetos, sino que referencia las credenciales de la solicitud aprobada del mismo entrenador. La cola administrativa debe identificar el tipo y resolver esas credenciales por la referencia. El perfil visible conserva la version aprobada hasta la decision administrativa, que reutiliza el flujo atomico de la tarea 5.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/access.test.ts src/app/actions/__tests__/trainerProfile.test.ts src/components/coaching/__tests__/trainerProfileForm.test.tsx
pnpm test:db:verification
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/access.ts src/lib/coaching/__tests__/access.test.ts src/app/actions/trainerProfile.ts src/app/\(app\)/coach src/components/coaching/TrainerProfileForm.tsx
git commit -m "feat(coaches): guard professional workspace"
```

### Task 7: Añadir selector Personal/Entrenador y verificar la fase

**Files:**
- Create: `src/app/actions/workspace.ts`
- Create: `src/lib/coaching/workspace.ts`
- Create: `src/lib/coaching/__tests__/workspace.test.ts`
- Create: `src/components/navigation/WorkspaceSwitcher.tsx`
- Modify: `src/components/navigation/appNavigation.ts`
- Modify: `src/components/navigation/AppShell.tsx`
- Modify: `src/components/navigation/DesktopSidebar.tsx`
- Modify: `src/components/navigation/BottomNav.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Create: `tests/e2e/trainer-verification.spec.ts`

**Interfaces:**
- Produces cookie `vekira_workspace=personal|coach`, navegacion profesional `Resumen|Clientes|Rutinas|Solicitudes|Perfil` y fallback automatico a Personal.

- [ ] **Step 1: Escribir prueba roja del modo**

Verificar que un usuario no aprobado no puede fijar `coach`, que una cookie `coach` obsoleta se normaliza a Personal y que un entrenador activo recibe exactamente las cinco entradas aprobadas.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/workspace.test.ts src/components/navigation/__tests__/appNavigation.test.ts
```

- [ ] **Step 3: Implementar selector y navegacion**

La accion valida capacidad en servidor, escribe cookie `httpOnly`, `sameSite=lax`, `secure` en produccion y redirige a `/coach` o `/dashboard`. Mostrar selector en desktop y una opcion accesible equivalente en movil.

- [ ] **Step 4: Escribir y ejecutar el E2E aprobado**

El flujo debe: enviar solicitud, pedir correccion, reenviar, programar entrevista, aprobar, confirmar notificacion y abrir modo Entrenador.

```bash
pnpm playwright test tests/e2e/trainer-verification.spec.ts --project=mobile-375 --project=desktop-1440
```

- [ ] **Step 5: Ejecutar regresion completa**

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add src/app/actions/workspace.ts src/lib/coaching/workspace.ts src/lib/coaching/__tests__/workspace.test.ts src/components/navigation src/app/\(app\)/layout.tsx tests/e2e/trainer-verification.spec.ts
git commit -m "feat(coaches): add verified workspace switcher"
```

## Completion Criteria

- Un usuario puede guardar, completar y enviar una solicitud con credencial y contacto.
- El administrador puede pedir cambios, coordinar una entrevista externa y decidir con historial auditable.
- Datos privados y notas internas no aparecen fuera del expediente administrativo.
- La aprobacion crea una sola capacidad profesional activa; ningun otro estado abre `/coach/*`.
- El selector de espacio solo aparece para entrenadores activos y no altera su identidad personal.
- No existen todavia servicios, precios, acceso a clientes ni mensajeria.
