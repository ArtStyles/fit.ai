# Phase 6 Task 2 — concurrent trainer workflow hardening

## Outcome

Added a deterministic local security harness and an opt-in Playwright contract for trainer workflow races and cross-tenant identifiers. The existing 042–045 authorization and serialization boundaries held under the new tests, so no production action or permission changes were made. Migration 045 only gained a read-only deployment marker used to stop remote fixture setup before any write.

## TDD evidence

- RED: preflight unit tests failed because the read-only probe/helper did not exist.
- GREEN: the helper probes migrations 042–045 with ten bounded `SELECT` calls and eight intentionally invalid/read-only RPC calls; incomplete schemas reject before seed or cleanup callbacks.
- RED: the migration contract failed because 045 had no definitive deployment marker.
- GREEN: `trainer_security_preflight()` is a stable constant SQL function returning `45`, with fixed search path and authenticated/service-role execute only.
- RED: the database harness contract failed before the repeat runner and supplemental SQL existed.
- GREEN: `pnpm test:db:trainer-security` creates fresh isolated databases and defaults to three repetitions.
- RED during the first real local race: the end/read barrier attempted an authenticated direct row lock, which the RPC-only table correctly denied. The fixture now acquires its synchronization lock before assuming the authenticated role; the mutation and read still execute through the real authenticated RPC boundary.
- RED after expanding the exact IDOR comparisons: the authenticated actor could not record results in the setup role's temporary table. Granting access to that temporary test table fixed the harness only; no product grant or guard changed.

## Race results

All races use independent sessions locally through `dblink`; the Playwright spec uses separately authenticated Supabase clients and literal `Promise.allSettled` calls.

1. Two trainers accept competing requests: exactly one relationship/request wins.
2. Two same-key proposals: both calls resolve to the same assignment; one assignment, version, and materialized plan exist.
3. Accept + publish + suspend: serialization leaves the trainer suspended, no active plan, and no partial version.
4. Two N+1 revisions: version numbers remain unique, exactly one version/plan is active, and every version is fully materialized.
5. End relationship + read insights/evidence: the read cannot escape the relationship transition; the final relationship is ended and unavailable evidence remains generic.

The final local command completed three fresh-database repetitions in 55.9 seconds with exit code 0.

## IDOR coverage

For each identifier below, the local SQL executes the real RPC/RLS boundary with an authenticated non-owner, compares a known foreign row with a missing UUID, and compares protected-row snapshots before and after:

- `applicationId` — `submit_trainer_application`
- `credentialId` — `prepare_trainer_credential_removal`
- `requestId` — `accept_coaching_request`
- `relationshipId` — `end_coaching_relationship`
- `clientId` — `get_coach_client_insights`
- `templateId` — `propose_trainer_assignment`
- `assignmentId` — `publish_trainer_assignment_revision`
- `planId` — `workout_plans` RLS update
- `progressLogId` — `progress_logs` RLS update

All nine produced indistinguishable foreign/missing outcomes and zero protected-row changes in each of the three final repetitions.

## Remote preflight

The opt-in remote Playwright attempt was intentionally not reported green. The configured remote database is behind migration 045, so the read-only preflight raised:

`Trainer security migrations 042, 043, 044, and 045 must be deployed before fixture writes`

No fixture seed ran. Global teardown repeated the preflight, logged that cleanup was blocked, and performed zero cleanup writes. The browser suite must be rerun after the remote has migrations 042–045.

## Final verification

- `pnpm test:db:trainer-security` — exit 0; 3/3 fresh database repetitions.
- `pnpm vitest run scripts/__tests__/trainer-security-preflight.test.ts scripts/__tests__/trainer-security-db-harness.test.ts src/lib/coaching/__tests__/trainerSecurityMigration.test.ts` — 3 files, 7 tests passed.
- `pnpm playwright test tests/e2e/trainer-security.spec.ts --project=desktop-1024 --repeat-each=3 --list` — 6 scheduled tests (2 tests × 3 repeats).
- `pnpm test` — 187 files, 1,507 tests passed.
- `pnpm test:db:trainers` — exit 0.
- `pnpm test:db:insights` — exit 0; migrations 040–045 behavior and rerunnability passed.
- `pnpm type-check` — exit 0.
- `pnpm lint` — exit 0.
- `git diff --check` — exit 0 (Git emitted only line-ending conversion warnings).

## Self-review

- No credentials, connection strings, or secret values are emitted by the new runner.
- The preflight performs only reads and intentionally invalid RPC calls before any seed/cleanup write.
- Production changes are limited to the read-only migration marker; no action handler or database permission was relaxed.
- Package/community/payment/messaging surfaces are untouched.
- Remaining blocker: deploy migrations 042–045 to the dedicated remote E2E project, then run the opt-in Playwright spec with `--repeat-each=3`.

## Review round 1 of 5

All critical and important review findings were remediated with tests before implementation:

- The only pre-seed RPC is now the read-only `trainer_security_preflight()` marker. It returns exactly `45` and verifies all seven required routine signatures with `to_regprocedure`; the client preflight performs only bounded table `SELECT`s plus that marker call.
- Browser IDOR coverage now uses persisted foreign IDs and separate random missing IDs for all nine identifier classes. A successful empty response is rejected, foreign/missing failures must share the same generic code/domain, and full target/dependency snapshots are compared without coercing malformed results to empty arrays.
- The suspension race now traverses an authenticated admin-only HTTP boundary. The server-only helper verifies the bearer identity and active admin profile before creating a service client for the privileged RPC; direct authenticated RPC access remains denied in SQL.
- Proposal, N+1 revision, and end/read SQL races capture exact `dblink` backend PIDs and prove a local `Lock` wait event before releasing their barriers. The end/read race always executes a post-commit evidence read and verifies generic denial.
- Security race execution now always invokes registered cleanup in `finally`. Partial relationship seed failures clean tracked rows, all created actor sessions are registered as soon as they exist, and fixtures that publish retained program data declare the dedicated-project-reset policy explicitly.
- The global teardown no longer returns early when the security preflight fails; unrelated teardown is still attempted.
- Protected snapshots now include full rows for applications, credentials and cleanup records, application events/interviews, trainer profiles and service offerings, requests, relationships, consents, templates/workouts/exercises, assignments/versions, plans/workouts/exercises, progress/exercise logs, notifications, and professional audits.

### Review-round verification

- `pnpm test:db:trainer-security` — exit 0, 3/3 fresh isolated database repetitions (94.9 seconds).
- `pnpm test:db:programming` — exit 0.
- `pnpm test:db:insights` — exit 0; migrations 040–045 behavior and rerunnability passed.
- `pnpm test:db:trainers` — exit 0; authorization mode passed.
- Focused Vitest command over preflight, teardown, DB harness, migration marker, admin boundary, and route — 6 files and 17 tests passed.
- `pnpm type-check` — exit 0.
- `pnpm lint` — exit 0.
- Playwright list with `--repeat-each=3` — 6 tests scheduled.
- Remote Playwright with `--repeat-each=3` stopped at the read-only preflight in all three attempts because the configured remote still lacks marker 45. No fixture seed ran. General teardown was attempted after the security teardown failure; the sandbox then denied the auth-list network request with `fetch EACCES`.
- A post-review full Vitest run was not green: 184/190 files and 1,513/1,517 tests passed. The six failed suites were browser/Vite lifecycle contention only (ports 5173–5177, four 5-second test timeouts, and six 10-second `afterAll` close timeouts); there was no behavioral assertion mismatch and no listener remained after the run. This is recorded as an external repository-wide parallelism blocker rather than represented as a pass.
