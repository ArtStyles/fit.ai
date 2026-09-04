# Task 2 report: client visibility of coaching prescriptions

## Implementation

- The client coaching proposal query now selects the proposed version's `change_summary` and passes it to `ProposedProgramReview`. The review displays it as **Mensaje del entrenador** before acceptance. Per-exercise proposal notes are explicitly labelled **Indicación del entrenador**.
- Locked plans resolve the participant-visible `coaching_relationships.trainer_user_id` and then the matching `public_profiles` name. `PlanOverview` links that identity to `/coaching`; missing public profile data safely falls back to `Tu entrenador`.
- The locked plan read view preserves the separate prescribed target RPE and renders the trainer indication separately. The session exercise header likewise labels its prescription text, without modifying completion/session-result data.
- The trainer editor now calls its prescription textarea **Indicaciones para el cliente**. All affected editor interaction expectations were updated from the stale `Notas` label.
- Dashboard header attention now combines existing hub-notice semantics with a `product_notifications` unread head/count query. It selects only `id` with `{ count: 'exact', head: true }`, filters the authenticated user plus `dismissed_at`/`read_at` null, and never fetches notification bodies for the badge.

## TDD evidence

### RED

The initial combined focused run was started before production edits and exceeded the command timeout because it included two browser suites; it produced no buffered Vitest summary before timeout:

```text
Exit code: 124
command timed out after 124039 milliseconds
```

The isolated non-browser RED run then completed with the expected three feature failures and 24 existing passes:

```text
Test Files  3 failed (3)
Tests  3 failed | 24 passed (27)
```

Its specific expected failures were:

```text
planStructure: expected page source to contain 'trainer_user_id'
sessionContracts: locked header did not contain 'Indicación del entrenador'
notificationAttentionContract: expected page source to contain ".from('product_notifications')"
```

The proposal and editor expectations were added before the implementation in the timed combined run; the complete editor suite was subsequently run independently as part of GREEN evidence.

### GREEN

Focused proposal/plan/session/dashboard tests:

```text
pnpm exec vitest run --maxWorkers=1 src/components/coaching/__tests__/trainerAssignmentUi.test.tsx src/components/plan/__tests__/planStructure.test.ts src/components/session/__tests__/sessionContracts.test.ts src/app/(app)/dashboard/__tests__/notificationAttentionContract.test.ts
Test Files  4 passed (4)
Tests  32 passed (32)
```

Focused editor interactions:

```text
pnpm exec vitest run --maxWorkers=1 src/components/coaching/__tests__/programTemplateEditor.test.tsx
Test Files  1 passed (1)
Tests  39 passed (39)
```

Type check:

```text
pnpm type-check
tsc --noEmit --incremental false
Exit code: 0
```

`git diff --check` also completed with exit code 0.

## Files changed

- `src/app/(app)/coaching/page.tsx`
- `src/components/coaching/ProposedProgramReview.tsx`
- `src/components/coaching/__tests__/trainerAssignmentUi.test.tsx`
- `src/components/coaching/__tests__/fixtures/trainerAccessibility.fixture.tsx`
- `src/app/(app)/plan/page.tsx`
- `src/components/plan/PlanOverview.tsx`
- `src/components/plan/PlanWorkoutReadView.tsx`
- `src/components/plan/__tests__/planStructure.test.ts`
- `src/components/session/SessionExerciseHeader.tsx`
- `src/components/session/__tests__/sessionContracts.test.ts`
- `src/components/coaching/program-editor/TemplateExerciseCard.tsx`
- `src/components/coaching/__tests__/programTemplateEditor.test.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/__tests__/notificationAttentionContract.test.ts`

## Self-review

- Preserved Task 1's coaching request/relationship identity, errors, and service fan-out; only the proposal-version field contract was extended.
- No migration was added.
- The trainer identity is relationship-derived and only uses public profile fields; no private contact data was requested.
- The notification query is scoped to the authenticated user and is head/count-only. A query failure produces no unread contribution while preserving the pre-existing dashboard attention state.
- RPE, trainer prescription text, and session result entry paths remain separate.

## Concerns

The first all-in-one RED command timed out due to buffered browser-suite execution. The isolated RED evidence and all post-change focused suites/type check completed successfully. Live Supabase/RLS behavior and a physical-device browser session were not exercised; this task is intentionally application-layer only.
