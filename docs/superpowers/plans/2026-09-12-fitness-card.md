# Fitness Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver beautiful, private Fitness Cards with truthful training evidence, selected photos, @ sharing, consent and revocation.

**Architecture:** Shared typed projection, UI and connected client; Android supplies account-bound transport and local evidence through an alias. Supabase stores only opted-in card preferences/projection, private image slots and directed access. An own-row revision signal invalidates viewer content without exposing private payloads through realtime.

**Tech Stack:** Existing Next/React, TypeScript, Radix, Tailwind, Supabase/PostgreSQL, Capacitor/Vite; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-fitness-card.md`

## Global Constraints

- Preserve the five global navigation tabs.
- Up to three selected photos.
- Reuse profiles.username and immutable user IDs.
- Never persist received card content.
- Remote migration/deployment and real-account/device verification must be reported separately from local tests.
- Work only in `codex/fitness-card`, based on `codex/android-offline` at d5b3211.

## Interfaces and ownership

Root owns `src/lib/fitness-card/types.ts`, transport/controller, platform adapters, route, navigation integration and browser regression. Backend worker owns migration and disposable PostgreSQL contract. Evidence worker owns pure projection, its tests and Android projection adapter. UI worker owns only `src/components/fitness-card/` presentational views and styles. Types are the binding interface; coordinate additions before changing them.

### Task 1: Consent and storage

Files: `infra/supabase/migrations/20260912040000_fitness_card.sql`; `mobile/src/original/run-fitness-card-postgres.mjs`; `mobile/src/original/fitness-card-postgres-contract.sql`.

RPCs: `get_fitness_card_state()`, `get_fitness_card(p_owner_id uuid)`, `save_fitness_card(p_artistic_name text,p_theme text,p_expected_revision bigint)`, `publish_fitness_card_evidence(p_evidence jsonb,p_expected_revision bigint)`, `fitness_card_access(p_action text,p_handle text,p_request_id uuid)`. Mutations derive actor from auth.uid(). Save returns card; publish returns card; access returns hub.

- [x] Write SQL contracts that authenticate A/B/C, create A's card, deny B's read, request as B, deny C's acceptance, accept as A, read as B, revoke as A and deny B immediately. Assert old IDs, inactive actors and fourth photo cannot bypass checks.
- [x] Run the disposable runner with `--red --native`; prove missing RPC/authorization contract fails.
- [x] Implement locked directed access, strict projection validation, CAS editing, exact three private image slots, owner/viewer signals and storage policies.
- [x] Run green SQL contracts including actual concurrent sessions; review function grants and authorization at image reads.

### Task 2: True evidence

Files: `src/lib/fitness-card/projection.ts`, `src/lib/fitness-card/projection.test.ts`, `mobile/src/original/fitness-card/projection.ts`, focused tests.

Produces `projectFitnessCard({ownerId,logs,exerciseLogs,exercises,timeZone,language,now}): FitnessEvidence` and `projectLocalFitnessCard(state,now?): FitnessEvidence` using shared types. Best records are lifetime through today, maximum twelve exercises; muscle counts are fixed 84 civil days inclusive.

- [x] Test one session with several chest exercises counts chest once; two sessions count twice; foreign/skipped/future/attendance rows never create marks. Assert malformed/missing values do not become zero-weight PRs, and one real set supplies both weight and reps.
- [x] Run focused Vitest and observe failure before implementation.
- [x] Implement shared deterministic normalization/projection, historical names/muscles, valid timed-set evidence and thin local adapter.
- [x] Run tests with empty, partial, all-history, timezone and duplicate data cases.

### Task 3: Card UI

Files: `src/components/fitness-card/FitnessCardCover.tsx`, `FitnessCardDetail.tsx`, `FitnessCardEditor.tsx`, `FitnessCardCollection.tsx`, `FitnessCardAccess.tsx`, `FitnessCardMuscles.tsx` and shared presentational styles.

Consumes shared card/access/evidence types. Parent controller supplies callbacks and busy/error state. Photo URLs are temporary and supplied by controller; UI must not create signed/public URLs. Editor accepts `(artisticName,theme,expectedRevision)` and per-slot upload/remove callbacks returning the confirmed card. Access callbacks accept action/handle/requestId.

- [x] Create actual presentation with cover, internal tabs, period/date/units, map geometry, empty photo slots and compact access lists.
- [x] Keep controls semantic and bounded; no hover-only mobile actions, no native select, no enormous nested vertical dashboard.
- [x] Render via integrated browser journey at 320/390/1440px and verify tabs, editor focus/escape, max-three slots, empty state and long names. Root runs full browser checks after integration.

### Task 4: Platform and live behavior

Files: shared `src/lib/fitness-card/client.ts`, `platform.ts`, `src/components/fitness-card/FitnessCardHub.tsx`; Android `mobile/src/original/fitness-card/platform.ts`, publication hook; new page `src/app/(app)/fitness-card/page.tsx`; routes/aliases and account/progress entry.

- [x] Test stale read after account switch is ignored; rejected authority clears received content; a revision invalidates photos and content; old edit revision fails instead of overwriting; background refresh does not overwrite editor input.
- [x] Build generic transport with identity validation, serialized mutations, timeout and read epoch. Use separate platform factory for browser and account-bound Android client.
- [x] Connect explicit creation, profile @ setup link, share/request/accept/reject/revoke/cancel/leave, authenticated photos and realtime signals. Refresh fallback and content lease close disconnected cases.
- [x] Publish opted-in projection on relevant local state/focus/online changes and web card open; only minimal validated data leaves device.
- [x] Integrate routes and compact entry; run mobile and web type checks, focused lint, SQL and unit suites, build and browser regressions.

### Task 5: Review and delivery

- [x] Review security and behavior independently, fix material findings, rerun impacted checks.
- [x] Record local evidence, current migration status and device verification limits in `docs/fitness-card-verification.md`.
- [x] Show rendered artifact and report branch, implemented behavior and remaining external activation steps accurately.

## Preflight rulings

User already approved the design and implementation. Continue without another design approval. Photo editing is connected-only; own training preview remains useful offline. Projection persistence is necessary to share a minimal local-first snapshot without exposing full private Android backups. Do not label it server-verified. No new package is required.
