# Trainer Security Review Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the trainer security E2E fixtures executable, fully reversible, and observably concurrent while preserving the authenticated-admin server boundary.

**Architecture:** Resolve foreign IDOR IDs only from rows already created by the legal relationship/programming lifecycle, and snapshot both attacker and foreign graphs. Replace descriptive reset metadata with an actual service-role cleanup routine restricted to exact E2E-tagged users and invoked in every published-fixture failure/finally path. Use exact captured PostgreSQL backend PIDs for database race barriers; keep HTTP admin authentication authoritative in the E2E route and describe the SQL service-role call only as the database half of that split boundary.

**Tech Stack:** TypeScript, Vitest, Playwright, Supabase/PostgreSQL, PL/pgSQL, dblink, PowerShell/pnpm.

## Global Constraints

- Tests are written and observed failing before implementation changes.
- No destructive reset can run before the marker preflight and explicit security opt-in.
- Cleanup accepts only exact user IDs whose `auth.users.raw_user_meta_data.e2e_run_id` matches the requested run.
- The suspension RPC remains unavailable to `authenticated`; only the server-only route may cross into its service-role database half.
- Commit as a new commit; do not amend review round 1.

---

### Task 1: Legal foreign dependency resolution

**Files:**
- Modify: `tests/e2e/helpers/trainer-marketplace.ts`
- Create: `scripts/__tests__/trainer-security-fixture-contract.test.ts`

**Interfaces:**
- Produces: `readPersistedForeignIdorDependencies(service, relationshipId, trainerProfileIds)` returning the existing source request ID and service rows.

- [ ] Write a focal test whose strict fake permits `coaching_relationships.source_request_id` and `trainer_service_offerings.trainer_profile_id` queries only.
- [ ] Run it and observe failure because the resolver does not exist.
- [ ] Implement the resolver and use it after the foreign active relationship exists; remove the illegal second request creation.
- [ ] Run the focal test green.

### Task 2: Dual-graph immutable snapshot

**Files:**
- Modify: `tests/e2e/helpers/trainer-marketplace.ts`
- Modify: `tests/e2e/trainer-security.spec.ts`
- Modify: `scripts/__tests__/trainer-security-fixture-contract.test.ts`

**Interfaces:**
- Produces: a full snapshot scoped to attacker and foreign users, relationships, applications, profiles, services, requests, templates, assignments, versions, plans, workout/evidence rows, notifications, and audits.

- [ ] Add a failing focal contract that supplies attacker and foreign IDs and expects both graphs to be queried.
- [ ] Replace the foreign-only snapshot with a two-fixture graph snapshot.
- [ ] Verify the focal contract and browser type contract green.

### Task 3: Real published-fixture cleanup

**Files:**
- Modify: `supabase/migrations/045_trainer_hardening.sql`
- Modify: `supabase/tests/trainer_security_test.sql`
- Modify: `tests/e2e/helpers/core-product.ts`
- Modify: `tests/e2e/helpers/trainer-marketplace.ts`
- Modify: `scripts/__tests__/trainer-security-preflight.test.ts`
- Modify: `src/lib/coaching/__tests__/trainerSecurityMigration.test.ts`

**Interfaces:**
- Produces: `cleanup_trainer_security_e2e_fixture(text, uuid[])` service-only RPC and `cleanupTrainerSecurityPublishedFixtures(fixtures)` helper.

- [ ] Add failing migration/client/SQL tests for the exact-user E2E metadata gate, actual row/user deletion, and cleanup invocation on exercise and partial preparation failure.
- [ ] Implement the narrowly scoped cleanup RPC, revoke it from public/anon/authenticated, and add its catalog signature to marker 45.
- [ ] Remove `resetPolicy`; invoke actual cleanup for every published fixture in `finally` and every preparation catch.
- [ ] Run focal and one security database repetition green before continuing.

### Task 4: Observable race barriers and honest boundary split

**Files:**
- Modify: `scripts/test-trainer-relationships-db.mjs`
- Modify: `supabase/tests/trainer_security_test.sql`
- Modify: `scripts/__tests__/trainer-security-db-harness.test.ts`
- Modify: `.superpowers/sdd/2026-08-07-trainer-phase-6-hardening/task-2-report.md`

**Interfaces:**
- Produces: exact-PID `pg_stat_activity.wait_event_type='Lock'` gates before releasing two-trainer acceptance and before invoking the database half of suspension.

- [ ] Add failing harness tests requiring captured PID tables/variables and wait-event checks for both races.
- [ ] Add the two condition-based barriers.
- [ ] Rename/document the SQL suspension connection as the database service boundary, while retaining direct authenticated denial and E2E route coverage for the real authenticated-admin boundary.
- [ ] Run focal and security DB x3 green.

### Task 5: Regression, report, and commit

**Files:**
- Modify: `.superpowers/sdd/2026-08-07-trainer-phase-6-hardening/task-2-report.md`

- [ ] Rewrite contradictory historical statements and record only current commands/results as current evidence.
- [ ] Run focal tests, security DB x3, programming/insights/authorization DB suites, full Vitest serially with one worker, type-check, lint, Playwright list, and diff check.
- [ ] Review staged diff and commit a new review-round fix without amending.
