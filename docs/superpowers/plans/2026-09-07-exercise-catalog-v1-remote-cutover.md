# Exercise Catalog V1 Remote Cutover Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** Replace the remotely visible exercise catalog with Vekira Catalog V1 while preserving every existing workout, log, plan, and trainer-template reference.

**Architecture:** The active `infra/supabase/migrations` line owns schema and a service-role-only transactional cutover RPC. A manifest mapper converts the reviewed 50-entry JSON into database rows. A pinned semantic SHA-256 prevents any unreviewed field substitution. A guarded deployment command verifies the exact target project, performs read-only audit, creates a read-back-verified backup of the whole Storage bucket, uploads hash-verified assets, executes the atomic catalog cutover, and checks exact post-cutover identity. Explicit legacy source/external mappings move the three foreign-key families to their equivalent V1 exercise. Remaining referenced legacy exercises become private but stay readable only to their owning user/trainer; only unreferenced legacy rows may be deleted.

**Tech Stack:** TypeScript, Vitest, Supabase JS 2, PostgreSQL/Supabase migrations, Supabase Storage, pnpm.

---

### Task 1: Define and test the V1 manifest-to-database contract

**Files:**
- Create: `src/lib/exercises/catalogV1Rows.ts`
- Create: `src/lib/exercises/__tests__/catalogV1Rows.test.ts`
- Read: `public/exercises/catalog/v1/manifest.json`
- Modify: `package.json`

- [x] Write failing tests that require exactly 50 unique `vekira-catalog-v1` rows, stable slug external IDs, valid database enums, Spanish instructional text, poster URLs, motion URLs only for reviewed motion assets, and both-or-neither legacy source/external mapping fields.
- [x] Implement the pure mapper with no network or filesystem mutation.
- [x] Add a focused validation command and run the test green.

### Task 2: Add the active transactional cutover migration

**Files:**
- Create: `infra/supabase/migrations/20260907230000_exercise_catalog_v1_cutover.sql`
- Create: `src/lib/exercises/__tests__/catalogV1CutoverMigrationContract.test.ts`
- Modify: `supabase/migrations/062_exercise_motion_previews.sql` only if parity documentation is needed; it remains historical and must never be pushed.

- [x] Write a failing SQL contract test for `motion_preview_url`, a public `exercise-media` bucket, unique V1 source IDs, an advisory transaction lock, payload validation, atomic upsert, exact legacy-ID remapping in all three FK tables, retirement of every non-V1 public row, deletion only when no reference exists in all three FK tables, owner-only read continuity for remaining private referenced rows, and a structured result.
- [x] Implement `public.replace_exercise_catalog_v1(jsonb)` as `SECURITY DEFINER`, revoke it from `PUBLIC`, `anon`, and `authenticated`, and grant only to `service_role`.
- [x] Pin all 26 semantic payload fields in the follow-up migration `20260907233000_exercise_catalog_v1_semantic_digest.sql` and prove remaps, rollback, trigger isolation, and RLS in disposable PostgreSQL.
- [x] Make the migration idempotent where Supabase replay safety requires it and validate the active migration tree.

### Task 3: Build a guarded remote audit, backup, asset upload, cutover, and verification command

**Files:**
- Create: `scripts/exercise-catalog-v1-remote.ts`
- Create: `src/lib/exercises/exerciseCatalogV1Remote.ts`
- Create: `src/lib/exercises/__tests__/exerciseCatalogV1Remote.test.ts`
- Modify: `package.json`
- Modify: `.gitignore` only if `.artifacts` is not already ignored.

- [x] Write failing unit tests for command-mode parsing, immutable dry-run behavior, sanitized output, deterministic Storage keys, SHA-256 verification, backup-before-write enforcement, upload-before-cutover enforcement, and reference-count invariants.
- [x] Implement read-only `audit` and `backup` modes plus guarded `deploy --execute` and `verify` modes. Never print secrets, connection strings, or personal rows.
- [x] Store backups only under `.artifacts/exercises/remote-cutover/<timestamp>/`, including catalog rows, full bucket metadata/inventory, aggregate reference counts, file-level SHA-256 values, and a verified completion marker.
- [x] Upload reviewed assets to `exercise-media/catalog/v1/<slug>/poster.webp` and optional `motion-preview.webp`; verify remote object size and checksum metadata before the database cutover.
- [x] Call the transactional RPC only after backup and upload succeed, then assert exact equality for all persisted V1 fields, exactly 50 public V1 rows, zero other public rows, unchanged counts in `exercise_logs`, `workout_exercises`, and `trainer_template_exercises`, expected remap counts, and all expected public asset URLs resolve.

### Task 4: Local verification and independent review

**Files:**
- Review all files changed by Tasks 1-3.

- [x] Run focused new tests and catalog validators.
- [x] Run `pnpm check:supabase-migrations`, `pnpm type-check`, and `pnpm lint`.
- [x] Run non-browser Vitest and the browser fixture suite separately with bounded workers to avoid the known shared Vite resource contention.
- [x] Run `pnpm build`; distinguish a Google Fonts network `EACCES` from a code failure.
- [x] Have an independent subagent review destructive-operation safety, RPC privileges, catalog cardinality, asset paths, and no-history-loss invariants.

### Task 5: Apply the remote cutover safely

**Files:**
- Write ignored evidence only under `.artifacts/exercises/remote-cutover/`.

- [x] Recheck the target project reference without exposing credentials.
- [x] Run remote catalog audit and backup before any mutation.
- [x] Use only the active `infra` migration runner and the fixed Supabase CLI. Run migration list, `db push --dry-run`, then real `db push`; never run remote reset or replay the historical migration tree.
- [x] Upload and verify assets, execute the RPC cutover, and run the complete remote verification.
- [x] Retain the backup and report counts of inserted, updated, hidden, and physically deleted legacy catalog rows.

### Task 6: Integrate the verified branch into local `main`

**Files:**
- Merge only the intended feature commits; preserve unrelated `.artifacts/` work.

- [ ] Confirm feature and main worktrees are clean except known ignored/untracked artifacts.
- [ ] Commit the scoped implementation on `codex/exercise-visual-pilot`.
- [ ] Fast-forward local `main` to the verified branch and rerun the focused migration/catalog gate from `D:\work\project`.
- [ ] Do not push or claim an application deployment unless separately authorized; the remote catalog assets live in Supabase Storage and do not depend on a Vercel deployment.
