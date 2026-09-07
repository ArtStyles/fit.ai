# Coaching Context and Consent UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a contracted trainer visible in discovery and Home, while turning routine-sharing consent and proposal failures into an explicit, recoverable flow.

**Architecture:** Add one client-owned TypeScript summary loader over existing RLS-protected reads and reuse its stable projection in the trainer directory and Dashboard. Keep the existing proposal RPC authoritative, enrich its application error mapping and recipient readiness, and add migration 058 with one narrowly scoped client-only RPC for repairing a missing `training_profile` grant on an already-active relationship.

**Tech Stack:** Next.js App Router, React 18, TypeScript, Supabase/PostgreSQL, Tailwind CSS, Vitest, Testing Library, Playwright fixtures, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-06-coaching-context-consent-ux-design.md`

## Global Constraints

- `/coaching` remains the only detailed client hub; the Dashboard summary never duplicates finalization, consent history, request history, or full routine content.
- `active_trainer_directory` remains a public authenticated projection and must not include viewer-specific relationship state.
- Directory cards show personalized state only for the current `active` or `paused_by_platform` relationship; they do not show pending requests, ended relationships, or internal IDs.
- `training_profile` is required for professional routine access; `body_measurements` remains optional and must never block routine proposal or acceptance.
- Only the client may grant `training_profile`; the trainer must never grant, repair, or impersonate that consent.
- The proposal RPC remains the authorization authority. Client-side or page-level readiness is explanatory and must not replace server checks.
- Known proposal failures receive distinct Spanish messages; unknown errors remain tenant-safe and expose no IDs or database details.
- Migration 058 is additive, rerunnable, `SECURITY DEFINER`, `search_path = public, pg_temp`, owner `postgres`, and executable only by `authenticated` and `service_role` after explicit revocation.
- New persistent state is conveyed with text, not color alone. Interactive targets are at least 44 px, have visible focus, and do not create nested links.
- Layouts must avoid horizontal overflow at 320, 360, 390, 412, and 1280 px.
- Capture `FormData` before any `await` or lazy action import.
- Follow strict TDD: write one focused failing test, observe the intended failure, implement minimally, rerun green, then refactor.
- Do not modify or commit work from the main checkout; this plan runs only in `.worktrees/coaching-ux-guidance`.
- Do not claim remote Supabase migration, deployment, live authenticated accounts, or physical-device verification from local evidence.

---

## File map

- `src/lib/coaching/clientSummary.ts`: owns the shared client coaching summary query and status projection.
- `src/components/coaching/TrainerDirectory.tsx`: renders viewer-specific trainer-card treatment supplied by the page.
- `src/components/dashboard/CoachingSummaryCard.tsx`: renders the compact Home summary and state-specific CTA copy.
- `src/components/dashboard/DashboardPrimaryFlow.tsx`: places the summary once in the established Dashboard composition.
- `src/app/actions/trainerAssignments.ts`: maps authoritative proposal RPC failures to specific safe messages.
- `src/components/coaching/AssignProgramDialog.tsx`: explains recipient readiness and prevents redundant proposals in the UI.
- `src/components/coaching/ConsentManager.tsx`: distinguishes required and optional consent and exposes client reauthorization.
- `supabase/migrations/058_training_profile_consent_regrant.sql`: adds the client-only recovery RPC and advances professional preflight.
- `supabase/tests/058_training_profile_consent_regrant_test.sql`: proves the new RPC's ownership, state, audit, notification, concurrency, and ACL contract.

---

### Task 1: Shared client summary and personalized trainer cards

**Files:**

- Create: `src/lib/coaching/clientSummary.ts`
- Create: `src/lib/coaching/__tests__/clientSummary.test.ts`
- Modify: `src/app/(app)/trainers/page.tsx`
- Create: `src/app/(app)/trainers/__tests__/page.test.tsx`
- Modify: `src/components/coaching/TrainerDirectory.tsx`
- Modify: `src/components/coaching/__tests__/trainerDirectory.test.tsx`

**Interfaces:**

- Produces:

```ts
export type ClientCoachingSummary = {
  relationshipId: string
  relationshipStatus: 'active' | 'paused_by_platform'
  trainerUserId: string
  trainerName: string
  trainerAvatarUrl: string | null
  trainerSlug: string | null
  serviceId: string
  serviceName: string
  startedAt: string
  trainingConsentActive: boolean
  assignmentStatus: 'proposed' | 'active' | null
}

export type ClientCoachingSummaryResult = {
  summary: ClientCoachingSummary | null
  error: string | null
}

export async function loadClientCoachingSummary(
  supabase: ClientCoachingSummaryClient,
  clientUserId: string,
): Promise<ClientCoachingSummaryResult>
```

- `TrainerDirectory` gains `coachingSummary?: ClientCoachingSummary | null`.
- Task 2 consumes `loadClientCoachingSummary` and `ClientCoachingSummary` without changing their names or fields.

- [ ] **Step 1: Write failing loader tests for owned relationship projection**

Create a chain-complete Supabase double and assert literal output for: active relationship,
active `training_profile`, a latest `proposed` assignment, public trainer identity, and service
name resolved from `get_requestable_trainer_services`. Add separate assertions that a missing
relationship returns `{ summary: null, error: null }`, and that a relationship-query failure
returns `{ summary: null, error: 'No se pudo cargar tu acompañamiento.' }`.

- [ ] **Step 2: Run the loader test and verify RED**

Run:

```powershell
pnpm exec vitest run src/lib/coaching/__tests__/clientSummary.test.ts --maxWorkers=1
```

Expected: FAIL because `clientSummary.ts` and `loadClientCoachingSummary` do not exist.

- [ ] **Step 3: Implement the minimal summary loader**

Query the client's latest `active`/`paused_by_platform` relationship first. For a result,
perform grouped reads for `public_profiles`, `active_trainer_directory`, active consents, and
`trainer_plan_assignments` in `['proposed', 'active']`; call
`get_requestable_trainer_services` only when a slug exists. Select the newest proposed
assignment before an active assignment so a pending client decision wins the Home state.
Return safe fallbacks `Entrenador no disponible` and
`Servicio de acompañamiento no disponible` without discarding the relationship.

- [ ] **Step 4: Run the loader test and verify GREEN**

Run the command from Step 2. Expected: all loader tests pass.

- [ ] **Step 5: Write failing route and card tests**

In the route test, mock only external server loaders and assert that the authenticated
`user.id` is passed to `loadClientCoachingSummary` and its result reaches `TrainerDirectory`.
In the real component test, pass a matching summary and assert:

```text
Tu entrenador
Acompañamiento activo
Acompañamiento de fuerza
href="/coaching"
href="/trainers/ada-lovelace"
```

Also render a nonmatching trainer and assert that it has no `Tu entrenador` or `/coaching`
CTA.

- [ ] **Step 6: Run route/card tests and verify RED**

Run:

```powershell
pnpm exec vitest run src/app/\(app\)/trainers/__tests__/page.test.tsx src/components/coaching/__tests__/trainerDirectory.test.tsx --maxWorkers=1
```

Expected: FAIL because the page does not load the summary and cards do not render contracted
state.

- [ ] **Step 7: Implement the page projection and card treatment**

Use `requireAppUserContext()` in the protected route and load directory plus summary in
parallel. Replace the card-wide link with a semantic article and explicit links to avoid
nested anchors. Matching cards receive textual state, contracted service, violet accent,
`Ver acompañamiento`, and `Ver perfil`; other cards retain a single `Ver perfil` action.

- [ ] **Step 8: Run focused tests and type-check**

Run:

```powershell
pnpm exec vitest run src/lib/coaching/__tests__/clientSummary.test.ts src/app/\(app\)/trainers/__tests__/page.test.tsx src/components/coaching/__tests__/trainerDirectory.test.tsx --maxWorkers=1
pnpm type-check
```

Expected: all focused tests and TypeScript pass.

- [ ] **Step 9: Commit Task 1**

```powershell
git add -- 'src/lib/coaching/clientSummary.ts' 'src/lib/coaching/__tests__/clientSummary.test.ts' 'src/app/(app)/trainers/page.tsx' 'src/app/(app)/trainers/__tests__/page.test.tsx' 'src/components/coaching/TrainerDirectory.tsx' 'src/components/coaching/__tests__/trainerDirectory.test.tsx'
git commit -m "feat(coaching): mark contracted trainer in directory"
```

---

### Task 2: Professional coaching summary on Home

**Files:**

- Create: `src/components/dashboard/CoachingSummaryCard.tsx`
- Create: `src/components/dashboard/__tests__/CoachingSummaryCard.test.tsx`
- Modify: `src/components/dashboard/DashboardPrimaryFlow.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/__tests__/dashboardStructure.test.ts`

**Interfaces:**

- Consumes: `ClientCoachingSummary` and `loadClientCoachingSummary` from Task 1.
- Produces:

```ts
export type CoachingSummaryDisplayState =
  | 'paused'
  | 'needs_consent'
  | 'proposal_pending'
  | 'active_plan'
  | 'awaiting_routine'

export function getCoachingSummaryDisplayState(
  summary: ClientCoachingSummary,
): CoachingSummaryDisplayState

export function CoachingSummaryCard({
  summary,
}: {
  summary: ClientCoachingSummary
}): JSX.Element
```

- `DashboardPrimaryFlow` gains `coaching: ReactNode` and renders it after `title` and before
  `music`.

- [ ] **Step 1: Write failing real rendering tests for all five states**

Use literal summaries to assert the state priority and visible copy:

```text
paused -> Acompañamiento pausado
needs_consent -> Falta autorizar tus datos de entrenamiento
proposal_pending -> Rutina pendiente de revisión
active_plan -> Rutina activa con tu entrenador
awaiting_routine -> Tu entrenador está preparando el siguiente paso
```

Every rendering must retain trainer name, service name, `/coaching`, and a textual state.

- [ ] **Step 2: Run the component test and verify RED**

```powershell
pnpm exec vitest run src/components/dashboard/__tests__/CoachingSummaryCard.test.tsx --maxWorkers=1
```

Expected: FAIL because the component and state resolver do not exist.

- [ ] **Step 3: Implement the minimal summary card**

Resolve state in the exact priority listed in the spec. Render one compact article using the
existing Avatar primitives, a decorative image, `min-w-0`, text truncation, explicit state
label, and one minimum-height CTA. Use a stacked mobile layout and horizontal layout from
`sm` upward.

- [ ] **Step 4: Run the component test and verify GREEN**

Run the command from Step 2. Expected: all five state cases pass.

- [ ] **Step 5: Write failing composition/data assertions**

Update `dashboardStructure.test.ts` to require a single `<CoachingSummaryCard` rendered
through `DashboardPrimaryFlow`, positioned after the accessible title and before music and
the weekly journey. Add a data-boundary assertion that `DashboardPage` calls
`loadClientCoachingSummary(supabase, user.id)` inside its existing parallel load rather than
adding viewer state to a public view.

- [ ] **Step 6: Run Dashboard tests and verify RED**

```powershell
pnpm exec vitest run src/components/dashboard/__tests__/CoachingSummaryCard.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts --maxWorkers=1
```

Expected: FAIL because the page and flow do not yet place the card.

- [ ] **Step 7: Wire the summary into the established Dashboard composition**

Add the shared loader to the current `Promise.all`, pass the card as the new `coaching` slot
only when `summary` is non-null, and render a non-blocking compact error only when the summary
read itself fails. Do not add any fixed dock or duplicate relationship controls.

- [ ] **Step 8: Run focused tests and type-check**

```powershell
pnpm exec vitest run src/components/dashboard/__tests__/CoachingSummaryCard.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts src/lib/coaching/__tests__/clientSummary.test.ts --maxWorkers=1
pnpm type-check
```

Expected: all focused tests and TypeScript pass.

- [ ] **Step 9: Commit Task 2**

```powershell
git add -- 'src/components/dashboard/CoachingSummaryCard.tsx' 'src/components/dashboard/__tests__/CoachingSummaryCard.test.tsx' 'src/components/dashboard/DashboardPrimaryFlow.tsx' 'src/app/(app)/dashboard/page.tsx' 'src/components/dashboard/__tests__/dashboardStructure.test.ts'
git commit -m "feat(coaching): surface accompaniment on home"
```

---

### Task 3: Accurate proposal diagnostics and recipient readiness

**Files:**

- Modify: `src/app/actions/trainerAssignments.ts`
- Modify: `src/app/actions/__tests__/trainerAssignments.test.ts`
- Modify: `src/app/(app)/coach/programs/[templateId]/page.tsx`
- Modify: `src/app/(app)/coach/programs/[templateId]/__tests__/page.test.tsx`
- Modify: `src/components/coaching/AssignProgramDialog.tsx`
- Modify: `src/components/coaching/__tests__/trainerAssignmentUi.test.tsx`
- Modify the browser fixture for `AssignProgramDialog` only if the real interaction test needs
  the new recipient fields.

**Interfaces:**

- `Relationship` in `AssignProgramDialog` gains:

```ts
type Relationship = {
  id: string
  clientUserId: string
  clientName?: string
  clientAvatarUrl?: string | null
  serviceName?: string
  startedAt?: string
  state?: string
  canReceiveProposal: boolean
  blockingReason?: string
}
```

- `mapTrainerAssignmentProposalError(error: unknown): string` is exported for focused tests
  and used only at the server-action boundary.

- [ ] **Step 1: Write failing table-driven error-mapping tests**

For each literal database message, assert the exact safe Spanish result:

```text
TRAINER_ASSIGNMENT_CONSENT_REQUIRED -> No se puede enviar la rutina porque la autorización de datos de entrenamiento del cliente no está activa. Pídele que revise Acompañamiento.
COACHING_RELATIONSHIP_NOT_ACTIVE -> El acompañamiento está pausado o finalizado. Revísalo antes de enviar la rutina.
TRAINER_ASSIGNMENT_ACTIVE_EXISTS -> Este cliente ya tiene una rutina profesional activa. Gestiona esa rutina en lugar de enviar otra.
TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE -> Completa todos los días y añade al menos un ejercicio por día antes de enviar la rutina.
TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE -> Esta rutina ya no está disponible para enviarla.
TRAINER_ASSIGNMENT_TRAINER_INACTIVE -> Tu perfil de entrenador no está activo.
TRAINER_ASSIGNMENT_CLIENT_INACTIVE -> La cuenta del cliente no está activa.
```

Assert an unknown error returns `No se pudo enviar la rutina. Inténtalo de nuevo.` and does
not reproduce raw database text.

- [ ] **Step 2: Run action tests and verify RED**

```powershell
pnpm exec vitest run src/app/actions/__tests__/trainerAssignments.test.ts --maxWorkers=1
```

Expected: FAIL because all failures still collapse into one message.

- [ ] **Step 3: Implement minimal tenant-safe mapping**

Extract text only from known `message`, `details`, `hint`, or string fields; match only the
allowlisted tokens above. Use the mapper when the RPC returns an error and retain a generic
response-shape failure when no recognized database error exists.

- [ ] **Step 4: Run action tests and verify GREEN**

Run Step 2. Expected: mapping and existing action validation tests pass.

- [ ] **Step 5: Write failing recipient-readiness route and component tests**

Change the program-page fixture so one relationship has no assignment, one has `proposed`,
and one has `active` from another template. Assert the route passes:

```ts
{ canReceiveProposal: true, state: 'Listo para recibir rutina' }
{ canReceiveProposal: false, state: 'Propuesta pendiente', blockingReason: 'El cliente ya tiene una propuesta pendiente de revisión.' }
{ canReceiveProposal: false, state: 'Rutina activa', blockingReason: 'El cliente ya tiene una rutina profesional activa.' }
```

The real dialog rendering test must prove blocked recipients are disabled with visible reason,
and only the ready recipient can submit.

- [ ] **Step 6: Run route/dialog tests and verify RED**

```powershell
pnpm exec vitest run src/app/\(app\)/coach/programs/\[templateId\]/__tests__/page.test.tsx src/components/coaching/__tests__/trainerAssignmentUi.test.tsx --maxWorkers=1
```

Expected: FAIL because current assignment lookup only understands active assignments for the
open template and every relationship radio remains enabled.

- [ ] **Step 7: Implement readiness without weakening server authority**

Load the trainer's `proposed` and `active` assignments across the visible relationship IDs,
including `relationship_id`, `client_user_id`, `source_template_id`, `status`, and
`created_at`. Derive one latest blocking assignment per relationship. Keep current-template
active assignments in the existing revision choices. In the dialog, disable blocked radios,
render their reason, default-select only a ready relationship, and explain in the empty state
that an active accompaniment plus current authorization is required.

- [ ] **Step 8: Run focused tests and type-check**

```powershell
pnpm exec vitest run src/app/actions/__tests__/trainerAssignments.test.ts src/app/\(app\)/coach/programs/\[templateId\]/__tests__/page.test.tsx src/components/coaching/__tests__/trainerAssignmentUi.test.tsx --maxWorkers=1
pnpm type-check
```

Expected: all focused tests and TypeScript pass.

- [ ] **Step 9: Commit Task 3**

```powershell
git add -- 'src/app/actions/trainerAssignments.ts' 'src/app/actions/__tests__/trainerAssignments.test.ts' 'src/app/(app)/coach/programs/[templateId]/page.tsx' 'src/app/(app)/coach/programs/[templateId]/__tests__/page.test.tsx' 'src/components/coaching/AssignProgramDialog.tsx' 'src/components/coaching/__tests__/trainerAssignmentUi.test.tsx' 'src/components/coaching/__tests__/fixtures/assignProgramDialogInteraction.html'
git commit -m "fix(coaching): explain routine proposal blockers"
```

---

### Task 4: Client-owned training-consent recovery

**Files:**

- Create: `supabase/migrations/058_training_profile_consent_regrant.sql`
- Create: `supabase/tests/058_training_profile_consent_regrant_test.sql`
- Modify: `scripts/test-trainer-programming-db.mjs`
- Modify: `supabase/tests/trainer_authorization_test.sql`
- Modify: `supabase/tests/trainer_security_test.sql` if its exact preflight marker or function
  catalog requires the new RPC.
- Modify: `src/types/database.ts`
- Modify: `src/lib/coaching/__tests__/relationshipsMigration.test.ts`
- Modify: `src/lib/coaching/__tests__/auditCoverage.test.ts`
- Modify: `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`
- Modify: `src/app/actions/coachingRelationships.ts`
- Modify: `src/app/actions/__tests__/coachingRelationships.test.ts`
- Modify: `src/components/coaching/ConsentManager.tsx`
- Modify: `src/components/coaching/__tests__/consentManager.test.tsx`
- Modify: `src/components/coaching/__tests__/fixtures/consentManager.fixture.tsx`
- Modify: `src/components/coaching/__tests__/fixtures/consentActions.fixture.ts`
- Modify: `src/app/(app)/coaching/page.tsx`
- Modify: `src/app/(app)/coaching/__tests__/page.test.tsx`
- Modify: `tests/e2e/helpers/trainer-marketplace.ts`
- Modify: `README.md`
- Modify: `docs/operations/trainer-marketplace-runbook.md`
- Modify: `docs/operations/trainer-pilot-checklist.md` when its marker/order text contains 57.

**Interfaces:**

- Adds SQL and generated TypeScript contract:

```ts
grant_training_profile_consent: {
  Args: {
    p_relationship_id: string
    p_consent_version: string
    p_idempotency_key: string
  }
  Returns: { relationship_id: string; changed: boolean }[]
}
```

- `coachingRelationships.ts` exports
  `grantTrainingProfileConsent(formData: FormData): Promise<ConsentResult>` and sends
  `training-profile-v1` from the server, never a browser-selected version.

- [ ] **Step 1: Write the failing pgTAP suite**

Cover at minimum: function existence/signature; owner/search path/exact ACL; unauthenticated
and foreign relationship rejection; ended/paused relationship rejection; inactive client or
trainer rejection; successful client grant; `granted_by` and version; one active-scope row;
`training_profile_consent_granted` audit metadata; deduplicated trainer notification; exact
retry returning `changed = false`; two concurrent attempts serialized by the relationship
lock; migration rerun preserving an existing grant; and `trainer_security_preflight() = 58`.

- [ ] **Step 2: Register migration/test in the DB runner and verify RED**

Append 058 after 057 in the migration list, run it twice for rerunnability, execute the new
pgTAP file, update durable-rerun wording to `040–051, 053, 056–058`, and advance all exact
preflight consumers to 58.

Run:

```powershell
pnpm test:db:trainers
```

Expected: FAIL because migration 058 and the RPC are absent. If Docker or local PostgreSQL is
unavailable, record that exact environmental boundary and continue with the static contract
tests; do not claim DB execution.

- [ ] **Step 3: Implement migration 058 minimally**

Create `grant_training_profile_consent` with this order:

1. derive `auth.uid()` and validate non-null arguments/version length;
2. lock the client account and the relationship owned by that client;
3. require relationship `active` and trainer/client accounts plus trainer profile active;
4. check the existing active `training_profile` grant while holding the relationship lock;
5. return `{ relationship_id, false }` when already granted;
6. insert one versioned grant, audit `training_profile_consent_granted`, notify the trainer at
   `/coach/clients/<client_user_id>`, and return `{ relationship_id, true }`;
7. set owner/search path/exact ACL;
8. redefine `trainer_security_preflight()` from the 057 contract, add the new function's
   signature/owner/config/ACL checks, and return 58.

Do not amend migrations 042–057.

- [ ] **Step 4: Rerun pgTAP and verify GREEN when DB dependencies exist**

Run Step 2. Expected: the complete trainer DB suite passes and reports marker 58. If the
environment boundary remains, leave this check explicitly unverified.

- [ ] **Step 5: Write failing application contract/action tests**

Extend the relationship RPC type test to read 042 plus 058 and include the new exact argument
order. Assert `grantTrainingProfileConsent` ignores injected trainer/version fields and calls:

```ts
supabase.rpc('grant_training_profile_consent', {
  p_relationship_id: '11111111-1111-4111-8111-111111111111',
  p_consent_version: 'training-profile-v1',
  p_idempotency_key: '22222222-2222-4222-8222-222222222222',
})
```

Add static migration coverage for audit allowlist compatibility, marker 58, exact ACL, and
runner order.

- [ ] **Step 6: Run application contract/action tests and verify RED**

```powershell
pnpm exec vitest run src/lib/coaching/__tests__/relationshipsMigration.test.ts src/lib/coaching/__tests__/auditCoverage.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts src/app/actions/__tests__/coachingRelationships.test.ts --maxWorkers=1
```

Expected: FAIL because types, action, and final migration contract are absent.

- [ ] **Step 7: Add types, action, and all marker consumers**

Update `Database['public']['Functions']`, route the new name through `invokeConsentAction`,
revalidate `/dashboard`, `/coaching`, `/coach/clients`, and `/coach/programs`, and keep the
server-owned consent version. Update every committed `= 57`, `through 057`, and migration list
that represents the current deployable trainer boundary; historical tests explicitly about
057 remain historically named unless they assert the latest boundary.

- [ ] **Step 8: Run application contract/action tests and verify GREEN**

Run Step 6. Expected: all focused contract and action tests pass.

- [ ] **Step 9: Write failing client UI/page tests**

Real-render `ConsentManager` with no training grant and assert required/optional labels,
`Falta un paso para recibir tu rutina`, and `Autorizar datos de entrenamiento`, with no
`Revocar datos de entrenamiento` action. Render an active grant and assert
`Autorización activa` plus the existing destructive revoke action. Extend the interaction
fixture to assert success/failure restores controls and retains accessible feedback. In the
page test, assert an active relationship with missing consent still renders the recovery
manager.

- [ ] **Step 10: Run client UI/page tests and verify RED**

```powershell
pnpm exec vitest run src/components/coaching/__tests__/consentManager.test.tsx src/app/\(app\)/coaching/__tests__/page.test.tsx --maxWorkers=1
```

Expected: FAIL because the missing-grant branch currently offers only revocation.

- [ ] **Step 11: Implement the guided consent UI**

Add a `grant-training` action state, explicit confirmation copy excluding measurements,
server action invocation, and refresh after success. Keep body measurements in an optional
section. Render the destructive training revoke button only when the grant is active. Use an
alert-styled but non-live persistent recovery block and reserve live announcements for action
results.

- [ ] **Step 12: Run all Task 4 tests and type-check**

```powershell
pnpm exec vitest run src/lib/coaching/__tests__/relationshipsMigration.test.ts src/lib/coaching/__tests__/auditCoverage.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts src/app/actions/__tests__/coachingRelationships.test.ts src/components/coaching/__tests__/consentManager.test.tsx src/app/\(app\)/coaching/__tests__/page.test.tsx --maxWorkers=1
pnpm type-check
```

Expected: all focused tests and TypeScript pass.

- [ ] **Step 13: Commit Task 4**

```powershell
git add -- 'supabase/migrations/058_training_profile_consent_regrant.sql' 'supabase/tests/058_training_profile_consent_regrant_test.sql' 'scripts/test-trainer-programming-db.mjs' 'supabase/tests/trainer_authorization_test.sql' 'supabase/tests/trainer_security_test.sql' 'src/types/database.ts' 'src/lib/coaching/__tests__/relationshipsMigration.test.ts' 'src/lib/coaching/__tests__/auditCoverage.test.ts' 'src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts' 'src/app/actions/coachingRelationships.ts' 'src/app/actions/__tests__/coachingRelationships.test.ts' 'src/components/coaching/ConsentManager.tsx' 'src/components/coaching/__tests__/consentManager.test.tsx' 'src/components/coaching/__tests__/fixtures/consentManager.fixture.tsx' 'src/components/coaching/__tests__/fixtures/consentActions.fixture.ts' 'src/app/(app)/coaching/page.tsx' 'src/app/(app)/coaching/__tests__/page.test.tsx' 'tests/e2e/helpers/trainer-marketplace.ts' 'README.md' 'docs/operations/trainer-marketplace-runbook.md' 'docs/operations/trainer-pilot-checklist.md'
git commit -m "feat(coaching): add guided training consent recovery"
```

---

### Task 5: Cross-flow, responsive, and repository verification

**Files:**

- Create: `src/components/coaching/__tests__/coachingContextAcceptance.test.tsx`
- Create: `src/components/coaching/__tests__/fixtures/coachingContextAcceptance.fixture.tsx`
- Create: `src/components/coaching/__tests__/fixtures/coachingContextAcceptance.html`
- Do not change production behavior merely to silence an unrelated flaky fixture.

**Interfaces:**

- Consumes every interface from Tasks 1–4.
- Produces no new production API.

- [ ] **Step 1: Run all touched focused suites together**

```powershell
pnpm exec vitest run src/lib/coaching/__tests__/clientSummary.test.ts src/app/\(app\)/trainers/__tests__/page.test.tsx src/components/coaching/__tests__/trainerDirectory.test.tsx src/components/dashboard/__tests__/CoachingSummaryCard.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts src/app/actions/__tests__/trainerAssignments.test.ts src/app/\(app\)/coach/programs/\[templateId\]/__tests__/page.test.tsx src/components/coaching/__tests__/trainerAssignmentUi.test.tsx src/lib/coaching/__tests__/relationshipsMigration.test.ts src/lib/coaching/__tests__/auditCoverage.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts src/app/actions/__tests__/coachingRelationships.test.ts src/components/coaching/__tests__/consentManager.test.tsx src/app/\(app\)/coaching/__tests__/page.test.tsx --maxWorkers=4
```

Expected: all touched suites pass together with zero failures.

- [ ] **Step 2: Run static repository gates**

```powershell
pnpm type-check
pnpm lint
git diff --check origin/main...HEAD
```

Expected: every command exits 0. Existing warnings must be identified separately from errors.

- [ ] **Step 3: Run the complete Vitest suite**

```powershell
pnpm exec vitest run --maxWorkers=4
```

Expected: 0 failed tests. If the two baseline browser fixtures time out during initial Vite
optimization, rerun each isolated once and report both the full-suite result and isolated
evidence; never rewrite them as part of this feature without a reproduced product defect.

- [ ] **Step 4: Run the trainer database suite when available**

```powershell
pnpm test:db:trainers
```

Expected: migrations through 058, pgTAP, authorization, rerun, and preflight marker 58 pass.
If Docker/PostgreSQL is unavailable, preserve the exact error as an external verification
boundary.

- [ ] **Step 5: Verify responsive behavior on real rendered components**

Extend an existing Vite/Playwright fixture or create a focused one that renders:

- a matching trainer card and a normal card;
- Dashboard summary in `needs_consent` and `proposal_pending` states;
- ConsentManager missing-grant state;
- AssignProgramDialog with ready, proposed, and active recipients.

At widths 320, 360, 390, 412, and 1280 assert `scrollWidth <= clientWidth`, visible status
text, non-overlapping CTA bounding boxes, and minimum 44 px interactive heights. Run axe on
the rendered surfaces and capture narrow plus desktop screenshots under a git-ignored
artifact directory.

- [ ] **Step 6: Review the complete branch diff against the spec**

Check every acceptance criterion, RLS assumption, error token, consent actor, route, Spanish
label, responsive state, and migration consumer. Confirm `active_trainer_directory` remains
viewer-agnostic and the trainer never receives a consent-grant control.

- [ ] **Step 7: Commit verification-only changes if any**

```powershell
git add -- 'src/components/coaching/__tests__/coachingContextAcceptance.test.tsx' 'src/components/coaching/__tests__/fixtures/coachingContextAcceptance.fixture.tsx' 'src/components/coaching/__tests__/fixtures/coachingContextAcceptance.html'
git commit -m "test(coaching): verify context and consent flow"
```

Skip this commit when Task 5 creates no files. Never stage generated screenshots or unrelated
worktree content.
