# Coaching Catalog and Relationship Management Implementation Plan

This records the initial local preparation phase. The subsequent user-authorized
release includes integration, migrations, commit and push; see
`docs/operations/coaching-catalog-management.md` for its fresh checks and remote
evidence. The original local-only constraints below describe that earlier phase.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Work sequentially with scoped reviews. User scope overrides commit/release steps: leave all changes uncommitted in this isolated worktree and produce review packages from file snapshots.

**Goal:** Explain and resolve retired exercise references explicitly and make professional accompaniment management identifiable per person.

**Architecture:** Add a forward migration for assignment/revision error classification and editor availability. Add a separate minimal management RPC and compose its relationship metadata with consent-bound evidence in the existing professional list. Keep request lifecycle, principal selection and historical prescriptions unchanged.

**Tech Stack:** Next.js, React, TypeScript, Supabase PostgreSQL, pnpm, Vitest/Playwright fixtures, disposable Docker PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-09-08-coaching-catalog-management-design.md`

## Global Constraints

- No commits, merge, push, remote migration application or real-account mutations in this phase. New unapplied SQL files and isolated fixtures are authorized.
- Use only forward migrations in `infra/supabase/migrations`; never edit published migrations.
- Preserve direct assignment without acceptance or automatic principal selection, ownership, active-account/relationship checks, consent, idempotency, immutable versions/sessions and historical read visibility.
- Retired/private exercises require explicit public replacements for new assignment/revision. Do not grant assignment permission from reference-read eligibility.
- One active trainer per client; several clients per trainer. Resume remains client-only.
- Management metadata is independent of permission to view progress; never broaden existing RLS or use service role from application code.
- Preserve current request service/message/date/actions and available professional evidence, adherence, alerts and attention filtering.
- Render affected components at 390 and 1280 px; controls at least 44 px, full names visible, keyboard/focus and no horizontal overflow.
- Móvil: tarjetas apiladas, nombre completo visible y controles de al menos 44 px. Escritorio: filas amplias con identidad a la izquierda y acciones a la derecha, sin desplazamiento horizontal.
- Only one Vite/Vitest executor at a time across Vekira worktrees. Coordinate with root before any run. No worker may spawn subagents.
- Reports, snapshots and progress belong to this plan's ignored `.superpowers/sdd/2026-09-08-coaching-catalog-management/` directory.

### Task 1: Retired exercise classification and explicit replacement

**Files:**
- Create `infra/supabase/migrations/20260908140000_trainer_template_exercise_availability.sql`.
- Modify `src/lib/coaching/trainerAssignmentProposalErrors.ts`, `src/app/(app)/coach/programs/[templateId]/page.tsx`, `src/components/coaching/{ProgramTemplateEditor.tsx,AssignProgramDialog.tsx,PublishProgramRevisionDialog.tsx}` and `src/components/coaching/program-editor/{types.ts,model.ts,TemplateExerciseCard.tsx}`.
- Modify covering action/page/editor tests and fixtures. Create `scripts/test-trainer-template-availability-db.mjs` with local-only fixture SQL under `supabase/tests/`; add its package script.
- Add deployment/validation notes to `docs/operations/coaching-catalog-management.md`.

**Interfaces:**
- Consumes existing `assign_trainer_program(uuid,uuid,text,text)` and `publish_trainer_assignment_revision(uuid,uuid,text,text)` signatures and normal editor save actions.
- Produces new error token `TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE`, with Spanish text `La rutina contiene ejercicios que ya no están disponibles. Sustitúyelos antes de enviarla.`
- Nested persisted exercise view includes `is_public: boolean`; null/missing catalog data is unavailable. Update fixtures deliberately rather than treating missing availability as success.

- [ ] **Step 1: Preserve the established RED and add focused tests.**

Use `C:/Users/ACER NITRO/AppData/Local/Temp/vekira-assignment-repro-20260908.mjs` and its log as the proven seed. Convert to a repository-relative disposable runner with no environment connection string. Reuse the production V1 manifest mapper and semantic-digest-pinned RPC. Test cases include:

```ts
expect(mapTrainerAssignmentProposalError({ message: 'TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE' }))
  .toBe('La rutina contiene ejercicios que ya no están disponibles. Sustitúyelos antes de enviarla.')
// Browser assertion against the real editor, after opening a retired row:
await expect(page.getByLabel('Ejercicio', { exact: true })).toHaveValue(retiredExerciseId)
// Change notes only; the selected ID and persisted reference must stay retired.
// Choose a public replacement explicitly, save, then assert all unchanged prescription fields.
```

The DB fixture must prove: 3×3 before cutover succeeds; after cutover the same nine visible rows cause the NEW unavailable token; truly absent days/empty day cause only INCOMPLETE; explicit replacement permits assignment. Cover revision separately and use a fresh recipient/request so retained/idempotency shortcuts cannot hide validation. Verify unrelated private IDs, actor/account/consent rejection, exact preserved prescription/history data and no silent reference edits.

- [ ] **Step 2: Implement the smallest forward SQL change.** Copy the current full assignment and revision definitions into the new migration, preserving owner/mode/search_path/ACL and all other code. Split the existing classification in this order:

```sql
IF v_workout_count <> v_template.days_per_week OR EXISTS (
  SELECT 1 FROM public.trainer_template_workouts w
  WHERE w.template_id = v_template.id
    AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises e WHERE e.template_workout_id = w.id)
) THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE'; END IF;
IF EXISTS (
  SELECT 1 FROM public.trainer_template_exercises e
  JOIN public.trainer_template_workouts w ON w.id = e.template_workout_id
  LEFT JOIN public.exercises catalog ON catalog.id = e.exercise_id AND catalog.is_public = TRUE
  WHERE w.template_id = v_template.id AND catalog.id IS NULL
) THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE'; END IF;
```

Adapt local variable names to each original function. A complete nonempty template with all retired exercises must also return UNAVAILABLE. No new privileges or preflight version change is necessary for this classification-only step.

- [ ] **Step 3: Implement editor availability and explicit replacement.** Fetch availability in the nested query, derive unavailable rows from saved props, label each row and expose `Sustituir ejercicio`. Preserve the current missing option explicitly:

```tsx
{!options.some(option => option.id === draft.exerciseId) && (
  <option value={draft.exerciseId} disabled>{name} — No disponible</option>
)}
```

Make the replacement interaction focus its selector and preserve the draft's prescription fields. Do not submit a retired selection as if another option had been chosen. Show why saving/sending cannot continue while selection is unavailable. Keep FormData capture before awaits. Include structural add/delete/reorder pending states in send/publish readiness together with existing dirty/saving/error states. A server-side catalog change after page load still returns the new friendly error.

Rendered replacement verification identified a stale local blocking message in the dialogs after the saved replacement resolved the block. Separate derived blocking notices from server action errors in assignment/revision dialogs so resolved notices disappear without clearing real errors, form fields or idempotency state; add a focused regression.

- [ ] **Step 4: Verify covering cases.** After root grants the test slot, run the affected action/page/model units and the real editor browser fixture. Run the new isolated DB runner and migration validation. Record RED/GREEN commands, exact assertions and screenshots; inspect mobile/desktop renders. Do not repeat unrelated full suites.

- [ ] **Step 5: Report for scoped review, without commit.** Write `task-1-report.md`, list every changed/new file and checks. Root will package the worktree diff plus untracked source additions and dispatch a reviewer.

### Task 2: Person-based accompaniment management

**Files:**
- Create `infra/supabase/migrations/20260908150000_coach_relationship_management.sql`, `src/lib/coaching/relationshipManagement.ts`, and its tests.
- Modify `src/types/database.ts`, `src/lib/coaching/insights.ts` and its summary tests/fixtures, `src/app/(app)/coach/{page.tsx,clients/page.tsx,requests/page.tsx}`, `src/components/coaching/{CoachClientList.tsx,CoachOverview.tsx,CoachRelationshipActions.tsx}`, and `src/app/actions/{coachingRequests.ts,coachingRelationships.ts}`.
- Add scoped DB authorization fixtures/runner, page/action/component tests and one real browser fixture for the management list. Update `vitest.config.ts` only to register that fixture if required.
- Update operation notes, preflight expectation tests and local runner assertions affected by the new contract.

**Interfaces:**
- Consumes existing consent-bound `getCoachClientsSummary`, existing lifecycle server actions and existing public identity fields.
- Produces `public.get_coach_relationship_management()` returning the following JSON shape and a strict TypeScript adapter/loader:

```ts
type CoachRelationshipManagement = {
  counts: { pendingRequests: number; activeRelationships: number; pausedRelationships: number }
  relationships: Array<{
    relationshipId: string; clientId: string; clientName: string | null
    username: string | null; avatarUrl: string | null; serviceName: string
    status: 'active' | 'paused_by_platform'; startedAt: string
    trainingConsentActive: boolean; trainingAccessAvailable: boolean
  }>
}
```

No caller-selected trainer ID. No email, health/profile fields, progress, workouts, sessions or prescriptions. `trainingAccessAvailable` requires active relationship, active client account and active training consent; the caller's account and trainer profile are already required active. Derive identity from public fields with full-name then username fallback; null identity is explicit.

The existing `CoachClientSummary` TypeScript type currently identifies only `clientId`, although both baseline and current consent-bound SQL payloads already emit `relationshipId`. Preserve and validate `relationshipId: string` in the adapter/type and update its fixtures so evidence can be joined to the exact relationship rather than another lifecycle of the same client. Leave the existing summary SQL, authority checks and calculations unchanged; prove the actual API payload already provides the ID.

- [ ] **Step 1: Write actual API-role authorization RED tests.** Seed one active trainer with three distinct clients, including an active consented relation, active revoked consent, and paused relation, plus an unrelated trainer and ended history. Confirm existing direct SELECT hides rows without access. Expect the new management RPC to return only own active/paused metadata and accurate independent counts; reject anon, nontrainer and inactive trainer. Assert the exact allowed payload keys and continued denial of protected insights for revoked/paused/unrelated cases. Confirm no mutation/history or one-active-trainer constraint changes.

```ts
expect(payload.relationships.map(row => row.relationshipId)).toEqual(expectedOwnCurrentIds)
expect(payload.relationships.find(row => row.relationshipId === revokedId)?.trainingAccessAvailable).toBe(false)
expect(payload.counts.pendingRequests).toBe(1) // accepted requests are excluded
```

- [ ] **Step 2: Implement the minimal authorized metadata RPC.** Use SECURITY DEFINER, postgres ownership and pinned search_path; validate auth.uid(), active account and active trainer profile before selecting only their relationships. Grant authenticated EXECUTE, revoke PUBLIC/anon and do not grant application service-role bypass. Use consistent row ordering by start/id, preserve rows when optional public identity/service data is absent, and fail generically for unauthorized callers. Return only the documented keys. Leave existing RLS/helpers and insight RPC authority unchanged.

Extend the existing trainer security preflight to validate the new RPC's signature, owner, definer/search_path and ACL, returning **61**. Preserve every prior check. Update active-schema tests/fixtures that explicitly require the prior60; do not weaken those assertions or edit historical migration files.

The observed preflight allowlist-source comparison depends on CRLF/LF formatting. In the new preflight only, normalize CRLF to LF on both sides of that otherwise exact source comparison, preserving every substantive check. Verify mixed line-ending definitions pass and an altered allowlist still fails; do not rely on keeping one checkout's line endings identical to a deployed database.

- [ ] **Step 3: Compose the person list without losing existing evidence.** Load management metadata and existing protected summary independently. Render each relationship once, keyed by relationshipId. Join optional evidence only when trainingAccessAvailable is true AND summary matches the same relationship; failure of evidence shows a localized message while management remains visible. Failure of management is an error, never an empty zero-count success. Keep evidence dates, adherence, alerts and attention filter for authorized rows. Add active/paused context and explicit unavailable-authorization text without exposing progress.

```tsx
<CoachRelationshipActions
  relationshipId={relationship.relationshipId}
  status={relationship.status}
  clientName={relationship.clientName}
  serviceName={relationship.serviceName}
/>
```

Buttons/confirmations must name the person; no enabled anonymous finalization on missing identity. Ver cliente links to the existing client page; Asignar rutina links to `/coach/programs?clientId=...` only for authorized active relations. Use row/card containers, never nested buttons inside the current all-card Link. Preserve the client-only resume rule.

- [ ] **Step 4: Separate requests and update counters.** Remove the anonymous relationship action block from requests and link to the management list with its distinct count. Keep request names/avatar/service/message/date/actions intact. Professional overview uses clear management counts for pending/active/paused while existing analytics may retain consent-bound metrics with accurate labels. After successful accept/end/consent actions revalidate `/coach`, `/coach/requests`, `/coach/clients` as relevant. Validate relationship action results match the requested relationship ID before reporting success.

- [ ] **Step 5: Verify behavior and responsive presentation.** Use real components with three clients, long names/homonyms, absent photo/name and independent busy/retry state. Confirm selecting the second Finalizar sends only its relationshipId, cancel sends nothing, and confirmation names the correct person/service. Verify protected links absent for paused/revoked access, management survives summary failure, error states are explicit and counters update. Run actual API-role DB tests plus affected units/browser after slot grant. Capture390/1280, inspect keyboard/focus/44px/no overflow.

- [ ] **Step 6: Report for scoped review, without commit.** Write `task-2-report.md`, exact files/checks and any unresolved concern. Root will package the delta from the Task1 accepted snapshot, not a duplicate full-branch review.

### Task 3: Integration verification and delivery

**Files:** `docs/operations/coaching-catalog-management.md`, plan-local verification logs and reports. Amend application/tests only for concrete integration failures through the relevant implementer.

**Interfaces:** Consumes the reviewed Task1 and Task2 working-tree state, both forward migrations and their unchanged product/security contracts. Produces a concrete uncommitted reviewable result and honest remote deployment boundary.

- [ ] Run typecheck, lint, both affected DB suites and the established direct-assignment integration suite against the final active migration chain. Full Vitest (unit+browser) once after coordinating the slot; fix real failures via implementers, avoiding parallel Vite. Use local-only fixtures; never apply to linked remote.
- [ ] Build with existing project environment loaded only in memory; if network/font limits recur, use actual cached font bytes or report the specific limitation without changing application fonts.
- [ ] Inspect actual mobile/desktop screenshots for both editor availability and management; preserve evidence under the plan scratch folder.
- [ ] Assemble one final whole-change review package including tracked diffs and all intended new source files; exclude dependencies, generated build artifacts and scratch. Independent review validates spec/quality. Address findings in one combined final fix wave and scoped re-review.
- [ ] Update operation notes with commands/results and unapplied migration names. Confirm root main and real data are unchanged. Deliver concise behavior/test summary and location of the uncommitted worktree. Do not commit, merge, push or deploy.
