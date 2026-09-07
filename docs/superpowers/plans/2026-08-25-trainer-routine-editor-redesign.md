# Trainer Routine Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the professional trainer routine editor around one active day and make multi-exercise insertion atomic, recoverable, and responsive.

**Architecture:** A PostgreSQL RPC owns authorization, locking, order compaction, and batch insertion. A plural Next.js server action maps form input to that RPC, while focused React components compose the active-day workspace, shared exercise catalog, hybrid save states, and assignment/publication guardrails.

**Tech Stack:** Next.js 14, React 18, TypeScript 5, Supabase/PostgreSQL, Tailwind CSS, Radix UI, Vitest, Playwright, pgTAP, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-25-trainer-routine-editor-redesign-design.md`

## Global Constraints

- Do not add dependencies.
- Do not edit historical migration `043_trainer_programming.sql`; add `056_trainer_template_exercise_batch_append.sql`.
- The batch defaults are exactly `3` sets, `10` repetitions, RPE `7`, `60` seconds rest, `null` weight, and `null` notes.
- A day may contain at most `30` exercises, matching the existing database constraint.
- `order_index` and `order_in_plan` must never be editable numeric form fields; only the existing atomic reorder RPCs may change them after creation.
- Structural changes save immediately. Routine/day metadata and exercise prescription edits require explicit save.
- Assignment and publication remain separate confirmed operations and must be blocked while descriptive changes are pending.
- Preserve the existing Vekira color tokens, dark/light themes, published snapshot immutability, and separation from personal plans.
- Interactive targets must be at least `44 × 44` px. The editor must not overflow horizontally at `320`, `360`, `390`, `430`, or `450` px.
- Apply migration 056 remotely before deploying the UI; a committed SQL file is not evidence of remote application.
- Run CPU-heavy repository gates sequentially and use `--maxWorkers=4` for the browser-backed Vitest suites.

## File Map

### Database and operations

- Create `supabase/migrations/056_trainer_template_exercise_batch_append.sql`: atomic append RPC and preflight marker 56.
- Create `supabase/tests/056_trainer_template_exercise_batch_append_test.sql`: authorization, validation, atomicity, ordering, concurrency, and ACL coverage.
- Modify `scripts/test-trainer-programming-db.mjs`: apply, test, and rerun migration 056.
- Modify `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`: migration chronology and runner contract.
- Modify `README.md`: ordered migration list and deployment order.
- Modify `docs/operations/trainer-marketplace-runbook.md`: migration 056, preflight 56, smoke, and forward-only recovery.
- Modify `docs/operations/trainer-pilot-checklist.md`: release gate 040–056 and preflight 56.

### Server boundary

- Modify `src/app/actions/trainerPrograms.ts`: plural append action, order-free update parsers, targeted error mapping.
- Modify `src/app/actions/__tests__/trainerPrograms.test.ts`: plural payload, no client order, update boundaries, RPC errors.

### Shared catalog

- Modify `src/components/plan/ExercisePicker.tsx`: async confirmation, pending/error state, close only on success.
- Modify `src/components/plan/__tests__/ExercisePicker.test.ts`: pending/error rendering contract.
- Modify `src/components/plan/__tests__/fixtures/planInteractions.fixture.tsx`: first-failure retry fixture.
- Modify `src/components/plan/__tests__/planInteractions.test.tsx`: preserve selection and dialog state after failure.

### Professional editor

- Create `src/components/coaching/program-editor/types.ts`: shared template/workout/exercise/action choice types.
- Create `src/components/coaching/program-editor/model.ts`: pure ordering and weekly summary helpers.
- Create `src/components/coaching/program-editor/SaveStateIndicator.tsx`: saved/dirty/saving/error presentation.
- Create `src/components/coaching/program-editor/ProgramTemplateSummary.tsx`: compact metadata summary and explicit editor.
- Create `src/components/coaching/program-editor/TemplateDayTabs.tsx`: active-day navigation and structural controls.
- Create `src/components/coaching/program-editor/TemplateExerciseCard.tsx`: mobile-safe exercise card and prescription form.
- Create `src/components/coaching/program-editor/TemplateExerciseBatchPicker.tsx`: multiple selection and batch action bridge.
- Create `src/components/coaching/program-editor/ActiveTemplateWorkout.tsx`: active day, totals, cards, and day metadata.
- Create `src/components/coaching/program-editor/ProgramTemplateActions.tsx`: status, weekly totals, assignment, and revision panel.
- Modify `src/components/coaching/ProgramTemplateEditor.tsx`: orchestrate the workspace and hybrid state.
- Delete `src/components/coaching/TemplateWorkoutEditor.tsx`: responsibilities move to the focused components above.
- Modify `src/components/coaching/AssignProgramDialog.tsx`: block opening while descriptive changes are dirty.
- Modify `src/components/coaching/PublishProgramRevisionDialog.tsx`: same dirty guard.
- Modify `src/app/(app)/coach/programs/[templateId]/page.tsx`: pass relationship/assignment choices into the workspace and remove the old stacked layout.

### UI tests and fixtures

- Create `src/components/coaching/__tests__/programEditorModel.test.ts`: pure summary/order coverage.
- Modify `src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts`: record repeated fields and deterministic batch failures.
- Modify `src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx`: two days and three catalog exercises.
- Modify `src/components/coaching/__tests__/programTemplateEditor.test.tsx`: active day, batch retry, two consecutive appends, dirty states, and order-free forms.
- Modify `src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx`: new editor props and complete action panel.
- Modify `src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts`: tab semantics, responsive widths, safe area, and focus restoration.

---

### Task 1: Add the atomic trainer-template batch append RPC

**Files:**
- Create: `supabase/migrations/056_trainer_template_exercise_batch_append.sql`
- Create: `supabase/tests/056_trainer_template_exercise_batch_append_test.sql`
- Modify: `scripts/test-trainer-programming-db.mjs`

**Interfaces:**
- Consumes: `trainer_template_workouts`, `trainer_template_exercises`, `exercises`, authenticated trainer/profile guards, and `trainer_template_exercises_workout_order_unique` from migration 043.
- Produces: `public.append_trainer_template_exercises(uuid, jsonb) returns jsonb`; successful payload `{ "templateWorkoutId": string, "exercises": [{ "id": string, "exerciseId": string, "orderIndex": number }] }`.

- [ ] **Step 1: Register migration 056 and its pgTAP file in the database runner**

Add the migration after 053 in `trainerMigrationFiles`, add a test path, and execute the new pgTAP suite before authorization/security suites:

```js
const trainerMigrationFiles = [
  '040_trainer_foundations.sql',
  '041_trainer_verification.sql',
  '042_trainer_relationships.sql',
  '043_trainer_programming.sql',
  '044_trainer_insights.sql',
  '045_trainer_hardening.sql',
  '046_release_session_authorization.sql',
  '047_product_notification_preferences_insert.sql',
  '048_profile_weight_measurement_sync.sql',
  '049_trainer_iso_weekday_repair.sql',
  '050_product_events_conversion_funnel.sql',
  '051_workout_adjustment_atomic.sql',
  '053_trainer_draft_rpc_json_repair.sql',
  '056_trainer_template_exercise_batch_append.sql',
]
const templateBatchAppendTestPath = path.join(
  repoRoot,
  'supabase',
  'tests',
  '056_trainer_template_exercise_batch_append_test.sql',
)
```

Run migration 056 explicitly in the initial path, run the pgTAP file, and keep it in the full rerun array. Update runner labels to `040-051, 053, 056` rather than claiming a contiguous trainer-only subset.

- [ ] **Step 2: Write the failing pgTAP contract**

Create fixtures for an active trainer, outsider, active template, day, four public exercises, and rows at orders `1` and `3`. Include these assertions:

```sql
SELECT plan(23);

SELECT is(
  jsonb_array_length(
    public.append_trainer_template_exercises(
      '56000000-0000-4000-8000-000000000071',
      '[
        {"exerciseId":"56000000-0000-4000-8000-000000000052","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null},
        {"exerciseId":"56000000-0000-4000-8000-000000000053","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}
      ]'::jsonb
    )->'exercises'
  ),
  2,
  'owner appends every selected exercise in one call'
);

SELECT results_eq(
  $$SELECT order_index FROM public.trainer_template_exercises
    WHERE template_workout_id = '56000000-0000-4000-8000-000000000071'
    ORDER BY order_index$$,
  $$VALUES (1), (2), (3), (4)$$,
  'existing gaps are compacted and appended exercises are consecutive'
);

SELECT throws_ok(
  $$SELECT public.append_trainer_template_exercises(
    '56000000-0000-4000-8000-000000000071',
    '[{"exerciseId":"56000000-0000-4000-8000-000000000099","sets":3,"reps":10,"weightKg":null,"targetRpe":7,"restSeconds":60,"notes":null}]'::jsonb
  )$$,
  'TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE',
  'an unavailable exercise rejects the complete batch'
);
```

Also assert malformed/non-array/empty JSON, duplicate IDs in one payload, all numeric ranges, more than 30 final rows, inactive profile, inactive trainer, outsider, anonymous ACL, forced second-insert rollback, exact return order, `SECURITY DEFINER`, fixed `search_path`, grants, preflight `56`, and idempotent migration rerun.

- [ ] **Step 3: Run the database suite and verify the new contract fails**

Run:

```powershell
pnpm test:db:trainers
```

Expected: FAIL because migration 056 and `append_trainer_template_exercises` do not exist.

- [ ] **Step 4: Implement migration 056**

Use exact domain errors so the action layer can map them:

```sql
CREATE OR REPLACE FUNCTION public.append_trainer_template_exercises(
  p_template_workout_id UUID,
  p_exercises JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID;
  v_existing_count INTEGER;
  v_requested_count INTEGER;
  v_result JSONB;
BEGIN
  SELECT template.trainer_user_id
  INTO v_trainer_user_id
  FROM public.trainer_template_workouts workout
  JOIN public.trainer_program_templates template ON template.id = workout.template_id
  WHERE workout.id = p_template_workout_id;

  IF auth.uid() IS NULL OR auth.role() <> 'authenticated'
    OR v_trainer_user_id IS NULL OR v_trainer_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  PERFORM 1 FROM public.profiles
    WHERE id = v_trainer_user_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_profiles
    WHERE user_id = v_trainer_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_template_workouts
    WHERE id = p_template_workout_id FOR UPDATE;

  IF jsonb_typeof(p_exercises) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;
  v_requested_count := jsonb_array_length(p_exercises);
  IF v_requested_count NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) request(item)
    WHERE jsonb_typeof(request.item) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(request.item)) <> 7
      OR NOT (request.item ?& ARRAY[
        'exerciseId', 'sets', 'reps', 'weightKg', 'targetRpe', 'restSeconds', 'notes'
      ])
      OR jsonb_typeof(request.item->'exerciseId') <> 'string'
      OR jsonb_typeof(request.item->'sets') <> 'number'
      OR jsonb_typeof(request.item->'reps') <> 'number'
      OR jsonb_typeof(request.item->'weightKg') NOT IN ('number', 'null')
      OR jsonb_typeof(request.item->'targetRpe') NOT IN ('number', 'null')
      OR jsonb_typeof(request.item->'restSeconds') <> 'number'
      OR jsonb_typeof(request.item->'notes') NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) request(item)
    WHERE request.item->>'exerciseId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR request.item->>'sets' !~ '^[0-9]+$'
      OR request.item->>'reps' !~ '^[0-9]+$'
      OR request.item->>'restSeconds' !~ '^[0-9]+$'
      OR request.item->>'weightKg' IS NOT NULL
        AND request.item->>'weightKg' !~ '^[0-9]+(?:\.[0-9]+)?$'
      OR request.item->>'targetRpe' IS NOT NULL
        AND request.item->>'targetRpe' !~ '^[0-9]+(?:\.[05])?$'
  ) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_exercises) AS request(
      "exerciseId" TEXT,
      sets INTEGER,
      reps INTEGER,
      "weightKg" NUMERIC,
      "targetRpe" NUMERIC,
      "restSeconds" INTEGER,
      notes TEXT
    )
    WHERE request.sets NOT BETWEEN 1 AND 20
      OR request.reps NOT BETWEEN 1 AND 100
      OR request."weightKg" IS NOT NULL AND request."weightKg" NOT BETWEEN 0 AND 1000
      OR request."targetRpe" IS NOT NULL AND request."targetRpe" NOT BETWEEN 1 AND 10
      OR request."restSeconds" NOT BETWEEN 0 AND 3600
      OR char_length(COALESCE(request.notes, '')) > 1000
  ) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF (
    SELECT count(DISTINCT request.item->>'exerciseId')
    FROM jsonb_array_elements(p_exercises) request(item)
  ) <> v_requested_count THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM public.exercises exercise
    WHERE exercise.is_public = TRUE
      AND exercise.id IN (
        SELECT (request.item->>'exerciseId')::UUID
        FROM jsonb_array_elements(p_exercises) request(item)
      )
  ) <> v_requested_count THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE';
  END IF;

  SET CONSTRAINTS trainer_template_exercises_workout_order_unique DEFERRED;
  PERFORM exercise.id
  FROM public.trainer_template_exercises exercise
  WHERE exercise.template_workout_id = p_template_workout_id
  ORDER BY exercise.order_index, exercise.id
  FOR UPDATE;

  WITH ranked AS (
    SELECT exercise.id,
           row_number() OVER (ORDER BY exercise.order_index, exercise.id)::INTEGER AS next_order
    FROM public.trainer_template_exercises exercise
    WHERE exercise.template_workout_id = p_template_workout_id
  )
  UPDATE public.trainer_template_exercises exercise
  SET order_index = ranked.next_order
  FROM ranked
  WHERE exercise.id = ranked.id;

  SELECT count(*) INTO v_existing_count
  FROM public.trainer_template_exercises
  WHERE template_workout_id = p_template_workout_id;
  IF v_existing_count + v_requested_count > 30 THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_LIMIT';
  END IF;

  WITH requested AS (
    SELECT request.item, request.position
    FROM jsonb_array_elements(p_exercises) WITH ORDINALITY AS request(item, position)
  ), inserted AS (
    INSERT INTO public.trainer_template_exercises (
      template_workout_id,
      exercise_id,
      order_index,
      sets,
      reps,
      weight_kg,
      target_rpe,
      rest_seconds,
      notes
    )
    SELECT
      p_template_workout_id,
      (requested.item->>'exerciseId')::UUID,
      v_existing_count + requested.position::INTEGER,
      (requested.item->>'sets')::INTEGER,
      (requested.item->>'reps')::INTEGER,
      (requested.item->>'weightKg')::NUMERIC,
      (requested.item->>'targetRpe')::NUMERIC,
      (requested.item->>'restSeconds')::INTEGER,
      NULLIF(btrim(requested.item->>'notes'), '')
    FROM requested
    ORDER BY requested.position
    RETURNING id, exercise_id, order_index
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', inserted.id,
      'exerciseId', inserted.exercise_id,
      'orderIndex', inserted.order_index
    )
    ORDER BY inserted.order_index
  )
  INTO v_result
  FROM inserted;

  RETURN jsonb_build_object(
    'templateWorkoutId', p_template_workout_id,
    'exercises', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION public.append_trainer_template_exercises(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.append_trainer_template_exercises(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_trainer_template_exercises(UUID, JSONB) TO authenticated, service_role;
```

Copy the final `trainer_security_preflight()` body from migration 049 into migration 056, preserve every existing check, add the following condition before its return, change its marker to `56`, and reapply its owner/grants:

```sql
IF to_regprocedure('public.append_trainer_template_exercises(uuid,jsonb)') IS NULL
  OR has_function_privilege('anon', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
  OR NOT has_function_privilege('authenticated', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
  OR NOT has_function_privilege('service_role', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
THEN
  RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
END IF;

RETURN 56;
```

- [ ] **Step 5: Run the database suite and verify it passes**

Run:

```powershell
pnpm test:db:trainers
```

Expected: PASS, including the new 056 pgTAP suite and the full locked-fixture rerun.

- [ ] **Step 6: Commit the database boundary**

```powershell
git add supabase/migrations/056_trainer_template_exercise_batch_append.sql supabase/tests/056_trainer_template_exercise_batch_append_test.sql scripts/test-trainer-programming-db.mjs
git commit -m "feat(coach): append template exercises atomically"
```

### Task 2: Add plural server actions and remove client-owned order fields

**Files:**
- Modify: `src/app/actions/__tests__/trainerPrograms.test.ts`
- Modify: `src/app/actions/trainerPrograms.ts`

**Interfaces:**
- Consumes: RPC `append_trainer_template_exercises(UUID, JSONB)` from Task 1.
- Produces: `addTrainerTemplateExercises(formData)` and an order-free `updateTrainerTemplateExercise(formData)` / `updateTrainerTemplateWorkout(formData)`.

- [ ] **Step 1: Extend the Supabase fixture to return an RPC batch payload**

Make `rpc` return the same shape as PostgreSQL:

```ts
const rpc = vi.fn(async () => ({
  data: {
    templateWorkoutId: ids.workout,
    exercises: [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: ids.exercise, orderIndex: 2 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', exerciseId: '44444444-4444-4444-8444-444444444444', orderIndex: 3 },
    ],
  },
  error: null,
}))
```

- [ ] **Step 2: Write failing action tests**

Add tests proving repeated `exerciseId` fields become one RPC call and order fields disappear:

```ts
it('appends repeated exercise ids with server-owned defaults and no client order', async () => {
  const supabase = supabaseFixture()
  requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
  const { addTrainerTemplateExercises } = await import('../trainerPrograms')
  const data = form({ templateWorkoutId: ids.workout })
  data.append('exerciseId', ids.exercise)
  data.append('exerciseId', '44444444-4444-4444-8444-444444444444')
  data.set('orderIndex', '1')

  await expect(addTrainerTemplateExercises(data)).resolves.toMatchObject({
    ok: true,
    exercises: [
      { exerciseId: ids.exercise, orderIndex: 2 },
      { exerciseId: '44444444-4444-4444-8444-444444444444', orderIndex: 3 },
    ],
  })
  expect(supabase.rpc).toHaveBeenCalledWith('append_trainer_template_exercises', {
    p_template_workout_id: ids.workout,
    p_exercises: [
      { exerciseId: ids.exercise, sets: 3, reps: 10, weightKg: null, targetRpe: 7, restSeconds: 60, notes: null },
      { exerciseId: '44444444-4444-4444-8444-444444444444', sets: 3, reps: 10, weightKg: null, targetRpe: 7, restSeconds: 60, notes: null },
    ],
  })
  expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('orderIndex')
})
```

Add separate assertions for empty/duplicate/31-ID selections, mapped database errors, template-path revalidation, workout update without `orderInPlan`, and exercise update without `orderIndex`.

- [ ] **Step 3: Run the action tests and verify they fail**

Run:

```powershell
pnpm vitest run src/app/actions/__tests__/trainerPrograms.test.ts
```

Expected: FAIL because the plural action and order-free parsers are absent.

- [ ] **Step 4: Implement the result types and shared RPC helper**

Use these contracts:

```ts
type AppendedExercise = { id: string; exerciseId: string; orderIndex: number }
type ExerciseBatchResult = { ok: true; exercises: AppendedExercise[] } | Failure

const DEFAULT_TEMPLATE_PRESCRIPTION = {
  sets: 3,
  reps: 10,
  weightKg: null,
  targetRpe: 7,
  restSeconds: 60,
  notes: null,
} as const

function repeatedUuidValues(formData: FormData, field: string, maximum: number) {
  const ids = formData.getAll(field)
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map(candidate => candidate.trim())
    .filter(Boolean)
  return ids.length > 0
    && ids.length <= maximum
    && new Set(ids).size === ids.length
    && ids.every(validUuid)
    ? ids
    : null
}
```

Create an internal helper that calls the RPC and validates its returned array before reporting success. Map the exact database errors from Task 1 to:

```ts
const BATCH_ERROR_MESSAGES: Record<string, string> = {
  TRAINER_TEMPLATE_OWNER_REQUIRED: 'No tienes permiso para modificar este entrenamiento.',
  TRAINER_TEMPLATE_BATCH_INVALID: 'La selección de ejercicios no es válida.',
  TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE: 'Uno de los ejercicios ya no está disponible.',
  TRAINER_TEMPLATE_BATCH_LIMIT: 'Este día no puede superar 30 ejercicios.',
}
```

- [ ] **Step 5: Implement the plural action and compatibility adapter**

```ts
export async function addTrainerTemplateExercises(formData: FormData): Promise<ExerciseBatchResult> {
  const context = await requireActiveTrainerContext()
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const exerciseIds = repeatedUuidValues(formData, 'exerciseId', 30)
  if (!exerciseIds) return failure({ exerciseId: 'Selecciona entre 1 y 30 ejercicios válidos.' })
  return appendTemplateExerciseDrafts(context, ownership, exerciseIds.map(exerciseId => ({
    exerciseId,
    ...DEFAULT_TEMPLATE_PRESCRIPTION,
  })))
}
```

Keep `addTrainerTemplateExercise` only as a one-item adapter for any remaining caller, but discard submitted `orderIndex` and route the insert through the same RPC. Split `createWorkoutInput` from `updateWorkoutInput`, and `createExerciseInput` from `updateExerciseInput`, so update payloads cannot write ordering columns.

- [ ] **Step 6: Run action tests and type-check**

Run:

```powershell
pnpm vitest run src/app/actions/__tests__/trainerPrograms.test.ts
pnpm type-check
```

Expected: both PASS.

- [ ] **Step 7: Commit the server boundary**

```powershell
git add src/app/actions/trainerPrograms.ts src/app/actions/__tests__/trainerPrograms.test.ts
git commit -m "fix(coach): keep exercise order on the server"
```

### Task 3: Make exercise-catalog confirmation recoverable

**Files:**
- Modify: `src/components/plan/__tests__/ExercisePicker.test.ts`
- Modify: `src/components/plan/__tests__/fixtures/planInteractions.fixture.tsx`
- Modify: `src/components/plan/__tests__/planInteractions.test.tsx`
- Modify: `src/components/plan/ExercisePicker.tsx`

**Interfaces:**
- Consumes: existing catalog pagination, filtering, `toggleExerciseSelection`, and Radix dialog.
- Produces: `onConfirm(ids, options) => boolean | void | Promise<boolean | void>` where `false` keeps the dialog open; `confirming`, `confirmationError`, and `confirmationDetails` render in `ExerciseCatalogDialogView` and pass through `ExerciseCatalogDialog`.

- [ ] **Step 1: Write the static pending/error rendering test**

Extend the view props in `ExercisePicker.test.ts` and render:

```ts
const html = renderToStaticMarkup(createElement(ExerciseCatalogDialogView, {
  options,
  query: '',
  muscle: '',
  equipment: '',
  selectedIds: ['curl'],
  onQueryChange: () => undefined,
  onMuscleChange: () => undefined,
  onEquipmentChange: () => undefined,
  onToggle: () => undefined,
  onConfirm: () => undefined,
  confirming: true,
  confirmationError: 'No se pudieron agregar los ejercicios.',
  confirmationDetails: createElement('p', null, '3 × 10 · RPE 7 · 60 s'),
}))

expect(html).toContain('Agregando…')
expect(html).toContain('aria-disabled="true"')
expect(html).toContain('role="alert"')
expect(html).toContain('No se pudieron agregar los ejercicios.')
expect(html).toContain('3 × 10 · RPE 7 · 60 s')
```

- [ ] **Step 2: Add a browser fixture that fails the first confirmation**

In `CatalogFixture`, use URL parameter `confirm=retry` and record attempts:

```tsx
let catalogConfirmAttempts = 0

async function confirmCatalog(ids: string[]) {
  catalogConfirmAttempts += 1
  ;(window as Window & { __CATALOG_ATTEMPTS__?: number }).__CATALOG_ATTEMPTS__ = catalogConfirmAttempts
  if (new URLSearchParams(window.location.search).get('confirm') === 'retry' && catalogConfirmAttempts === 1) {
    return false
  }
  ;(window as Window & { __CATALOG_SELECTION__?: string[] }).__CATALOG_SELECTION__ = ids
  return true
}
```

- [ ] **Step 3: Write the failing retry interaction test**

```ts
it('keeps selection and focus context when async confirmation fails', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=catalog&confirm=retry`)
  const catalog = page.getByRole('dialog', { name: 'Agregar ejercicio' })
  await catalog.getByRole('button', { name: /Ejercicio 01/ }).click()
  await catalog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
  await pwExpect(catalog).toBeVisible()
  await pwExpect(catalog.getByRole('button', { name: /Ejercicio 01/ })).toHaveAttribute('aria-pressed', 'true')
  await catalog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
  await pwExpect.poll(() => page.evaluate(() => (window as any).__CATALOG_SELECTION__)).toEqual(['exercise-01'])
  await context.close()
})
```

- [ ] **Step 4: Run the focused picker tests and verify failure**

Run:

```powershell
pnpm vitest run src/components/plan/__tests__/ExercisePicker.test.ts src/components/plan/__tests__/planInteractions.test.tsx --maxWorkers=4
```

Expected: FAIL because confirmation closes immediately and cannot await `false`.

- [ ] **Step 5: Implement async confirmation**

Extend `ExerciseCatalogDialogViewProps` with:

```ts
confirming?: boolean
confirmationError?: string | null
confirmationDetails?: React.ReactNode
```

Add the same optional `confirmationError` and `confirmationDetails` props to `ExerciseCatalogDialog`, and change its `onConfirm` return type to `boolean | void | Promise<boolean | void>`. Disable search, filters, selection, pagination, and confirmation while `confirming`. Render details first and the error immediately above the footer button with `role="alert"`. In `ExerciseCatalogDialog`, track local pending/error state under names that do not shadow the external error prop, then:

```ts
async function confirmSelection() {
  if (confirming || draftIds.length === 0) return
  setConfirming(true)
  setInternalConfirmationError(null)
  try {
    const selectedOptions = draftIds.flatMap(id => {
      const option = knownOptions.get(id)
      return option ? [option] : []
    })
    const result = await onConfirm(draftIds, selectedOptions)
    if (result !== false) onOpenChange(false)
  } catch (cause) {
    setInternalConfirmationError(cause instanceof Error ? cause.message : 'No se pudo completar la selección.')
  } finally {
    setConfirming(false)
  }
}
```

Pass `confirmationError ?? internalConfirmationError` into the view. Reset only the internal confirmation error when the selection changes. Do not reset `draftIds` after failure.

- [ ] **Step 6: Run picker regression tests**

Run:

```powershell
pnpm vitest run src/components/plan/__tests__/ExercisePicker.test.ts src/components/plan/__tests__/planInteractions.test.tsx --maxWorkers=4
```

Expected: PASS for both new retry coverage and existing paginated selection/replacement flows.

- [ ] **Step 7: Commit the shared catalog behavior**

```powershell
git add src/components/plan/ExercisePicker.tsx src/components/plan/__tests__/ExercisePicker.test.ts src/components/plan/__tests__/fixtures/planInteractions.fixture.tsx src/components/plan/__tests__/planInteractions.test.tsx
git commit -m "feat(catalog): preserve selections after confirm errors"
```

### Task 4: Build the active-day workspace and multi-add bridge

**Files:**
- Create: `src/components/coaching/program-editor/types.ts`
- Create: `src/components/coaching/program-editor/model.ts`
- Create: `src/components/coaching/program-editor/SaveStateIndicator.tsx`
- Create: `src/components/coaching/program-editor/ProgramTemplateSummary.tsx`
- Create: `src/components/coaching/program-editor/TemplateDayTabs.tsx`
- Create: `src/components/coaching/program-editor/TemplateExerciseCard.tsx`
- Create: `src/components/coaching/program-editor/TemplateExerciseBatchPicker.tsx`
- Create: `src/components/coaching/program-editor/ActiveTemplateWorkout.tsx`
- Create: `src/components/coaching/program-editor/ProgramTemplateActions.tsx`
- Create: `src/components/coaching/__tests__/programEditorModel.test.ts`
- Modify: `src/components/coaching/ProgramTemplateEditor.tsx`
- Delete: `src/components/coaching/TemplateWorkoutEditor.tsx`
- Modify: `src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts`
- Modify: `src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx`
- Modify: `src/components/coaching/__tests__/programTemplateEditor.test.tsx`

**Interfaces:**
- Consumes: plural action from Task 2 and recoverable catalog from Task 3.
- Produces: one active-day workspace, `SaveState`, `RoutineSummary`, and responsive components used by the route in Task 6.

- [ ] **Step 1: Define shared types and pure model tests**

Use these types in `types.ts`:

```ts
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
export type ProgramTemplateView = {
  id: string
  name: string
  goal: string | null
  description: string | null
  days_per_week: number
  status: 'draft' | 'active' | 'archived'
}
export type TemplateExerciseView = {
  id: string
  exercise_id: string
  order_index: number
  sets: number
  reps: number
  weight_kg: number | null
  target_rpe: number | null
  rest_seconds: number
  notes: string | null
  exercise?: { name: string; muscle_groups?: string[] | null; equipment?: string[] | null } | null
}
export type TemplateWorkoutView = {
  id: string
  name: string
  day_of_week: number
  order_in_plan: number
  exercises: TemplateExerciseView[]
}
export type RoutineSummary = { days: number; exercises: number; sets: number; estimatedMinutes: number }
```

Write tests for:

```ts
expect(summarizeRoutine(workouts)).toEqual({ days: 2, exercises: 3, sets: 10, estimatedMinutes: 32 })
expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
```

Use an explicit estimate formula in `model.ts`: `sets * 2 + exercises * 4` minutes. It is UI guidance only and must be labeled “estimado”.

- [ ] **Step 2: Run the model test and verify failure**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/programEditorModel.test.ts
```

Expected: FAIL because the model module does not exist.

- [ ] **Step 3: Implement the pure model and presentational primitives**

Implement `summarizeRoutine`, `summarizeWorkout`, and `moveItem` without React or server imports. `SaveStateIndicator` must map states to visible copy:

```ts
const SAVE_COPY: Record<SaveState, string> = {
  saved: 'Todo guardado',
  dirty: 'Cambios pendientes',
  saving: 'Guardando…',
  error: 'No se pudo guardar',
}
```

`TemplateDayTabs` must use `role="tablist"`, one `role="tab"` per day, `aria-selected`, `aria-controls`, and horizontally scrolling `snap-x overflow-x-auto` styles. It emits `onSelect(id)`, `onMove(id, delta)`, and `onAdd()`; it never mutates data itself.

- [ ] **Step 4: Upgrade the action fixture before browser tests**

Preserve repeated fields instead of losing them through `Object.fromEntries`:

```ts
function fieldsFrom(formData?: FormData) {
  const fields: Record<string, string | string[]> = {}
  for (const [key, value] of formData?.entries() ?? []) {
    if (typeof value !== 'string') continue
    const current = fields[key]
    fields[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value]
  }
  return fields
}
```

Implement fixture action `addTrainerTemplateExercises(formData)` that records `add-exercises`. With `batch=retry`, fail only the first call and succeed on the second. Return two deterministic appended exercises on success.

- [ ] **Step 5: Write failing browser tests for active-day navigation and batch retry**

Update the editor fixture to contain Day A and Day B plus three distinct catalog options. Add:

```ts
it('shows one active day and switches panels with tab semantics', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
  await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveAttribute('aria-selected', 'true')
  await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toBeVisible()
  await page.getByRole('tab', { name: /Día B/ }).click()
  await pwExpect(page.getByRole('tabpanel', { name: /Día B/ })).toBeVisible()
  await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toHaveCount(0)
  await page.close()
})

it('keeps a failed multi-selection and retries the same batch', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?batch=retry`)
  await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
  const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
  await dialog.getByRole('button', { name: /Prensa/ }).click()
  await dialog.getByRole('button', { name: /Gemelos/ }).click()
  await dialog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()
  await pwExpect(dialog).toBeVisible()
  await pwExpect(dialog.getByRole('alert')).toContainText('No se pudieron agregar los ejercicios.')
  await dialog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()
  await pwExpect(dialog).toBeHidden()
  const calls = await page.evaluate(() => (window as any).__PROGRAM_ACTIONS__)
  expect(calls.filter((call: any) => call.action === 'add-exercises')).toHaveLength(2)
  await page.close()
})

it('submits two consecutive batches without an order field', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
  for (const exerciseName of ['Prensa', 'Gemelos']) {
    await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
    const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
    await dialog.getByRole('button', { name: new RegExp(exerciseName) }).click()
    await dialog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
    await pwExpect(dialog).toBeHidden()
  }
  const calls = await page.evaluate(() => (window as any).__PROGRAM_ACTIONS__)
  const batches = calls.filter((call: any) => call.action === 'add-exercises')
  expect(batches).toHaveLength(2)
  expect(batches.every((call: any) => call.fields.orderIndex === undefined)).toBe(true)
  await page.close()
})

it('keeps the confirmed order when a structural reorder fails', async () => {
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?reorder=error`)
  const before = await page.locator('[data-template-exercise-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
  await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
  await pwExpect(page.getByRole('status')).toContainText('No se pudo actualizar el orden.')
  const after = await page.locator('[data-template-exercise-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
  expect(after).toEqual(before)
  await page.close()
})
```

- [ ] **Step 6: Run the editor browser test and verify failure**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
```

Expected: FAIL because the current page stacks every day and uses a single picker.

- [ ] **Step 7: Implement the batch picker and exercise card**

`TemplateExerciseBatchPicker` owns only open/error state and returns `false` to the shared catalog on failure:

```tsx
<ExerciseCatalogDialog
  open={open}
  onOpenChange={setOpen}
  options={toExerciseCatalogOptions(options)}
  selectionMode="multiple"
  maxSelections={remainingCapacity}
  paginated
  title="Agregar ejercicios"
  confirmationError={error}
  confirmationDetails={<p>Valores iniciales: 3 × 10 · RPE 7 · 60 s</p>}
  onConfirm={async ids => {
    const data = new FormData()
    data.set('templateWorkoutId', workoutId)
    ids.forEach(id => data.append('exerciseId', id))
    const action = await import('@/app/actions/trainerPrograms')
    const result = await action.addTrainerTemplateExercises(data)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError(null)
    onAdded(result.exercises)
    return true
  }}
/>
```

The details remain visible above the confirmation footer and the error stays adjacent to the failed action.

`TemplateExerciseCard` must render a three-column metrics grid using `grid-cols-3 min-w-0`, place edit/delete in a 44 px menu/control, and omit any editable order field. Its prescription form includes only `templateExerciseId`, `exerciseId`, `sets`, `reps`, `weightKg`, `targetRpe`, `restSeconds`, and `notes`.

- [ ] **Step 8: Implement the active-day workspace composition**

`ProgramTemplateEditor` owns `activeWorkoutId`, derives the active workout, and renders:

```tsx
<section className="space-y-4">
  <ProgramTemplateSummary template={template} saveState={templateSaveState} />
  <TemplateDayTabs
    workouts={workouts}
    activeWorkoutId={activeWorkout.id}
    onSelect={setActiveWorkoutId}
    onMove={moveWorkout}
    onAdd={() => setAddingWorkout(true)}
  />
  <ActiveTemplateWorkout
    key={activeWorkout.id}
    workout={activeWorkout}
    options={options}
    onChanged={() => router.refresh()}
  />
</section>
```

Render an empty state with “Agregar primer día” when no workout exists. Move all exercise/day mutations into `ActiveTemplateWorkout`; use independent pending flags for template, day, batch, reorder, delete, and prescription save. Remove `TemplateWorkoutEditor.tsx` only after no import remains.

Do not mutate the rendered order before a reorder RPC succeeds. If drag/reorder later becomes optimistic, snapshot the previous IDs and restore them on failure. Preserve archive-with-confirmation inside `ProgramTemplateActions`. Day creation uses localized ISO weekday labels (`1=Lunes` through `7=Domingo`) and computes its initial `orderInPlan` internally; it never exposes an editable order control.

- [ ] **Step 9: Run model and editor tests**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/programEditorModel.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
pnpm type-check
```

Expected: PASS.

- [ ] **Step 10: Commit the workspace**

```powershell
git add src/components/coaching/program-editor src/components/coaching/ProgramTemplateEditor.tsx src/components/coaching/TemplateWorkoutEditor.tsx src/components/coaching/__tests__/programEditorModel.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts
git commit -m "feat(coach): rebuild routine editor by active day"
```

### Task 5: Enforce hybrid save states and guard assignment/publication

**Files:**
- Modify: `src/components/coaching/AssignProgramDialog.tsx`
- Modify: `src/components/coaching/PublishProgramRevisionDialog.tsx`
- Modify: `src/components/coaching/program-editor/ProgramTemplateSummary.tsx`
- Modify: `src/components/coaching/program-editor/ActiveTemplateWorkout.tsx`
- Modify: `src/components/coaching/program-editor/ProgramTemplateActions.tsx`
- Modify: `src/components/coaching/ProgramTemplateEditor.tsx`
- Modify: `src/app/(app)/coach/programs/[templateId]/page.tsx`
- Modify: `src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx`
- Modify: `src/components/coaching/__tests__/programTemplateEditor.test.tsx`

**Interfaces:**
- Consumes: workspace state from Task 4 and existing relationship/assignment choice arrays from the route.
- Produces: `blocked?: boolean` and `blockedMessage?: string` on both professional action dialogs; route-level complete workspace.

- [ ] **Step 1: Write failing dirty-state and action-guard tests**

Add browser coverage:

```ts
it('requires explicit metadata save before assignment or publication', async () => {
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
  await page.getByRole('button', { name: 'Editar información' }).click()
  await page.getByLabel('Nombre de la rutina').fill('Fuerza editada')
  await pwExpect(page.getByText('Cambios pendientes')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
  await pwExpect(page.getByRole('status')).toContainText('Guarda los cambios pendientes antes de asignar o publicar.')
  await page.getByRole('button', { name: 'Guardar detalles' }).click()
  await pwExpect(page.getByText('Todo guardado')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
  await pwExpect(page.locator('#assign-program-form')).toBeVisible()
  await page.close()
})
```

Update the deterministic edit-form assertion so `update-workout` contains no `orderInPlan` and `update-exercise` contains no `orderIndex`.

- [ ] **Step 2: Run the focused browser test and verify failure**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
```

Expected: FAIL because dirty state is not shared with assignment/publication controls.

- [ ] **Step 3: Add blocked action contracts**

Add to both dialogs:

```ts
type PendingChangeGuardProps = {
  blocked?: boolean
  blockedMessage?: string
}
```

Before opening, check `blocked`. If true, keep the form closed, place `blockedMessage` in the existing `role="status"` region, and focus that status element. Do not disable the button: it must explain why the action is unavailable.

- [ ] **Step 4: Implement template/day dirty state**

Each explicit form owns a `SaveState`:

```ts
function markDirty() {
  setSaveState(current => current === 'saving' ? current : 'dirty')
}

async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  setSaveState('saving')
  const result = await updateTrainerProgram(data)
  setSaveState(result.ok ? 'saved' : 'error')
  if (result.ok) router.refresh()
}
```

Use `onInput={markDirty}` on descriptive forms. Install a `beforeunload` listener only while either template or active-day metadata is dirty/error. Structural operations and saved prescription forms must not trigger that listener.

- [ ] **Step 5: Compose the action panel inside the client workspace**

Extend `ProgramTemplateEditor` props with serializable choices:

```ts
relationships: Array<{ id: string; label: string }>
assignments: Array<{ id: string; label: string }>
```

Render `ProgramTemplateActions` in the desktop side column and mobile bottom region. Pass `blocked={hasPendingDescriptions}` to both dialogs. In the route, remove the old standalone dialogs and pass `relationshipChoices` / `revisionChoices` to `ProgramTemplateEditor`.

Expand the nested exercise query so existing cards receive their real metadata:

```ts
trainer_template_exercises(
  id,
  exercise_id,
  order_index,
  sets,
  reps,
  weight_kg,
  target_rpe,
  rest_seconds,
  notes,
  exercises(name, muscle_groups, equipment, image_url)
)
```

- [ ] **Step 6: Run editor tests and type-check**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit hybrid save behavior**

```powershell
git add src/components/coaching/AssignProgramDialog.tsx src/components/coaching/PublishProgramRevisionDialog.tsx src/components/coaching/program-editor src/components/coaching/ProgramTemplateEditor.tsx src/app/'(app)'/coach/programs/'[templateId]'/page.tsx src/components/coaching/__tests__/programTemplateEditor.test.tsx src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.fixture.tsx
git commit -m "feat(coach): guard routine actions with save state"
```

### Task 6: Lock down mobile geometry, accessibility, and focus behavior

**Files:**
- Modify: `src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx`
- Modify: `src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts`
- Modify: `src/components/coaching/program-editor/TemplateDayTabs.tsx`
- Modify: `src/components/coaching/program-editor/TemplateExerciseCard.tsx`
- Modify: `src/components/coaching/program-editor/TemplateExerciseBatchPicker.tsx`
- Modify: `src/components/coaching/program-editor/ProgramTemplateActions.tsx`
- Modify: `src/components/coaching/ProgramTemplateEditor.tsx`

**Interfaces:**
- Consumes: complete workspace from Tasks 4–5 and existing acceptance helpers.
- Produces: verified 320–450 px containment, tab semantics, 44 px targets, focus restoration, and safe-area behavior.

- [ ] **Step 1: Update the accessibility fixture to use the complete editor props**

Provide two days, three exercises, one relationship, and one active assignment. Keep the editor under `surface=editor`; do not create a second accessibility surface for the same workflow.

- [ ] **Step 2: Add failing mobile-width and semantic tests**

```ts
const EDITOR_MOBILE_VIEWPORTS = [320, 360, 390, 430, 450] as const

it.each(EDITOR_MOBILE_VIEWPORTS)('contains the active-day editor at %i px', async width => {
  const context = await browser.newContext({ viewport: { width, height: 844 } })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
  await page.waitForFunction(() => Boolean((window as any).__TRAINER_ACCESSIBILITY_READY__))
  await expectResponsiveGeometry(page)
  await expectActionTargetsAtLeast44(page)
  await pwExpect(page.getByRole('tablist', { name: 'Días de la rutina' })).toBeVisible()
  await pwExpect(page.locator('[data-exercise-metrics]')).toHaveCount(2)
  await context.close()
})
```

Add a keyboard test that opens the batch selector, selects two rows with Space/Enter, cancels, and confirms focus returns to “Agregar varios ejercicios”. Add Axe coverage with the metadata editor and batch dialog both opened separately.

- [ ] **Step 3: Run accessibility acceptance and verify failure**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts --maxWorkers=4
```

Expected: FAIL until the new layout, targets, focus restoration, and safe area are complete.

- [ ] **Step 4: Apply responsive and accessibility fixes**

Use these layout invariants:

```tsx
<div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
  <div className="min-w-0">{editor}</div>
  <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">{actions}</aside>
</div>
```

```tsx
<div data-exercise-metrics className="grid min-w-0 grid-cols-3 gap-2">
  <Metric label="Series × reps" value={`${sets} × ${reps}`} />
  <Metric label="Intensidad" value={targetRpe ? `RPE ${targetRpe}` : 'Libre'} />
  <Metric label="Descanso" value={`${restSeconds} s`} />
</div>
```

Use `min-w-0`, `truncate`, and `overflow-x-auto` only at intentional scrollers; never hide root overflow to mask a child escape. The mobile action bar must include `pb-[max(0.75rem,env(safe-area-inset-bottom))]`. Use Radix’s focus restoration for the dialog and explicitly focus the opening button after successful custom close if the wrapper intercepts it.

- [ ] **Step 5: Run accessibility and editor regressions**

Run:

```powershell
pnpm vitest run src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts src/components/coaching/__tests__/programTemplateEditor.test.tsx --maxWorkers=4
```

Expected: PASS at every requested viewport with no critical/serious Axe findings.

- [ ] **Step 6: Commit responsive hardening**

```powershell
git add src/components/coaching/program-editor src/components/coaching/ProgramTemplateEditor.tsx src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx src/components/coaching/__tests__/trainerAccessibilityAcceptance.test.ts
git commit -m "fix(coach): harden routine editor on mobile"
```

### Task 7: Document migration 056 and run the complete release gate

**Files:**
- Modify: `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`
- Modify: `README.md`
- Modify: `docs/operations/trainer-marketplace-runbook.md`
- Modify: `docs/operations/trainer-pilot-checklist.md`

**Interfaces:**
- Consumes: migration and UI behavior from Tasks 1–6.
- Produces: exact 040–056 migration chronology, trainer subset notation, preflight 56, deployment/smoke instructions, and final verified repository state.

- [ ] **Step 1: Write the failing migration/documentation contract**

Change the production migration filter to include 040–056 and assert exact order including 052, 054, 055, and 056. Add:

```ts
expect(readme).toContain('056_trainer_template_exercise_batch_append.sql')
expect(runbook).toContain('040–056')
expect(runbook).toContain('trainer_security_preflight() = 56')
expect(pilotChecklist).toContain('040–056')
expect(pilotChecklist).toContain('trainer_security_preflight() = 56')
expect(trainerRunner).toMatch(/053_trainer_draft_rpc_json_repair\.sql[\s\S]+056_trainer_template_exercise_batch_append\.sql/i)
```

Keep the runner documentation explicit that its professional subset is `040–051, 053, 056`, while the remote project must apply every production migration through 056 in numeric order.

- [ ] **Step 2: Run the contract and verify failure**

Run:

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts
```

Expected: FAIL because docs still stop at older markers.

- [ ] **Step 3: Update README and operations docs**

Document:

```text
056_trainer_template_exercise_batch_append.sql
```

The runbook sequence is:

1. verify backup/PITR and migration hashes;
2. apply every migration through 056 in numeric order;
3. confirm `trainer_security_preflight() = 56`;
4. confirm the 056 function exists with authenticated/service-role execute only;
5. smoke an existing day with two consecutive multi-adds, reorder, reload, assignment, and revision publication;
6. deploy the application only after the database smoke passes;
7. recover forward without dropping appended exercises or rewriting migration history.

The pilot checklist must block launch when migration 056, preflight 56, the authenticated smoke, or responsive editor acceptance is missing.

- [ ] **Step 4: Run focused contracts**

Run:

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts
pnpm vitest run src/app/actions/__tests__/trainerPrograms.test.ts src/components/plan/__tests__/ExercisePicker.test.ts src/components/coaching/__tests__/programEditorModel.test.ts --maxWorkers=4
```

Expected: PASS.

- [ ] **Step 5: Run full verification sequentially**

Run each command separately and capture its exit code:

```powershell
pnpm test:db:trainers
pnpm vitest run --maxWorkers=4
pnpm type-check
pnpm lint
git diff --check
```

Expected: every command exits `0`. If Docker/provider access is unavailable, do not claim the database gate passed; report it separately from code regressions.

- [ ] **Step 6: Perform the local authenticated/browser smoke when credentials are available**

Verify this exact sequence:

```text
Open an existing trainer template.
Select Day A.
Add Prensa and Gemelos in one confirmation.
Add Zancada in a second confirmation.
Edit Zancada to 4 × 8, RPE 8, 90 s.
Reorder Zancada above Gemelos.
Reload and confirm all rows and order persist.
Edit routine name and confirm assignment is blocked until “Guardar detalles”.
Save details, open assignment, then open revision publication.
Repeat the card check at 390 px with no horizontal overflow.
```

Do not mutate production during this local smoke. The remote smoke belongs to the deployment runbook and requires explicit environment access.

- [ ] **Step 7: Commit documentation and contract updates**

```powershell
git add src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts README.md docs/operations/trainer-marketplace-runbook.md docs/operations/trainer-pilot-checklist.md
git commit -m "docs(coach): add routine batch rollout gate"
```

- [ ] **Step 8: Verify final repository state**

Run:

```powershell
git status --short --branch
git log --oneline -8
```

Expected: no unintended working-tree changes and the task commits appear in order. Do not merge or push unless the user explicitly requests integration after reviewing the completed implementation.
