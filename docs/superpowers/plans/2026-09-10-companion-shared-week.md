# Companion shared week implementation plan

**Goal:** Apply the approved received-greeting and shared-week celebration improvements to the existing Android companion experience.

**Approved scope:** This conversation approves the proposed first delivery: received greetings and celebration when both people meet their own weekly goal. Four-week history and multiple companions remain later proposals.

**Architecture:** Extend the existing private state projection through a forward migration. Share the additive public contract between web and Android, and derive the celebration from the existing synchronized weekly summaries. Preserve the current one-to-one consent, daily greeting quota, account cache, five tabs and training data.

## Decisions

- Existing migration `20260912010000` was already deployed according to the project release notes; add a new migration rather than rewriting its history.
- `receivedGreeting` is optional in the TypeScript wire contract for existing servers/caches. When supplied, validate it and expose only `sentAt` and `message`.
- Return the current partner's latest retained greeting for this exact active relationship, including its date; do not add chat history or send notifications on reads.
- The shared achievement uses each current goal, without changing plans or creating a new agreed training target. Both positive goals must be reached and both summaries must refer to the same current calendar week in their respective time zones.
- Cached current-week achievements may be displayed under the existing offline notice. Recheck the date while the view is mounted so last week's achievement is not presented as this week's.
- Preserve prior uncommitted work. No Git publishing or remote deployment is included in this implementation turn.

## Task 1: Received greeting projection

- [x] Add real SQL regressions for bidirectional messages, current relationship membership, past-day receipts, unchanged quota, and inactive/unlinked/re-paired users.
- [x] Observe them fail without the new migration.
- [x] Create `20260912020000_companion_received_greeting.sql` and pass the disposable PostgreSQL runner.

## Task 2: Shared contract and achievement

- [x] Add parser tests: preserve validated received text/date; omit absent legacy field; reject invalid and unauthorized states; remove extra private fields.
- [x] Add independent achievement cases for unequal goals, overachievement, missing/zero goals, one unfinished person, mismatched weeks, timezone rollover and stale cache.
- [x] Observe failures, implement minimal shared contract/helper, pass unit tests.
- [x] Verify received greetings survive the Android account cache and never cross account or relationship changes.

## Task 3: Existing screens

- [x] Add browser regressions and observe missing received message / celebration.
- [x] Render received text/date separately from sent greeting and quota, add compact achievement in overview/dashboard and ES/EN copy.
- [x] Keep counts and greeting action visible; verify keyboard behavior, plain text and widths 320/390/1440.

## Task 4: Integration and review

- [x] Run scoped web unit tests, Android tests, companion browser fixtures, real PostgreSQL contracts and migration validator.
- [x] Run TypeScript web/mobile and scoped ESLint, build Android web bundle.
- [x] Extend/run the compiled Android companion journey with received greetings, achievement and offline cache evidence; inspect rendered screenshots.
- [x] Obtain independent review, resolve actionable findings, document current verification and pending deployment boundary.

Commands: `pnpm exec vitest run --project unit src/lib/companions src/app/actions/__tests__/companions.test.ts`; `pnpm mobile:test`; `pnpm exec vitest run --project browser-fixtures src/components/companions/__tests__/companionInteraction.test.tsx`; `node mobile/src/original/run-companion-postgres.mjs`; `pnpm run check:supabase-migrations`; `pnpm mobile:type-check`; `pnpm run type-check`; `pnpm mobile:build`; `node mobile/tests/companion-regression.mjs` against a task-owned preview.

## Publication addendum — 2026-09-10

The user subsequently authorized migration deployment and APK packaging. Migration `20260912020000` is deployed to Supabase project `duqayqktljywufgxobbl`: ledger 11, `trainer_security_preflight` 61, exact normalized helper-body MD5 `f73a851669e8c11898af652881fe347f`, ACL and `READ ONLY` SQL projection/identity checks using two existing active subjects passed. The final dry-run reports no pending changes. The HTTP REST check through PowerShell HTTPS with normal TLS validation confirmed anonymous access is blocked as designed: HTTP 401, code `42501`. Node's earlier `EACCES` was local; the consolidated remote report is `.artifacts/companion-shared-week/supabase-release-verification.json`.

Delivered `.artifacts/Vekira-1.1.11-offline.apk`, version code 13, 17,967,805 bytes, SHA-256 `7e67bef3798d744c8cc66c83475dede26cf6f7f2b179cf22cc6078e5ab26d4bc`. Its v2 signature matches the previous certificate; package and WebView origin remain unchanged. All 249 rebuilt assets match the build that passed 11 compiled journeys; the APK also contains two verified empty Capacitor Cordova placeholders. Release evidence is in `.artifacts/companion-shared-week/release-1.1.11/`, with deployment logs alongside it. No physical-device test, Git push or web deployment was performed. See `docs/companion-shared-week.md` for the full publication record and installation guidance.
