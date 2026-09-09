# Android offline implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The design was approved in the conversation; execute continuously on the separate branch.

**Goal:** Ship an Android APK with durable offline personal training and optional direct Supabase connectivity.

**Architecture:** Independent Vite mobile entry shares the tested training engine and bundled exercise assets with Next.js. SQLite owns local state; a durable account-scoped outbox synchronizes through authenticated Supabase APIs.

**Tech Stack:** React 19, TypeScript, Vite, Capacitor 8, SQLite, Supabase, Vitest, Playwright, Android Gradle/JDK 21.

**Spec:** `docs/superpowers/specs/2026-09-08-android-offline-design.md`.

## Global constraints

- Work only at `D:/work/project/.worktrees/android-offline` on `codex/android-offline`.
- No main merge/push or production deployment. Keep Next web usable.
- Preserve `com.fitai.app` and release signing identity; package local assets.
- Spanish Vekira UI; durable writes, isolated accounts and no embedded secrets.
- Shared interfaces are the exact types and method signatures in the spec.

## Task 1: SQLite repository, backups and outbox

**Own:** `mobile/src/domain/types.ts`, `mobile/src/data/**`, `mobile/src/data/__tests__/**`.
**Consumes:** Spec model. **Produces:** `MobileRepository`, `openMobileRepository` and injected SQLite factory.

- [ ] Write real SQLite tests for reopening an active workout, completed-session/outbox atomicity and tenant isolation. A failed commit must leave both prior session and outbox unchanged.
- [ ] Run the new tests and observe the missing implementation fail.
- [ ] Implement schema versioning, serialized transactions, immutable per-operation payloads and account-scoped queries. Native driver uses Capacitor SQLite; browser SQLite persists binary data in IndexedDB. Propagate storage errors.
- [ ] Implement complete backup validation and transactional merge; test corruption, cross-account collision, preservation of local pending data and failed import rollback.
- [ ] Run `pnpm exec vitest run --config mobile/vitest.config.ts mobile/src/data --maxWorkers=2`, record result and self-review.

## Task 2: Mobile application UI

**Own:** `mobile/src/ui/**`, `mobile/src/App.tsx`, `mobile/src/main.tsx`, `mobile/src/mobile.css`, UI browser tests.
**Consumes:** Repository, domain and cloud interfaces in spec. **Produces:** Full offline personal journey and online connection/trainer surfaces.

- [ ] Write Playwright acceptance for fresh offline profile, plan, complete workout, reload and history; use the actual built app and storage.
- [ ] Create the responsive dark/violet app shell with labelled bottom navigation, safe areas and Android Back handling.
- [ ] Implement profile/readiness form, plan generation/selection, catalogue/details, workout recording/rest timer, durable completion and historical metrics/measurements. Prevent starting another session over an unfinished one.
- [ ] Add optional login/logout, explicit account switch, sync/error state and trainers/request/assignment views using `MobileCloud`; add native/web backup controls.
- [ ] Run acceptance at 360/390/768 widths; inspect screenshots and fix overflow/focus/keyboard issues. Record exact evidence.

## Task 3: Direct Supabase cloud adapter

**Own:** `mobile/src/cloud/**`, additive mobile SQL migrations if required, cloud tests and `docs/android-offline-cloud.md`.
**Consumes:** Repository interfaces and existing cloud schema/RPCs. **Produces:** `createMobileCloud`, `MobileCloud`, `TrainerCard`, `CoachingOverview` as specified.

- [ ] Write contract tests for owner mismatch, missing credentials/capability, retries after lost responses and stale pulls.
- [ ] Implement sign-in and account restoration/import without replacing local profiles or pending changes. Use only public URL/anon key; online requests validate session identity each run.
- [ ] Adapt existing authenticated APIs/RPCs for trainers, requests and assignment download. Preserve immutable trainer prescription snapshots.
- [ ] Implement serialized outbox drain and cloud import with stable IDs, scope checks and stale-pull protection. Add secure additive offline ingestion RPC only if existing RPC semantics require it; keep web contracts unchanged.
- [ ] Test failure paths and document which remote capabilities are already usable and which need explicit deployment; never claim pending data is synced.

## Task 4: Build, bundled domain and native integration

**Own:** `mobile/index.html`, `mobile/vite.config.ts`, `mobile/vitest.config.ts`, `mobile/tsconfig.json`, `mobile/src/domain/catalog.ts`, `mobile/src/domain/training.ts`, their tests, build scripts/package files, Capacitor config and Android integration.

- [ ] Run shared engine/session baseline before implementation.
- [ ] Write tests for engine input mapping/readiness and for bundled-output URLs; implement catalogue mapping and plan/session constructors through existing engine.
- [ ] Add isolated `mobile:dev`, `mobile:build`, `mobile:test`, `mobile:type-check`, `android:offline:debug` and `android:offline:release` commands. Package only reviewed catalogue/media/local fonts and actual app assets, excluding web service workers and remote loaders.
- [ ] Add native backup export/import support and a validated legacy pending-session recovery bridge without deleting old WebView origin data.
- [ ] Build and inspect APK; verify release signing identity and bundled index, run Android unit tests. Preserve original checkout.

## Task 5: Independent review and end-to-end verification

- [ ] Independently review each task and fix material findings in its owning agent.
- [ ] Run mobile tests/type/build, complete airplane-mode workflow, inspect screenshots and APK.
- [ ] Run existing unit suite plus web type/build checks and report any environment-only boundaries separately.
- [ ] Record changes, evidence, APK path, backend deployment status and device status. Commit the scoped branch; leave it separate from main and retain worktree.
