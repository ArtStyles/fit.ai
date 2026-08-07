# Task 2 — Community availability guards

## Scope

- Added server-side Community availability guards to every public feed, follow, post, and moderation action.
- Disabled read actions return their established empty contracts; disabled mutators return `{ ok: false, error: 'Comunidad no esta disponible.' }`.
- Disabled `/feed` redirects to `/trainers`; disabled composer and post-detail entries terminate through `notFound()`.
- Server-rendered plan, history, and session completion sharing surfaces now receive the server-derived flag and omit their sharing controls when unavailable.

## TDD evidence

1. Added `src/lib/social/__tests__/communityAvailability.test.ts` before production changes. It invokes all public social actions with `COMMUNITY_ENABLED=false`; social dependencies throw if invoked, so a successful unavailable/empty result proves the guard short-circuits. It also invokes each route entry point with mocked Next navigation boundaries.
2. RED command:

   ```powershell
   pnpm vitest run src/lib/social/__tests__/communityAvailability.test.ts
   ```

   Result: exit 1, 2 failed. `createPost` rejected after calling the mocked social dependency at `src/app/actions/posts.ts:30`; `FeedPage` rejected after calling the mocked auth dependency instead of redirecting. These are the expected pre-implementation failures.
3. GREEN command:

   ```powershell
   pnpm vitest run src/lib/social/__tests__/communityAvailability.test.ts
   ```

   Result: exit 0, 1 file / 2 tests passed.

## Verification

```powershell
pnpm vitest run src/lib/social/__tests__/communityAvailability.test.ts src/lib/social/__tests__
```

Result: exit 0, 9 files / 34 tests passed.

```powershell
pnpm type-check
```

Result: exit 0 (`tsc --noEmit --incremental false`).

```powershell
pnpm test
```

Result: exit 0, 122 files / 1,039 tests passed.

The Vitest commands retain the repository's existing `vite-tsconfig-paths` deprecation warning; it is unrelated to this task and does not affect the passing result.

## Files changed

- `src/lib/features/community.ts`
- `src/lib/social/__tests__/communityAvailability.test.ts`
- `src/app/actions/feed.ts`
- `src/app/actions/follows.ts`
- `src/app/actions/posts.ts`
- `src/app/actions/moderation.ts`
- `src/app/(app)/feed/page.tsx`
- `src/app/(app)/feed/new/page.tsx`
- `src/app/(app)/post/[id]/page.tsx`
- `src/app/(app)/plan/page.tsx`
- `src/app/(app)/history/[logId]/page.tsx`
- `src/app/(app)/session/[workoutId]/page.tsx`
- `src/app/(app)/session/[workoutId]/SessionClient.tsx`
- `src/components/session/CompletionScreen.tsx`

## Self-review

- Checked every exported social action in the four required action modules; its disabled guard precedes Supabase, auth, storage, notification, and revalidation work.
- Confirmed the route test covers redirect and both `notFound()` route boundaries without inspecting production source.
- Confirmed the sharing flag is computed only on server pages and transmitted as a serializable boolean through `SessionClient` to `CompletionScreen`.
- `git diff --check` completed without whitespace errors.
