# Coaching Relationship Visibility Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Make the existing trainer-client relationship understandable and actionable from request through routine execution, without adding the separate post-session feedback system planned for a later delivery.

**Architecture:** Keep the current `coaching_requests` → `coaching_relationships` → `trainer_plan_assignments` contract and enrich the server-rendered projections that feed each UI. Add one narrowly scoped, security-definer RPC for a client to decline a still-proposed assignment; all other work is application-layer presentation and navigation over existing data. Preserve consent boundaries, immutable assignment snapshots, and the single active-plan invariant.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase/PostgreSQL, Vitest, Testing Library, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-07-trainer-coaching-marketplace-design.md`, plus the user-approved first-delivery scope recorded in this task: visible relationship and routine lifecycle now; structured post-session trainer feedback later.

## Global Constraints

- Do not add chat, private messaging, trainer session-feedback tables, billing, or a second coaching relationship model.
- A request continues to target an active `service_id`; acceptance remains the only way to create a relationship and training-profile consent.
- Only the client who owns a `proposed` assignment may decline it. Declining must not activate, delete, or mutate the immutable snapshot; it must cancel the proposed assignment/version, deactivate its already-inactive materialized plan defensively, audit the transition, and notify the trainer.
- Existing locked-plan and future-session revision behavior must remain unchanged.
- Use `public_profiles` and the existing trainer directory/service projections under their current RLS policies; do not query private profile data for display identity.
- Every new interactive success/error state must be visible and accessible, and every mutation must preserve idempotency or terminal-state safety.
- Spanish UI copy must identify people and services in human terms; UUIDs are fallback diagnostics only, never the primary label.
- Capture `FormData` synchronously before any `await` or lazy action import.
- Follow strict TDD: add a focused test, observe the intended failure, implement minimally, rerun green, then refactor.
- Do not claim remote Supabase migration, deployment, or authenticated live-account verification from local tests.

## Task 1: Make “Mi entrenador” discoverable and humanize the client hub

**Files:**

- Modify: `src/components/navigation/appNavigation.ts`
- Modify: `src/components/navigation/__tests__/appNavigation.test.ts`
- Modify: `src/app/(app)/coaching/page.tsx`
- Modify: `src/app/(app)/coaching/__tests__/page.test.tsx`
- Modify: `src/components/coaching/ClientCoachingStatus.tsx`
- Modify: `src/components/coaching/__tests__/coachingRequestForm.test.tsx`
- Modify: `src/components/coaching/CoachingRequestForm.tsx`
- Add or modify the focused request-form test that exercises its real post-success rendering.

**Behavior:**

- Add a stable personal navigation destination `/coaching`, labelled `Mi entrenador`, in both community-enabled and community-disabled modes, without removing the existing discovery/community destination.
- Query request rows with `trainer_user_id`, `service_id`, and current status/date. Query active/paused relationship rows with trainer, service, and start date. Resolve public trainer name/avatar and service name in grouped lookups; use safe Spanish fallbacks when a profile or service is no longer public.
- Render the current relationship first as a clear identity card: trainer photo/name, service, start date, and active/paused meaning. Render request history as distinct trainer/service entries, including an explicit note when an old accepted request no longer represents the current relationship.
- Make the empty state explain that no trainer is connected and link to `/trainers`.
- After a request is submitted successfully, preserve the visible success announcement and add a `Ver estado` link to `/coaching`; surface the specific server error instead of replacing it with a generic one.

**TDD sequence:**

1. Add navigation assertions for `/coaching` and both feature-flag modes; run `pnpm exec vitest run --maxWorkers=4 src/components/navigation/__tests__/appNavigation.test.ts` and confirm failure.
2. Add component/page assertions for trainer/service identity, current-vs-historical wording, empty CTA, grouped query projection, and the post-request status link/error; run the focused coaching tests and confirm failure.
3. Implement the query mapping and UI with no schema changes.
4. Rerun the focused tests and `pnpm type-check`.

## Task 2: Carry trainer instructions and identity into proposal, plan, session, and alerts

**Files:**

- Modify: `src/app/(app)/coaching/page.tsx`
- Modify: `src/components/coaching/ProposedProgramReview.tsx`
- Modify: `src/components/coaching/__tests__/trainerAssignmentUi.test.tsx`
- Modify: `src/app/(app)/plan/page.tsx`
- Modify: `src/components/plan/PlanOverview.tsx`
- Modify: `src/components/plan/PlanWorkoutReadView.tsx`
- Modify focused plan tests under `src/components/plan/__tests__/`
- Modify: `src/components/session/SessionExerciseHeader.tsx`
- Modify the focused session header test.
- Modify: `src/components/coaching/program-editor/TemplateExerciseCard.tsx`
- Modify its focused editor test.
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify or add a small server helper/test for the unread product-notification count if the page cannot query it cleanly through an existing helper.
- Modify: `src/components/dashboard/__tests__/DashboardHeader.test.tsx` or the closest dashboard page data test.

**Behavior:**

- Select and render the proposal version’s `change_summary` as `Mensaje del entrenador` before acceptance.
- Label per-exercise proposal/session notes as `Indicación del entrenador`; label the trainer editor field `Indicaciones para el cliente`.
- In the normal locked-plan read view, display both target RPE and trainer indication without mixing either into user-recorded session notes.
- Resolve and show the assigning trainer’s public name in `PlanOverview`, with a link to `/coaching`, while retaining version, lock state, and change summary.
- Make the dashboard bell attention dot true when either the existing dashboard attention notice exists or the authenticated user has unread `product_notifications`; avoid loading full notification bodies solely for the count.

**TDD sequence:**

1. Add focused rendering tests for summary, trainer identity, RPE, and explicitly labelled indications; observe failures.
2. Add a focused data-contract test for unread-notification attention and observe failure.
3. Implement the smallest query/prop/rendering changes.
4. Rerun all focused proposal/plan/session/dashboard tests and `pnpm type-check`.

## Task 3: Connect trainer acceptance directly to the named client and routine

**Files:**

- Modify: `src/app/(app)/coach/requests/page.tsx`
- Modify: `src/components/coaching/CoachRequestQueue.tsx`
- Modify or add: `src/components/coaching/__tests__/CoachRequestQueue.test.tsx`
- Modify: `src/app/(app)/coach/clients/[clientId]/page.tsx`
- Modify its focused route test.
- Modify: `src/app/(app)/coach/programs/page.tsx`
- Modify: `src/app/(app)/coach/programs/[templateId]/page.tsx`
- Modify: `src/components/coaching/AssignProgramDialog.tsx`
- Modify: `src/components/coaching/PublishProgramRevisionDialog.tsx`
- Modify: `src/components/coaching/ProgramTemplateEditor.tsx`
- Modify: `src/components/coaching/__tests__/trainerAssignmentUi.test.tsx`

**Behavior:**

- Include `clientId` in request cards. On successful acceptance, replace the removed request with a success panel naming that client and offering `Ver cliente` and `Preparar rutina` actions.
- The client detail page must show current service and assignment state and offer an `Asignar rutina` CTA when the relationship is active.
- Preserve a validated `clientId` query parameter from client/request CTA → template list → template detail. If it matches one of the trainer’s active relationships, preselect that relationship; otherwise ignore it safely.
- Resolve relationship and active-assignment choices through `public_profiles` and display client avatar/name, service, and useful state/date. Replace UUID-first native option labels with accessible visual choice cards in both proposal and revision dialogs.
- Do not allow the query parameter to bypass active relationship, ownership, or consent checks; the existing proposal RPC remains authoritative.

**TDD sequence:**

1. Add real component tests for the accepted-success panel and named visual relationship choices; observe failures.
2. Add route/data mapping tests for profile lookup, service/assignment state, and valid-vs-invalid preselection; observe failures.
3. Implement the server projections and URL handoff.
4. Rerun focused coach request/client/program tests and `pnpm type-check`.

## Task 4: Let the client decline a proposed routine safely

**Files:**

- Add: `supabase/migrations/057_trainer_assignment_decline.sql`
- Add: `supabase/tests/057_trainer_assignment_decline_test.sql`
- Modify: `scripts/test-trainer-programming-db.mjs`
- Modify: `src/types/database.ts`
- Modify: `src/app/actions/trainerAssignments.ts`
- Modify: `src/app/actions/__tests__/trainerAssignments.test.ts`
- Modify: `src/components/coaching/ProposedProgramReview.tsx`
- Modify: `src/components/coaching/__tests__/trainerAssignmentUi.test.tsx`
- Modify: `src/components/coaching/__tests__/fixtures/trainerAssignments.fixture.ts`
- Modify: `src/lib/coaching/__tests__/auditCoverage.test.ts`
- Modify: `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`
- Modify: `tests/e2e/helpers/trainer-marketplace.ts`
- Modify: `scripts/__tests__/trainer-security-preflight.test.ts`
- Modify: `supabase/tests/trainer_security_test.sql`
- Modify: `README.md`
- Modify: `docs/operations/trainer-marketplace-runbook.md`
- Modify: `docs/operations/trainer-pilot-checklist.md`

**Behavior:**

- Add `decline_trainer_assignment(p_assignment_id UUID, p_reason TEXT, p_idempotency_key TEXT)` returning the declined assignment ID and a `changed` flag.
- Validate authenticated ownership, proposed state, optional trimmed reason of at most 500 characters, and idempotency key of at most 200 characters. Lock the assignment row before transition. A retry by the same client/key returns success without duplicating audit entries or notifications; foreign, active, or otherwise terminal assignments fail without leaking tenant existence.
- Persist decline idempotency on the assignment (nullable column plus owner/key unique index), set the assignment and proposed version to `cancelled`, ensure its materialized plan remains inactive, add a professional audit record, and create one trainer notification linking to the relevant client/program workflow.
- Reuse the existing client advisory-lock namespace and then lock assignment, version 1, and materialized plan in canonical order so decline serializes with acceptance. Set both existing plan-mutation guards before the defensive plan update. Decline remains available to the owning client even if the relationship later becomes inactive.
- Extend the final professional-audit allowlist with assignment action `declined`; store no free-text reason in audit metadata. A trimmed optional reason may appear only in the deduplicated trainer notification body.
- Advance `trainer_security_preflight()` to marker 57 only after validating the new function, ACL, column, constraint, and unique index, and synchronize the runner, remote E2E preflight consumers, and release documentation with that boundary. Historical 045/049/056 boundary tests remain unchanged.
- Update generated database contracts for the new column/RPC and the already-existing assignment acceptance/revision contracts discovered to be missing from the local type file.
- Expose a validated `declineTrainerAssignment` server action that revalidates `/coaching` and `/coach/programs`.
- In `ProposedProgramReview`, add a confirmation-based `No aceptar rutina` action with an optional reason field, visible progress/error/success states, and one in-flight mutation at a time. Acceptance remains the primary action.

**TDD sequence:**

1. Write pgTAP coverage for owner success, state/version/plan invariants, notification/audit exactly once, idempotent retry, reason/key boundaries, foreign/random IDs, non-proposed states, ACLs, rerunnability, and marker 57; run the trainer DB test command and confirm the new tests fail because the RPC is absent.
2. Add a committed DB-runner race for accept versus decline (and same-key concurrent decline if practical), plus server-action validation/RPC-payload tests, real component interaction tests, audit coverage, rerun-contract, and preflight-consumer tests; observe failures.
3. Add migration, types, action, UI, runner, preflight consumer, and release-documentation implementation.
4. Rerun focused Vitest tests, `pnpm type-check`, `pnpm lint`, `git diff --check`, and `pnpm test:db:trainers` when Docker is available; otherwise report that boundary explicitly.

## Task 5: Cross-flow regression and visual verification

**Files:**

- Modify or add only tests necessary to cover integration seams discovered here.
- Update this plan only if a binding implementation ruling is required.

**Behavior:**

- Verify the personal mobile and desktop navigation still expose all destinations and the mobile bar remains usable at narrow widths.
- Verify request → accepted relationship → proposed routine → declined or accepted routine at the application boundary.
- Verify trainer-side preselection cannot select another trainer’s or inactive relationship.
- Confirm normal personal-plan behavior is unchanged and trainer notes do not appear as client-authored evidence.

**Verification:**

1. Run all focused tests changed by Tasks 1–4.
2. Run `pnpm exec vitest run --maxWorkers=4`.
3. Run `pnpm type-check`, `pnpm lint`, `pnpm test:db:trainers` (if local database dependencies are available), and `git diff --check`.
4. Run the relevant local app routes and capture desktop plus narrow-mobile screenshots if authentication fixtures permit; otherwise inspect the responsive component output and state the live-auth visual boundary.
5. Review the complete branch diff for scope, privacy/RLS assumptions, migration safety, accessibility, and Spanish copy.
