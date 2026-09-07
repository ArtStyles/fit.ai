# Next.js 16 maintenance implementation plan

> Execution: approved in conversation; use the writing-plans and verification-before-completion workflows. The framework, types, route contracts and test doubles are tightly coupled and are migrated together; request an independent whole-change code review before delivery.

**Goal:** Upgrade Vekira from Next.js 14.2.0 to maintained Next.js 16.3.4, preserving existing training, coaching, authentication, PWA and Android behavior.

**Architecture:** Keep App Router, Supabase and the existing Webpack PWA integration. Convert request APIs and route props to their asynchronous contracts. Upgrade React and its type definitions together, then adapt consumers and tests without relaxing authorization or functional assertions.

**Tech Stack:** Next.js 16.3.4, React/React DOM 19.2.8, TypeScript, ESLint 9, pnpm, Vitest, Playwright, Capacitor 8.

**Spec:** The user-approved five-step migration in this conversation: isolated branch, compatible dependencies, request API/form/authentication adaptation, PWA/Android compatibility, and verification before deployment.

## Constraints

- Implement in `.worktrees/next16-maintenance`, branch `codex/next16-maintenance`, from `43812cb`. The user's subsequent release request authorizes integration, commit and push to `main` after verification.
- Pin Next.js/React packages and related type/lint versions; update `pnpm-lock.yaml` normally.
- Keep Webpack for development and production while verifying `@ducanh2912/next-pwa`.
- No database migrations, production fixture writes, or deployment verification. The follow-up request explicitly authorizes a normal push to `origin/main`.
- Keep functional browser timeouts and assertions; isolate cold fixture preparation in setup if necessary.
- Distinguish local/browser fixtures, remote Supabase journeys, and physical Android verification.
- Baseline: 2,513 unit tests passed; browser fixtures 228 passed and 10 startup/test timeouts. Two representative cases later passed in a diagnostic rerun, one with a retry. Types passed. Those results are not a clean browser baseline.

## Task 1: Runtime and request contracts

Files: `package.json`, `pnpm-lock.yaml`, `next.config.mjs`, `eslint.config.mjs`, `tsconfig.json`, `src/app/**/page.tsx`, route/layout files, `src/lib/auth/server.ts`, `src/app/actions/settings.ts`, `src/app/actions/workspace.ts`, and their existing tests.

- [x] Update dependencies and install. Set `dev`/`dev:clean` and `build` to explicit `--webpack`; remove obsolete `swcMinify`.
- [x] Run type-check against the installed dependencies, recording and resolving Next.js 16 / React 19 contract failures.
- [x] Convert request APIs to await their values, including server actions and root layout. Example:

```ts
const cookieStore = await cookies()
const requestHeaders = await headers()
const language = normalizeLanguage(requestHeaders.get('x-public-locale') ?? cookieStore.get('fitai-language')?.value)
```

- [x] Convert route props and matching test inputs together. Required props objects remain required:

```ts
type PageProps = { params: Promise<{ clientId: string }> }
export default async function Page({ params }: PageProps) {
  const { clientId } = await params
  // Existing authorization, loading and presentation continue here.
}
```

- [x] Add a behavior test using promised route query props before adapting at least one filtered page; verify it fails on the old synchronous consumer and passes after migration.
- [x] Review middleware/proxy authentication compatibility and preserve fresh Supabase checks and identity-header boundaries.
- [x] Adapt React form hooks and types only as needed for the migration; keep validation and error feedback.
- [x] Pass type-check and the unit project, then inspect the complete migration diff.

## Task 2: Browser and PWA compatibility

Files: browser fixture tests under `src/**/__tests__`, their local fixtures, `tests/e2e/helpers`, PWA/build configuration only where required.

- [x] Reproduce a cold-start timeout and add deterministic fixture preparation before functional cases. Warm the same local HTML and readiness signal; do not replace `load` with an earlier event or globally extend functional timeouts.
- [x] Run affected browser fixtures serially with the upgraded React dependencies and retain accessibility, responsive, consent and session-preservation assertions.
- [x] Run the entire unit and browser projects separately; record exit codes and counts.
- [x] Run `pnpm lint`, `pnpm type-check`, and `pnpm build` sequentially. Resolve dependency/API regressions; identify external font/network failures separately.
- [x] Inspect generated service worker/manifest and start the production build on a separate local port. Verify public/auth pages, redirects and service worker assets with a browser or HTTP smoke check.
- [x] Inspect Capacitor's remote URL and available Android device/emulator tooling; report physical verification only if performed.

## Task 3: Review and delivery

Files: `README.md`, this plan, and a local verification report under `docs/operations` if useful.

- [x] Document supported versions, explicit Webpack usage and actual verification results.
- [x] Request independent review of the full diff and security/compatibility boundaries. Address actionable findings and re-run covering checks.
- [x] Verify a frozen-lockfile install and `git diff --check`. Deliver the isolated branch with a precise summary and remaining environment limits.

## Progress

- Worktree created; existing `.env.local` copied into the ignored worktree environment for local build compatibility.
- Registry versions confirmed: Next.js 16.3.4, React 19.2.8, React types 19.2.18/19.2.7, ESLint 9.39.5, typescript-eslint 8.69.0, react-hooks plugin 7.1.1.

- Final type generation/TypeScript, lint (zero errors; three unused-disable warnings), and frozen offline install passed. The final unit run passed 279 files / 2,515 tests.
- Review identified React 19 form resets; two real-hook Strict Mode browser tests failed before the fix and passed after native reset prevention. The identity-header tests also demonstrated failure before sanitization and passed afterward.

- Final browser run: 18 files / 240 tests passed, no retries, 223.80 s. Final Webpack production build passed; browser smoke verified ES/EN public pages, registration/login, responsive containment, no page errors, and an activated service worker.
- Runtime artifacts are local under `.artifacts/next16-runtime`; native Android and remote authenticated E2E remain explicitly unverified.
