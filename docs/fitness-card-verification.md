# Fitness Card — local implementation and verification

Implemented on `codex/fitness-card`, based on `codex/android-offline` at `d5b3211`. The original five tabs remain; Progreso and the personal account menu link to `/fitness-card`.

## Delivered behavior

The card has three visual treatments, avatar/name/existing @username, an optional artistic name, lifetime best recorded sets, an 84-day map counting unique sessions per muscle, and up to three deliberately selected photos. Mi tarjeta, Colección and Accesos keep the hub compact; Marcas, Mapa and Fotos organize the opened card. The existing profile username editor is available independently of Community.

Sharing by @ grants directed access; requests require owner approval. Accept, reject, cancel, leave and revoke act on exact relationship IDs. Private photos are re-encoded to WebP without source metadata, capped at 2 MiB, downloaded with account authorization and displayed through temporary blob URLs. Received cards are never written into SQLite or account backups. Realtime own-row revision signals invalidate displayed data; a five-second refresh and a fifteen-second authority lease recover missed events. Offline, hidden-document and account-change paths clear received content.

Only explicit card creation opts into minimal evidence publication. Confirmed workout saves, local changes, focus, reconnect and day rollover trigger checks. Property order cannot trigger repeated publication. Local/canonical exercise records merge atomically so weight and reps never come from different source sets. Android checks the remote backup revision and retains local edits/deletions while incorporating canonical additions and unchanged-field corrections. A different backup revision requires normal account synchronization before publishing. Fitness Card does not automatically send a complete backup.

Editor style changes use the revision captured when editing begins. A background refresh cannot silently authorize overwriting a newer style. Confirmed photo changes rebase that revision only when the original style remains unchanged. Timed-out preflight requests cannot dispatch later; an already dispatched mutation retains its account write lock until its underlying operation settles.

## Verification on 2026-09-12

| Check | Result |
|---|---|
| Existing Android suite plus new projection adapter | 318 tests / 39 files passed |
| Fitness projection, remote reconciliation, validation, request expiry, leases, publication, events and affected session/profile contracts | 69 tests / 9 files passed |
| Account menu and route coverage | 54 tests / 2 files passed |
| Mobile and web TypeScript checks | Passed |
| ESLint on changed feature/integration sources | Passed |
| Disposable PostgreSQL 17 | All consent, RLS, image-slot, validation and actual concurrent CAS/photo/revoke contracts passed |
| Compiled mobile browser: owner at 320/390/1440px and English offline | All four scenarios passed; no runtime errors or unexpected HTTP requests |
| Existing original-app browser journey | Passed, including onboarding, exact five tabs, workout/RPE/reload completion, progress, measurements, settings, backup and offline trainer boundaries |
| Final mobile production build | Passed using the existing Android public connection settings; fixture host/token absent from final assets |

The Fitness Card browser suite uses an explicit fake backend and seeded test accounts. It tests actual UI interactions and image processing, including keyboard Select, long-name wrapping, three uploads plus replacement/deletion, busy-dialog Escape, concurrent remote-style edits, sharing, approval, revocation, viewer updates, offline clearing and absence of received identity in persisted SQLite. SQL tests separately exercise real PostgreSQL policies and concurrency. Neither proves a live Supabase HTTP/Realtime deployment.

Screenshots and the browser report are local ignored artifacts under `.artifacts/fitness-card/`. Reproduce that suite with `VITE_SUPABASE_URL=https://fitness-fixture.supabase.co` and `VITE_SUPABASE_ANON_KEY=fakepublictesttoken` when building the test bundle, then `MOBILE_PREVIEW_URL=http://127.0.0.1:4193 node mobile/tests/fitness-card-regression.mjs`. Restore the actual public Android settings for any distributable build.

## Activation and remaining external verification

The new canonical migration is `infra/supabase/migrations/20260912040000_fitness_card.sql`. It has not been applied remotely in this task. Apply it through the repository's canonical migration workflow after checking the remote migration ledger and any predecessor migrations, then verify two real authenticated accounts with actual Storage HTTP and Realtime delivery. No remote deployment, push, new APK, physical-device run or real-account end-to-end claim is included in this local delivery.

For older web-readable Android snapshots without `mobile_web_base`, a snapshot-only session cannot be proven to have originated from a subsequently deleted canonical row. Such rows remain eligible as mobile evidence; current snapshots with the baseline exclude known canonical deletions. Stored card projections represent the owner's recorded data, not external fitness certification.
