# Trainer Direct Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver trainer routines directly to the client's library, allowing selection/removal/reassignment without duplicates or automatic primary changes.

**Architecture:** Keep immutable professional assignment snapshots and distinguish retained assignment status from the client's selected plan. Implement all mutations atomically in PostgreSQL under the authenticated caller; adapt actions and rendered surfaces to the same lifecycle.

**Tech Stack:** Next.js, React, TypeScript, Supabase/PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-trainer-direct-assignment-design.md`

## Global Constraints

- No routine acceptance. Direct library insertion with `is_active=false`, preserving current selection.
- Deduplicate trainer + client + source template while retained; allow different templates and reassignment after removal.
- Preserve completed sessions, immutable versions, account/relationship/consent authorization and personal library limits.
- No production data mutations for testing. Active migrations live only in `infra/supabase/migrations`.
- No concurrent Vite/Vitest processes. Each worker requests the test slot before starting those processes.
- Work only in this worktree; no main merge, push, remote migration, or unrelated cleanup during implementation.

## Task 1: Atomic direct assignment and library lifecycle

**Files:** new timestamped migration in `infra/supabase/migrations`, new `supabase/tests/trainer_direct_assignment_test.sql`, new `scripts/test-trainer-direct-assignment-db.mjs`, package script, migration runbook.

**Interfaces:** Add `public.assign_trainer_program(p_relationship_id uuid,p_template_id uuid,p_change_summary text,p_idempotency_key text)` returning `(assignment_id uuid,assignment_version_id uuid,workout_plan_id uuid)`. Keep `propose_trainer_assignment` as a compatible direct-assignment entry point. Add `public.remove_trainer_assignment(p_plan_id uuid)` returning the removed plan UUID. Existing `activate_plan_version`, revision, pause/resume and session functions must honor the spec.

- [ ] Reproduce the old failure on the active baseline with real API session identity, using fictional fixtures:
```sql
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT * FROM public.propose_trainer_assignment('59000000-0000-4000-8000-000000000041','59000000-0000-4000-8000-000000000061',NULL,'direct-assignment-test');
ROLLBACK;
```
- [ ] Implement a forward migration that validates participants and the complete template, locks client then trainer, creates assignment/version/plan without selecting it, scopes trusted professional mutations without permitting authenticated flag forgery, and enforces retained-template uniqueness.
```sql
CREATE UNIQUE INDEX trainer_assignments_retained_template_unique
ON public.trainer_plan_assignments(trainer_user_id,client_user_id,source_template_id)
WHERE status IN ('proposed','active','frozen') AND source_template_id IS NOT NULL;
```
- [ ] Update professional selection, removal, revision and relationship resumption coherently. Preserve historical records and idempotency. Define obsolete acceptance RPC behavior safely for old clients; migration may not record fake client acceptance.
- [ ] Add executable database assertions for every spec boundary, including a double-request race, and run red then green on the same disposable baseline. Include migration rerun with retained and removed assignments and history.
- [ ] Document DB command and evidence; commit scoped DB changes in the worktree.

## Task 2: Actions and complete client/coach presentation

**Files:** `src/app/actions/trainerAssignments.ts`, `src/app/actions/plan.ts`, coaching proposal error mapping, coach program/client pages, coaching client page/components, plan library and related action/component/browser tests.

**Interfaces:** Consume Task 1 RPCs. Expose `assignTrainerProgram(FormData)` with the current result shape; retain the old exported action as a compatibility alias. The direct send dialog sends relationship/template/change summary/idempotency key as today. Use the assignment-specific remove RPC for professional plans.

- [ ] Add failing action/component tests for direct assignment and same-template-only blocking, then implement:
```ts
await supabase.rpc('assign_trainer_program', {
  p_relationship_id: relationshipId,
  p_template_id: templateId,
  p_change_summary: changeSummary || null,
  p_idempotency_key: idempotencyKey,
})
```
- [ ] Replace proposal/acceptance/current-professional-primary language with direct-assignment copy. Success: `Rutina añadida a la lista del cliente.` Duplicate: `Este cliente ya tiene esta rutina asignada.` Remove pending acceptance UI from the new flow while preserving readable historical states.
- [ ] Show all different assigned routines and allow Usar/Eliminar for professional plans without exposing prescription edit controls. Ensure both the no-primary and selected-primary layouts show the library. Show per-template assignment availability to coaches.
- [ ] Update empty states, selected-client context, revisions and insights that assume one assignment, preserving navigation and unrelated personal behavior.
- [ ] Run scoped unit/action/browser tests, update fixture metadata to real new contracts, and commit scoped UI changes.

## Task 3: Integration and review

**Files:** tests and minimal fixes exposed by the complete-flow review; this plan's validation evidence.

- [ ] Run the new complete database suite, relevant existing security/history suites, all unit tests, type-check and lint with bounded concurrency.
- [ ] Render client and coach flows on mobile and desktop. Verify multiple assignments, duplicate button behavior, removal and retry; no false acceptance/automatic activation messages.
- [ ] Review the whole branch independently for specification and quality, fix actionable findings and retest affected cases.
- [ ] Record final verification and distinguish local completion from remote deployment. Preserve user's unrelated `.artifacts` and other worktrees.
