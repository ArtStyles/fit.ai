# Trainer Phase 4 Professional Programming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que entrenadores creen plantillas, asignen una primera rutina que el cliente acepta, publiquen revisiones futuras y mantener la prescripcion profesional bloqueada en todas las capas.

**Architecture:** Las plantillas viven fuera de `workout_plans`. Cada asignacion publica una instantanea inmutable y materializa un plan propiedad del cliente. La primera version es propuesta; la aceptacion la hace principal atomica. Las revisiones crean nuevos planes/versiones y solo sustituyen sesiones futuras. Triggers y RPC protegen la prescripcion; el motor actual conserva la ejecucion y evidencia real.

**Tech Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL con RPC/trigger/RLS, motor de sesiones existente, Vitest y Playwright.

## Global Constraints

- Nunca usar `workout_plans` como editor o catalogo de plantillas del entrenador.
- Una asignacion guarda snapshots inmutables; editar la plantilla no altera versiones publicadas.
- `source_type='trainer_assigned'`, `library_slot='professional'` y `prescription_locked=true` son inseparables.
- El cupo profesional no consume los dos planes personales Free ni concede cupos personales extra.
- Solo el cliente acepta la primera asignacion; revisiones posteriores se aplican automaticamente a sesiones futuras.
- Una publicacion fallida conserva activa la version anterior.
- Una sesion ya autorizada conserva `assignmentVersionId`, plan, workout y ejercicios capturados.
- El cliente no puede editar, reordenar, reemplazar, retirar, compartir, ajustar con IA, regenerar, autoprogresar ni activar manualmente un plan profesional.
- Mientras la relacion y asignacion profesional estan activas, el cliente no puede reemplazar el plan principal por uno personal.
- Tras terminar la relacion, el ultimo plan profesional sigue bloqueado y ejecutable; el cliente puede elegir luego un plan personal o aceptar otro entrenador.
- Durante la sesion se permiten resultados reales, notas, omisiones con motivo y salida segura; no ejercicios adicionales o sustituciones “solo por hoy”.
- Los guards de UI complementan, pero no sustituyen, acciones, RPC, triggers y RLS.

---

## File Map

- `supabase/migrations/043_trainer_programming.sql`: plantillas, asignaciones, versiones, columnas del plan, cupos, triggers y RPC.
- `src/lib/coaching/programs.ts`: validacion y snapshots de plantilla.
- `src/app/actions/trainerPrograms.ts`: CRUD de plantillas.
- `src/app/actions/trainerAssignments.ts`: proponer, aceptar y publicar revisiones.
- `src/app/(app)/coach/programs/**`: catalogo/editor/asignacion.
- `src/app/(app)/coaching/page.tsx`: revision y aceptacion del cliente.
- `src/lib/plans/editability.ts`: decision central de lectura/escritura.
- `src/app/actions/plan.ts`, `adjustPlan.ts`, `generatePlan.ts`, `posts.ts`: barreras de mutacion/compartir.
- `src/app/(app)/plan/page.tsx`, `src/components/plan/**`: presentacion de plan bloqueado.
- `src/app/actions/authorizeSession.ts`, `saveSession.ts`: snapshot y persistencia segura.
- `src/app/(app)/session/[workoutId]/**`, `src/components/session/**`, `src/store/sessionStore.ts`: modo de ejecucion bloqueado.

### Task 1: Modelar plantillas, asignaciones y versiones inmutables

**Files:**
- Create: `src/lib/coaching/programs.ts`
- Create: `src/lib/coaching/__tests__/programs.test.ts`
- Create: `supabase/migrations/043_trainer_programming.sql`
- Create: `src/lib/coaching/__tests__/programmingMigration.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces tablas `trainer_program_templates`, `trainer_template_workouts`, `trainer_template_exercises`, `trainer_plan_assignments` y `trainer_assignment_versions`.
- Produce `buildTrainerProgramSnapshot(input)` y `parseTrainerProgramSnapshot(value)`.

- [ ] **Step 1: Escribir pruebas rojas de snapshot**

El snapshot versionado debe tener esta forma estable:

```ts
export type TrainerProgramSnapshotV1 = {
  schemaVersion: 1
  name: string
  goal: string | null
  description: string | null
  daysPerWeek: number
  workouts: Array<{
    sourceTemplateWorkoutId: string
    name: string
    dayOfWeek: number
    orderInPlan: number
    exercises: Array<{
      sourceTemplateExerciseId: string
      exerciseId: string
      orderIndex: number
      sets: number
      reps: number
      weightKg: number | null
      targetRpe: number | null
      restSeconds: number
      notes: string | null
    }>
  }>
}
```

Probar orden determinista, limites, dias unicos, IDs UUID, ejercicio existente y rechazo de versiones desconocidas.

- [ ] **Step 2: Escribir prueba roja del esquema**

Exigir ownership del entrenador, FK de relacion/cliente, `UNIQUE (assignment_id, version_number)`, JSON inmutable, estados aprobados y un indice parcial de una asignacion activa por cliente.

- [ ] **Step 3: Ejecutar RED**

```bash
pnpm vitest run src/lib/coaching/__tests__/programs.test.ts src/lib/coaching/__tests__/programmingMigration.test.ts
```

- [ ] **Step 4: Implementar modelo y RLS**

El entrenador activo administra sus plantillas. Cliente y entrenador participante leen asignacion/versiones; nadie actualiza snapshots publicados. Cada version guarda `effective_from` y `effective_to` para reconstruir ocurrencias historicas. Agregar trigger que rechace `UPDATE snapshot` y `DELETE` de versiones referenciadas.

- [ ] **Step 5: Actualizar tipos y confirmar GREEN**

```bash
pnpm vitest run src/lib/coaching/__tests__/programs.test.ts src/lib/coaching/__tests__/programmingMigration.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add src/lib/coaching/programs.ts src/lib/coaching/__tests__/programs.test.ts src/lib/coaching/__tests__/programmingMigration.test.ts supabase/migrations/043_trainer_programming.sql src/types/database.ts
git commit -m "feat(coaching): add professional program model"
```

### Task 2: Añadir identidad profesional y cupo independiente a planes

**Files:**
- Modify: `supabase/migrations/043_trainer_programming.sql`
- Modify: `src/types/database.ts`
- Modify: `src/lib/plans/entitlements.ts`
- Modify: `src/lib/plans/__tests__/entitlements.test.ts`
- Modify: `src/lib/plans/__tests__/lifecycle.test.ts`

**Interfaces:**
- Añade a `workout_plans`: `library_slot`, `trainer_relationship_id`, `trainer_assignment_id`, `trainer_assignment_version_id`, `prescription_locked`.
- Mantiene un unico plan activo total por usuario y limita solo familias con `library_slot='personal'`.

- [ ] **Step 1: Escribir pruebas rojas de cupo e invariantes**

Probar: usuario Free con dos familias personales puede recibir un plan profesional; no puede crear una tercera personal; el plan anterior se conserva; un plan `trainer_assigned` sin las cuatro referencias/bloqueo falla.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/plans/__tests__/entitlements.test.ts src/lib/plans/__tests__/lifecycle.test.ts
```

- [ ] **Step 3: Implementar columnas y reemplazar funciones de cupo**

Ampliar constraint de `source_type` con `trainer_assigned`. Reemplazar `enforce_plan_family_limit`, `set_subscription_tier_atomic` y conteos auxiliares para filtrar `library_slot='personal'`. Mantener el indice unico existente de plan activo sin ese filtro.

- [ ] **Step 4: Actualizar TypeScript y confirmar GREEN**

```bash
pnpm vitest run src/lib/plans/__tests__/entitlements.test.ts src/lib/plans/__tests__/lifecycle.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/043_trainer_programming.sql src/types/database.ts src/lib/plans/entitlements.ts src/lib/plans/__tests__/entitlements.test.ts src/lib/plans/__tests__/lifecycle.test.ts
git commit -m "feat(plans): reserve independent professional slot"
```

### Task 3: Construir editor de plantillas del entrenador

**Files:**
- Create: `src/app/actions/trainerPrograms.ts`
- Create: `src/app/actions/__tests__/trainerPrograms.test.ts`
- Replace: `src/app/(app)/coach/programs/page.tsx`
- Create: `src/app/(app)/coach/programs/new/page.tsx`
- Create: `src/app/(app)/coach/programs/[templateId]/page.tsx`
- Create: `src/components/coaching/ProgramTemplateEditor.tsx`
- Create: `src/components/coaching/TemplateWorkoutEditor.tsx`
- Create: `src/components/coaching/__tests__/programTemplateEditor.test.tsx`

**Interfaces:**
- Produces acciones CRUD para plantilla/workout/ejercicio que siempre derivan `trainer_user_id` del guard.
- Consume catalogo `exercises`; no consume ni crea `workout_plans`.

- [ ] **Step 1: Escribir pruebas rojas de ownership y validacion**

Cubrir entrenador activo, plantilla ajena, indices/dias, limites de sets/reps/peso/RPE/descanso y prueba estatica que las acciones no usan `.from('workout_plans')`.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/trainerPrograms.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx
```

- [ ] **Step 3: Implementar editor**

Reutilizar `ExercisePicker` y patrones de formulario, pero no importar acciones de plan personal. Guardar reordenamiento en una transaccion/RPC. Mostrar claramente que cambios de plantilla no actualizan asignaciones existentes.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/trainerPrograms.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add src/app/actions/trainerPrograms.ts src/app/actions/__tests__/trainerPrograms.test.ts src/app/\(app\)/coach/programs src/components/coaching/ProgramTemplateEditor.tsx src/components/coaching/TemplateWorkoutEditor.tsx src/components/coaching/__tests__/programTemplateEditor.test.tsx
git commit -m "feat(coaches): add professional template editor"
```

### Task 4: Proponer la primera asignacion como copia bloqueada

**Files:**
- Modify: `supabase/migrations/043_trainer_programming.sql`
- Create: `src/app/actions/trainerAssignments.ts`
- Create: `src/app/actions/__tests__/trainerAssignments.test.ts`
- Create: `src/components/coaching/AssignProgramDialog.tsx`
- Modify: `src/app/(app)/coach/programs/[templateId]/page.tsx`
- Modify: `src/app/(app)/coaching/page.tsx`
- Create: `src/components/coaching/ProposedProgramReview.tsx`

**Interfaces:**
- Produce RPC `propose_trainer_assignment(relationship_id,template_id,change_summary,idempotency_key)`.
- Retorna `assignment_id`, `assignment_version_id` y `workout_plan_id`; el plan queda inactivo y bloqueado.

- [ ] **Step 1: Escribir pruebas rojas de propuesta**

Cubrir relacion activa propia, consentimiento basico, plantilla propia, snapshot determinista, copia completa de workouts/ejercicios, plan propiedad del cliente, `is_active=false`, version 1, reintento idempotente y cero cambios al plan principal actual.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/trainerAssignments.test.ts src/lib/coaching/__tests__/programs.test.ts
```

- [ ] **Step 3: Implementar RPC de materializacion**

La RPC adquiere lock por cliente, lee plantilla completa, crea snapshot/version/asignacion y materializa `workout_plans`, `workouts` y `workout_exercises`. No usa el limite personal. Audita y notifica al cliente con URL `/coaching`.

- [ ] **Step 4: Implementar revision del cliente**

Mostrar nombre, objetivo, dias, ejercicios y prescripcion en solo lectura, entrenador/version y aviso de bloqueo. No ofrecer controles de edicion ni aceptar automaticamente.

- [ ] **Step 5: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/trainerAssignments.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add supabase/migrations/043_trainer_programming.sql src/app/actions/trainerAssignments.ts src/app/actions/__tests__/trainerAssignments.test.ts src/components/coaching/AssignProgramDialog.tsx src/components/coaching/ProposedProgramReview.tsx src/app/\(app\)/coach/programs src/app/\(app\)/coaching/page.tsx
git commit -m "feat(coaching): propose immutable trainer assignments"
```

### Task 5: Aceptar la primera rutina atomica y proteger activacion

**Files:**
- Modify: `supabase/migrations/043_trainer_programming.sql`
- Modify: `src/app/actions/trainerAssignments.ts`
- Modify: `src/app/actions/__tests__/trainerAssignments.test.ts`
- Modify: `src/components/coaching/ProposedProgramReview.tsx`
- Modify: `src/lib/plans/__tests__/lifecycle.test.ts`

**Interfaces:**
- Produce RPC `accept_trainer_assignment(assignment_id,idempotency_key)`.
- Consume cliente autenticado, propuesta vigente, relacion activa y version 1 materializada.

- [ ] **Step 1: Escribir pruebas rojas de activacion**

Exigir lock por cliente, propietario correcto, plan anterior desactivado pero no retirado, propuesta activa, `accepted_at`, notificacion y auditoria. Probar dos aceptaciones concurrentes y fallo que conserva el plan anterior activo.

Tambien exigir que `activate_plan_version` rechace planes profesionales y que creacion/regeneracion personal rechace reemplazar un profesional mientras su relacion este activa.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/trainerAssignments.test.ts src/lib/plans/__tests__/lifecycle.test.ts
```

- [ ] **Step 3: Implementar transaccion y guards SQL**

La RPC valida todo antes de desactivar. Al final activa exactamente el plan profesional, marca asignacion/version activas y supersede otra asignacion activa. Las funciones personales llaman a `assert_professional_plan_replaceable(user_id)`.

- [ ] **Step 4: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/trainerAssignments.test.ts src/lib/plans/__tests__/lifecycle.test.ts
pnpm type-check
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add supabase/migrations/043_trainer_programming.sql src/app/actions/trainerAssignments.ts src/app/actions/__tests__/trainerAssignments.test.ts src/components/coaching/ProposedProgramReview.tsx src/lib/plans/__tests__/lifecycle.test.ts
git commit -m "feat(coaching): activate first trainer plan atomically"
```

### Task 6: Publicar revisiones solo para sesiones futuras

**Files:**
- Modify: `supabase/migrations/043_trainer_programming.sql`
- Modify: `src/app/actions/trainerAssignments.ts`
- Modify: `src/app/actions/__tests__/trainerAssignments.test.ts`
- Create: `src/components/coaching/PublishProgramRevisionDialog.tsx`
- Modify: `src/app/(app)/coach/programs/[templateId]/page.tsx`
- Modify: `src/app/actions/authorizeSession.ts`
- Modify: `src/lib/session/contextSnapshot.ts`
- Modify: `src/lib/session/__tests__/contextSnapshot.test.ts`

**Interfaces:**
- Produce RPC `publish_trainer_assignment_revision(assignment_id,template_id,change_summary,idempotency_key)`.
- Snapshot de sesion añade `prescriptionLocked`, `trainerAssignmentId` y `trainerAssignmentVersionId`.

- [ ] **Step 1: Escribir pruebas rojas de revision y continuidad**

Cubrir version N+1, resumen obligatorio, materializacion completa, cambio atomico del plan activo, version anterior superseded, log historico intacto y autorizacion A que conserva version A despues de publicar B.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/app/actions/__tests__/trainerAssignments.test.ts src/lib/session/__tests__/contextSnapshot.test.ts
```

- [ ] **Step 3: Implementar publicacion**

Crear todo como inactivo, validar copia y solo entonces cambiar version/plan activos bajo el mismo lock. Si cualquier insert falla, rollback completo. Notificar al cliente con el resumen; no pedir nueva aceptacion.

- [ ] **Step 4: Congelar asignaciones al terminar o suspender**

Agregar trigger posterior a tablas de fase 4 que al pasar relacion a `ended|paused_by_platform` marca asignaciones `frozen`, impide publicar y conserva el ultimo plan. Redefinir la RPC de reanudacion para que la confirmacion explicita del cliente reactive tambien la ultima asignacion congelada de esa relacion; una relacion `ended` nunca se descongela.

- [ ] **Step 5: Ejecutar GREEN**

```bash
pnpm vitest run src/app/actions/__tests__/trainerAssignments.test.ts src/lib/session/__tests__/contextSnapshot.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add supabase/migrations/043_trainer_programming.sql src/app/actions/trainerAssignments.ts src/app/actions/__tests__/trainerAssignments.test.ts src/components/coaching/PublishProgramRevisionDialog.tsx src/app/\(app\)/coach/programs src/app/actions/authorizeSession.ts src/lib/session/contextSnapshot.ts src/lib/session/__tests__/contextSnapshot.test.ts
git commit -m "feat(coaching): publish future-only plan revisions"
```

### Task 7: Bloquear edicion, IA, retiro y compartir en plan

**Files:**
- Create: `src/lib/plans/editability.ts`
- Create: `src/lib/plans/__tests__/editability.test.ts`
- Modify: `src/app/actions/plan.ts`
- Modify: `src/app/actions/adjustPlan.ts`
- Modify: `src/app/actions/generatePlan.ts`
- Modify: `src/app/actions/posts.ts`
- Modify: `src/app/actions/__tests__/plan.logic.test.ts`
- Modify: `src/lib/plans/__tests__/lifecycle.test.ts`
- Modify: `src/app/(app)/plan/page.tsx`
- Modify: `src/components/plan/PlanWorkoutWorkspace.tsx`
- Modify: `src/components/plan/WorkoutExerciseManager.tsx`
- Modify: `src/components/plan/PlanOverview.tsx`
- Modify: `src/components/plan/__tests__/planStructure.test.ts`

**Interfaces:**
- Produce `getPlanCapabilities(plan)` con flags explicitos `canEdit`, `canAdjustWithAi`, `canRegenerate`, `canRetire`, `canShare`, `canActivate`.
- Server Actions consumen `requireEditableOwnedPlan`; no confian en los flags del cliente.

- [ ] **Step 1: Escribir pruebas rojas de la matriz de capacidades**

```ts
expect(getPlanCapabilities({ prescriptionLocked: true })).toEqual({
  canEdit: false,
  canAdjustWithAi: false,
  canRegenerate: false,
  canRetire: false,
  canShare: false,
  canActivate: false,
})
```

Agregar pruebas para cada accion de `plan.ts`, `adjustPlan`, `generatePlan` y `createPostFromPlan` con plan bloqueado.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/lib/plans/__tests__/editability.test.ts src/app/actions/__tests__/plan.logic.test.ts src/components/plan/__tests__/planStructure.test.ts src/lib/plans/__tests__/lifecycle.test.ts
```

- [ ] **Step 3: Implementar trigger de prescripcion y guards de acciones**

El trigger rechaza `UPDATE/DELETE` del plan, sus workouts y workout_exercises si estan bloqueados, salvo una marca local que solo establecen RPC profesionales autorizadas. Proteger nombre, objetivo, descripcion, orden, dias y todos los campos de prescripcion.

- [ ] **Step 4: Implementar vista de solo lectura**

Mostrar insignia “Asignada por entrenador”, version y resumen. No renderizar formularios, drag handles, menus, IA, regenerar, retirar o compartir. Mantener switcher de biblioteca solo como lectura mientras la relacion profesional activa impide sustituir.

- [ ] **Step 5: Ejecutar GREEN**

```bash
pnpm vitest run src/lib/plans/__tests__/editability.test.ts src/app/actions/__tests__/plan.logic.test.ts src/components/plan/__tests__/planStructure.test.ts src/lib/plans/__tests__/lifecycle.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add src/lib/plans/editability.ts src/lib/plans/__tests__/editability.test.ts src/app/actions/plan.ts src/app/actions/adjustPlan.ts src/app/actions/generatePlan.ts src/app/actions/posts.ts src/app/actions/__tests__/plan.logic.test.ts src/lib/plans/__tests__/lifecycle.test.ts src/app/\(app\)/plan/page.tsx src/components/plan
git commit -m "feat(plans): enforce trainer prescription lock"
```

### Task 8: Mantener ejecucion real sin sustituciones ni autoprogresion

**Files:**
- Modify: `supabase/migrations/043_trainer_programming.sql`
- Modify: `src/app/actions/saveSession.ts`
- Modify: `src/app/actions/__tests__/saveSession.test.ts`
- Modify: `src/app/(app)/session/[workoutId]/page.tsx`
- Modify: `src/app/(app)/session/[workoutId]/SessionClient.tsx`
- Modify: `src/components/session/SessionRoutineTools.tsx`
- Modify: `src/components/session/SessionExerciseHeader.tsx`
- Modify: `src/components/session/sessionViewModel.ts`
- Modify: `src/components/session/__tests__/sessionContracts.test.ts`
- Modify: `src/store/sessionStore.ts`
- Modify: `src/store/__tests__/sessionStore.test.ts`

**Interfaces:**
- Produce RPC `save_session_log_atomic_v3` y usa `prescriptionLocked` desde autorizacion.
- Permite logs reales del ejercicio prescrito y `sets_completed=0` con motivo; rechaza IDs adicionales/reemplazados.

- [ ] **Step 1: Escribir pruebas rojas de sesion bloqueada**

Cubrir herramientas “solo por hoy” ausentes, store que rechaza `addAdHocExercise`/`replaceExercise`, pesos/reps/RPE reales aceptados, omision aceptada, ejercicio no prescrito rechazado y resultados/snapshot persistidos.

Agregar prueba de que `updateActivePlanTargets` no actualiza `workout_exercises` cuando `prescription_locked=true`.

- [ ] **Step 2: Ejecutar RED**

```bash
pnpm vitest run src/components/session/__tests__/sessionContracts.test.ts src/store/__tests__/sessionStore.test.ts src/app/actions/__tests__/saveSession.test.ts
```

- [ ] **Step 3: Implementar validacion SQL y fallback seguro**

`save_session_log_atomic_v3` deriva el plan de la autorizacion. Para plan bloqueado verifica que todos los `exercise_id` pertenezcan al workout capturado/materializado. `saveSession` intenta v3; si falta y el plan esta bloqueado devuelve un error de actualizacion requerida y nunca cae a v2/legacy.

- [ ] **Step 4: Desactivar autoprogresion y herramientas de rutina**

Seleccionar `prescription_locked` en `updateActivePlanTargets` y retornar antes de mutar. Pasar `prescriptionLocked` al cliente/store y ocultar `SessionRoutineTools` y reemplazo. Mantener detener sesion, notas, omitir y controles de resultados.

- [ ] **Step 5: Ejecutar GREEN**

```bash
pnpm vitest run src/components/session/__tests__/sessionContracts.test.ts src/store/__tests__/sessionStore.test.ts src/app/actions/__tests__/saveSession.test.ts
pnpm type-check
```

- [ ] **Step 6: Commit de la tarea**

```bash
git add supabase/migrations/043_trainer_programming.sql src/app/actions/saveSession.ts src/app/actions/__tests__/saveSession.test.ts src/app/\(app\)/session src/components/session src/store/sessionStore.ts src/store/__tests__/sessionStore.test.ts
git commit -m "feat(session): execute locked trainer plans safely"
```

### Task 9: Verificar asignacion, revision y regresion completa

**Files:**
- Create: `tests/e2e/trainer-programming.spec.ts`
- Modify: `tests/e2e/helpers/core-product.ts`
- Modify: `tests/e2e/helpers/acceptance.ts`
- Verify: migracion 043 y todas las superficies de plan/sesion.

**Interfaces:**
- Consume fixtures de cliente, entrenador, relacion, plantilla, plan personal y sesion autorizada.
- Produce evidencia E2E de versionado y bloqueo.

- [ ] **Step 1: Implementar el journey E2E**

Probar: crear plantilla, proponer, revisar, aceptar, conservar plan personal, bloquear toda edicion/IA/compartir, ejecutar con resultados reales, rechazar manipulacion directa, autorizar sesion A, publicar revision B, terminar A con snapshot A e iniciar nueva sesion con B.

- [ ] **Step 2: Ejecutar E2E focalizado**

```bash
pnpm playwright test tests/e2e/trainer-programming.spec.ts --project=mobile-375 --project=tablet-768 --project=desktop-1440
```

- [ ] **Step 3: Ejecutar regresion de planes y sesiones**

```bash
pnpm vitest run src/lib/plans/__tests__ src/lib/session/__tests__ src/app/actions/__tests__/saveSession.test.ts src/components/plan/__tests__ src/components/session/__tests__ src/store/__tests__/sessionStore.test.ts
```

- [ ] **Step 4: Ejecutar verificacion completa**

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

- [ ] **Step 5: Commit de la tarea**

```bash
git add tests/e2e/trainer-programming.spec.ts tests/e2e/helpers/core-product.ts tests/e2e/helpers/acceptance.ts
git commit -m "test(coaching): verify professional programming flow"
```

## Completion Criteria

- Plantillas y planes de cliente estan separados; las publicaciones son snapshots inmutables.
- La primera rutina requiere aceptacion; revisiones posteriores solo cambian sesiones futuras.
- Un plan profesional no consume cupo personal y el plan anterior se conserva.
- El cliente no puede modificar, sustituir, compartir, ajustar, regenerar, autoprogresar ni reemplazar una prescripcion activa.
- El cliente si puede registrar ejecucion real, notas, omisiones y detenerse de forma segura.
- Sesiones autorizadas e historial conservan exactamente su version original.
- Finalizacion/suspension congelan asignaciones y conservan el ultimo plan bloqueado.
