# Plan History Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every completed training session across plan regeneration, activation and retirement while making plan lifecycle and in-flight session saves atomic and idempotent.

**Architecture:** Completed sessions gain a versioned immutable context snapshot and all evidence readers become independent from the mutable `workouts` relation. Plans become versioned families retired through PostgreSQL RPCs instead of physical deletion; generation, activation and retirement use per-user locks. A server-issued session authorization captures context at start and lets one already-authorized workout finish after the active plan changes.

**Tech Stack:** Next.js 14 server actions, React 18, TypeScript 5, Supabase/PostgreSQL migrations and RLS, Vitest 4, Playwright 1.61.

## Global Constraints

- Preserve all existing `progress_logs` and `exercise_logs`; continuity migrations must not delete or truncate historical rows.
- Keep `workout_id` nullable and treat it only as an optional source reference.
- `session_result_snapshot` remains dedicated to PRs and progression suggestions; historical presentation uses `session_context_snapshot`.
- New session authorizations expire 12 hours after server-side creation and are consumed atomically with the first successful save.
- A free account may retain at most two non-retired plan families; superseded versions do not consume additional slots.
- A completed session from an older plan appears on its actual completion date but never marks a different workout from the new active plan as completed.
- Every database transition validates `auth.uid()`, owns its user rows, and takes a per-user advisory transaction lock before changing active-plan state.
- Readers remain backward compatible with `session_context_snapshot = NULL` and render the translated fallback `Entrenamiento` / `Workout` when both snapshot and workout relation are absent.
- Do not add runtime dependencies.

---

### Task 1: Immutable completed-session context and additive schema

**Files:**
- Create: `src/lib/session/contextSnapshot.ts`
- Create: `src/lib/session/__tests__/contextSnapshot.test.ts`
- Create: `supabase/migrations/036_completed_session_context.sql`
- Modify: `src/types/database.ts`
- Modify: `src/app/actions/saveSession.ts`

**Interfaces:**
- Produces: `SessionContextSnapshotV1`, `parseSessionContextSnapshot(value)`, `resolveSessionContext({ snapshot, workout, fallbackWorkoutName })`.
- Produces database fields: `progress_logs.session_context_snapshot`, `workout_plans.family_id`, `superseded_at`, `retired_at`, and `generation_request_id`.
- Consumers: Tasks 2–6.

- [ ] **Step 1: Write failing parser and resolution tests**

Create tests with literal fixtures proving:

```ts
expect(parseSessionContextSnapshot(validSnapshot)).toEqual(validSnapshot)
expect(parseSessionContextSnapshot({ version: 2 })).toBeNull()
expect(resolveSessionContext({ snapshot: validSnapshot, workout: { name: 'Renamed', focus: null }, fallbackWorkoutName: 'Workout' }))
  .toMatchObject({ workoutName: 'Original workout', source: 'snapshot' })
expect(resolveSessionContext({ snapshot: null, workout: { name: 'Legacy workout', focus: 'Core' }, fallbackWorkoutName: 'Workout' }))
  .toMatchObject({ workoutName: 'Legacy workout', source: 'workout' })
expect(resolveSessionContext({ snapshot: null, workout: null, fallbackWorkoutName: 'Workout' }))
  .toEqual({ workoutName: 'Workout', focus: null, source: 'fallback' })
```

Run: `pnpm exec vitest run src/lib/session/__tests__/contextSnapshot.test.ts`

Expected: FAIL because `contextSnapshot.ts` does not exist.

- [ ] **Step 2: Implement the strict version-1 context contract**

Define the exact public contract:

```ts
export interface SessionContextSnapshotV1 {
  version: 1
  workout: { id: string; name: string; focus: string | null; dayOfWeek: number | null }
  plan: { id: string; familyId: string; name: string; weekNumber: number | null } | null
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

Reject extra/missing top-level keys, malformed UUID/name fields, invalid nullable values and non-array exercise metadata. `resolveSessionContext` returns snapshot first, then live relation, then fallback.

- [ ] **Step 3: Verify parser tests pass**

Run: `pnpm exec vitest run src/lib/session/__tests__/contextSnapshot.test.ts`

Expected: PASS.

- [ ] **Step 4: Add the additive migration and backfill**

The migration must:

```sql
ALTER TABLE public.progress_logs
  ADD COLUMN session_context_snapshot JSONB;

ALTER TABLE public.workout_plans
  ADD COLUMN family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN superseded_at TIMESTAMPTZ,
  ADD COLUMN retired_at TIMESTAMPTZ,
  ADD COLUMN generation_request_id UUID;

CREATE UNIQUE INDEX workout_plans_user_generation_request_unique
  ON public.workout_plans(user_id, generation_request_id)
  WHERE generation_request_id IS NOT NULL;
```

Backfill snapshots only where the source workout still exists. Build exercise metadata from `workout_exercises JOIN exercises`, ordered by `order_index`. Keep already-null orphan sessions null rather than inventing metadata. Add indexes for `(user_id, retired_at, superseded_at, created_at DESC)` and `(user_id, family_id)`.

- [ ] **Step 5: Capture context when deriving a session outcome**

Extend the save path’s workout/exercise metadata query to construct `SessionContextSnapshotV1`. Add `contextSnapshot` to the internal candidate outcome but keep `SessionResultSnapshot` unchanged. Direct legacy inserts write `session_context_snapshot`; Task 4 will make the atomic RPC consume authorization context.

- [ ] **Step 6: Update generated database types manually**

Add all four plan columns and the progress-log snapshot to `Row`, `Insert`, and `Update`. Preserve every existing field and RPC signature until later tasks introduce v2 functions.

- [ ] **Step 7: Run task verification and commit**

Run:

```bash
pnpm exec vitest run src/lib/session/__tests__/contextSnapshot.test.ts src/app/actions/__tests__/saveSession.test.ts
pnpm type-check
```

Commit: `feat(history): snapshot completed session context`

---

### Task 2: Restore orphaned sessions across every evidence reader

**Files:**
- Create: `src/lib/session/historyRows.ts`
- Create: `src/lib/session/__tests__/historyRows.test.ts`
- Modify: `src/app/(app)/history/page.tsx`
- Modify: `src/app/(app)/history/[logId]/page.tsx`
- Modify: `src/app/(app)/calendario/page.tsx`
- Modify: `src/app/(app)/progress/page.tsx`
- Modify: `src/app/actions/progression.ts`
- Modify: `src/lib/ai/coachContextLoader.ts`
- Modify: `src/lib/calendar/aggregate.ts`
- Modify: `supabase/migrations/036_completed_session_context.sql`

**Interfaces:**
- Consumes: `parseSessionContextSnapshot` and `resolveSessionContext` from Task 1.
- Produces: `CompletedSessionSourceRow` and `toCompletedSessionPresentation(row, fallbackName)` used by page loaders.
- Preserves public view-model contracts; only their input resolution changes.

- [ ] **Step 1: Write failing orphan-history tests**

Use real row-to-presentation functions with a literal orphan fixture:

```ts
const orphan = {
  id: 'log-1', workout_id: null, completed_at: '2026-07-01T12:00:00Z',
  duration_minutes: 45, session_context_snapshot: null, workout: null,
}
expect(toCompletedSessionPresentation(orphan, 'Entrenamiento')).toMatchObject({
  id: 'log-1', workoutName: 'Entrenamiento', focus: null,
})
```

Add a snapshot fixture proving an orphan renders its original name and focus. Add calendar aggregation input with `workout_id: null` and assert the day/session totals remain one.

Run: `pnpm exec vitest run src/lib/session/__tests__/historyRows.test.ts src/lib/calendar/__tests__/aggregate.test.ts`

Expected: FAIL because orphan conversion is missing or excluded.

- [ ] **Step 2: Implement the shared historical-row resolver**

Normalize PostgREST one-to-one relations that may be object/array/null. Return `workoutId: string | null`; never synthesize IDs. Snapshot presentation has priority over relation and fallback.

- [ ] **Step 3: Remove null-workout exclusion from readers**

Delete `.not('workout_id', 'is', null)` from History, Calendar, Progress, progression action and coach queries. Select `session_context_snapshot` wherever a workout title/focus is shown. Keep ownership filtering by `user_id`.

For history detail, direct navigation to an orphan continues to load its `exercise_logs`; resolve the title through the shared resolver. For progression and metrics, operate on `progress_log_id` regardless of workout relation.

- [ ] **Step 4: Refresh SQL readers inside migration 036**

Replace `get_dashboard_payload`, `get_calendar_payload`, `get_history_payload` and `get_exercise_detail_payload` so their history CTEs do not require `workout_id IS NOT NULL` and use `LEFT JOIN workouts`. Preserve function signatures and grants. Include `session_context_snapshot` in JSON log objects where presentation needs it.

- [ ] **Step 5: Verify recovered-reader behavior**

Run:

```bash
pnpm exec vitest run src/lib/session/__tests__/historyRows.test.ts src/lib/calendar/__tests__/aggregate.test.ts src/components/history/__tests__/historyViewModel.test.ts src/components/calendar/__tests__/calendarViewModel.test.ts
pnpm type-check
```

Expected: PASS, including orphan rows.

- [ ] **Step 6: Commit**

Commit: `fix(history): include sessions detached from deleted workouts`

---

### Task 3: Atomic versioned plan lifecycle

**Files:**
- Create: `supabase/migrations/037_atomic_plan_lifecycle.sql`
- Create: `src/components/plan/PlanRetireButton.tsx`
- Create: `src/lib/plans/__tests__/lifecycle.test.ts`
- Modify: `src/lib/plans/entitlements.ts`
- Modify: `src/lib/plans/__tests__/entitlements.test.ts`
- Modify: `src/app/actions/generatePlan.ts`
- Modify: `src/app/actions/plan.ts`
- Modify: `src/app/actions/adjustPlan.ts`
- Modify: `src/app/(app)/plan/page.tsx`
- Modify: `src/app/(app)/plans/generate/GeneratePlanClient.tsx`
- Modify: `src/components/plan/PlanRegenerateButton.tsx`
- Modify: `src/components/plan/PlanAdjustButton.tsx`
- Modify: `src/app/onboarding/OnboardingWizard.tsx`
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes plan-family columns from Task 1.
- Produces RPCs `create_engine_plan_v2`, `activate_plan_version`, `retire_plan_family`, and `create_manual_plan_atomic`.
- `GeneratePlanOptions` gains required `requestId` for non-preview persistence; `previewOnly` may omit it.

- [ ] **Step 1: Write failing lifecycle and entitlement tests**

Prove saved-plan policy counts only current non-retired family heads. Replace ID-pruning expectations with:

```ts
expect(getPlanCreatePolicy(freeWithTwoFamilies, userId)).resolves.toMatchObject({ allowed: false })
expect(getPlanCreatePolicy(freeWithTwoFamilies, userId, { replacingFamilyId: 'family-a' }))
  .resolves.toMatchObject({ allowed: true, replacingExisting: true })
```

Add pure lifecycle validation tests proving a weekly request requires an expected active parent and that initial generation creates a new family.

Run: `pnpm exec vitest run src/lib/plans/__tests__/entitlements.test.ts src/lib/plans/__tests__/lifecycle.test.ts`

Expected: FAIL under count-by-row/pruning behavior.

- [ ] **Step 2: Implement lifecycle RPCs with per-user locks**

`create_engine_plan_v2` accepts:

```sql
p_plan JSONB,
p_metadata JSONB,
p_week_number INTEGER,
p_plan_context TEXT,
p_expected_parent_plan_id UUID,
p_generation_request_id UUID,
p_profile_updates JSONB DEFAULT '{}'::jsonb
```

It must lock on `auth.uid()`, return an existing row for the same `(user_id, generation_request_id)`, validate the expected active parent for weekly/adjustment modes, inherit `family_id`, insert workouts/exercises, mark the parent `superseded_at`, switch active rows, update profile fields and record success in one transaction. Initial mode generates a new family and checks the count of non-retired, non-superseded family heads.

`activate_plan_version` rejects retired/superseded versions and atomically switches active state. `retire_plan_family` marks every family version retired, deactivates it and activates the newest available family head. `create_manual_plan_atomic` inserts the plan and requested empty workouts before optionally activating it.

- [ ] **Step 3: Replace application pruning and split updates**

Remove `pruneExcessPlansForFreeUser` from generation. Make active-plan query errors fatal; weekly generation without an active plan returns the existing translated failure. Pass both expected parent and request ID to v2. Map stale-parent SQL errors to “El plan activo cambió. Recarga e inténtalo nuevamente.”

Make `activatePlan`, `deletePlan` and manual creation call their RPCs and check errors. `deletePlan` becomes retirement and never calls `.delete()` on workouts or plans.

- [ ] **Step 4: Generate stable operation IDs at UI boundaries**

Use `crypto.randomUUID()` once per click/apply attempt and keep it stable until that request resolves:

```ts
const requestId = crypto.randomUUID()
await generatePlan({ mode: 'weekly_regeneration', requestId })
```

Apply the same contract to initial generation, onboarding and structured adjustment. Preview calls remain read-only and omit the ID.

- [ ] **Step 5: Filter plan library to family heads and add retirement confirmation**

Query `.is('superseded_at', null).is('retired_at', null)`. Replace the raw trash form with `PlanRetireButton`, using `window.confirm(t('El plan se archivará, pero tu historial permanecerá intacto.'))` before submitting. Keep a minimum 44px target.

- [ ] **Step 6: Verify lifecycle behavior**

Run:

```bash
pnpm exec vitest run src/lib/plans/__tests__/entitlements.test.ts src/lib/plans/__tests__/lifecycle.test.ts src/components/plan/__tests__/planStructure.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat(plans): make plan lifecycle atomic and versioned`

---

### Task 4: Durable authorization for sessions that outlive a plan switch

**Files:**
- Create: `supabase/migrations/038_session_authorizations.sql`
- Create: `src/app/actions/authorizeSession.ts`
- Create: `src/lib/session/authorization.ts`
- Create: `src/lib/session/__tests__/authorization.test.ts`
- Modify: `src/app/(app)/session/[workoutId]/SessionClient.tsx`
- Modify: `src/store/sessionStore.ts`
- Modify: `src/lib/session/persistSession.ts`
- Modify: `src/app/actions/saveSession.ts`
- Modify: `src/app/actions/__tests__/saveSession.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces RPCs `authorize_session_start` and `save_session_log_atomic_v2`.
- Produces server action `authorizeSessionStart(clientSessionId, workoutId)` returning `{ success: true; contextSnapshot } | { success: false; error }`.
- `SessionSnapshot` keeps the same `clientSessionId` across crash restore.

- [ ] **Step 1: Write failing authorization-state tests**

Test pure transitions:

```ts
expect(canUseAuthorization({ expiresAt: future, consumedAt: null, userMatches: true, workoutMatches: true })).toBe(true)
expect(canUseAuthorization({ expiresAt: past, consumedAt: null, userMatches: true, workoutMatches: true })).toBe(false)
expect(canUseAuthorization({ expiresAt: future, consumedAt: now, userMatches: true, workoutMatches: true })).toBe(false)
```

Extend save-session tests so an authorized session succeeds even when the source plan is no longer active, while an unclaimed session still fails closed.

Run: `pnpm exec vitest run src/lib/session/__tests__/authorization.test.ts src/app/actions/__tests__/saveSession.test.ts`

Expected: FAIL because authorization is not represented.

- [ ] **Step 2: Add authorization table and RPC**

Create `session_authorizations` with `client_session_id` primary key, user/workout/plan FKs, timestamps, context snapshot and RLS-own policy. `authorize_session_start` reuses the current workout access rules inside PostgreSQL, captures the immutable context, sets `expires_at = NOW() + INTERVAL '12 hours'`, and is idempotent for an existing unconsumed matching ID.

Create `save_session_log_atomic_v2` with the existing save parameters. It locks the authorization row, validates owner/workout/expiry, inserts or reuses `progress_logs`, writes authorization context to `session_context_snapshot`, inserts exercise rows only for the winning insert, marks `consumed_at`, and returns the same `{ progress_log_id, inserted, result_snapshot }` contract. Keep the v1 RPC during rollout.

- [ ] **Step 3: Authorize immediately after client session initialization**

After `initSession` or `restoreSession`, call `authorizeSessionStart` with the stable client ID before allowing set completion. Add an `authorizing | ready | error` client state and retry button. Persist backup before the network call so a lost response restores the same ID.

- [ ] **Step 4: Save through v2 and preserve compatibility**

Call `save_session_log_atomic_v2`. Fall back to v1 only when the v2 RPC is missing, and in that compatibility path retain the existing active-plan guard. Do not re-run active-plan access checks after a valid v2 authorization.

- [ ] **Step 5: Verify session switching and idempotency**

Run:

```bash
pnpm exec vitest run src/lib/session/__tests__/authorization.test.ts src/app/actions/__tests__/saveSession.test.ts src/store/__tests__/sessionStore.test.ts src/lib/session/__tests__/persistSession.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat(session): preserve authorized workouts across plan switches`

---

### Task 5: Preserve midweek evidence on the dashboard

**Files:**
- Create: `src/lib/dashboard/weekContinuity.ts`
- Create: `src/lib/dashboard/__tests__/weekContinuity.test.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/dashboardViewModel.ts`
- Modify: `src/components/dashboard/__tests__/dashboardViewModel.test.ts`
- Modify: `src/components/dashboard/DashboardWeekJourney.tsx`
- Modify: `src/lib/i18n/index.ts`

**Interfaces:**
- Consumes session context snapshots from Task 1 and all-user week logs from Task 2.
- Produces `buildWeekContinuity({ activeWorkouts, weekLogs, dates, today })` with separate `scheduledWorkout` and `completedEvidence` fields.

- [ ] **Step 1: Write failing cross-plan week tests**

Use plan-A completion and different plan-B workout on the same ISO day:

```ts
expect(day.completedEvidence?.workoutName).toBe('Plan A Legs')
expect(day.scheduledWorkout?.name).toBe('Plan B Full Body')
expect(day.isScheduledWorkoutCompleted).toBe(false)
expect(day.hasTrainingEvidence).toBe(true)
expect(day.canStartScheduledWorkout).toBe(false)
```

Add a same-workout fixture that sets `isScheduledWorkoutCompleted = true`.

Run: `pnpm exec vitest run src/lib/dashboard/__tests__/weekContinuity.test.ts src/components/dashboard/__tests__/dashboardViewModel.test.ts`

Expected: FAIL because week days only match active workout IDs.

- [ ] **Step 2: Implement continuity projection**

Group completed logs by local completion date. Match active workout IDs only for `isScheduledWorkoutCompleted`; independently expose any actual completion as `completedEvidence`. Enforce one-session-per-day by setting `canStartScheduledWorkout = false` when evidence exists.

- [ ] **Step 3: Render prior-plan evidence explicitly**

Timeline cards show the historical name and duration from snapshot with translated label “Realizado con el plan anterior” when evidence does not match the active scheduled workout. The scheduled plan-B workout remains visible as replaced/blocked for that date, not falsely completed.

Use evidence dates for session count, streak, volume, latest session and records even when `workout_id` is null.

- [ ] **Step 4: Verify dashboard continuity**

Run:

```bash
pnpm exec vitest run src/lib/dashboard/__tests__/weekContinuity.test.ts src/components/dashboard/__tests__/dashboardViewModel.test.ts src/components/dashboard/__tests__/dashboardStructure.test.ts src/components/dashboard/__tests__/dashboardLocalization.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `fix(dashboard): retain completed evidence across plan changes`

---

### Task 6: Recovery audit and end-to-end regression coverage

**Files:**
- Create: `scripts/audit-plan-history-continuity.ts`
- Create: `scripts/__tests__/audit-plan-history-continuity.test.ts`
- Modify: `package.json`
- Modify: `tests/e2e/helpers/core-product.ts`
- Modify: `tests/e2e/training-evidence.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Produces `pnpm audit:history` read-only aggregate audit.
- Produces E2E fixture helpers to detach/retire a source plan without deleting progress evidence.

- [ ] **Step 1: Write failing audit aggregation tests**

Extract a pure `summarizeHistoryContinuity({ logs, workouts, exerciseLogs })` and assert literal totals for linked, orphaned and snapshot-backed sessions. Verify the command never mutates Supabase and prints no user IDs.

Run: `pnpm exec vitest run scripts/__tests__/audit-plan-history-continuity.test.ts`

Expected: FAIL because the audit module does not exist.

- [ ] **Step 2: Implement the read-only audit command**

Paginate service-role reads and print only aggregate counts:

```json
{
  "progressLogs": 27,
  "detachedLogs": 19,
  "detachedLogsWithExerciseRows": 19,
  "contextSnapshots": 7,
  "affectedUsers": 1
}
```

Values are illustrative output shape; the command computes live values. Add `"audit:history": "tsx --env-file=.env.local scripts/audit-plan-history-continuity.ts"`.

- [ ] **Step 3: Add the E2E continuity journey**

Seed plan A, complete it, create/activate plan B, retire A, and assert:

- `/history` still links to the original progress log.
- `/history/[logId]` shows exercises and metrics.
- `/calendario` retains the completion date.
- `/progress` retains session and volume.
- `/dashboard` shows prior-plan evidence without marking B’s different workout completed.

Use service-role cleanup only for the dedicated E2E account.

- [ ] **Step 4: Document rollout and recovery semantics**

Document migration order 036 → 037 → 038, backward-compatible RPC rollout, `pnpm audit:history`, and the fact that detached legacy names use fallback while their exercise metrics remain exact.

- [ ] **Step 5: Run complete verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
pnpm audit:history
```

Run Playwright continuity test when the migrations are available in the configured E2E database:

```bash
pnpm exec playwright test tests/e2e/training-evidence.spec.ts
```

Expected: all commands exit 0; the audit reports the same physical progress/exercise totals as the pre-change audit.

- [ ] **Step 6: Commit**

Commit: `test(history): cover plan-change continuity end to end`

---

## Final branch review and integration

- [ ] Generate a whole-branch review package from the merge base through HEAD.
- [ ] Dispatch a senior reviewer against the design spec and this plan.
- [ ] Resolve every Critical and Important finding, then run one scoped re-review.
- [ ] Run the full verification commands again on the feature branch.
- [ ] Merge `codex/plan-history-continuity` into `main` without rewriting unrelated user changes.
- [ ] Run the full unit/type/lint/build verification on merged `main`.
- [ ] Push `main` to `origin` and confirm the remote SHA matches local `main`.
