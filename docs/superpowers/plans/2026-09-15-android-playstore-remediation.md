# Android Play Store audit remediation

Approved direction: the 2026-09-15 audit and user instruction `comienza`.
Baseline: codex/android-offline at 51888d28d59ad6724ba3a3a8f9fab4152307a06d.
Audit: .artifacts/playstore-audit-2026-09-15/INFORME.md.

## Global constraints

- Work in the existing Android worktree; preserve the original screens and five tabs.
- Preserve user data, account isolation, authorization, session idempotency and trainer prescriptions.
- Never put server credentials in the mobile bundle. Remote account operations must verify identity on the server.
- Changes are local implementation and tests. Publication and real-user destructive tests are outside this execution.
- Meaningful regression tests must demonstrate the failure before the fix. Browser fixtures intercept external requests.
- Treat unit, compiled browser, native JVM, physical device and remote deployment evidence separately.
- Keep independent edits scoped; no automatic commits, migration pushes, package publishing or replacement signing keys.

## Task 1: Training and measurement integrity

Fix A03/A04. Free attendance/training does not consume the guided daily quota; preserve one guided session per day and per occurrence, leases, idempotency and snapshots. Apply that policy consistently to authorization, save and UI availability. Derive profile weight from the latest owned valid measurement on create/update/delete using the existing web policy. Cover both orders, retries, account boundaries and unchanged prescriptions. Re-run compiled reproduction expecting successful save and matching weight.

## Task 2: Safe backup restore

Fix A02. Keep default conflict rejection; add a preview/explicit restore workflow for the same authenticated account only. Preserve the pre-restore state durably, reject stale preview/session/account changes, apply changes transactionally and preserve monotonic revision/cloud conflict safety. Display counts, scope and readable Spanish/English outcomes. Offer recovery of the preserved state. Cover reinstall/login, divergent account data, cancel, malformed backup, wrong owner, persistence failure and concurrent edit. Storage/types owner also provides a guarded account-removal primitive for Task 3.

## Task 3: Account lifecycle

Fix A01/A08. Add an authenticated server boundary for deletion using the established server operation, validation/protected-owner policy and cleanup; mobile calls it with a verified account token and removes only that account locally after confirmed success. Failed/ambiguous remote outcome must preserve local data. Provide an accessible web deletion entry and password recovery request/OTP/update flow appropriate to the existing Supabase auth model. Test unauthenticated/wrong-owner/confirmation/failure/success, reload and account switching. Explicitly report which remote deployment/configuration is still needed.

## Task 4: Native and UI quality

Fix A09/A10/A11/A12. Version-specific native resources, contrast, catalog nested controls, ARIA/list semantics, legal document locale and Android admin destination. Retain existing geometry/navigation, keyboard/focus behavior. Localize touched mobile storage/account errors. Verify axe states, rendered mobile/desktop and Android lint.

## Task 5: Connected-feature honesty and notification lifecycle

Address A05/A06/A07/A13 without exposing server keys or promising unavailable services. Route privileged professional actions through an authenticated backend or an explicit functioning web handoff; integrate available product push initialization with build/config capability; scope reminders to account and reconcile changes/logout; remove undisclosed AI mock behavior from the mobile user flow. Test each boundary and document externally unavailable credentials/configuration.

## Task 6: Repeatable release verification

Incorporate the audited E2E selector/fixture corrections into maintained tests; promote new regressions; provide one repeatable mobile E2E command with controlled backend traffic. Add AAB build support and explicit backup rules where necessary. Run full mobile/shared unit/types, targeted lint, compiled E2E, axe, native JVM/lint, release packaging and asset verification as applicable. Preserve the existing signing identity. Conduct an independent review of the final scoped diff and fix important findings. Update the audit status with actual evidence and remaining physical/remote/Play Console gates.

## Progress

- Baseline confirmed clean on the approved Android worktree.
- Tasks 1-6: implementation and local verification completed on 2026-09-16. Independent review findings corrected; professional account deletion additionally verified with the full local PostgreSQL schema.
- Final evidence and package hashes: `docs/android-playstore-remediation.md`; account backend release procedure: `docs/android-account-deletion-release.md`.
- APK/AAB 1.1.26-offline (28) generated with the original signing identity. No commits, push, deployment, remote migration or real-user deletion performed.
- Production remains gated on coordinated backend/migration deployment, recovery email configuration, physical Android tests and Play Console verification. Native push is explicitly unavailable until Firebase is configured and tested.
