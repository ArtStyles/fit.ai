# Coaching catalog availability

The forward migration `20260908140000_trainer_template_exercise_availability.sql`
separates incomplete template structure from unavailable exercise references in
`assign_trainer_program(uuid,uuid,text,text)` and
`publish_trainer_assignment_revision(uuid,uuid,text,text)`.

- Missing days or an empty day return `TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE`.
- A complete template containing any nonpublic or missing exercise returns
  `TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE`, including when every
  referenced exercise is retired.
- The editor displays the saved unavailable selection and requires an explicit
  public replacement. It preserves prescription fields and waits for refreshed
  saved availability before allowing assignment/revision. Pending structural
  mutations also block sending.

Apply this migration through the normal `infra/supabase/migrations` deployment
process before deploying the UI that maps the new error. It preserves the RPC
signatures, security-definer mode, search path, owner and grants; it does not change
the preflight version or rewrite template, assignment or history records.
Published migrations must remain unchanged.

Local validation:

```sh
pnpm run test:db:template-availability
pnpm run check:supabase-migrations
```

The database test requires Docker and starts its own disposable Supabase Postgres
container without published ports or an environment connection string. It applies
the repository baseline and forward migrations, runs the production V1 manifest
mapper and digest-pinned cutover RPC against synthetic fixtures, and removes only
its owned container. It tests both assignment and revision using fresh requests,
checks authorization and availability errors, and compares exact saved
prescriptions, reference rows, published versions and exercise history.

These local checks do not establish deployment to a remote project. Remote
migration application and production account validation require a separate
authorized release phase.


## Person-based relationship management

The forward migration `20260908150000_coach_relationship_management.sql` adds authenticated-only `get_coach_relationship_management()` and advances `trainer_security_preflight()` to 61. The RPC derives the trainer from `auth.uid()` and returns only own active/paused relationships, public identity, service, dates, status and authorization flags. Pending request counts exclude accepted history. Management visibility does not grant training evidence or assignment authority; existing RLS and lifecycle functions are unchanged, including client-only resume and one active trainer per client.

The preflight retains the checks from version 60 and adds the new signature, owner, definer, pinned search path and exact application ACL. Its existing pinned audit allowlist comparison normalizes CRLF to LF on both sides only, so Git line-ending normalization cannot cause a false failure; changing allowlist content still fails.

The protected summary already emits `relationshipId`; the production adapter now requires it. UI evidence joins by both relationship and client ID and only when management marks training access available. Management failure remains an explicit error; protected-summary failure preserves the management list with a localized unavailable message. Acceptance, consent and lifecycle actions invalidate the overview, requests and clients views.

Local gates: `pnpm test:db:relationship-management` (disposable local API-role authorization/preflight tests), `pnpm test:db:direct-assignment` (active-chain and legacy history regression), scoped unit/browser tests, and type/lint checks. E2E deployment helpers now require preflight61 before any fixture writes. This work does not apply remote migrations or verify a deployment.

## Integrated verification — 2026-09-08

| Check | Result |
| --- | --- |
| Full Vitest, unit and real-component browser projects before the final two UI refinements | 2,989 tests in 322 files passed |
| Final saved-public selector and identity-initials refinements | 9 SSR and 7 focused browser tests passed after reproducing both defects; nonincremental TypeScript and scoped ESLint passed |
| Direct-assignment and historical DB regression | 207 pgTAP assertions and 33 real response-adapter assertions passed; data and active function fingerprints preserved |
| Management API-role DB matrix | Passed minimal payload, account/consent boundaries, lifecycle isolation and preflight tampering checks |
| Template availability against all seven active migration files | Passed actual V1 cutover, assignment, revision and explicit replacement cases |
| Next route types and nonincremental TypeScript | Passed |
| Full ESLint | Zero errors; three existing unused-disable warnings in unchanged files |
| Webpack production build after final refinements | Passed, including 53 static pages and professional routes, using a temporary cache of the real Google Fonts files |
| Responsive component inspection | 390 and 1280 px, named confirmation, keyboard focus, 44 px controls and no horizontal overflow |

The normal font download failed with Node `connect EACCES`. For the successful
build, Google CSS and 16 real WOFF2 files were fetched with the available HTTP
client into ignored temporary storage. Font signatures and SHA256 hashes were
checked; all 16 emitted font files matched those downloaded bytes. No synthetic
font bytes, application font changes or Next configuration changes were used.
Environment values were loaded only into the build process. Existing Vite,
Browserslist, Tailwind and lint notices are recorded in the local verification logs.

The final selector also retains an already-saved public exercise when it lies
outside the initial 200 options. Prescription-only changes keep the exact ID;
retired or missing saved references remain disabled until explicit replacement.
Named clients without photos show decorative initials; genuinely missing
identity keeps its generic icon and disabled finalization. These six-file UI
refinements did not alter SQL, authorization or migration files, so the already
passing database matrices remain applicable.

The independent whole-change review approved the local handoff with no critical
or important findings. Its two functional presentation observations were then
resolved in one final wave; a scoped rereview approved both fixes without new
findings. This is local review evidence, not deployment verification.

At the initial local handoff, both migrations were unapplied and the worktree
remained uncommitted on `db5a15a9939bdf6a7cfe59bd32acfdc020008251`. The later
release authorization explicitly included migration application, commit and
push to `main`.

## Authorized release verification — 2026-09-08

The reviewed changes were integrated without conflicts onto current `main`
`f1fcc739e2f849075d5d7ff56e2217ab04da1ea2`. Auth, notification and personal-plan
readiness changes were preserved, including their Vitest fixture registrations.
The staged check also removed one extra blank line at the end of the new local
management database runner; its behavior is unchanged.

Fresh validation of this integrated tree:

- Full Vitest: 324 files and 3,020 tests; 3,019 passed and one unchanged music
  fixture hit a navigation timeout while Vite optimized dependencies. The exact
  affected file passed all three cases when rerun alone, without code changes.
- Next type generation and nonincremental TypeScript passed. Full lint had zero
  errors and the same three warnings in unchanged files.
- The management database matrix passed against all seven active migrations,
  including permissions, lifecycle preservation and preflight tampering.
- The production build passed with 53 pages. All 16 emitted font files matched
  the previously verified real WOFF2 bytes used by the temporary build cache.

Before application, the remote ledger held the five published migrations and
preflight 60. The three existing function bodies and authority settings matched
the published direct-assignment migration. The maintained wrapper, pinned to
Supabase CLI 2.116.0 and `infra`, listed exactly the two new migrations in its
dry run, with no seeds or role changes.

Two attempts failed during connection acquisition. A subsequent ledger read
confirmed no partial application. The successful wrapper invocation used the
validated transaction pooler on port 6543 with explicit `sslmode=require` and
applied both migrations in order. Independent read-only verification confirmed:

- Seven matching ledger entries and `trainer_security_preflight() = 61`.
- Exact bodies, owners, definer settings, search paths and execution permissions
  for assignment, revision, management and preflight.
- Preflight 61 and the minimal management response under the `authenticated`
  database role, with an existing active trainer subject and no business writes.

The last check used a database session whose session role remained `postgres`;
it is not proof of a logged-in browser journey. No real assignments, clients or
consents were modified for release testing. Git publication and the deployed
web runtime are verified separately from these database checks.
