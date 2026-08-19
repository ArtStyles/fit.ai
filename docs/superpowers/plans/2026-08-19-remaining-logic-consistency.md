# Remaining Logic Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every repository-side gap in workout adjustment atomicity, profile-time-zone presentation, measurement load-state integrity, and migration/E2E documentation.

**Architecture:** PostgreSQL owns the workout-adjustment transaction and authorization boundary. The authenticated app layout owns the resolved profile time zone and distributes it through `I18nProvider`; measurement reads use a discriminated result so errors cannot collapse into empty data.

**Tech Stack:** PostgreSQL 17/PLpgSQL/pgTAP, Supabase, Next.js 14 server actions, React 18, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-remaining-logic-consistency-design.md`

## Global Constraints

- Do not rewrite migrations 049 or 050; add `051_workout_adjustment_atomic.sql`.
- Derive the RPC actor only from `auth.uid()`.
- Validate the complete adjustment payload before the first mutation.
- Timestamp presentation uses the resolved profile IANA time zone; date-only domain keys are not shifted.
- A measurement query error must never render the successful empty-history state.
- Every behavior change follows a witnessed RED-GREEN test cycle.

---

### Task 1: Atomic workout editor

**Files:**
- Create: `supabase/migrations/051_workout_adjustment_atomic.sql`
- Create: `supabase/tests/051_workout_adjustment_atomic_test.sql`
- Modify: `scripts/test-trainer-programming-db.mjs`
- Modify: `src/app/actions/adjustPlan.ts`
- Modify: `src/app/actions/plan.ts`
- Modify: `src/app/actions/__tests__/plan.logic.test.ts`

**Interfaces:**
- Produces: `public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb) returns integer`
- Consumes: normalized `AdjustmentChange[]` with `type`, `workoutExerciseId`, and optional `sets`, `reps`, `targetRpe`, `restSeconds`.

- [ ] **Step 1: Add the failing database contract**

Create pgTAP fixtures for an active editable plan with three exercise rows and assert: an owner can update/remove in one call; order becomes `1..n`; plan metadata changes; another user and a locked/inactive plan are rejected; an unknown/duplicate/out-of-range change rejects the whole request; and a test-only trigger throwing on the second update restores the first row and plan metadata.

- [ ] **Step 2: Wire migration 051 and its pgTAP file into the real runner, then verify RED**

Run: `pnpm test:db:trainers`

Expected: FAIL because `051_workout_adjustment_atomic.sql` or its function does not exist.

- [ ] **Step 3: Implement the minimal transaction boundary**

Implement a `SECURITY DEFINER` PL/pgSQL function with `SET search_path = ''` that:

```sql
SELECT w.plan_id
INTO v_plan_id
FROM public.workouts w
JOIN public.workout_plans p ON p.id = w.plan_id
WHERE w.id = p_workout_id
  AND w.user_id = auth.uid()
  AND p.user_id = auth.uid()
  AND p.is_active
  AND NOT p.prescription_locked
FOR UPDATE OF w, p;
```

It validates the JSON array and every referenced `workout_exercises` row before looping through writes, compacts `order_index` after removals, updates `plan_context`/`manually_updated_at`, returns the applied count, revokes `PUBLIC`/`anon`, and grants `authenticated`/`service_role`.

- [ ] **Step 4: Verify the database contract GREEN and rerunnable**

Run: `pnpm test:db:trainers`

Expected: PASS including the 051 pgTAP assertions, the forced intermediate rollback, and migration rerun.

- [ ] **Step 5: Add failing server-action tests**

Add tests showing `applyWorkoutAdjustment` emits exactly one RPC call with `p_workout_id` and normalized `p_changes`, performs no mutation-table loop, and reports an RPC failure. Add a test where `updateWorkoutSummary` receives a workout from another plan and must not mark the submitted plan.

Run: `pnpm vitest run src/app/actions/__tests__/plan.logic.test.ts`

Expected: FAIL because the current action still issues separate table writes and the summary update is not scoped by `plan_id`.

- [ ] **Step 6: Implement the server-action wiring**

Replace the mutation loop with:

```ts
const { data: appliedCount, error } = await supabase.rpc('apply_workout_adjustment_atomic', {
  p_workout_id: workoutId,
  p_changes: changes,
})
```

Scope the workout summary update by `.eq('plan_id', planId)` and require a returned row before marking the plan.

- [ ] **Step 7: Verify and commit Task 1**

Run:

```text
pnpm vitest run src/app/actions/__tests__/plan.logic.test.ts
pnpm type-check
pnpm test:db:trainers
```

Commit: `fix(plan): apply workout adjustments atomically`

### Task 2: Profile-time-zone consistency

**Files:**
- Modify: `src/components/i18n/I18nProvider.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/lib/workouts/schedule.ts`
- Modify: `src/lib/workouts/__tests__/schedule.test.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/lib/dashboard/banner.ts`
- Modify: `src/lib/dashboard/__tests__/banner.test.ts`
- Modify: `src/components/notifications/NotificationCenter.tsx`
- Modify: `src/components/notifications/__tests__/notificationCenter.test.tsx`
- Modify: `src/components/dashboard/ProgressHighlights.tsx`
- Modify: `src/components/measurements/MeasurementsClient.tsx`
- Modify: `src/components/measurements/MeasurementHistory.tsx`
- Modify: `src/components/measurements/WeightChart.tsx`
- Modify: `src/components/measurements/__tests__/MeasurementsClient.test.tsx`
- Modify: `src/components/social/PostCard.tsx`
- Modify: `src/lib/social/date.ts`
- Modify: `src/lib/social/__tests__/date.test.ts`
- Modify: `src/components/chat/ChatContainer.tsx`

**Interfaces:**
- Produces: `useI18n()` value `{ language, timeZone, t }`.
- Produces: `getZonedHour(date, timeZone): number`.
- Consumes: `profile.timezone` resolved by `resolveUserTimeZone` in the authenticated layout.

- [ ] **Step 1: Add failing boundary tests**

Use the instant `2026-08-20T03:30:00.000Z`, which is August 19 at 23:30 in Havana and August 20 in UTC. Assert that the profile zone controls greeting period, banner date, notification timestamp, measurement date, post timestamp, and relative-day labels.

Run the affected Vitest files and confirm they fail because UTC/server/browser time is still used.

- [ ] **Step 2: Propagate the resolved profile zone**

Add optional `timeZone` input to `I18nProvider`, resolve it once, include it in the context, and pass `resolveUserTimeZone(profile.timezone)` from the authenticated layout. Keep a valid app-zone fallback for public/test providers.

- [ ] **Step 3: Replace implicit time zones**

Use the context zone for client timestamp formatters and `getZonedHour(referenceNow, tz)` for the dashboard greeting. Pass `todayStr` to `isDashboardBannerVisible`. Preserve UTC only when formatting an explicit date-only key constructed with `Date.UTC`.

- [ ] **Step 4: Verify and commit Task 2**

Run:

```text
pnpm vitest run src/lib/workouts/__tests__/schedule.test.ts src/lib/dashboard/__tests__/banner.test.ts src/components/notifications/__tests__/notificationCenter.test.tsx src/components/measurements/__tests__/MeasurementsClient.test.tsx src/lib/social/__tests__/date.test.ts
pnpm type-check
```

Commit: `fix(time): use profile timezone across authenticated dates`

### Task 3: Measurement load states and documentation

**Files:**
- Modify: `src/app/actions/measurements.ts`
- Modify: `src/app/actions/__tests__/measurements.test.ts`
- Modify: `src/app/(app)/medidas/page.tsx`
- Modify: `src/app/(app)/medidas/__tests__/page.test.tsx`
- Modify: `src/components/measurements/MeasurementsClient.tsx`
- Modify: `src/components/measurements/__tests__/MeasurementsClient.test.tsx`
- Modify: `README.md`
- Modify: `.env.example`
- Modify: relevant migration/E2E runbooks under `docs/operations/`

**Interfaces:**
- Produces: `MeasurementsLoadResult = { success: true; measurements: MeasurementRow[] } | { success: false; measurements: []; error: string }`.
- Consumes: the result in `MedidasPage` and `MeasurementsClient`.

- [ ] **Step 1: Add failing action and UI tests**

Assert a Supabase query error returns the error variant, a successful zero-row query returns the success variant, and the page/client show `role="alert"` plus retry only for the error variant while retaining the correct back target.

Run:

```text
pnpm vitest run src/app/actions/__tests__/measurements.test.ts src/app/(app)/medidas/__tests__/page.test.tsx src/components/measurements/__tests__/MeasurementsClient.test.tsx
```

Expected: FAIL because `getMeasurements` currently returns `[]` for both outcomes.

- [ ] **Step 2: Implement the discriminated load result**

Return a stable localized source string for authentication/query failure, pass the result through the page, and render `ScreenState kind="error"` with a `router.refresh()` retry action before the empty-state branch.

- [ ] **Step 3: Update migration and E2E documentation**

List migration 051 as latest, update applicable `040-050` ranges to `040-051`, add `E2E_HISTORY_CONTINUITY_ENABLED=true` to `.env.example`, and document the exact history-continuity Playwright command/gate without weakening existing credential isolation.

- [ ] **Step 4: Verify and commit Task 3**

Run:

```text
pnpm vitest run src/app/actions/__tests__/measurements.test.ts src/app/(app)/medidas/__tests__/page.test.tsx src/components/measurements/__tests__/MeasurementsClient.test.tsx
pnpm type-check
git diff --check
```

Commit: `fix(measurements): distinguish load errors from empty history`

### Task 4: Final audit and integration

**Files:**
- Review all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: the complete requirements checklist in the design spec.
- Produces: a clean, reviewed branch ready to merge into `main`.

- [ ] **Step 1: Run full verification**

Run:

```text
pnpm lint
pnpm type-check
pnpm test
pnpm test:db:trainers
pnpm test:db:settings-weight
git diff --check origin/main...HEAD
```

- [ ] **Step 2: Review every requirement and request code review**

Map each design requirement to code and a passing test. Resolve every Critical or Important review finding and rerun the affected verification.

- [ ] **Step 3: Integrate and push as previously authorized**

Merge the completed delivery commits into `main`, verify the merged tree, then push `main` once all deliveries are present.
