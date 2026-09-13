# Fitness Card — local implementation and verification

Implemented on `codex/fitness-card`, based on `codex/android-offline` at `d5b3211`. The original five tabs remain; Progreso and the personal account menu link to `/fitness-card`.

## Delivered behavior

The card has three accent colors, avatar/name/existing @username, an optional artistic name, lifetime best recorded sets, an 84-day map counting unique sessions per muscle, and up to three deliberately selected photos. Mi tarjeta, Colección and Accesos keep the hub compact; Marcas, Mapa and Fotos organize the opened card. The existing profile username editor is available independently of Community.

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

## Reference-led cover refinement, 2026-09-12

The supplied black membership-card reference now guides the cover: charcoal material, restrained texture, diagonal accent, the existing Vekira mark, circular profile portrait and a horizontal identity row. The lower strip names the actual Records, Map and Photos sections. The reference's gym-entry QR and member number are not part of this product. Violet, Ember and Ice retain their persisted keys and now change the accent on the same black design. The Radix color selector includes swatches, readable names, keyboard navigation and a live preview.

The cover responds to its own container width, including collection tiles and the editor. Long names remain fully visible; narrow cards grow vertically when needed. Fresh mobile/web TypeScript and scoped ESLint checks passed. The compiled browser regression passed at 320/390/1440 px and in English offline, exercising all three colors by keyboard, normal and long names, three photos, concurrent edits and access revocation. Separate cover screenshots, including the no-avatar fallback, are under `.artifacts/fitness-card/`. These are seeded local previews. This refinement changes no backend schema or consent behavior.

## Android integration and package, 2026-09-12

The cover also has a restrained decorative edge pulse followed by a diagonal light reflection. The cycle repeats every 11 seconds after a 1.5-second opening delay and uses the selected card accent. Two noninteractive CSS pseudo-elements animate only opacity and transform; no JavaScript timer, new persisted setting or server change is involved. `prefers-reduced-motion: reduce` leaves both layers hidden and unanimated. The shared cover component applies the treatment to the owner's card, editor preview and collection cards.

This animation is included in `.artifacts/Vekira-1.1.21-offline.apk`, version code 23, 18,052,077 bytes, SHA-256 `ac307a6da4ab3e542301dd7cb5b58049898a61377c35b42350effd5cd082d938`. The browser suite passed at 320/390/1440 px and English offline. At 390 px it samples the actual CSS animations across 24 phases, confirms bounded opacity, moving reflection, nonblocking pointer behavior and no horizontal overflow, then verifies that reduced motion removes both effects. Visual captures confirm the text remains legible. The production Android build and APK checks passed, including original signer continuity, version, alignment, exact bundled assets/index and absence of fixture backend settings. No new backend migration is required.

Fitness Card and the reference-led cover were integrated into `codex/android-offline` by fast-forward through `3a65e6a`. The signed package is `.artifacts/Vekira-1.1.20-offline.apk`: application ID `com.fitai.app`, version code 22, 18,051,869 bytes, SHA-256 `87d75bae9768fba00d66ce97f35ae9e63aabd3f07bae47f03993b219e28297f9`.

Fresh checks in the Android worktree passed: 318 mobile tests, 69 Fitness Card/affected contracts, mobile TypeScript, the original five-tab browser journey and the native release build. APK verification matched every compiled asset and `index.html`, the SQLite runtime, 50 exercise posters, 16 original fonts and the muscle-map license. Android signature verification matched the previous 1.1.19 package's certificate; alignment and version metadata passed. Install over the existing signed app to retain its data. This is local build/browser evidence, not physical-device or real-account verification. No Git push was performed for this integration.

## Activation and remaining external verification

The canonical migration `infra/supabase/migrations/20260912040000_fitness_card.sql` was applied to the same Supabase project configured in the Android APK, `duqayqktljywufgxobbl`, at the user's explicit request on September 12 in Havana (verification completed `2026-09-13T00:47:10Z`). Source release commit: `2560b44`; SQL SHA-256: `fb4da958eb167e5ed9f064e77a55a58e440b7e510d8e9685b4578655a1ff9fcc`.

The canonical pinned CLI workflow verified all 12 predecessors and a dry run containing only this migration, applied it, then verified all 13 ledger versions and an empty subsequent dry run. The workstation's existing database credentials and documented transaction-pooler fallback were used without changing credentials or replaying the baseline. No seeds or role migrations were applied.

Live read-only checks passed for the private tables, six authenticated RPCs, private helper permissions, Storage RLS and all four photo policies, private WebP/2 MiB bucket, two triggers and Realtime publication registration. All 18 function bodies match the migration exactly; the existing trainer security preflight still returns 61. HTTP confirmed that PostgREST discovers the RPC and rejects anonymous execution (401/42501); the private bucket's public URL rejects access (400). Sanitized local logs are under `.artifacts/fitness-card-deployment/`.

Backend activation requires no new APK: 1.1.20 already contains the client code. Full authenticated interaction between two real accounts, actual photo upload/download and Realtime event delivery remain device/account verification; registration in the publication alone does not prove delivery. No real user profiles, cards or photos were created or changed for these checks. No Git push was performed.

For older web-readable Android snapshots without `mobile_web_base`, a snapshot-only session cannot be proven to have originated from a subsequently deleted canonical row. Such rows remain eligible as mobile evidence; current snapshots with the baseline exclude known canonical deletions. Stored card projections represent the owner's recorded data, not external fitness certification.

## Social profiles, flip and QR exchange — 2026-09-13 UTC

Implemented directly on `codex/android-offline`. The editor now accepts optional Instagram, X and Facebook handles/profile URLs in a collapsible section. Only configured profiles appear as touch-accessible external links; removing a field removes its icon. URLs are normalized and restricted to the selected provider. Social edits use the same opening revision as the style, and photo mutations cannot rebase over another device's social changes. The previous three-argument save RPC remains compatible and preserves social links.

Tapping a saved card flips it to a real black-and-white QR with four-module margins. Social links and the separate collection content action have independent click targets. Inactive faces are inert and hidden from assistive technology, focus moves to the return control, and reduced motion disables the flip transition and decorative lights. The QR carries only `vekira://fitness-card/<owner UUID>`; it contains no credential, photo address or training evidence. Android handles validated cold/warm links and the app also provides an explicit camera/image scanner. Invites survive sign-in with a bounded session-only queue, and routing defers during active training. An invite exposes minimal identity and access status, followed by an explicit pending request; approval and revocation remain with the owner.

Fresh verification passed: 322 Android tests / 40 files; 73 shared Fitness Card tests / 9 files; mobile and web TypeScript; scoped ESLint; the existing disposable PostgreSQL contracts plus new social/CAS/legacy-save/QR-consent cases. The compiled fixture browser passed at 320/390/1440 px and English offline with no runtime errors or unexpected HTTP traffic. It verifies hidden/configured/removed icons, canonical destinations through mocked external navigation, unsafe-link rejection, keyboard selectors, flip focus/inert faces, actual displayed QR decoding through the real scanner, explicit pending requests, live acceptance, camera stream release on close and after delayed permission, permission-denied image fallback, malformed QR rejection, and the previous photo/concurrency/private-access cases. The original five-tab app journey also passed after restoring production settings.

The new canonical migration `20260913010000_fitness_card_social_qr.sql` is active on the existing backend; exact 14-version ledger, no pending migrations, schema/function/ACL checks and trainer security preflight 61 passed. See [backend verification](fitness-card-backend-verification.md#social-links-and-qr-activation--2026-09-13-utc).

Signed update: `.artifacts/Vekira-1.1.22-offline.apk`, `com.fitai.app`, version code 24, 18,080,958 bytes, SHA-256 `047c5427d293e88b7a511accb0cc20f2f6a5e24948e92a248772df718fc4e220`. Release build, original signing certificate continuity, alignment, version, all compiled assets/index, SQLite, posters/fonts/license and absence of fixture settings passed. Install over the existing app to retain its data. Camera tests use real browser streams with controlled permissions; external Android camera handling, physical-device updates and communication between two real accounts remain unverified. No Git push was performed.
