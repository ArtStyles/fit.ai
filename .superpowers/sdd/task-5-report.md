# Phase 2 Task 5 Report: Privacy-safe first-party funnel events

## Status

Implemented the complete first-party analytics contract on `codex/ui-seo` from base `6d44c55`, including the exact 12-name event union, browser transport, sanitizer, server route, storage migration, and required landing/registration/onboarding instrumentation.

## TDD evidence

### Sanitizer RED → GREEN

- RED: `pnpm test -- src/lib/analytics/__tests__/events.test.ts`
  - Expected missing-module failure: `Cannot find module '../events'`.
  - The command's project configuration also ran the existing suite: 62 existing files / 386 existing tests passed while the new suite failed to import.
- Initial GREEN: `pnpm exec vitest run src/lib/analytics/__tests__/events.test.ts`
  - 1 file, 71 tests passed.
- The brief's initial sample used `section`, which conflicts with the binding seven-key allowlist. The sample was used to capture the required initial RED, then the final test uses allowed `stage` and explicitly verifies that `section` is rejected.
- Browser fallback RED: a new test proved that a throwing `navigator.sendBeacon` escaped the analytics boundary (1 of 72 failed). GREEN after catching the exception and falling back to keepalive fetch.
- Localized sensitive-path RED: `/es/u/private_username`, `/en/search/private-term`, and `/es/reset/token-value` were initially accepted (3 failures). GREEN after making sensitive route-segment checks locale-independent: 75/75 passed.

### Route RED → GREEN

- RED: `pnpm exec vitest run src/app/api/analytics/__tests__/route.test.ts`
  - Expected missing-module failure: `Cannot find module '../route'`.
- GREEN: same command after implementation.
  - 1 file, 9 tests passed.
- Coverage includes missing/cross-origin Origin, JSON content type, malformed JSON, streamed 2 KB body enforcement, sanitizer rejection, server-derived auth identity, authenticated and anonymous inserts, valid/invalid anonymous cookies, cookie attributes, and storage failure.

### Instrumentation RED → GREEN

- RED: `pnpm exec vitest run src/components/analytics/__tests__/instrumentation.test.ts`
  - 5 of 5 tests failed against missing landing, registration, and onboarding instrumentation.
- GREEN combined analytics run:
  - `pnpm exec vitest run src/lib/analytics/__tests__/events.test.ts src/app/api/analytics/__tests__/route.test.ts src/components/analytics/__tests__/instrumentation.test.ts`
  - 3 files, 86 tests passed at that checkpoint.
- Executable source-contract tests verify server rendering is preserved, signup timing, all five onboarding stages, hidden-only abandonment guards, success-only plan generation, and absence of sensitive payload references.

### Migration sanity

- `pnpm exec vitest run src/lib/analytics/__tests__/migration.test.ts`
  - 1 file, 3 tests passed.
- Tests verify the exact event union, identity columns, FK behavior, RLS, absence of client policies/grants, path/locale constraints, and both indexes.
- Neither Supabase CLI nor `psql` is installed in this workspace, so a live database apply was not available. SQL was reviewed statically and by executable migration contract tests.

## Verification commands and results

- Relevant contracts:
  - `pnpm exec vitest run 'src/app/(auth)/register/__tests__' 'src/components/onboarding/__tests__' src/lib/analytics/__tests__/events.test.ts src/app/api/analytics/__tests__/route.test.ts src/components/analytics/__tests__/instrumentation.test.ts`
  - 14 files, 208 tests passed.
- Full suite checkpoint: `pnpm test`
  - 65 files, 472 tests passed before the final migration and localized-path edge tests were added.
- Type check: `pnpm type-check`
  - Passed after correcting test-only ES5 target and mock tuple typing issues.
- Lint: `pnpm lint`
  - Passed after replacing a control-character regex and constant-condition stream loop.
- Whitespace: `git diff --check`
  - Passed.
- Privacy scan:
  - Enumerated every production `trackEvent(...)` call and payload.
  - Confirmed analytics service-client import exists only in `src/app/api/analytics/route.ts` (tests mock that boundary).
  - Confirmed migration contains no `CREATE POLICY`, `ALTER POLICY`, or client grant.

Fresh final suite/type-check/lint results are recorded below.

## Files changed

- `supabase/migrations/034_product_events.sql` — append-only event storage, constraints, RLS with no client policy, and query indexes.
- `src/types/database.ts` — typed `product_events` table contract.
- `src/lib/analytics/events.ts` — exact event union, sanitizer, safe pathname rules, beacon/fetch transport.
- `src/lib/analytics/__tests__/events.test.ts` — event/key/value/path/UTF-8 size and transport edge coverage.
- `src/lib/analytics/__tests__/migration.test.ts` — executable migration contract review.
- `src/app/api/analytics/route.ts` — same-origin limited-body endpoint, server identity, anonymous UUID, service insert.
- `src/app/api/analytics/__tests__/route.test.ts` — Origin/body/cookie/auth/insert/error coverage.
- `src/components/analytics/TrackPageView.tsx` — focused client island for page view and delegated approved CTA clicks.
- `src/components/analytics/__tests__/instrumentation.test.ts` — timing, payload, guard, and server-rendering contracts.
- `src/app/[locale]/page.tsx` — mounts the small tracker without clientizing marketing sections.
- `src/app/(auth)/register/RegisterForm.tsx` — validated signup start and successful signup completion events.
- `src/app/onboarding/OnboardingWizard.tsx` — five-stage completion, hidden-only abandonment, and success-only plan generation events.

## Event-to-surface matrix

| Event | Surface/timing | Properties (plus automatic pathname) |
| --- | --- | --- |
| `landing_view` | Localized landing tracker mounts | `locale`, `screen: landing` |
| `primary_cta_clicked` | Delegated click on landing links whose href begins `/register` | `locale`, `source: landing`, `screen: landing` |
| `signup_started` | Registration passes local validation, immediately before Supabase signup | `locale`, `screen: register` |
| `signup_completed` | Authenticated signup callback, or successful verification-required signup response | `locale`, `screen: register`, `authenticated` |
| `onboarding_step_completed` | Successful forward completion of profile, availability, equipment, safety; guarded automatic confirmation; or successfully saved manual confirmation | `stage`, `screen: onboarding`, `authenticated: true` |
| `onboarding_abandoned` | `visibilitychange` to `hidden`, after hydration, once while not completed | `stage`, `screen: onboarding`, `authenticated: true` |
| `plan_generated` | Only inside `outcome.phase === 'success'` | `stage: generating`, `screen: onboarding`, `authenticated: true` |

The remaining union members (`language_changed`, `first_session_started`, `first_session_completed`, `plan_adjustment_used`, and `organic_page_cta_clicked`) are accepted by the shared contract but intentionally not emitted because those surfaces are outside Task 5's required instrumentation list.

## Privacy threat review

- **Sensitive form/profile data:** no event call receives `answers`, email, password, name, username, injuries/limitations, weight, height, age, copy, or a selected/generated plan. Payloads use fixed identifiers only.
- **Key injection:** the sanitizer accepts exactly `locale`, `path`, `stage`, `source`, `screen`, `authenticated`, and `duration_bucket`; augmented top-level envelopes and every other property key are rejected.
- **Nested/free-form structures:** only finite numbers, strings, and booleans pass. Nulls, arrays, objects, `undefined`, `NaN`, and infinities are rejected.
- **Oversized payloads:** properties are measured as UTF-8 and capped at 1,024 bytes. The route independently streams and caps the raw request body at 2,048 bytes.
- **URL leakage:** the client overwrites any caller-provided path with `window.location.pathname`. Sanitization requires `/`, max 200 characters, no query/hash/control characters, rejects decoded email markers, and rejects username/profile/search/token/reset/auth callback route segments even behind locale prefixes.
- **Cross-site submission:** Origin is mandatory and must exactly equal the request URL origin; content type must be JSON.
- **Identity spoofing:** the strict envelope rejects `user_id` and `anonymous_id`. Authenticated identity comes from server `getUser()` only.
- **Anonymous identity:** only canonical UUID cookies are accepted; missing/invalid values are replaced server-side and set `HttpOnly`, `SameSite=Lax`, `Path=/`, one-year max age, and `Secure` in production.
- **Service-role exposure:** only the route imports the server-only service client. Browser code posts to the fixed relative `/api/analytics` endpoint.
- **Product-flow resilience:** beacon is preferred; unavailable, declined, or throwing beacons fall back to same-origin keepalive fetch. Network errors are absorbed so analytics cannot block registration, onboarding, or navigation.
- **Abandonment accuracy:** no `beforeunload` or `pagehide` listener exists; only hidden visibility transitions while the completion ref is false emit abandonment.

## Migration review

- `product_events` has UUID PK/default, timestamp default, checked exact event names, required anonymous UUID, nullable auth FK with `ON DELETE SET NULL`, checked locale, constrained pathname, and JSONB properties.
- RLS is enabled.
- No anon/authenticated policy is created; insertion is through the route's service client only.
- Indexes cover descending occurrence queries and event-name funnel queries.
- Database TypeScript definitions were updated so service inserts remain type checked.
- No payment tables, events, code, or policies were added.

## Concerns

- Live migration application could not be run because Supabase CLI/`psql` is unavailable; executable SQL contract tests and static review are green.
- `signup_completed` treats a successful `verification-required` signup response as account creation completion; OTP verification remains a subsequent existing flow and was not modified because the brief scopes instrumentation changes to `RegisterForm.tsx`.

## Final fresh verification

- `pnpm test; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm type-check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; pnpm lint; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; git diff --check; exit $LASTEXITCODE`
- Exit code: 0.
- Full suite: 66 files, 478 tests passed.
- Type check: passed.
- Lint: passed with zero ESLint findings.
- Diff integrity: passed; Git printed only LF-to-CRLF convention notices for existing tracked files.
