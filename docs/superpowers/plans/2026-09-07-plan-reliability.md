# Plan reliability implementation plan

Approved scope: session completion recovery and account isolation; calendar consistency when adjusting a plan; atomic complete workout exercise reordering; regression tests and repair of the stale insights date fixture. Approval supplied by the originating voice task on 2026-09-07. The audit in that task is the specification.

## Global constraints

- Work only in D:/work/project/.worktrees/plan-reliability, branch codex/plan-reliability, baseline dc14578.
- Preserve existing sessions, completed history, professional prescription locks and server/database ownership checks.
- Do not apply migrations remotely, merge, push, publish, or change unrelated UI. No visible AI coach or weekly regeneration controls.
- Never run simultaneous Vite/Vitest processes, including across worktrees. Root coordinates the test slot. Docker tests use isolated disposable containers only.
- Each production fix needs a failing behavioral regression first, followed by passing focused checks. Do not increase functional test timeouts to obtain a pass.
- Do not commit until root has coordinated review and verification; leave unrelated changes untouched.

## Task 1: Durable session completion and account-scoped recovery

Owner: root. Files: src/lib/session/persistSession.ts, src/store/sessionStore.ts, src/app/(app)/session/[workoutId]/{page.tsx,SessionClient.tsx}, src/components/{navigation/BottomNav.tsx,session/CompletionScreen.tsx}, auth/account context plumbing and pertinent tests.

Introduce a versioned owner-scoped snapshot with stable clientSessionId, finishedAt and completion state. Persist the completion transition before saving to the server; a reload restores the finished screen and the original completion timestamp. Use account-specific backup/pointer keys, require the authenticated account when reading/writing/removing, and clear in-memory state when it belongs to another account. Never display or adopt anonymous legacy snapshots without an authenticated ownership verification; retain unknown legacy evidence until verification succeeds. A normal logout must not destroy unsaved evidence owned by the account. Keep server authorization and idempotent save boundaries unchanged.

Write failing storage/store and integration regressions: finish -> backup -> clear memory -> restore preserves exact timestamp and ID; A -> B -> A never shows/restores/deletes A's data as B; legacy ownership mismatch leaves evidence untouched; offline/ambiguous retry keeps ID. Run focused unit tests, implement minimally, then exercise actual SessionClient/active dock in existing browser fixture architecture at mobile and desktop widths.

## Task 2: One resolved adjustment calendar

Owner: calendar implementer. Files allowed: src/app/actions/generatePlan.ts, src/app/actions/adjustPlan.ts, src/lib/plans/adjustmentIntent.ts, a focused schedule helper under src/lib/plans, src/lib/training-engine/adjustments.ts if required, src/components/plan/{PlanAdjustButton.tsx,planAdjustmentForm.ts}, related calendar/generation tests. Do not edit session or reorder files.

Regression first: an active Tue/Thu/Sat plan adjusted to two days resolves Tue/Thu, stores those same preferences, and a later duration adjustment keeps Tue/Thu. Requested explicit ISO weekdays, when supplied, are validated uniquely and persist exactly. Preview and apply must agree; stale active parent or changed schedule between preview and apply must fail safely instead of applying a different preview. Preserve previous session/version evidence. Resolve calendar once and use it for preview metadata, transactional workouts and profile updates; non-calendar adjustments preserve current workout weekdays. Keep current UX scope; display the actual weekdays in the preview, with no navigation redesign or added permanent route. Existing quantity-based selection can be retained using deterministic normalization. Run behavioral action/helper regressions and existing adjustment/engine tests, with root permission for the Vitest slot.

## Task 3: Atomic complete exercise permutation

Owner: reorder implementer. Files allowed: src/app/actions/plan.ts, src/app/actions/plan.logic.ts, src/types/database.ts, new appropriately numbered local SQL migration/test, scripts/test-trainer-programming-db.mjs, relevant plan action tests. Coordinate migration numbering with existing filenames. Do not edit session/calendar code or the insights fixture.

Regression first: reorderWorkoutExercises with owned [A,B] and submitted [A,A] rejects without writes. Complete [B,A] saves 1-based ordering; omitted/foreign/extra IDs reject unchanged. Replace the per-row writes with one RPC which authenticates, checks owned editable personal plan/workout, serializes concurrent permutations and validates exact distinct membership. On any error rollback all positions. Preserve guards on locked trainer prescriptions and existing editor staying open. Existing move controls should not retain a separate unsafe reordering write path: route through the same transactional contract. Do not expand to unrelated add/remove editor behavior. Add real pgTAP tests for invalid inputs, ownership, professional lock, valid result, rollback and concurrency where feasible. Integrate the new suite into the isolated DB runner. Run DB suites locally; root coordinates Vitest red/green slots.

## Task 4: Stale fixture and final acceptance

Owner: root. Replace fixed August timestamp in supabase/tests/044_trainer_insights_test.sql with a timestamp relative to CURRENT_DATE at 02:30 UTC and assert the independently derived previous Havana calendar date. The original fixture failure was reproduced twice in the audit (45/46 insights assertions; 130/130 programming).

After scoped task reviews, run complete unit project with maxWorkers=4, then browser-fixtures separately (selected plan, session/navigation, coaching fixtures), type-check/lint, and isolated DB trainer suite including the new permutation tests. Record exact results and limitations. Perform a broad final review. Deliver worktree location, changed files, evidence, and the unapplied local migration; do not claim remote or physical device validation.

## Verified result — 2026-09-07

All four tasks implemented and independently reviewed against the approved scope. Review findings about uncertain legacy ownership, stale asynchronous migration, final-backup write failure, and stale profile day counts were corrected; the subsequent review has no open findings.

| Check | Result |
| --- | --- |
| Full unit project, maxWorkers=4 | 283 files / 2,542 tests passed; 52.89 s |
| Selected browser-fixtures: session recovery, account workspace, plan interactions, trainer assignments, coaching context, consent, program editor, trainer accessibility | 8 files / 162 tests passed; 113.78 s |
| Local trainer DB runner with --authorization | 646 pgTAP assertions passed, plus committed concurrency and migration-rerun/preservation checks; isolated container removed |
| pnpm run type-check | Next route type generation and TypeScript passed |
| pnpm run lint | Passed; three existing unused-disable warnings in unrelated seed/social files |
| Final edited test lint and git diff --check | Passed |

Session browser regressions run at 375 and 1440 px with real components, store and localStorage under StrictMode. They cover exact completion timestamp/session ID across a lost server response and reload; storage quota failure preventing server submission; and account A → B → A retaining only the owner's dock/backup. Server transport is mocked in these browser fixtures. Server ownership actions have separate unit coverage; reorder authorization, rollback and concurrency are exercised against disposable PostgreSQL.

The calendar action regression checks Tuesday/Thursday/Saturday → two days, asserts identical transactional workout weekdays and persisted preferences, and reconstructs the next duration adjustment from that first RPC payload. Explicit weekdays and stale preview calendars are also covered.

Database fixture repairs needed to finish the existing gate were kept narrow: 044 uses a current-date-relative Havana boundary; 057 flushes its valid deferred active-version FK before fixture DDL; 058 creates dependencies while active before testing the inactive state and normalizes source line endings; later race fixture emails/slug are unique. A catalog diff proved that the old authorization digests omitted three existing 057/058 definer entries. Those reviewed snapshots were refreshed, and the new 060 RPC has its own exact owner/search-path/ACL assertion.

Migration `supabase/migrations/060_workout_exercise_reorder_atomic.sql` is local and must accompany any later deployment. No remote migration, merge, commit, push, deployment or physical-device test was performed. Branch `codex/plan-reliability` and its worktree are preserved; unrelated main-workspace changes were left alone.

## Authorized release — 2026-09-07

The user subsequently authorized applying the migration and committing/pushing to main. Main had advanced to d6c8eb1 with the new isolated Supabase migration workdir. The reviewed changes were integrated without overwriting that work; the historical `060` SQL was copied byte-for-byte to the supported active migration `infra/supabase/migrations/20260907135652_workout_exercise_reorder_atomic.sql`.

- Both SQL files have Git/LF SHA-256 `d8f7d3f2d2617ab0c874a046818d8bb9e7d25989ac3052eee0408caeeb98b2b9`; function-body verification normalizes Windows line endings.
- Fresh verification on main: 284 unit files / 2,568 tests passed, Next type generation and TypeScript passed, lint passed with the same three unrelated warnings, and both active migration files passed the migration validator.
- The configured application project and cached database project identity were checked before connecting. Credentials were loaded from the local environment and never printed or committed.
- Supabase CLI 2.116.0, using the active `infra` workdir and the documented transaction-pooler fallback, listed only the baseline remotely. Dry-run proposed only `20260907135652_workout_exercise_reorder_atomic.sql`, with no seeds or roles.
- The authorized real `db push` completed successfully. Post-application SQL verification found the new ledger row with four statements and a function body matching the reviewed SQL. The owner is `postgres`, SECURITY DEFINER is enabled, the search path is empty, authenticated execution is granted, and anonymous/service-role execution is denied. The existing trainer security preflight still returns 59.
- A subsequent migration list aligned both local/remote versions and a subsequent dry-run returned `upToDate: true`, with no pending migrations, seeds or roles.

The commit containing this release record also contains the exact applied SQL. Git publication is verified separately through local/remote SHA equality; application hosting and physical-device behavior are not inferred from that push.
