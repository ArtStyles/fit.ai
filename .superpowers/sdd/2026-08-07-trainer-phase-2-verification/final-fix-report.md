# Final fix wave — trainer Phase 2 verification

## Status

PASS for every locally runnable regression and static check. The production build and the live Playwright flow remain environment-blocked, not reported as passing.

## Findings closed

1. Credential removal and submission now share the trainer lock discipline. Submission and approval revalidate a complete eligible credential set, including pending `user_removal` cleanup, while finalization locks and rechecks the application before deleting metadata.
2. `/coach/profile` loads the latest profile-update review, its public event timeline, and the applicant-safe interview projection. Profile-update notifications now route to `/coach/profile`; initial applications remain on `/coach/apply`.
3. Cyclic and multi-path trainer foreign keys use deferred checks so deleting an Auth user after approved profile updates removes applications and the trainer profile without orphans.
4. The verification E2E uses an unambiguous HTTPS textbox locator, reopens the `<details>` actions after every reload, waits on enabled controls, and deletes a partially created Auth admin if profile setup fails.
5. Changed professional photos must match this Supabase project's public `avatars/{auth.uid()}/avatar.webp` URL (optional numeric cache version) and an existing object. The server action and SQL RPC both enforce the boundary; unchanged legacy photos and `NULL` remain supported.

## TDD evidence

RED:

- Focused Vitest: 2 expected failures (external HTTPS photo accepted; closed profile-update history absent).
- Isolated pgTAP: 16 expected failures covering remove/submit exclusion, approval without credentials, external photo bypass, profile-update CTAs, and Auth-user deletion.

GREEN:

- `pnpm test:db:verification` — PASS, 206/206 pgTAP assertions.
- `pnpm test` — PASS, 141/141 files and 1219/1219 tests.
- `pnpm lint` — PASS.
- `pnpm type-check` — PASS.
- `pnpm exec playwright test tests/e2e/trainer-verification.spec.ts --project=desktop-1024 --list` — PASS; one test collected.
- `git diff --check` — PASS.

## Environment limitations

- Live Playwright execution stops in global setup because `NEXT_PUBLIC_SUPABASE_URL` and the remaining E2E Supabase credentials are absent.
- `pnpm build` reaches Next.js compilation but cannot fetch Google Fonts because outbound HTTPS is denied with `EACCES`.

## Auto-review

Requirements, lock ordering, authorization boundaries, owner-visible projections, notification routing, FK deletion semantics, E2E synchronization, and fixture cleanup were reviewed against the complete diff. No unresolved Critical or Important findings remain. The two environment limitations above require CI or a configured integration environment for final live confirmation.
