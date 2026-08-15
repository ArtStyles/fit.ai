# Dashboard Settings Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore an always-visible, accessible settings entry in the personal Home header without re-enabling Community or exposing unavailable social-profile links.

**Architecture:** `DashboardHeader` owns only the presentation of an optional social profile link and a permanent `/settings` action. `DashboardPage` owns the Community feature decision and passes a nullable `profileHref`, keeping the client header independent from server environment flags.

**Tech Stack:** Next.js App Router, React, TypeScript, Lucide React, Vitest, React DOM server rendering, existing Vekira i18n utilities.

**Spec:** `docs/superpowers/specs/2026-08-11-dashboard-settings-access-design.md`

## Global Constraints

- Show the settings gear only in the personal Home route, `/dashboard`.
- The settings action must always navigate to `/settings` and expose the localized accessible name `Abrir ajustes`.
- Preserve a minimum 44 × 44 px target using the existing `h-11 w-11` control pattern.
- Do not add Settings to the bottom navigation, desktop sidebar, coach workspace, training sessions, or plan-generation flows.
- Community disabled must never produce a Home link to `/u/[username]`.
- Do not change database schema, permissions, middleware, server actions, or Community availability.
- Preserve the existing notice hub behavior and allow the gear and notice button to coexist.

---

### Task 1: Add the permanent settings action to `DashboardHeader`

**Files:**
- Create: `src/components/dashboard/__tests__/DashboardHeader.test.tsx`
- Modify: `src/components/dashboard/DashboardHeader.tsx:1-70`
- Modify: `src/lib/i18n/index.ts:1-20`
- Modify: `src/lib/i18n/__tests__/i18n.test.ts:1-20`

**Interfaces:**
- Consumes: `profileHref: `/u/${string}` | null`, supplied by `DashboardPage` in Task 2.
- Produces: `DashboardHeader` with a permanent `/settings` link, an optional social-name link, and unchanged notice controls.

- [ ] **Step 1: Write the failing component tests**

Create `src/components/dashboard/__tests__/DashboardHeader.test.tsx`:

```tsx
import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DashboardHeader } from '../DashboardHeader'

vi.mock('@/components/profile/AvatarUploader', () => ({
  AvatarUploader: () => <span data-testid="avatar" />,
}))

vi.mock('@/components/navigation/FixedTopBar', () => ({
  FixedTopBar: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (source: string) => source }),
}))

const baseProps: ComponentProps<typeof DashboardHeader> = {
  greeting: 'Buenos días',
  firstName: 'Ana',
  dateLabel: 'sábado, 15 de agosto',
  avatarUrl: null,
  profileHref: null,
  noticeLabel: 'Notificaciones',
}

function renderHeader(overrides: Partial<ComponentProps<typeof DashboardHeader>> = {}) {
  return renderToStaticMarkup(<DashboardHeader {...baseProps} {...overrides} />)
}

describe('DashboardHeader settings access', () => {
  it('always exposes a 44px settings link from the personal Home header', () => {
    const html = renderHeader()

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Abrir ajustes"')
    expect(html).toMatch(/href="\/settings"[^>]+h-11[^>]+w-11/)
  })

  it('keeps the settings link beside the notice control', () => {
    const html = renderHeader({ noticeContent: <span>Aviso</span> })

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Abrir avisos"')
  })

  it('renders the user name as text unless an available social profile href is supplied', () => {
    const unavailable = renderHeader({ profileHref: null })
    const available = renderHeader({ profileHref: '/u/ana' })

    expect(unavailable).not.toContain('href="/u/ana"')
    expect(available).toContain('href="/u/ana"')
  })
})
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
pnpm vitest run src/components/dashboard/__tests__/DashboardHeader.test.tsx --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: FAIL because `DashboardHeader` does not accept `profileHref`, still accepts `username`, and has no `/settings` action.

- [ ] **Step 3: Add the localized accessible label test**

Add to `src/lib/i18n/__tests__/i18n.test.ts` inside the existing translation suite:

```ts
expect(translate('en', 'Abrir ajustes')).toBe('Open settings')
expect(translate('es', 'Abrir ajustes')).toBe('Abrir ajustes')
```

- [ ] **Step 4: Run the i18n test and verify RED**

Run:

```powershell
pnpm vitest run src/lib/i18n/__tests__/i18n.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: FAIL because `Abrir ajustes` is not present in the English dictionary.

- [ ] **Step 5: Implement the minimal header and translation changes**

In `src/lib/i18n/index.ts`, add:

```ts
'Abrir ajustes': 'Open settings',
```

In `src/components/dashboard/DashboardHeader.tsx`:

```tsx
import { Bell, Settings, X } from 'lucide-react'

interface Props {
  greeting: string
  firstName: string
  dateLabel: string
  avatarUrl: string | null
  profileHref: `/u/${string}` | null
  noticeContent?: ReactNode
  noticeLabel?: string
}
```

Replace the `username` condition with:

```tsx
{profileHref ? (
  <Link
    data-marketing-private
    href={profileHref}
    className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
  >
    {firstName}
  </Link>
) : <span data-marketing-private>{firstName}</span>}
```

Add this sibling immediately before the optional notice button:

```tsx
<Link
  href="/settings"
  aria-label={t('Abrir ajustes')}
  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-foreground transition-colors hover:border-violet-400/50 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none"
>
  <Settings className="h-5 w-5" aria-hidden="true" />
</Link>
```

- [ ] **Step 6: Run Task 1 tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/dashboard/__tests__/DashboardHeader.test.tsx src/lib/i18n/__tests__/i18n.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: both test files PASS; settings remains present with and without `noticeContent`.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- src/components/dashboard/DashboardHeader.tsx src/components/dashboard/__tests__/DashboardHeader.test.tsx src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "fix(dashboard): restore visible settings access"
```

---

### Task 2: Resolve Community-dependent profile navigation in `DashboardPage`

**Files:**
- Create: `src/lib/dashboard/profileNavigation.ts`
- Create: `src/lib/dashboard/__tests__/profileNavigation.test.ts`
- Modify: `src/app/(app)/dashboard/page.tsx:1-30,383-395,587-605`

**Interfaces:**
- Consumes: `DashboardHeader.profileHref: `/u/${string}` | null` from Task 1 and `isCommunityEnabled(): boolean` from `src/lib/features/community.ts`.
- Produces: `resolveDashboardProfileHref({ communityEnabled, username }): `/u/${string}` | null`; `/dashboard` passes its result to `DashboardHeader`.

- [ ] **Step 1: Write the failing profile-navigation behavior test**

Create `src/lib/dashboard/__tests__/profileNavigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveDashboardProfileHref } from '../profileNavigation'

describe('dashboard profile navigation', () => {
  it('withholds the social profile route while Community is disabled', () => {
    expect(resolveDashboardProfileHref({
      communityEnabled: false,
      username: 'ana',
    })).toBeNull()
  })

  it('withholds the social profile route when no username exists', () => {
    expect(resolveDashboardProfileHref({
      communityEnabled: true,
      username: null,
    })).toBeNull()
  })

  it('returns the social profile route only when Community and username are available', () => {
    expect(resolveDashboardProfileHref({
      communityEnabled: true,
      username: 'ana',
    })).toBe('/u/ana')
  })
})
```

- [ ] **Step 2: Run the profile-navigation test and verify RED**

Run:

```powershell
pnpm vitest run src/lib/dashboard/__tests__/profileNavigation.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: FAIL because `profileNavigation.ts` and `resolveDashboardProfileHref` do not exist.

- [ ] **Step 3: Implement the minimal profile-navigation decision**

Create `src/lib/dashboard/profileNavigation.ts`:

```ts
export function resolveDashboardProfileHref({
  communityEnabled,
  username,
}: {
  communityEnabled: boolean
  username: string | null
}): `/u/${string}` | null {
  return communityEnabled && username ? `/u/${username}` : null
}
```

- [ ] **Step 4: Run the profile-navigation test and verify GREEN**

Run:

```powershell
pnpm vitest run src/lib/dashboard/__tests__/profileNavigation.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: all three behavior cases PASS.

- [ ] **Step 5: Integrate the server-owned Community decision**

Add the import to `src/app/(app)/dashboard/page.tsx`:

```ts
import { isCommunityEnabled } from '@/lib/features/community'
import { resolveDashboardProfileHref } from '@/lib/dashboard/profileNavigation'
```

After the authenticated context is loaded, resolve the flag once:

```ts
const communityEnabled = isCommunityEnabled()
```

Replace the `username` prop passed to `DashboardHeader` with:

```tsx
profileHref={resolveDashboardProfileHref({
  communityEnabled,
  username: profile.username,
})}
```

- [ ] **Step 6: Run dashboard tests and verify GREEN**

Run:

```powershell
pnpm vitest run src/components/dashboard/__tests__/DashboardHeader.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts src/lib/dashboard/__tests__/profileNavigation.test.ts src/lib/i18n/__tests__/i18n.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: all selected tests PASS.

- [ ] **Step 7: Run focused navigation and Community regressions**

Run:

```powershell
pnpm vitest run src/components/navigation/__tests__/appNavigation.test.ts src/lib/features/__tests__/community.test.ts src/lib/social/__tests__/communityAvailability.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```

Expected: all tests PASS and Community remains disabled behind its existing feature flag.

- [ ] **Step 8: Run static verification**

Run:

```powershell
pnpm type-check
pnpm lint
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 9: Run the full unit suite**

Run:

```powershell
pnpm vitest run --maxWorkers=1 --no-file-parallelism --reporter=dot
```

Expected: all test files PASS with no failed tests.

- [ ] **Step 10: Commit Task 2**

```powershell
git add -- 'src/app/(app)/dashboard/page.tsx' src/lib/dashboard/profileNavigation.ts src/lib/dashboard/__tests__/profileNavigation.test.ts
git commit -m "fix(dashboard): decouple profile link from community"
```
