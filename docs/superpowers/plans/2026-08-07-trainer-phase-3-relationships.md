# Trainer Phase 3 Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar entrenadores verificados y sus servicios gratuitos, permitir solicitudes abiertas de clientes y administrar una unica relacion activa con consentimientos revocables.

**Architecture:** El directorio solo lee perfiles/servicios activos. Crear, aceptar, terminar, pausar y reanudar relaciones ocurre mediante RPC transaccionales con advisory locks por cliente. El acceso profesional se concede por la conjuncion entrenador activo + relacion activa + consentimiento vigente.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL con RLS/RPC, Vitest y Playwright.

## Global Constraints

- Mostrar solo `trainer_profiles.status='active'` y servicios activos.
- Cada servicio usa `billing_mode='free_preview'`; precio, moneda y periodicidad son nulos y no existen en props/formularios publicos.
- Un cliente puede tener varias solicitudes pendientes solo mientras no tenga una relacion activa.
- Solo una relacion `active` por cliente; `paused_by_platform` no bloquea buscar reemplazo.
- Aceptar una solicitud cancela todas las demas pendientes del mismo cliente en la misma transaccion.
- Entrenador y cliente no pueden ser la misma cuenta.
- La relacion social/follow nunca concede acceso profesional.
- El consentimiento `training_profile` es obligatorio; `body_measurements` es separado y opcional.
- Revocar medidas no termina la relacion. Revocar el consentimiento basico si la termina.
- No exponer telefono/correo del entrenador ni del cliente como sustituto de mensajeria.
- Terminar o suspender revoca acceso en la misma transaccion y conserva datos historicos.
- No implementar rutinas profesionales ni lectura de progreso todavia; solo producir sus permisos.

---

## File Map

- `supabase/migrations/042_trainer_relationships.sql`: servicios, solicitudes, relaciones, consentimientos, RPC y RLS.
- `src/lib/coaching/relationships.ts`: estados, transiciones y mensajes de dominio.
- `src/lib/coaching/permissions.ts`: interfaz de autorizacion por alcance.
- `src/app/actions/trainerServices.ts`: CRUD profesional sin campos comerciales.
- `src/app/actions/coachingRequests.ts`: crear, cancelar, aceptar y rechazar.
- `src/app/actions/coachingRelationships.ts`: consentimiento, finalizacion y reanudacion.
- `src/app/(app)/trainers/**`: directorio y perfil publico.
- `src/app/(app)/coaching/page.tsx`: estado del cliente y consentimientos.
- `src/app/(app)/coach/services/page.tsx`: servicios del entrenador.
- `src/app/(app)/coach/requests/page.tsx`: bandeja profesional.
- `src/app/actions/admin.ts`, `src/app/actions/adminTrainers.ts`: suspension atomica y restablecimiento.

### Task 1: Crear el esquema relacional y el helper de permisos

**Files:**
- Create: `src/lib/coaching/relationships.ts`
- Create: `src/lib/coaching/permissions.ts`
- Create: `src/lib/coaching/__tests__/relationships.test.ts`
- Create: `supabase/migrations/042_trainer_relationships.sql`
- Create: `src/lib/coaching/__tests__/relationshipsMigration.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces estados `CoachingRequestStatus`, `CoachingRelationshipStatus`, `CoachingConsentScope`.
- Produces tablas `trainer_service_offerings`, `coaching_requests`, `coaching_relationships` y `coaching_consents`.
- Produce funcion SQL `has_active_coaching_scope(trainer_id, client_id, scope)`.

- [ ] **Step 1: Escribir pruebas rojas de estados e invariantes**

```ts
expect(canTransitionCoachingRequest('pending', 'accepted', 'trainer')).toBe(true)
expect(canTransitionCoachingRequest('pending', 'cancelled', 'client')).toBe(true)
expect(canTransitionCoachingRequest('accepted', 'cancelled', 'client')).toBe(false)
expect(canTransitionRelationship('paused_by_platform', 'active', 'client')).toBe(true)
expect(canTransitionRelationship('ended', 'active', 'client')).toBe(false)
```

La prueba SQL exige:

```sql
CREATE UNIQUE INDEX coaching_relationships_one_active_client
  ON public.coaching_relationships(client_user_id)
  WHERE status = 'active';
```

Tambien exige indice parcial contra solicitudes pendientes equivalentes, constraint cliente distinto de entrenador, `free_preview`, RLS y `SECURITY DEFINER SET search_path` en el helper.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/relationships.test.ts src/lib/coaching/__tests__/relationshipsMigration.test.ts
```

- [ ] **Step 3: Implementar esquema y funcion deny-by-default**

El consentimiento usa una fila por alcance con `text_version`, `granted_at`, `revoked_at`, `granted_by` y `revoked_by`. `has_active_coaching_scope` devuelve verdadero solo si perfil, relacion y consentimiento son vigentes.

Los campos comerciales existen solo en DB:

```sql
billing_mode TEXT NOT NULL DEFAULT 'free_preview',
price_minor INTEGER,
currency TEXT,
billing_interval TEXT,
CHECK (billing_mode <> 'free_preview' OR (
  price_minor IS NULL AND currency IS NULL AND billing_interval IS NULL
))
```

- [ ] **Step 4: Actualizar tipos y ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/relationships.test.ts src/lib/coaching/__tests__/relationshipsMigration.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/relationships.ts src/lib/coaching/permissions.ts src/lib/coaching/__tests__ supabase/migrations/042_trainer_relationships.sql src/types/database.ts
git commit -m "feat(coaching): add services relationships and consent schema"
```

### Task 2: Implementar multiples servicios sin superficie comercial

**Files:**
- Create: `src/lib/coaching/serviceValidation.ts`
- Create: `src/lib/coaching/__tests__/serviceValidation.test.ts`
- Create: `src/app/actions/trainerServices.ts`
- Create: `src/app/actions/__tests__/trainerServices.test.ts`
- Create: `src/app/(app)/coach/services/page.tsx`
- Create: `src/components/coaching/TrainerServiceForm.tsx`
- Create: `src/components/coaching/__tests__/trainerServiceForm.test.tsx`
- Modify: `src/components/navigation/appNavigation.ts`

**Interfaces:**
- Produces `createTrainerService`, `updateTrainerService`, `setTrainerServiceActive`.
- Formulario consume solo nombre, descripcion, modalidad, duracion, contenido y cupo.

- [ ] **Step 1: Escribir pruebas rojas**

Cubrir ownership, guard de entrenador activo, limites de texto/duracion/cupo, id estable en edicion y rechazo de `price`, `currency`, `billingInterval` aunque se inyecten en `FormData`.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/serviceValidation.test.ts src/app/actions/__tests__/trainerServices.test.ts src/components/coaching/__tests__/trainerServiceForm.test.tsx
```

- [ ] **Step 3: Implementar acciones y UI**

Todas las escrituras fuerzan en servidor:

```ts
const commercialFields = {
  billing_mode: 'free_preview' as const,
  price_minor: null,
  currency: null,
  billing_interval: null,
}
```

Incorporar `Servicios` dentro de Perfil profesional o como enlace secundario, manteniendo las cinco entradas principales aprobadas.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/serviceValidation.test.ts src/app/actions/__tests__/trainerServices.test.ts src/components/coaching/__tests__/trainerServiceForm.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/serviceValidation.ts src/lib/coaching/__tests__/serviceValidation.test.ts src/app/actions/trainerServices.ts src/app/actions/__tests__/trainerServices.test.ts src/app/\(app\)/coach/services src/components/coaching/TrainerServiceForm.tsx src/components/coaching/__tests__/trainerServiceForm.test.tsx src/components/navigation/appNavigation.ts
git commit -m "feat(coaches): add free trainer services"
```

### Task 3: Construir directorio y perfil publico

**Files:**
- Create: `src/lib/coaching/directory.ts`
- Create: `src/lib/coaching/__tests__/directory.test.ts`
- Replace: `src/app/(app)/trainers/page.tsx`
- Create: `src/app/(app)/trainers/loading.tsx`
- Create: `src/app/(app)/trainers/[slug]/page.tsx`
- Create: `src/app/(app)/trainers/[slug]/loading.tsx`
- Create: `src/components/coaching/TrainerDirectory.tsx`
- Create: `src/components/coaching/TrainerPublicProfile.tsx`
- Create: `src/components/coaching/__tests__/trainerDirectory.test.tsx`

**Interfaces:**
- Consumes: vista publica `active_trainer_directory` con perfil y servicios no comerciales.
- Produces: busqueda por texto, especialidad, modalidad, idioma y ubicacion general; paginacion por cursor.

- [ ] **Step 1: Escribir pruebas rojas de filtrado y privacidad**

Exigir que perfiles suspendidos/inactivos, contacto, credenciales, entrevista, notas, precio y cupo interno no formen parte del row publico ni de las props renderizadas.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/directory.test.ts src/components/coaching/__tests__/trainerDirectory.test.tsx
```

- [ ] **Step 3: Implementar consulta y UI**

Usar filtros normalizados y cursor `(professional_name,user_id)`. El perfil muestra insignia verificada, bio, experiencia declarada, modalidades, ubicacion general, idiomas y servicios activos. No implementar ranking ni reseñas.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/directory.test.ts src/components/coaching/__tests__/trainerDirectory.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/directory.ts src/lib/coaching/__tests__/directory.test.ts src/app/\(app\)/trainers src/components/coaching/TrainerDirectory.tsx src/components/coaching/TrainerPublicProfile.tsx src/components/coaching/__tests__/trainerDirectory.test.tsx
git commit -m "feat(trainers): add verified trainer directory"
```

### Task 4: Crear solicitud de servicio con consentimiento basico

**Files:**
- Create: `src/lib/coaching/requestValidation.ts`
- Create: `src/lib/coaching/__tests__/requestValidation.test.ts`
- Create: `src/app/actions/coachingRequests.ts`
- Create: `src/app/actions/__tests__/coachingRequests.test.ts`
- Create: `src/components/coaching/CoachingRequestForm.tsx`
- Modify: `src/app/(app)/trainers/[slug]/page.tsx`
- Create: `src/app/(app)/coaching/page.tsx`
- Create: `src/components/coaching/ClientCoachingStatus.tsx`

**Interfaces:**
- Produces RPC `create_coaching_request(service_id,message,consent_version,idempotency_key)` y accion `cancelCoachingRequest`.
- Consumes: servicio activo, entrenador activo, cliente sin relacion activa y texto de consentimiento versionado.

- [ ] **Step 1: Escribir pruebas rojas**

Cubrir mensaje 0-1000, consentimiento obligatorio, servicio suspendido, solicitud equivalente duplicada, relacion activa, auto-solicitud, reintento con misma clave y multiples pendientes a entrenadores distintos.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/requestValidation.test.ts src/app/actions/__tests__/coachingRequests.test.ts
```

- [ ] **Step 3: Implementar RPC y formulario**

La RPC bloquea al cliente, vuelve a leer perfil/servicio y crea solicitud `pending`, auditoria y notificacion al entrenador. El checkbox debe enlazar el texto exacto de datos compartidos y guardar su version; no crea aun acceso a datos.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/requestValidation.test.ts src/app/actions/__tests__/coachingRequests.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/lib/coaching/requestValidation.ts src/lib/coaching/__tests__/requestValidation.test.ts src/app/actions/coachingRequests.ts src/app/actions/__tests__/coachingRequests.test.ts src/components/coaching/CoachingRequestForm.tsx src/app/\(app\)/trainers src/app/\(app\)/coaching src/components/coaching/ClientCoachingStatus.tsx supabase/migrations/042_trainer_relationships.sql
git commit -m "feat(coaching): add client service requests"
```

### Task 5: Aceptar o rechazar de forma atomica

**Files:**
- Modify: `supabase/migrations/042_trainer_relationships.sql`
- Modify: `src/app/actions/coachingRequests.ts`
- Modify: `src/app/actions/__tests__/coachingRequests.test.ts`
- Replace: `src/app/(app)/coach/requests/page.tsx`
- Create: `src/components/coaching/CoachRequestQueue.tsx`
- Create: `src/lib/coaching/__tests__/requestConcurrency.test.ts`

**Interfaces:**
- Produces RPC `accept_coaching_request(request_id,idempotency_key)` y `decline_coaching_request(request_id,reason)`.
- `accept_coaching_request` retorna `{ relationship_id, accepted_request_id, cancelled_request_ids }`.

- [ ] **Step 1: Escribir pruebas rojas de concurrencia y ownership**

Exigir trainer correcto, solicitud pendiente, perfil/servicio activos y dos aceptaciones concurrentes para el mismo cliente: una tiene exito y la otra recibe `COACHING_ACTIVE_RELATIONSHIP_EXISTS` sin estado parcial.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/coachingRequests.test.ts src/lib/coaching/__tests__/requestConcurrency.test.ts
```

- [ ] **Step 3: Implementar la transaccion completa**

La RPC debe, en orden: advisory lock por cliente, `FOR UPDATE` de solicitud, revalidacion, insert de relacion, aceptacion, cancelacion de pendientes, insert de consentimiento `training_profile`, auditoria y notificaciones deduplicadas.

- [ ] **Step 4: Implementar bandeja y estados de error**

Mostrar mensaje del cliente y servicio, aceptar/rechazar con confirmacion y representar conflictos como estado actualizado, no como error generico.

- [ ] **Step 5: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/coachingRequests.test.ts src/lib/coaching/__tests__/requestConcurrency.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add supabase/migrations/042_trainer_relationships.sql src/app/actions/coachingRequests.ts src/app/actions/__tests__/coachingRequests.test.ts src/app/\(app\)/coach/requests src/components/coaching/CoachRequestQueue.tsx src/lib/coaching/__tests__/requestConcurrency.test.ts
git commit -m "feat(coaching): accept one trainer relationship atomically"
```

### Task 6: Gestionar consentimiento separado para medidas

**Files:**
- Create: `src/app/actions/coachingRelationships.ts`
- Create: `src/app/actions/__tests__/coachingRelationships.test.ts`
- Create: `src/components/coaching/ConsentManager.tsx`
- Create: `src/components/coaching/__tests__/consentManager.test.tsx`
- Modify: `src/app/(app)/coaching/page.tsx`
- Modify: `src/lib/coaching/permissions.ts`

**Interfaces:**
- Produces `grantBodyMeasurementsConsent`, `revokeBodyMeasurementsConsent` y `revokeTrainingProfileConsent`.
- Consume relacion propia y activa; ninguna accion acepta `trainerUserId` como autoridad.

- [ ] **Step 1: Escribir pruebas rojas de revocacion inmediata**

Probar que medidas pueden otorgarse/revocarse sin terminar; al revocar `training_profile` la relacion termina en la misma RPC; reintentos no duplican auditoria/notificaciones.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/coachingRelationships.test.ts src/components/coaching/__tests__/consentManager.test.tsx
```

- [ ] **Step 3: Implementar acciones y UI**

Mostrar por separado “Datos de entrenamiento” y “Medidas corporales”, con version, fecha y efecto de revocar. La funcion de permisos consulta en cada request, sin cache compartida entre usuarios.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/coachingRelationships.test.ts src/components/coaching/__tests__/consentManager.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/app/actions/coachingRelationships.ts src/app/actions/__tests__/coachingRelationships.test.ts src/components/coaching/ConsentManager.tsx src/components/coaching/__tests__/consentManager.test.tsx src/app/\(app\)/coaching/page.tsx src/lib/coaching/permissions.ts
git commit -m "feat(coaching): add revocable scoped consent"
```

### Task 7: Finalizar y reanudar con confirmacion del cliente

**Files:**
- Modify: `supabase/migrations/042_trainer_relationships.sql`
- Modify: `src/app/actions/coachingRelationships.ts`
- Modify: `src/app/actions/__tests__/coachingRelationships.test.ts`
- Modify: `src/components/coaching/ClientCoachingStatus.tsx`
- Create: `src/components/coaching/CoachRelationshipActions.tsx`

**Interfaces:**
- Produce RPC `end_coaching_relationship(relationship_id,reason,idempotency_key)` y `resume_paused_coaching_relationship(relationship_id,idempotency_key)`.

- [ ] **Step 1: Escribir pruebas rojas**

Cubrir finalizacion por cualquiera de los participantes, no participante, motivo opcional de 500 caracteres, acceso revocado dentro de la transaccion, y reanudacion solo por cliente cuando entrenador esta restablecido y no existe otro activo.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/coachingRelationships.test.ts
```

- [ ] **Step 3: Implementar RPC y controles**

Guardar `ended_at`, `ended_by`, `end_reason`; revocar consentimientos vigentes y notificar a ambas partes. `resume_paused...` crea nuevos grants versionados y nunca modifica una relacion `ended`.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/coachingRelationships.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/042_trainer_relationships.sql src/app/actions/coachingRelationships.ts src/app/actions/__tests__/coachingRelationships.test.ts src/components/coaching/ClientCoachingStatus.tsx src/components/coaching/CoachRelationshipActions.tsx
git commit -m "feat(coaching): end and resume relationships safely"
```

### Task 8: Integrar suspension administrativa y verificar la fase

**Files:**
- Modify: `supabase/migrations/042_trainer_relationships.sql`
- Modify: `src/app/actions/admin.ts`
- Modify: `src/app/actions/adminTrainers.ts`
- Create: `src/app/actions/__tests__/trainerSuspension.test.ts`
- Create: `tests/e2e/trainer-relationships.spec.ts`
- Modify: `tests/e2e/helpers/core-product.ts`

**Interfaces:**
- Produce RPC `suspend_account_and_professional(user_id,admin_id,reason,until)` y `reinstate_trainer_profile(user_id,admin_id)`.
- Suspension cambia relaciones activas a `paused_by_platform`; restablecer perfil no reactiva relaciones.

- [ ] **Step 1: Escribir pruebas rojas de suspension**

Exigir que una sola operacion suspenda cuenta/perfil, oculte servicios por estado, pause todas las relaciones, revoque grants y cree auditoria/notificaciones. Restablecer deja relaciones pausadas.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/trainerSuspension.test.ts
```

- [ ] **Step 3: Implementar RPC y sustituir update administrativo directo**

`suspendUser` usa la RPC para cualquier cuenta; si no existe perfil profesional conserva el comportamiento actual. `reactivateUser` reactiva la cuenta global pero no el perfil profesional. La revision admin ofrece una accion explicita para restablecer el perfil.

- [ ] **Step 4: Ejecutar E2E de relaciones**

Cubrir directorio, varias pendientes, aceptacion unica, consentimiento de medidas, revocacion, finalizacion, suspension y confirmacion de reanudacion.

```bash
pnpm playwright test tests/e2e/trainer-relationships.spec.ts --project=mobile-375 --project=desktop-1440
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
git add supabase/migrations/042_trainer_relationships.sql src/app/actions/admin.ts src/app/actions/adminTrainers.ts src/app/actions/__tests__/trainerSuspension.test.ts tests/e2e/trainer-relationships.spec.ts tests/e2e/helpers/core-product.ts
git commit -m "feat(coaching): revoke access on trainer suspension"
```

## Completion Criteria

- Solo entrenadores y servicios activos aparecen publicamente; ningun campo comercial o privado se filtra.
- Varias solicitudes pendientes son posibles antes de aceptar; despues existe exactamente una relacion activa.
- Aceptacion, cancelacion de competidoras, consentimiento, auditoria y notificaciones son atomicos.
- Medidas corporales requieren grant separado y revocable.
- Finalizar o suspender revoca acceso inmediatamente.
- Restablecer un entrenador no reanuda clientes sin su confirmacion y falla si ya tienen otro entrenador.
