# Phase 6 Task 2 — authoritative trainer security races and IDOR

## Current outcome

The trainer security harness now exercises legal persisted fixtures, observable database interleavings, strict generic denials, full two-tenant snapshots, and real cleanup. No current claim depends on an intentionally invalid mutating probe or on retention-only metadata.

Before any fixture write, the browser harness performs ten bounded table `SELECT`s and calls only the stable read-only `trainer_security_preflight()` RPC. Marker 45 returns exactly `45` after checking the catalog signatures of the seven protected workflow routines and the exact-fixture cleanup routine.

## Browser fixture and IDOR contract

The foreign fixture obtains its request identifier from the active relationship's persisted `source_request_id`; it does not attempt an illegal second request after the client already has an active relationship. Service offerings are selected through the schema's real `trainer_profile_id` key.

All nine foreign identifiers are persisted rows and every missing identifier is a distinct random UUID:

- `applicationId`
- `credentialId`
- `requestId`
- `relationshipId`
- `clientId`
- `templateId`
- `assignmentId`
- `planId`
- `progressLogId`

An IDOR attempt is denied only when it returns an error, returns no payload, and exposes a generic code/domain equivalent to the missing-ID attempt. A successful empty response is a failure.

The before/after snapshot covers both attacker and foreign graphs: account profiles, applications, credentials and cleanup records, events, interviews, trainer profiles, service offerings, requests, relationships, consents, templates/workouts/exercises, assignments/versions, all user plans/workouts/exercises, session authorizations, progress/exercise logs, measurements, notifications, and actor/subject audits. Snapshot reads fail on malformed results instead of coercing them to empty arrays.

## Cleanup boundary

`resetPolicy` metadata was removed. Every published security fixture now invokes `cleanup_trainer_security_e2e_fixture(text, uuid[])` in its final cleanup, and partial preparation paths invoke the same action after signing out registered actors.

The cleanup RPC is `SECURITY DEFINER`, explicitly owned by `postgres`, executable only by `service_role`, and rejects public, anonymous, and authenticated callers. It is not a project reset: it accepts exact user UUIDs only, locks and captures the targets that still exist, requires every captured auth user to carry the same requested `e2e_run_id`, and deletes only that captured set in dependency order. A completed retry returns zero; a partial retry removes only the remaining matching users; mixed or unmarked existing targets fail before mutation. The browser helper additionally requires every trainer-security opt-in before it can call the cleanup boundary. The SQL suite proves authenticated denial, mixed-run rejection, first-call deletion of a published assignment/version/plan graph and three exact users, a zero-count retry, and a one-user partial retry whose absent UUID does not broaden scope.

Global teardown continues unrelated account cleanup even if security preflight prevents security-fixture work.

## Race authority and admin boundary

The two-trainer acceptance runner captures the exact two `dblink` backend PIDs, holds the client's advisory lock, dispatches both authenticated accepts, and verifies both PIDs are active with `wait_event_type = 'Lock'` before release.

The proposal and N+1 revision races use the same exact-PID lock observation. The accept/publish/suspend SQL scenario also proves both authenticated contenders are waiting before the database suspension half runs. The end/read scenario proves the exact reader PID is waiting before the relationship end commits and always performs a post-commit denied read.

PostgreSQL-only runners do not contain an HTTP server, GoTrue, or the Next.js route, so the suspension boundary is deliberately split without misrepresenting the SQL service actor:

- The E2E route and helper exercise authenticated bearer identity → active admin verification → server-only service client.
- The SQL test proves direct authenticated invocation is denied, then tests only the service-role database serialization half.
- `suspend_account_and_professional` remains unavailable to `authenticated`; no production backdoor or relaxed grant was added.

## TDD evidence for review round 2

- IDOR fixture RED: the persisted-dependency resolver and dual-scope builder did not exist. GREEN: the strict fake permits only the active relationship/source-request query and `trainer_profile_id` service query; both attacker and foreign scopes are produced.
- Cleanup RED: the cleanup helper, preparation-failure cleanup wrapper, migration signature, and ACL were absent. GREEN: focal tests prove the full opt-in gate, exact RPC arguments, and cleanup invocation after partial preparation.
- Cleanup database RED: the first executable attempt exposed a reserved alias, then the real deletion exposed the `workout_exercises → workouts` dependency. GREEN: dependency-ordered cleanup removed the immutable graph and exactly three marked users.
- Authorization RED: adding the cleanup definer changed the reviewed owner and execute-ACL catalogs. GREEN: the reviewed hashes and explicit service-role-only assertions include the new routine.
- Barrier RED: neither the two-trainer runner nor accept/publish/suspend captured and observed exact PIDs. GREEN: focal contracts and real database runners verify both condition-based barriers.
- Full regression RED: the first serial run found one overly broad structural assertion that prohibited the acceptance barrier's bounded `pg_sleep(0.01)` while claiming to cover only suspension races. GREEN: the assertion now scopes itself to suspension SQL, and the complete serial run passes.

## Review round 2 verification evidence

- Focused Vitest security command — 7 files, 24 tests passed.
- `pnpm test:db:trainer-security` — 3/3 fresh isolated databases passed; 153.8 seconds.
- `pnpm test:db:programming` — exit 0; migrations 040–045 behavior and rerunnability passed.
- `pnpm test:db:insights` — exit 0; migrations 040–045 behavior and rerunnability passed.
- `pnpm test:db:trainers` — exit 0; authorization suite passed.
- `pnpm vitest run --maxWorkers=1 --no-file-parallelism --reporter=dot` — 191/191 files and 1,524/1,524 tests passed; 192.35 seconds.
- `pnpm playwright test tests/e2e/trainer-security.spec.ts --project=desktop-1024 --repeat-each=3 --list` — 6 tests listed from 1 file.
- `pnpm type-check` — exit 0.
- `pnpm lint` — exit 0.

Remote Playwright execution is not claimed in this review round. The suite remains opt-in and cannot seed unless marker 45 and the cleanup routine are both deployed.

## TDD evidence for review round 3

- Owner RED: the focal migration contract failed because migration 045 did not contain an explicit cleanup owner. GREEN: `ALTER FUNCTION ... OWNER TO postgres` now precedes the deny-first ACL reconstruction.
- Catalog RED: the real authorization suite, after reapplying migration 045, reported owner digest `b1c96e76694dd81ef8c2a12270b73d2f` against the obsolete expected digest. GREEN: the reviewed owner digest and an explicit `postgres` owner assertion now pass; the ACL digest remained `ca5fd1fb5de789d16af77d89118b55f8`.
- Idempotency RED: the supplemental security suite's second exact cleanup call failed with `TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH`. GREEN: the first call returns 3, the completed retry returns 0, a mixed set containing an unmarked existing user is rejected without mutation, and a partial retry deletes only its one remaining marked user.

## Review round 3 verification evidence

- Focused Vitest security command — 7 files, 24 tests passed.
- `SECURITY_RACE_REPEATS=1 pnpm test:db:trainer-security` — 1/1 fresh isolated database passed; 47.6 seconds.
- `pnpm test:db:trainers` — exit 0; migrations 040–045 behavior, authorization catalog, and rerunnability passed.
- `pnpm type-check` — exit 0.
- `pnpm lint` — exit 0.
