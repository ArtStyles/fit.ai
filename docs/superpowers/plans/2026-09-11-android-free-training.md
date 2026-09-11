# Android Free Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track each task below and keep all changes in this worktree.

**Goal:** Record a completed personal workout without a plan, optionally capture exercise evidence, and surface it accurately in existing progress and companion flows.

**Architecture:** New mobile-only route and atomic local action backed by existing account state and private backup. Reuse strict session snapshots and existing evidence readers; add Android-only entry points and partial-evidence labels.

**Tech Stack:** React 19, TypeScript, Vite, existing SQLite store, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-android-free-training-design.md`

## Global Constraints

- Base `codex/android-offline` at `826315b`; branch `codex/android-free-training`.
- Preserve five original tabs, existing plans and account boundaries; no remote writes/deployment in this implementation.
- No fabricated workload, no automatic series confirmation, stable session identity on edits/retries, ES/EN, offline persistence.

## Task 1: Atomic data contract

Files: `mobile/src/original/free-training/{types,data,data.test}.ts`.
Consumes AppState/AppStore and existing catalog/snapshot/performance helpers. Produces `loadFreeTrainingModel(logId?)`, `saveFreeTraining(input)`, pure `saveFreeTrainingInState(state,input,now?)`, and draft load/save/clear helpers.

- [x] Write behavioral tests: attendance creates one null-workout owned log/no exercise rows; valid details create traceable snapshot and arrays; replay operation retains one log; editing replaces children and increments version; wrong account, stale version, guided log, invalid/future date, negative/nonfinite values fail atomically; historical missing catalog entry remains editable; no active plan weekly goal stamps profile updated_at.
- [x] Run `pnpm exec vitest run --config mobile/vitest.config.ts mobile/src/original/free-training/data.test.ts` and observe missing implementation failure.
- [x] Implement exact interfaces in types.ts. Validate all fields before mutating rows. Preserve completed_at on same-date edits. Bind wrappers and draft cache to captured account/session version.
- [x] Run focused tests and `pnpm mobile:type-check`; review diff for inferred data or account leakage.

## Task 2: Mobile registration and result

Files: `mobile/src/original/free-training/{page,FreeTrainingScreen,FreeTrainingFields}.tsx` and focused view-model tests as needed.
Consumes the shared data contract, mobile router, existing UI/i18n context. Produces default route page and accessible form/result flow.

- [x] Cover form numeric parsing, explicit previous-record reuse and draft restoration before implementation.
- [x] Build one-column attendance form with progressive optional exercise selection/search, confirmed editable sets, partial/complete choice, optional goal for no-plan accounts.
- [x] Recover account-scoped draft; disable duplicate submission; keep stable operation on retry and retain form on failure. Editing an existing log starts with its details; success clears matching draft and shows truthful result/navigation.
- [x] Run focused tests; root will perform rendered browser checks after integration.

## Task 3: Existing journey and sync integration

Files: mobile route registry, dashboard/Entrenar Android entry, history and progress evidence labels, companion backup coordinator/tests.

- [x] Add route/entry behavior checks and failing test for backing up edited same-ID session.
- [x] Integrate mobile route and Android-only access; add edit link and missing/partial-evidence copy to history; add progress caveat when selected range includes attendance/partial rows.
- [x] Include updated_at/edit revision in companion fingerprint. Confirm backup round-trip and personal weekly goal compatibility with existing SQL contract.
- [x] Run focused contract tests and existing mobile suite. Ensure no unsupported columns are requested by web queries.

## Task 4: End-to-end verification and review

Files: `mobile/tests/free-training-regression.mjs`, evidence under ignored `.artifacts/free-training`, validation report in docs.

- [x] Build mobile bundle and run isolated preview on free port 4192.
- [x] Browser scenarios: no-plan dashboard entry, attendance offline and reload, edit with partial exercise data, map/history link, prior performance reuse, validation feedback, full session, ES/EN, mobile/desktop containment and keyboard operation.
- [x] Run mobile suite, mobile type-check, targeted lint, `git diff --check`, and original journey on same isolated preview.
- [x] Read changed files with independent reviewer, resolve findings, rerun relevant checks and document actual verification limits. Stale-version and wrong-account boundaries are covered by focused data tests.
