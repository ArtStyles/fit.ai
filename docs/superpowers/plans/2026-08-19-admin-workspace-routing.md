# Dedicated Admin Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated responsive admin workspace whose own navigation replaces the product shell and whose existing features live at `/admin`, `/admin/users`, `/admin/trainers`, and `/admin/content`.

**Architecture:** Move the existing admin pages from the `(app)` route group into a sibling `(admin)` group so their URLs remain stable while `AppShell` no longer wraps them. A shared `AdminShell` owns desktop/mobile navigation; authorized server loaders feed focused route pages, while pure view-model functions calculate overview metrics and filters. Existing server actions and security guards remain authoritative and only change their destination-specific redirects and revalidation paths.

**Tech Stack:** Next.js 14 App Router, React 18 Server and Client Components, TypeScript 5, Tailwind CSS, Supabase, Vitest 4, Playwright 1.61.

**Spec:** `docs/superpowers/specs/2026-08-19-admin-workspace-routing-design.md`

## Global Constraints

- Preserve `/admin`, `/admin/trainers`, and `/admin/trainers/[applicationId]` while adding `/admin/users` and `/admin/content`.
- Do not add runtime dependencies, Supabase migrations, roles, authorization policies, or audit tables.
- Keep every private read and mutation protected by `requireAdminUserContext()` even though the route layout also guards the surface.
- Do not render `AppShell`, product `DesktopSidebar`, product `BottomNav`, `WorkspaceSwitcher`, or `ActiveWorkoutDock` anywhere below `/admin`.
- Keep administrative copy in Spanish; a complete translation pass is outside this plan.
- Keep the root-layout `ActionNotice` as the single announcer for `notice` and `error` query parameters; the admin shell must not render a duplicate notice region.
- Use only timestamps already available on users, trainer applications, and the dashboard banner; never synthesize activity or convert unavailable metrics to zero.
- Desktop navigation begins at `lg`; smaller viewports use the admin mobile header and bottom navigation with safe-area spacing.
- Every mobile destination must expose a minimum 44 by 44 pixel target, a visible focus state, an accessible name, and `aria-current="page"` when active.
- Every production behavior starts with a failing Vitest or Playwright assertion and is implemented only after the failure is confirmed.

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/components/admin/adminNavigation.ts` | Typed destinations, icons, and active-route matching shared by both admin navigations. |
| `src/components/admin/AdminShell.tsx` | Fixed responsive workspace frame and scroll viewport. |
| `src/components/admin/AdminDesktopSidebar.tsx` | Desktop brand, section links, pending badge, and exit link. |
| `src/components/admin/AdminMobileNav.tsx` | Mobile header, bottom links, pending badge, and exit link. |
| `src/components/admin/AdminPageHeader.tsx` | Route title, description, breadcrumb, and actions. |
| `src/lib/admin/overview.ts` | Pure metrics, calendar-month, attention-status, and activity normalization. |
| `src/lib/auth/adminOverview.ts` | Authorized, partially resilient overview loader. |
| `src/components/admin/AdminOverview.tsx` | Overview composition and task shortcuts. |
| `src/components/admin/AdminMetricCard.tsx` | Available versus unavailable metric presentation. |
| `src/components/admin/AdminActivityList.tsx` | Chronological real-activity list and empty state. |
| `src/lib/admin/users.ts` | Query-parameter normalization and pure account filtering. |
| `src/components/admin/AdminUserDirectory.tsx` | User filters and responsive account directory. |
| `src/components/admin/AdminRouteLoading.tsx` | Shared admin skeleton geometry. |
| `src/components/admin/AdminRouteError.tsx` | Shared client-side retry state for route errors. |
| `src/app/(admin)/admin/**` | Dedicated guarded layout and feature-owned route pages. |

---

### Task 1: Admin navigation contract and responsive shell

**Files:**
- Create: `src/components/admin/adminNavigation.ts`
- Create: `src/components/admin/AdminShell.tsx`
- Create: `src/components/admin/AdminDesktopSidebar.tsx`
- Create: `src/components/admin/AdminMobileNav.tsx`
- Create: `src/components/admin/AdminPageHeader.tsx`
- Test: `src/components/admin/__tests__/adminNavigation.test.ts`
- Test: `src/components/admin/__tests__/AdminShell.test.tsx`

**Interfaces:**
- Produces: `ADMIN_NAV_ITEMS: readonly AdminNavItem[]`.
- Produces: `isAdminNavItemActive(pathname: string, href: AdminNavHref): boolean`.
- Produces: `AdminShell({ children, adminLabel, pendingTrainerCount? })`.
- Produces: `AdminPageHeader({ eyebrow?, title, description?, backHref?, backLabel?, actions? })`.
- Consumes: existing `PendingLink`, `VekiraLogo`, Tailwind safe-area utilities, and Lucide icons.

- [ ] **Step 1: Write the failing navigation contract test**

```ts
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_ITEMS, isAdminNavItemActive } from '../adminNavigation'

describe('admin navigation', () => {
  it('publishes the four approved destinations in order', () => {
    expect(ADMIN_NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: '/admin', label: 'Resumen' },
      { href: '/admin/users', label: 'Usuarios' },
      { href: '/admin/trainers', label: 'Entrenadores' },
      { href: '/admin/content', label: 'Contenido' },
    ])
  })

  it('keeps the admin root exact and trainer details under Entrenadores', () => {
    expect(isAdminNavItemActive('/admin', '/admin')).toBe(true)
    expect(isAdminNavItemActive('/admin/users', '/admin')).toBe(false)
    expect(isAdminNavItemActive('/admin/trainers/abc', '/admin/trainers')).toBe(true)
    expect(isAdminNavItemActive('/admin/users-extra', '/admin/users')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the navigation test and confirm the missing module failure**

Run: `pnpm vitest run src/components/admin/__tests__/adminNavigation.test.ts`

Expected: FAIL because `../adminNavigation` does not exist.

- [ ] **Step 3: Implement the typed navigation source**

```ts
import { FileText, LayoutDashboard, UserRoundSearch, UsersRound, type LucideIcon } from 'lucide-react'

export type AdminNavHref = '/admin' | '/admin/users' | '/admin/trainers' | '/admin/content'
export type AdminNavItem = { href: AdminNavHref; label: string; icon: LucideIcon }

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Usuarios', icon: UsersRound },
  { href: '/admin/trainers', label: 'Entrenadores', icon: UserRoundSearch },
  { href: '/admin/content', label: 'Contenido', icon: FileText },
]

export function isAdminNavItemActive(pathname: string, href: AdminNavHref): boolean {
  if (href === '/admin') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
```

- [ ] **Step 4: Run the navigation test and confirm it passes**

Run: `pnpm vitest run src/components/admin/__tests__/adminNavigation.test.ts`

Expected: PASS with 2 tests.

- [ ] **Step 5: Write the failing shell rendering test**

Mock `next/navigation`, `PendingLink`, and `VekiraLogo`, then assert the shared contract:

```tsx
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/trainers/application-1' }))
vi.mock('@/components/branding/VekiraLogo', () => ({ VekiraLogo: () => <i data-logo /> }))
vi.mock('@/components/navigation/PendingLink', () => ({
  PendingLink: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a>,
}))

it('renders admin-only desktop and mobile navigation with a real exit', () => {
  const html = renderToStaticMarkup(
    <AdminShell adminLabel="admin@example.test" pendingTrainerCount={3}>
      <main>Contenido</main>
    </AdminShell>,
  )

  expect(html).toContain('aria-label="Navegación administrativa"')
  expect(html).toContain('href="/admin/users"')
  expect(html).toContain('href="/admin/content"')
  expect(html).toContain('href="/dashboard"')
  expect(html).toContain('aria-current="page"')
  expect(html).toContain('>3<')
  expect(html).toContain('id="app-main-content"')
  expect(html).not.toContain('WorkspaceSwitcher')
})
```

- [ ] **Step 6: Run the shell test and confirm the missing component failure**

Run: `pnpm vitest run src/components/admin/__tests__/AdminShell.test.tsx`

Expected: FAIL because `AdminShell` does not exist.

- [ ] **Step 7: Implement the shell and its focused presentation components**

Use one shared item array in both navigations. `AdminShell` must own the scroll target expected by `SkipLink`:

```tsx
type AdminShellProps = {
  children: React.ReactNode
  adminLabel: string
  pendingTrainerCount?: number
}

export function AdminShell({ children, adminLabel, pendingTrainerCount }: AdminShellProps) {
  return (
    <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex overflow-hidden bg-background">
      <AdminDesktopSidebar pendingTrainerCount={pendingTrainerCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileHeader adminLabel={adminLabel} />
        <div id="app-main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none">
          {children}
        </div>
        <AdminMobileNav pendingTrainerCount={pendingTrainerCount} />
      </div>
    </div>
  )
}
```

Both navigation components must map `ADMIN_NAV_ITEMS`, call `isAdminNavItemActive`, apply `aria-current`, use `min-h-11 min-w-11`, and show the badge only for `/admin/trainers` when `pendingTrainerCount > 0`. Mark the visual badge `aria-hidden="true"` so the link's accessible name remains exactly `Entrenadores`. `AdminDesktopSidebar` uses `hidden lg:flex`; mobile header/navigation use `lg:hidden`. Both expose `/dashboard` as `Volver a Vekira` or `Salir a Vekira`.

Keep `AdminShell` server-safe. `AdminDesktopSidebar.tsx` and `AdminMobileNav.tsx` begin with `'use client'` because they call `usePathname()`; `AdminMobileNav.tsx` also exports `AdminMobileHeader({ adminLabel })` for the shell. Neither client component loads admin data.

Implement `AdminPageHeader` as a server-safe presentational component:

```tsx
type AdminPageHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
}

export function AdminPageHeader({ eyebrow = 'Operaciones', title, description, backHref, backLabel, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backHref && backLabel ? <PendingLink href={backHref}>{backLabel}</PendingLink> : null}
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{eyebrow}</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  )
}
```

- [ ] **Step 8: Run both component tests**

Run: `pnpm vitest run src/components/admin/__tests__/adminNavigation.test.ts src/components/admin/__tests__/AdminShell.test.tsx`

Expected: PASS with no React attribute warnings.

- [ ] **Step 9: Commit the navigation contract and shell**

```bash
git add src/components/admin/adminNavigation.ts src/components/admin/AdminShell.tsx src/components/admin/AdminDesktopSidebar.tsx src/components/admin/AdminMobileNav.tsx src/components/admin/AdminPageHeader.tsx src/components/admin/__tests__/adminNavigation.test.ts src/components/admin/__tests__/AdminShell.test.tsx
git commit -m "feat(admin): add dedicated workspace shell"
```

### Task 2: Isolate admin routes from the product layout

**Files:**
- Create: `src/app/(admin)/admin/layout.tsx`
- Create: `src/app/(admin)/admin/__tests__/layout.test.tsx`
- Move: `src/app/(app)/admin/page.tsx` → `src/app/(admin)/admin/page.tsx`
- Move: `src/app/(app)/admin/trainers/page.tsx` → `src/app/(admin)/admin/trainers/page.tsx`
- Move: `src/app/(app)/admin/trainers/[applicationId]/page.tsx` → `src/app/(admin)/admin/trainers/[applicationId]/page.tsx`

**Interfaces:**
- Consumes: `AdminShell` from Task 1.
- Consumes: `requireAdminUserContext()`, `requireAppUserContext()`, `normalizeLanguage()`, and `resolveUserTimeZone()`.
- Produces: a guarded route-group layout at the unchanged `/admin/**` URLs.

- [ ] **Step 1: Write the failing layout boundary test**

Mock both contexts, `I18nProvider`, and `AdminShell`. Capture their props and assert that the explicit admin guard runs before content is returned:

```tsx
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

async function renderAdminLayout(options: { adminError?: Error } = {}) {
  let shellProps: { adminLabel?: string; pendingTrainerCount?: number } | null = null
  let i18nProps: { language?: string; timeZone?: string | null } | null = null
  const requireAdmin = vi.fn(async () => {
    if (options.adminError) throw options.adminError
    return { user: { email: 'admin@example.test' }, service: {} }
  })

  vi.doMock('@/lib/auth/admin', () => ({ requireAdminUserContext: requireAdmin }))
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: vi.fn(async () => ({
      profile: { language: 'es', timezone: 'America/Havana' },
    })),
  }))
  vi.doMock('@/lib/i18n', () => ({ normalizeLanguage: () => 'es' }))
  vi.doMock('@/lib/workouts/schedule', () => ({
    resolveUserTimeZone: () => 'America/Havana',
  }))
  vi.doMock('@/components/i18n/I18nProvider', () => ({
    I18nProvider: ({ language, timeZone, children }: {
      language: string
      timeZone: string | null
      children: React.ReactNode
    }) => {
      i18nProps = { language, timeZone }
      return <>{children}</>
    },
  }))
  vi.doMock('@/components/admin/AdminShell', () => ({
    AdminShell: ({ adminLabel, pendingTrainerCount, children }: {
      adminLabel: string
      pendingTrainerCount?: number
      children: React.ReactNode
    }) => {
      shellProps = { adminLabel, pendingTrainerCount }
      return <section>{children}</section>
    },
  }))

  const AdminLayout = (await import('../layout')).default
  const html = renderToStaticMarkup(await AdminLayout({ children: <div>contenido-admin</div> }))
  return { html, shellProps, i18nProps, requireAdmin }
}

it('guards and localizes the dedicated admin shell', async () => {
  const { html, shellProps, i18nProps, requireAdmin } = await renderAdminLayout()

  expect(requireAdmin).toHaveBeenCalledOnce()
  expect(shellProps).toMatchObject({ adminLabel: 'admin@example.test' })
  expect(i18nProps).toEqual({ language: 'es', timeZone: 'America/Havana' })
  expect(html).toContain('contenido-admin')
  expect(html).not.toContain('app-shell')
})

it('does not convert an admin authorization failure into route content', async () => {
  await expect(renderAdminLayout({ adminError: new Error('admin required') }))
    .rejects.toThrow('admin required')
})
```

- [ ] **Step 2: Run the layout test and confirm the missing route-group failure**

Run: `pnpm vitest run "src/app/(admin)/admin/__tests__/layout.test.tsx"`

Expected: FAIL because the `(admin)` layout does not exist.

- [ ] **Step 3: Implement the guarded localized layout**

```tsx
import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin/AdminShell'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { requireAdminUserContext } from '@/lib/auth/admin'
import { requireAppUserContext } from '@/lib/auth/server'
import { normalizeLanguage } from '@/lib/i18n'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata: Metadata = { title: { default: 'Administración', template: '%s | Administración' } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [adminContext, appContext] = await Promise.all([
    requireAdminUserContext(),
    requireAppUserContext(),
  ])
  const language = normalizeLanguage(appContext.profile.language)
  const timeZone = resolveUserTimeZone(appContext.profile.timezone)

  return (
    <I18nProvider language={language} timeZone={timeZone}>
      <AdminShell adminLabel={adminContext.user.email ?? 'Administrador'}>{children}</AdminShell>
    </I18nProvider>
  )
}
```

- [ ] **Step 4: Move the three existing pages without changing their URLs**

Move the files exactly as listed above and remove the empty `src/app/(app)/admin` directories. Do not duplicate the pages across route groups because Next.js would detect conflicting `/admin` routes.

- [ ] **Step 5: Run the layout test and the existing admin security tests**

Run: `pnpm vitest run "src/app/(admin)/admin/__tests__/layout.test.tsx" src/lib/auth/__tests__/admin-access.test.ts src/lib/auth/__tests__/admin-e2e-boundary.test.ts`

Expected: PASS. The existing guard redirects must remain unchanged.

- [ ] **Step 6: Run TypeScript to catch stale route imports**

Run: `pnpm type-check`

Expected: exit 0; no import may still point to `@/app/(app)/admin`.

- [ ] **Step 7: Commit the route-group isolation**

```bash
git add "src/app/(admin)/admin" "src/app/(app)/admin"
git commit -m "refactor(admin): isolate admin route group"
```

### Task 3: Authorized overview data and deterministic view model

**Files:**
- Create: `src/lib/admin/overview.ts`
- Create: `src/lib/admin/__tests__/overview.test.ts`
- Create: `src/lib/auth/adminOverview.ts`
- Create: `src/lib/auth/__tests__/adminOverview.test.ts`
- Modify: `src/lib/auth/admin.ts`
- Modify: `src/lib/auth/adminTrainers.ts`
- Modify: `src/app/(admin)/admin/layout.tsx`
- Modify: `src/app/(admin)/admin/__tests__/layout.test.tsx`
- Modify: `src/components/admin/__tests__/trainerApplicationReview.test.tsx`

**Interfaces:**
- Produces: `loadAdminUsers(service: AdminServiceClient): Promise<AdminUsersData>`.
- Produces: `loadAdminDashboardBanner(service: AdminServiceClient): Promise<AdminDashboardBannerData>`.
- Produces: `loadAdminTrainerApplications(service: AdminServiceClient, status?: string): Promise<AdminTrainerQueueItem[]>`.
- Produces: `countAdminTrainerApplicationsRequiringAttention(service: AdminServiceClient): Promise<number>`.
- Produces: `buildAdminOverview(sources: AdminOverviewSources, clock: { now: string; timeZone: string }): AdminOverviewData`.
- Produces: `getAdminOverviewData(clock: { now: string; timeZone: string }): Promise<AdminOverviewData>`.
- Consumes: Task 1 `AdminShell.pendingTrainerCount`.

- [ ] **Step 1: Write failing pure view-model tests**

Use fixed ISO timestamps and assert the timezone-aware month, pending statuses, partial availability, and chronological activity:

```ts
import type { DashboardBannerData } from '@/lib/dashboard/banner'
import type { AdminUserRecord } from '@/lib/auth/admin'
import type { AdminTrainerQueueItem } from '@/lib/auth/adminTrainers'

function user(overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    id: 'user-1',
    email: 'user@example.test',
    fullName: null,
    username: null,
    avatarUrl: null,
    subscriptionTier: 'free',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
    ...overrides,
  }
}

function application(overrides: Partial<AdminTrainerQueueItem> = {}): AdminTrainerQueueItem {
  return {
    id: 'application-1',
    professionalName: 'Entrenadora Ejemplo',
    applicationDate: '2026-08-18T12:00:00.000Z',
    status: 'submitted',
    specialties: ['Fuerza'],
    applicationKind: 'initial',
    ...overrides,
  }
}

function banner(overrides: Partial<DashboardBannerData> = {}): DashboardBannerData {
  return {
    slot: 'dashboard-primary',
    kind: 'announcement',
    title: 'Aviso operativo',
    description: null,
    image_url: null,
    cta_label: null,
    cta_href: null,
    status: 'active',
    starts_on: null,
    ends_on: null,
    updated_at: '2026-08-16T12:00:00.000Z',
    ...overrides,
  }
}

it('derives real metrics and activity without inventing unavailable values', () => {
  const result = buildAdminOverview({
    users: {
      suspensionEnabled: true,
      users: [
        user({ id: 'u1', subscriptionTier: 'pro', createdAt: '2026-08-01T02:00:00.000Z' }),
        user({ id: 'u2', accountStatus: 'suspended', createdAt: '2026-07-31T20:00:00.000Z' }),
      ],
    },
    applications: [
      application({ id: 'a1', status: 'submitted', applicationDate: '2026-08-18T12:00:00.000Z' }),
      application({ id: 'a2', status: 'approved', applicationDate: '2026-08-17T12:00:00.000Z' }),
    ],
    banner: { enabled: true, banner: banner({ updated_at: '2026-08-16T12:00:00.000Z' }) },
  }, { now: '2026-08-19T12:00:00.000Z', timeZone: 'America/Havana' })

  expect(result.metrics).toMatchObject({
    totalUsers: 2,
    proUsers: 1,
    suspendedUsers: 1,
    newUsersThisMonth: 0,
    totalApplications: 2,
    pendingApplications: 1,
  })
  expect(result.activity.map(item => item.kind)).toEqual([
    'trainer_application', 'trainer_application', 'banner_updated', 'user_created', 'user_created',
  ])
})

it('uses null instead of zero when a source is unavailable', () => {
  const result = buildAdminOverview(
    { users: null, applications: null, banner: null },
    { now: '2026-08-19T12:00:00.000Z', timeZone: 'America/Havana' },
  )
  expect(result.metrics.totalUsers).toBeNull()
  expect(result.metrics.pendingApplications).toBeNull()
  expect(result.bannerEnabled).toBeNull()
  expect(result.activity).toEqual([])
})
```

- [ ] **Step 2: Run the pure tests and confirm the missing module failure**

Run: `pnpm vitest run src/lib/admin/__tests__/overview.test.ts`

Expected: FAIL because `src/lib/admin/overview.ts` does not exist.

- [ ] **Step 3: Implement the overview types and pure builder**

```ts
export const ADMIN_TRAINER_ATTENTION_STATUSES = ['submitted', 'under_review', 'interview_required'] as const

export type AdminOverviewSources = {
  users: AdminUsersData | null
  applications: AdminTrainerQueueItem[] | null
  banner: AdminDashboardBannerData | null
}

export type AdminOverviewClock = { now: string; timeZone: string }

export type AdminActivityItem = {
  id: string
  kind: 'user_created' | 'trainer_application' | 'banner_updated'
  label: string
  occurredAt: string
  href: '/admin/users' | '/admin/trainers' | '/admin/content'
}

export type AdminOverviewData = {
  metrics: {
    totalUsers: number | null
    proUsers: number | null
    suspendedUsers: number | null
    newUsersThisMonth: number | null
    totalApplications: number | null
    pendingApplications: number | null
  }
  activity: AdminActivityItem[]
  bannerEnabled: boolean | null
}
```

Use `import type` for `AdminUsersData`, `AdminDashboardBannerData`, and `AdminTrainerQueueItem` inside `overview.ts`; `adminTrainers.ts` may then import the runtime attention-status constant without creating a runtime cycle.

Implement the timezone-aware month helper explicitly:

```ts
function monthKey(value: string, timeZone: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', timeZone,
  }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  return year && month ? `${year}-${month}` : null
}
```

Implement the builder with prefixed stable IDs, valid source timestamps only, descending activity, and a five-item cap:

```ts
export function buildAdminOverview(
  { users, applications, banner }: AdminOverviewSources,
  clock: AdminOverviewClock,
): AdminOverviewData {
  const currentMonth = monthKey(clock.now, clock.timeZone)
  const attentionStatuses = new Set<AdminTrainerQueueItem['status']>(ADMIN_TRAINER_ATTENTION_STATUSES)
  const activity: AdminActivityItem[] = [
    ...(users?.users ?? []).map(user => ({
      id: `user:${user.id}`,
      kind: 'user_created' as const,
      label: `Nueva cuenta: ${user.email}`,
      occurredAt: user.createdAt,
      href: '/admin/users' as const,
    })),
    ...(applications ?? []).map(application => ({
      id: `application:${application.id}`,
      kind: 'trainer_application' as const,
      label: `Solicitud: ${application.professionalName}`,
      occurredAt: application.applicationDate,
      href: '/admin/trainers' as const,
    })),
    ...(banner?.banner ? [{
      id: `banner:${banner.banner.slot}`,
      kind: 'banner_updated' as const,
      label: `Banner actualizado: ${banner.banner.title}`,
      occurredAt: banner.banner.updated_at,
      href: '/admin/content' as const,
    }] : []),
  ]
    .filter(item => Number.isFinite(Date.parse(item.occurredAt)))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 5)

  return {
    metrics: {
      totalUsers: users ? users.users.length : null,
      proUsers: users ? users.users.filter(user => user.subscriptionTier === 'pro').length : null,
      suspendedUsers: users?.suspensionEnabled
        ? users.users.filter(user => user.accountStatus === 'suspended').length
        : null,
      newUsersThisMonth: users && currentMonth
        ? users.users.filter(user => monthKey(user.createdAt, clock.timeZone) === currentMonth).length
        : null,
      totalApplications: applications ? applications.length : null,
      pendingApplications: applications
        ? applications.filter(application => attentionStatuses.has(application.status)).length
        : null,
    },
    activity,
    bannerEnabled: banner?.enabled ?? null,
  }
}
```

- [ ] **Step 4: Run the pure view-model tests**

Run: `pnpm vitest run src/lib/admin/__tests__/overview.test.ts`

Expected: PASS, including the boundary where a UTC timestamp belongs to the previous Havana calendar month.

- [ ] **Step 5: Extract authorized low-level loaders without weakening public wrappers**

In `src/lib/auth/admin.ts`, export the service type and extract the existing bodies:

```ts
export type AdminServiceClient = ReturnType<typeof createServiceClient>

export async function loadAdminUsers(service: AdminServiceClient): Promise<AdminUsersData> {
  const [authResult, profileResult, accessResult] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 200 }),
    service.from('profiles').select('id, full_name, username, avatar_url, subscription_tier'),
    service.from('profiles').select('id, account_status, suspension_reason, suspended_until'),
  ])
  if (authResult.error || profileResult.error) {
    throw new Error(authResult.error?.message ?? profileResult.error?.message ?? 'No se pudieron cargar los usuarios.')
  }
  const profileById = new Map((profileResult.data ?? []).map(profile => [profile.id, profile]))
  const accessById = new Map((accessResult.data ?? []).map(profile => [profile.id, profile]))
  const users = authResult.data.users.map(user => {
    const profile = profileById.get(user.id)
    const access = accessById.get(user.id)
    const owner = isOwnerAdminEmail(user.email)
    const suspended = access?.account_status === 'suspended'
      && (!access.suspended_until || new Date(access.suspended_until).getTime() > Date.now())
    return {
      id: user.id,
      email: user.email ?? 'Sin correo',
      fullName: profile?.full_name ?? null,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      subscriptionTier: owner ? 'pro' as const : profile?.subscription_tier ?? 'free',
      accountStatus: owner || !suspended ? 'active' as const : 'suspended' as const,
      suspensionReason: owner || !suspended ? null : access?.suspension_reason ?? null,
      suspendedUntil: owner || !suspended ? null : access?.suspended_until ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      isOwner: owner,
    }
  })
  return { users, suspensionEnabled: !accessResult.error }
}

export async function listAdminUsers(): Promise<AdminUsersData> {
  const { service } = await requireAdminUserContext()
  return loadAdminUsers(service)
}

export async function loadAdminDashboardBanner(service: AdminServiceClient): Promise<AdminDashboardBannerData> {
  const { data, error } = await service
    .from('dashboard_banners')
    .select('slot, kind, title, description, image_url, cta_label, cta_href, status, starts_on, ends_on, updated_at')
    .eq('slot', DASHBOARD_BANNER_SLOT)
    .maybeSingle()
  return { banner: error ? null : data, enabled: !error }
}

export async function getAdminDashboardBanner(): Promise<AdminDashboardBannerData> {
  const { service } = await requireAdminUserContext()
  return loadAdminDashboardBanner(service)
}
```

In `src/lib/auth/adminTrainers.ts`, import `AdminServiceClient` with `import type`, extract the queue query into `loadAdminTrainerApplications(service, status)`, and keep `listAdminTrainerApplications(status)` as the guarded wrapper:

```ts
export async function loadAdminTrainerApplications(
  service: AdminServiceClient,
  status?: string,
): Promise<AdminTrainerQueueItem[]> {
  const selectedStatus = normalizeAdminTrainerStatus(status)
  let query = service
    .from('trainer_applications')
    .select('id, professional_name, submitted_at, created_at, status, specialties, application_kind')
  if (selectedStatus) query = query.eq('status', selectedStatus)
  const { data, error } = await query
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'No se pudo cargar la cola de entrenadores.')
  return (data ?? []).map(row => ({
    id: row.id,
    professionalName: row.professional_name,
    applicationDate: row.submitted_at ?? row.created_at,
    status: row.status,
    specialties: [...row.specialties],
    applicationKind: row.application_kind,
  }))
}

export async function listAdminTrainerApplications(status?: string): Promise<AdminTrainerQueueItem[]> {
  const { service } = await requireAdminUserContext()
  return loadAdminTrainerApplications(service, status)
}
```

Add the head-count query:

```ts
export async function countAdminTrainerApplicationsRequiringAttention(service: AdminServiceClient): Promise<number> {
  const { count, error } = await service
    .from('trainer_applications')
    .select('id', { count: 'exact', head: true })
    .in('status', [...ADMIN_TRAINER_ATTENTION_STATUSES])
  if (error || count === null) {
    throw new Error(error?.message || 'No se pudo cargar el contador de solicitudes.')
  }
  return count
}
```

Extend the existing queue fixture without relaxing its projected-column check, import the count loader, and add the badge-count assertion:

```ts
import {
  countAdminTrainerApplicationsRequiringAttention,
  getAdminTrainerApplication,
  listAdminTrainerApplications,
} from '@/lib/auth/adminTrainers'

function queueService(attentionCount = 3) {
  return {
    from(table: string) {
      if (table !== 'trainer_applications') throw new Error(`Unexpected queue table: ${table}`)
      return {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          if (options?.head) {
            const countQuery = {
              count: attentionCount,
              error: null,
              in() { return countQuery },
            }
            return countQuery
          }
          const query = {
            data: [projectedRow(columns)],
            error: null,
            eq() { return query },
            order() { return query },
          }
          return query
        },
      }
    },
  }
}

it('counts only attention statuses for the admin navigation badge', async () => {
  const service = queueService(3)
  await expect(countAdminTrainerApplicationsRequiringAttention(service as never)).resolves.toBe(3)
})
```

- [ ] **Step 6: Write the failing authorized overview loader tests**

Mock the guard and the three extracted loaders. Cover both security ordering and partial failure:

```ts
import { beforeEach, expect, it, vi } from 'vitest'
import type { AdminUsersData } from '@/lib/auth/admin'
import type { AdminOverviewClock } from '@/lib/admin/overview'
import { getAdminOverviewData } from '../adminOverview'

const {
  requireAdminUserContextMock,
  loadAdminUsersMock,
  loadAdminTrainerApplicationsMock,
  loadAdminDashboardBannerMock,
} = vi.hoisted(() => ({
  requireAdminUserContextMock: vi.fn(),
  loadAdminUsersMock: vi.fn(),
  loadAdminTrainerApplicationsMock: vi.fn(),
  loadAdminDashboardBannerMock: vi.fn(),
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminUserContext: requireAdminUserContextMock,
  loadAdminUsers: loadAdminUsersMock,
  loadAdminDashboardBanner: loadAdminDashboardBannerMock,
}))
vi.mock('@/lib/auth/adminTrainers', () => ({
  loadAdminTrainerApplications: loadAdminTrainerApplicationsMock,
}))

const clock: AdminOverviewClock = {
  now: '2026-08-19T12:00:00.000Z',
  timeZone: 'America/Havana',
}
const serviceMarker = { marker: 'service' }
const usersData: AdminUsersData = {
  suspensionEnabled: true,
  users: [{
    id: 'user-1',
    email: 'user@example.test',
    fullName: 'Usuario Ejemplo',
    username: 'usuario',
    avatarUrl: null,
    subscriptionTier: 'pro',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-08-10T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('does not start source reads when authorization fails', async () => {
  requireAdminUserContextMock.mockRejectedValue(new Error('admin required'))
  await expect(getAdminOverviewData(clock)).rejects.toThrow('admin required')
  expect(loadAdminUsersMock).not.toHaveBeenCalled()
  expect(loadAdminTrainerApplicationsMock).not.toHaveBeenCalled()
})

it('returns healthy sources when one authorized read fails', async () => {
  requireAdminUserContextMock.mockResolvedValue({ service: serviceMarker, user: { id: 'admin' } })
  loadAdminUsersMock.mockResolvedValue(usersData)
  loadAdminTrainerApplicationsMock.mockRejectedValue(new Error('trainer source unavailable'))
  loadAdminDashboardBannerMock.mockResolvedValue({ enabled: false, banner: null })

  const result = await getAdminOverviewData(clock)
  expect(loadAdminUsersMock).toHaveBeenCalledWith(serviceMarker)
  expect(loadAdminTrainerApplicationsMock).toHaveBeenCalledWith(serviceMarker)
  expect(loadAdminDashboardBannerMock).toHaveBeenCalledWith(serviceMarker)
  expect(result.metrics.totalUsers).toBe(usersData.users.length)
  expect(result.metrics.pendingApplications).toBeNull()
  expect(result.bannerEnabled).toBe(false)
})
```

- [ ] **Step 7: Run the loader tests and confirm the missing module failure**

Run: `pnpm vitest run src/lib/auth/__tests__/adminOverview.test.ts`

Expected: FAIL because `adminOverview.ts` does not exist.

- [ ] **Step 8: Implement the authorized partial loader**

Begin `adminOverview.ts` with `import 'server-only'`. Import the three loaders and guard as runtime dependencies, and import `AdminOverviewClock`/`AdminOverviewData` with `import type`:

```ts
export async function getAdminOverviewData(clock: AdminOverviewClock): Promise<AdminOverviewData> {
  const { service } = await requireAdminUserContext()
  const [users, applications, banner] = await Promise.allSettled([
    loadAdminUsers(service),
    loadAdminTrainerApplications(service),
    loadAdminDashboardBanner(service),
  ])

  return buildAdminOverview({
    users: users.status === 'fulfilled' ? users.value : null,
    applications: applications.status === 'fulfilled' ? applications.value : null,
    banner: banner.status === 'fulfilled' ? banner.value : null,
  }, clock)
}
```

The guard must remain above `Promise.allSettled`; never include it as one of the settled promises.

- [ ] **Step 9: Feed the optional pending count into the shell**

After `requireAdminUserContext()` succeeds in `layout.tsx`, call `countAdminTrainerApplicationsRequiringAttention(adminContext.service)`. Convert only this navigation decoration failure to `undefined`:

```ts
const pendingTrainerCount = await countAdminTrainerApplicationsRequiringAttention(adminContext.service)
  .catch(() => undefined)

<AdminShell
  adminLabel={adminContext.user.email ?? 'Administrador'}
  pendingTrainerCount={pendingTrainerCount}
>
  {children}
</AdminShell>
```

Extend Task 2's `renderAdminLayout()` setup so the new import remains isolated and the prop is asserted:

```tsx
const pendingCountMock = vi.fn(async () => 3)
vi.doMock('@/lib/auth/adminTrainers', () => ({
  countAdminTrainerApplicationsRequiringAttention: pendingCountMock,
}))

expect(shellProps).toMatchObject({
  adminLabel: 'admin@example.test',
  pendingTrainerCount: 3,
})
```

- [ ] **Step 10: Run all overview, guard, queue, and layout tests**

Run: `pnpm vitest run src/lib/admin/__tests__/overview.test.ts src/lib/auth/__tests__/adminOverview.test.ts src/components/admin/__tests__/trainerApplicationReview.test.tsx "src/app/(admin)/admin/__tests__/layout.test.tsx"`

Expected: PASS. The privacy queue test must still prove private fields are excluded.

- [ ] **Step 11: Commit the overview data boundary**

```bash
git add src/lib/admin src/lib/auth/admin.ts src/lib/auth/adminTrainers.ts src/lib/auth/adminOverview.ts src/lib/auth/__tests__/adminOverview.test.ts src/components/admin/__tests__/trainerApplicationReview.test.tsx "src/app/(admin)/admin/layout.tsx" "src/app/(admin)/admin/__tests__/layout.test.tsx"
git commit -m "feat(admin): add overview data model"
```

### Task 4: Admin overview route and visual components

**Files:**
- Create: `src/components/admin/AdminMetricCard.tsx`
- Create: `src/components/admin/AdminActivityList.tsx`
- Create: `src/components/admin/AdminOverview.tsx`
- Create: `src/components/admin/__tests__/AdminOverview.test.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`
- Create: `src/app/(admin)/admin/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `AdminOverviewData` and `AdminActivityItem` from Task 3.
- Consumes: `AdminPageHeader` from Task 1.
- Produces: `AdminMetricCard({ label, value, detail?, tone? })` where `value: number | null`.
- Produces: `AdminActivityList({ items, timeZone })`.
- Produces: `AdminOverview({ data, timeZone })`.

- [ ] **Step 1: Write the failing overview component tests**

```tsx
import type { AdminOverviewData } from '@/lib/admin/overview'

it('distinguishes unavailable metrics from zero and renders real task links', () => {
  const data: AdminOverviewData = {
    metrics: {
      totalUsers: null,
      proUsers: 0,
      suspendedUsers: 0,
      newUsersThisMonth: null,
      totalApplications: 7,
      pendingApplications: 3,
    },
    activity: [],
    bannerEnabled: true,
  }
  const html = renderToStaticMarkup(
    <AdminOverview data={data} timeZone="America/Havana" />,
  )

  expect(html).toContain('No disponible')
  expect(html).toContain('Usuarios Pro')
  expect(html).toContain('>0<')
  expect(html).toContain('href="/admin/trainers"')
  expect(html).toContain('3 expedientes requieren atención')
})

it('renders an explicit empty state when no activity exists', () => {
  const html = renderToStaticMarkup(<AdminActivityList items={[]} timeZone="America/Havana" />)
  expect(html).toContain('No hay actividad reciente disponible')
})
```

- [ ] **Step 2: Run the component tests and confirm missing components**

Run: `pnpm vitest run src/components/admin/__tests__/AdminOverview.test.tsx`

Expected: FAIL because the overview components do not exist.

- [ ] **Step 3: Implement metric and activity primitives**

`AdminMetricCard` must render `No disponible` for `null` and the numeric value, including zero, otherwise. `AdminActivityList` must use `<ol>`, semantic time elements, and a real `PendingLink` for each activity item.

```tsx
type AdminMetricTone = 'neutral' | 'violet' | 'warning' | 'danger'
type AdminMetricCardProps = {
  label: string
  value: number | null
  detail?: string
  tone?: AdminMetricTone
}

const toneClasses: Record<AdminMetricTone, string> = {
  neutral: 'border-border/60 text-foreground',
  violet: 'border-violet-500/30 text-violet-100',
  warning: 'border-amber-500/30 text-amber-100',
  danger: 'border-red-500/30 text-red-100',
}

export function AdminMetricCard({ label, value, detail, tone = 'neutral' }: AdminMetricCardProps) {
  return (
    <article className={cn('rounded-2xl border bg-card/60 p-4', toneClasses[tone])}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold">{value === null ? 'No disponible' : value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </article>
  )
}
```

- [ ] **Step 4: Implement the overview composition**

Render four primary cards (Usuarios, Pro, Solicitudes, Suspendidas). The Usuarios detail shows `+N este mes` when `newUsersThisMonth` is known and `No disponible` when it is not; it must not infer a delta from another source. Render the attention card only when `pendingApplications` is a positive number, the real activity list, and three shortcut cards for Users, Trainers, and Content. Do not import `AdminUserActions` or `DashboardBannerEditor` into this component.

- [ ] **Step 5: Run the overview component tests**

Run: `pnpm vitest run src/components/admin/__tests__/AdminOverview.test.tsx`

Expected: PASS.

- [ ] **Step 6: Write the failing overview page test**

Mock `getAdminOverviewData()` and `requireAppUserContext()`, render the async page, and assert the focused page contract:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import AdminPage from '../page'

const { getAdminOverviewDataMock } = vi.hoisted(() => ({
  getAdminOverviewDataMock: vi.fn(),
}))
vi.mock('@/lib/auth/adminOverview', () => ({ getAdminOverviewData: getAdminOverviewDataMock }))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({ resolveUserTimeZone: () => 'America/Havana' }))
vi.mock('@/components/admin/AdminOverview', () => ({
  AdminOverview: () => <section>Actividad reciente</section>,
}))

it('loads the focused overview without feature editors', async () => {
  getAdminOverviewDataMock.mockResolvedValue({ metrics: {}, activity: [], bannerEnabled: null })
  const html = renderToStaticMarkup(await AdminPage())

  expect(html).toContain('Estado general de la plataforma')
  expect(html).toContain('Actividad reciente')
  expect(html).not.toContain('Buscar por correo, nombre o usuario')
  expect(html).not.toContain('Guardar banner')
  expect(getAdminOverviewDataMock).toHaveBeenCalledWith(expect.objectContaining({
    timeZone: 'America/Havana',
    now: expect.any(String),
  }))
})
```

- [ ] **Step 7: Run the page test and confirm the old mixed page fails the assertions**

Run: `pnpm vitest run "src/app/(admin)/admin/__tests__/page.test.tsx"`

Expected: FAIL because the current page still contains user search and banner editing.

- [ ] **Step 8: Replace `/admin` with the focused overview page**

```tsx
export default async function AdminPage() {
  const { profile } = await requireAppUserContext()
  const timeZone = resolveUserTimeZone(profile.timezone)
  const data = await getAdminOverviewData({ now: new Date().toISOString(), timeZone })

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Resumen" description="Estado general de la plataforma" />
      <AdminOverview data={data} timeZone={timeZone} />
    </main>
  )
}
```

- [ ] **Step 9: Run overview page and component tests**

Run: `pnpm vitest run "src/app/(admin)/admin/__tests__/page.test.tsx" src/components/admin/__tests__/AdminOverview.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit the overview route**

```bash
git add src/components/admin/AdminMetricCard.tsx src/components/admin/AdminActivityList.tsx src/components/admin/AdminOverview.tsx src/components/admin/__tests__/AdminOverview.test.tsx "src/app/(admin)/admin/page.tsx" "src/app/(admin)/admin/__tests__/page.test.tsx"
git commit -m "feat(admin): add operational overview"
```

### Task 5: Feature-owned user directory and action routing

**Files:**
- Create: `src/lib/admin/users.ts`
- Create: `src/lib/admin/__tests__/users.test.ts`
- Create: `src/components/admin/AdminUserDirectory.tsx`
- Create: `src/components/admin/__tests__/AdminUserDirectory.test.tsx`
- Create: `src/app/(admin)/admin/users/page.tsx`
- Create: `src/app/(admin)/admin/users/__tests__/page.test.tsx`
- Modify: `src/app/actions/admin.ts:12-131`
- Modify: `src/app/actions/__tests__/trainerSuspension.test.ts`

**Interfaces:**
- Produces: `AdminUserFilters = { query: string; status: 'all' | 'active' | 'suspended'; tier: 'all' | 'free' | 'pro' }`.
- Produces: `normalizeAdminUserFilters(params): AdminUserFilters`.
- Produces: `filterAdminUsers(users, filters): AdminUserRecord[]`.
- Produces: `AdminUserDirectory({ users, suspensionEnabled, filters, timeZone })`.
- Consumes: `listAdminUsers()`, `AdminUserActions`, and `AdminPageHeader`.

- [ ] **Step 1: Write failing filter tests**

```ts
import type { AdminUserRecord } from '@/lib/auth/admin'

const users: AdminUserRecord[] = [
  {
    id: 'ana-pro',
    email: 'ana@example.test',
    fullName: 'Ana Pérez',
    username: 'ana',
    avatarUrl: null,
    subscriptionTier: 'pro',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    lastSignInAt: '2026-08-18T12:00:00.000Z',
    isOwner: false,
  },
  {
    id: 'bea-free',
    email: 'bea@example.test',
    fullName: 'Beatriz Ruiz',
    username: 'bea',
    avatarUrl: null,
    subscriptionTier: 'free',
    accountStatus: 'suspended',
    suspensionReason: 'Revisión manual',
    suspendedUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
  },
]

it('normalizes unknown query parameters and combines all approved filters', () => {
  expect(normalizeAdminUserFilters({ q: '  Ana ', status: 'unknown', tier: 'pro' })).toEqual({
    query: 'Ana', status: 'all', tier: 'pro',
  })

  expect(filterAdminUsers(users, { query: 'ana', status: 'active', tier: 'pro' }).map(user => user.id))
    .toEqual(['ana-pro'])
})
```

- [ ] **Step 2: Run the filter test and confirm the missing module failure**

Run: `pnpm vitest run src/lib/admin/__tests__/users.test.ts`

Expected: FAIL because `src/lib/admin/users.ts` does not exist.

- [ ] **Step 3: Implement parameter normalization and pure filtering**

```ts
export type AdminUserFilterParams = { q?: string; status?: string; tier?: string }
export type AdminUserFilters = {
  query: string
  status: 'all' | 'active' | 'suspended'
  tier: 'all' | 'free' | 'pro'
}

export function normalizeAdminUserFilters(params: AdminUserFilterParams): AdminUserFilters {
  const status = params.status === 'active' || params.status === 'suspended' ? params.status : 'all'
  const tier = params.tier === 'free' || params.tier === 'pro' ? params.tier : 'all'
  return { query: params.q?.trim() ?? '', status, tier }
}

export function filterAdminUsers(users: AdminUserRecord[], filters: AdminUserFilters): AdminUserRecord[] {
  const query = filters.query.toLocaleLowerCase('es')
  return users.filter(user => {
    const matchesQuery = !query || [user.email, user.fullName, user.username]
      .some(value => value?.toLocaleLowerCase('es').includes(query))
    const matchesStatus = filters.status === 'all' || user.accountStatus === filters.status
    const matchesTier = filters.tier === 'all' || user.subscriptionTier === filters.tier
    return matchesQuery && matchesStatus && matchesTier
  })
}
```

- [ ] **Step 4: Run the filter tests**

Run: `pnpm vitest run src/lib/admin/__tests__/users.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing directory component tests**

Render one active Pro account and one suspended Free account. Mock only `AdminUserActions`, so the test can prove that each visible account retains its action slot without pulling client dialogs into server rendering. Assert the populated and empty cases separately:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { AdminUserRecord } from '@/lib/auth/admin'
import { AdminUserDirectory } from '../AdminUserDirectory'

vi.mock('../AdminUserActions', () => ({
  AdminUserActions: ({ account }: { account: AdminUserRecord }) => (
    <span data-admin-actions={account.id}>Administrar plan</span>
  ),
}))

const directoryUsers: AdminUserRecord[] = [
  {
    id: 'ana-pro', email: 'ana@example.test', fullName: 'Ana Pérez', username: 'ana',
    avatarUrl: null, subscriptionTier: 'pro', accountStatus: 'active', suspensionReason: null,
    suspendedUntil: null, createdAt: '2026-08-01T12:00:00.000Z',
    lastSignInAt: '2026-08-18T12:00:00.000Z', isOwner: false,
  },
  {
    id: 'bea-free', email: 'bea@example.test', fullName: 'Beatriz Ruiz', username: 'bea',
    avatarUrl: null, subscriptionTier: 'free', accountStatus: 'suspended',
    suspensionReason: 'Revisión manual', suspendedUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z', lastSignInAt: null, isOwner: false,
  },
]
const filters = { query: '', status: 'all' as const, tier: 'all' as const }

it('preserves filters, status, dates, and actions in the populated and empty states', () => {
  const populatedHtml = renderToStaticMarkup(
    <AdminUserDirectory
      users={directoryUsers}
      suspensionEnabled
      filters={filters}
      timeZone="America/Havana"
    />,
  )
  const emptyHtml = renderToStaticMarkup(
    <AdminUserDirectory users={[]} suspensionEnabled filters={filters} timeZone="America/Havana" />,
  )
  const unavailableHtml = renderToStaticMarkup(
    <AdminUserDirectory users={directoryUsers} suspensionEnabled={false} filters={filters} timeZone="America/Havana" />,
  )

  expect(populatedHtml).toContain('name="q"')
  expect(populatedHtml).toContain('name="status"')
  expect(populatedHtml).toContain('name="tier"')
  expect(populatedHtml).toContain('aria-label="Resumen de cuentas"')
  expect(populatedHtml).toContain('Usuarios Pro')
  expect(populatedHtml).toContain('data-admin-actions="ana-pro"')
  expect(populatedHtml).toContain('data-admin-actions="bea-free"')
  expect(populatedHtml).toContain('Suspendida')
  expect(populatedHtml).toContain('18 ago 2026')
  expect(emptyHtml).toContain('No se encontraron cuentas')
  expect(unavailableHtml).toContain('El estado de suspensión no está disponible')
  expect(unavailableHtml).toContain('No disponible')
})
```

- [ ] **Step 6: Run the directory test and confirm the missing component failure**

Run: `pnpm vitest run src/components/admin/__tests__/AdminUserDirectory.test.tsx`

Expected: FAIL because `AdminUserDirectory` does not exist.

- [ ] **Step 7: Implement the responsive directory**

The component must:

```tsx
type AdminUserDirectoryProps = {
  users: AdminUserRecord[]
  suspensionEnabled: boolean
  filters: AdminUserFilters
  timeZone: string
}

type AdminUserRowProps = {
  account: AdminUserRecord
  suspensionEnabled: boolean
  timeZone: string
}

function SuspensionUnavailableNotice() {
  return (
    <p role="status" className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100">
      El estado de suspensión no está disponible en este momento.
    </p>
  )
}

function AdminUsersEmptyState() {
  return (
    <p className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
      No se encontraron cuentas
    </p>
  )
}

function formatAdminUserDate(value: string | null, timeZone: string): string {
  if (!value) return 'Sin actividad'
  return new Intl.DateTimeFormat('es-CU', { dateStyle: 'medium', timeZone }).format(new Date(value))
}

function AdminUserRow({ account, suspensionEnabled, timeZone }: AdminUserRowProps) {
  const displayName = account.fullName ?? account.username ?? account.email
  const statusLabel = !suspensionEnabled
    ? 'No disponible'
    : account.accountStatus === 'suspended' ? 'Suspendida' : 'Activa'
  return (
    <article className="grid gap-4 border-b border-border/50 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_8rem_10rem_minmax(15rem,auto)] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar><AvatarImage src={account.avatarUrl ?? undefined} alt="" /><AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback></Avatar>
        <div className="min-w-0"><h2 className="truncate font-semibold">{displayName}</h2><p className="truncate text-sm text-muted-foreground">{account.email}</p></div>
      </div>
      <Badge variant="outline">{account.subscriptionTier === 'pro' ? 'Pro' : 'Free'}</Badge>
      <div><Badge variant="outline">{statusLabel}</Badge><p className="mt-1 text-xs text-muted-foreground">Último acceso: {formatAdminUserDate(account.lastSignInAt, timeZone)}</p></div>
      <AdminUserActions account={account} suspensionEnabled={suspensionEnabled} />
    </article>
  )
}

export function AdminUserDirectory({ users, suspensionEnabled, filters, timeZone }: AdminUserDirectoryProps) {
  const visibleUsers = filterAdminUsers(users, filters)
  const summary = {
    total: users.length,
    pro: users.filter(account => account.subscriptionTier === 'pro').length,
    suspended: suspensionEnabled
      ? users.filter(account => account.accountStatus === 'suspended').length
      : null,
  }
  return (
    <div className="mt-8 space-y-5">
      <dl aria-label="Resumen de cuentas" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 p-4"><dt className="text-xs text-muted-foreground">Usuarios</dt><dd className="mt-1 text-2xl font-bold">{summary.total}</dd></div>
        <div className="rounded-xl border border-border/60 p-4"><dt className="text-xs text-muted-foreground">Usuarios Pro</dt><dd className="mt-1 text-2xl font-bold">{summary.pro}</dd></div>
        <div className="rounded-xl border border-border/60 p-4"><dt className="text-xs text-muted-foreground">Suspendidas</dt><dd className="mt-1 text-2xl font-bold">{summary.suspended ?? 'No disponible'}</dd></div>
      </dl>
      <form method="get" className="grid gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]">
        <input name="q" defaultValue={filters.query} aria-label="Buscar usuarios" />
        <select name="status" defaultValue={filters.status} aria-label="Estado de cuenta">
          <option value="all">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
        </select>
        <select name="tier" defaultValue={filters.tier} aria-label="Plan">
          <option value="all">Todos los planes</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <Button type="submit" className="min-h-11">Filtrar</Button>
      </form>
      {!suspensionEnabled ? <SuspensionUnavailableNotice /> : null}
      <section aria-label="Cuentas de usuario">
        {visibleUsers.length === 0 ? <AdminUsersEmptyState /> : visibleUsers.map(account => (
          <AdminUserRow key={account.id} account={account} timeZone={timeZone} suspensionEnabled={suspensionEnabled} />
        ))}
      </section>
    </div>
  )
}
```

Keep `AdminUserRow`, `SuspensionUnavailableNotice`, and `AdminUsersEmptyState` file-local. Import `Avatar`, `AvatarFallback`, `AvatarImage`, `Badge`, `Button`, `AdminUserActions`, and the Task 5 filter types/functions explicitly; responsive Tailwind classes change geometry without duplicating or hiding action controls.

- [ ] **Step 8: Run the directory tests**

Run: `pnpm vitest run src/components/admin/__tests__/AdminUserDirectory.test.tsx`

Expected: PASS.

- [ ] **Step 9: Write the failing users page test**

Mock `listAdminUsers()` and `requireAppUserContext()`. Render the query-parameter case and expose normalized directory props through the component mock:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import AdminUsersPage from '../page'

const { listAdminUsersMock } = vi.hoisted(() => ({ listAdminUsersMock: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({ listAdminUsers: listAdminUsersMock }))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({ resolveUserTimeZone: () => 'America/Havana' }))
vi.mock('@/components/admin/AdminUserDirectory', () => ({
  AdminUserDirectory: ({ filters }: { filters: { query: string; status: string; tier: string } }) => (
    <div data-query={filters.query} data-status={filters.status} data-tier={filters.tier}>Directorio de usuarios</div>
  ),
}))

it('owns user filters and excludes the banner editor', async () => {
  listAdminUsersMock.mockResolvedValue({ users: [], suspensionEnabled: true })
  const html = renderToStaticMarkup(await AdminUsersPage({
    searchParams: { q: 'ana', status: 'active', tier: 'pro' },
  }))

  expect(html).toContain('Cuentas, suscripciones y acceso')
  expect(html).toContain('data-query="ana"')
  expect(html).toContain('data-status="active"')
  expect(html).toContain('data-tier="pro"')
  expect(html).toContain('Directorio de usuarios')
  expect(html).not.toContain('Guardar banner')
})
```

- [ ] **Step 10: Run the users page test and confirm the missing route failure**

Run: `pnpm vitest run "src/app/(admin)/admin/users/__tests__/page.test.tsx"`

Expected: FAIL because `/admin/users` does not exist.

- [ ] **Step 11: Implement the users page**

```tsx
type AdminUsersPageProps = {
  searchParams?: { q?: string; status?: string; tier?: string }
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const [data, { profile }] = await Promise.all([listAdminUsers(), requireAppUserContext()])
  const filters = normalizeAdminUserFilters(searchParams ?? {})
  const timeZone = resolveUserTimeZone(profile.timezone)
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Usuarios" description="Cuentas, suscripciones y acceso" />
      <AdminUserDirectory {...data} filters={filters} timeZone={timeZone} />
    </main>
  )
}
```

- [ ] **Step 12: Update user-action routing tests before production routes**

Extend `trainerSuspension.test.ts` to import `setUserSubscription` and mocked `revalidatePath`. Change the expected success redirects to `/admin/users?notice=admin_user_suspended` and `/admin/users?notice=admin_user_reactivated`; assert both invalid inputs and successful writes remain in the feature route:

```ts
await expect(setUserSubscription(form({ targetUserId: TARGET_ID, tier: 'enterprise' })))
  .rejects.toThrow('REDIRECT:/admin/users?error=admin_invalid_action')
await expect(setUserSubscription(form({ targetUserId: TARGET_ID, tier: 'pro' })))
  .rejects.toThrow('REDIRECT:/admin/users?notice=admin_pro_granted')
expect(revalidatePath).toHaveBeenCalledWith('/admin/users')
expect(revalidatePath).toHaveBeenCalledWith('/admin')
await expect(reactivateUser(form({ targetUserId: TARGET_ID })))
  .rejects.toThrow('REDIRECT:/admin/users?notice=admin_user_reactivated')
```

- [ ] **Step 13: Run the action test and confirm old `/admin` redirects fail**

Run: `pnpm vitest run src/app/actions/__tests__/trainerSuspension.test.ts`

Expected: FAIL because `admin.ts` still redirects and revalidates only `/admin`.

- [ ] **Step 14: Move every user-action error, notice, and revalidation to its owner route**

Add constants at the top of `admin.ts`:

```ts
const ADMIN_USERS_PATH = '/admin/users'
const adminUsersFeedback = (key: 'notice' | 'error', value: string) => `${ADMIN_USERS_PATH}?${key}=${value}`
```

Replace each user-related literal beginning with `/admin?error=` or `/admin?notice=` with `adminUsersFeedback(key, value)`. After each successful mutation call both:

```ts
revalidatePath(ADMIN_USERS_PATH)
revalidatePath('/admin')
```

- [ ] **Step 15: Run filters, component, page, and action tests together**

Run: `pnpm vitest run src/lib/admin/__tests__/users.test.ts src/components/admin/__tests__/AdminUserDirectory.test.tsx "src/app/(admin)/admin/users/__tests__/page.test.tsx" src/app/actions/__tests__/trainerSuspension.test.ts`

Expected: PASS.

- [ ] **Step 16: Commit the Users feature route**

```bash
git add src/lib/admin/users.ts src/lib/admin/__tests__/users.test.ts src/components/admin/AdminUserDirectory.tsx src/components/admin/__tests__/AdminUserDirectory.test.tsx "src/app/(admin)/admin/users" src/app/actions/admin.ts src/app/actions/__tests__/trainerSuspension.test.ts
git commit -m "feat(admin): separate user management route"
```

### Task 6: Feature-owned dashboard content route

**Files:**
- Create: `src/app/(admin)/admin/content/page.tsx`
- Create: `src/app/(admin)/admin/content/__tests__/page.test.tsx`
- Modify: `src/components/admin/DashboardBannerEditor.tsx`
- Create: `src/components/admin/__tests__/DashboardBannerEditor.test.tsx`
- Create: `src/app/actions/__tests__/dashboardBannerRouting.test.ts`
- Modify: `src/app/actions/dashboardBanner.ts:25-115`

**Interfaces:**
- Consumes: `getAdminDashboardBanner()`, `DashboardBannerEditor`, and `AdminPageHeader`.
- Preserves: `saveDashboardBanner(formData)` signature.
- Produces: all banner feedback at `/admin/content` while still revalidating `/dashboard` and `/admin`.

- [ ] **Step 1: Write the failing content page and editor-state tests**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { DashboardBannerData } from '@/lib/dashboard/banner'
import AdminContentPage from '../page'

const { getAdminDashboardBannerMock } = vi.hoisted(() => ({
  getAdminDashboardBannerMock: vi.fn(),
}))
vi.mock('@/lib/auth/admin', () => ({
  getAdminDashboardBanner: getAdminDashboardBannerMock,
}))
vi.mock('@/components/admin/DashboardBannerEditor', () => ({
  DashboardBannerEditor: ({ initialBanner, enabled }: {
    initialBanner: DashboardBannerData | null
    enabled: boolean
  }) => (
    <div>
      Banner del dashboard <button>Guardar banner</button>
      {!enabled ? <p>Contenido no disponible</p> : !initialBanner ? <p>Banner sin configurar</p> : null}
    </div>
  ),
}))

const bannerFixture: DashboardBannerData = {
  slot: 'dashboard-primary',
  kind: 'announcement',
  title: 'Aviso operativo',
  description: null,
  image_url: null,
  cta_label: null,
  cta_href: null,
  status: 'draft',
  starts_on: null,
  ends_on: null,
  updated_at: '2026-08-19T12:00:00.000Z',
}

it('loads only banner data into the Content route', async () => {
  getAdminDashboardBannerMock.mockResolvedValue({ enabled: true, banner: bannerFixture })
  const html = renderToStaticMarkup(await AdminContentPage())

  expect(html).toContain('Contenido')
  expect(html).toContain('Banner del dashboard')
  expect(html).toContain('Guardar banner')
  expect(html).not.toContain('Cuentas de usuario')
  expect(getAdminDashboardBannerMock).toHaveBeenCalledOnce()
})

it('passes the unavailable feature state to the editor', async () => {
  getAdminDashboardBannerMock.mockResolvedValue({ enabled: false, banner: null })
  const html = renderToStaticMarkup(await AdminContentPage())
  expect(html).toContain('Contenido no disponible')
})

it('preserves the unconfigured banner empty state', async () => {
  getAdminDashboardBannerMock.mockResolvedValue({ enabled: true, banner: null })
  const html = renderToStaticMarkup(await AdminContentPage())
  expect(html).toContain('Banner sin configurar')
})
```

The page mock proves prop wiring. In `DashboardBannerEditor.test.tsx`, render the real editor for both explicit states so the user-facing copy is covered too:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { DashboardBannerEditor } from '../DashboardBannerEditor'

vi.mock('@/app/actions/dashboardBanner', () => ({ saveDashboardBanner: vi.fn() }))

it('explains when Content is unavailable without exposing migration details', () => {
  const html = renderToStaticMarkup(<DashboardBannerEditor initialBanner={null} enabled={false} />)
  expect(html).toContain('Contenido no disponible')
  expect(html).not.toContain('migración 030')
})

it('labels a new editable banner before its first save', () => {
  const html = renderToStaticMarkup(<DashboardBannerEditor initialBanner={null} enabled />)
  expect(html).toContain('Banner sin configurar')
  expect(html).toContain('Guardar banner')
})
```

- [ ] **Step 2: Run the page test and confirm the missing route failure**

Run: `pnpm vitest run "src/app/(admin)/admin/content/__tests__/page.test.tsx" src/components/admin/__tests__/DashboardBannerEditor.test.tsx`

Expected: FAIL because `/admin/content` does not exist and the editor does not yet expose the approved state labels.

- [ ] **Step 3: Implement the focused content page**

```tsx
export default async function AdminContentPage() {
  const data = await getAdminDashboardBanner()
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Contenido" description="Banner y programación del dashboard" />
      <section className="mt-8" aria-label="Contenido del dashboard">
        <DashboardBannerEditor initialBanner={data.banner} enabled={data.enabled} />
      </section>
    </main>
  )
}
```

In `DashboardBannerEditor`, replace the migration-specific unavailable card with a `role="status"` block headed `Contenido no disponible`. When `enabled` is true and `initialBanner` is `null`, render `Banner sin configurar` above the existing form and preview; keep the editable `EMPTY_BANNER` defaults intact.

- [ ] **Step 4: Run the content page test**

Run: `pnpm vitest run "src/app/(admin)/admin/content/__tests__/page.test.tsx" src/components/admin/__tests__/DashboardBannerEditor.test.tsx`

Expected: PASS.

- [ ] **Step 5: Write failing banner-action routing tests**

Test an invalid form and a successful minimal `draft` banner. Mock the exact Supabase chains, `revalidatePath`, and `redirect` as throwing `REDIRECT:<path>`:

```ts
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  service: undefined as unknown,
  revalidatePath: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) },
}))
vi.mock('@/lib/auth/admin', () => ({
  requireAdminUserContext: async () => ({ user: { id: 'admin-user' }, service: mocks.service }),
}))

import { saveDashboardBanner } from '../dashboardBanner'

function bannerForm(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function serviceForBanner() {
  return {
    from(table: string) {
      if (table === 'dashboard_banners') {
        return {
          select() {
            return {
              eq() {
                return { async maybeSingle() { return { data: { image_url: null }, error: null } } }
              },
            }
          },
          async upsert() { return { error: null } },
        }
      }
      if (table === 'admin_audit_logs') {
        return { async insert() { return { error: null } } }
      }
      throw new Error(`Unexpected banner table: ${table}`)
    },
    storage: {
      from() {
        return {
          async upload() { return { error: null } },
          getPublicUrl() { return { data: { publicUrl: 'https://cdn.example.test/banner' } } },
          async remove() { return { error: null } },
        }
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.service = serviceForBanner()
})

it('keeps validation and success feedback in the Content route', async () => {
  await expect(saveDashboardBanner(bannerForm({
    title: 'x', kind: 'announcement', status: 'draft',
  }))).rejects.toThrow('REDIRECT:/admin/content?error=admin_banner_invalid')

  await expect(saveDashboardBanner(bannerForm({
    title: 'Aviso', kind: 'announcement', status: 'draft',
  }))).rejects.toThrow('REDIRECT:/admin/content?notice=admin_banner_saved')
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/content')
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin')
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard')
})
```

- [ ] **Step 6: Run the banner action test and confirm old redirect failures**

Run: `pnpm vitest run src/app/actions/__tests__/dashboardBannerRouting.test.ts`

Expected: FAIL because the action still points to `/admin` and does not revalidate `/admin/content`.

- [ ] **Step 7: Update every banner redirect and revalidation**

Use a single route constant:

```ts
const ADMIN_CONTENT_PATH = '/admin/content'
const adminContentFeedback = (key: 'notice' | 'error', value: string) => `${ADMIN_CONTENT_PATH}?${key}=${value}`
```

Replace all banner validation, upload, and write error destinations. On success:

```ts
revalidatePath(ADMIN_CONTENT_PATH)
revalidatePath('/admin')
revalidatePath('/dashboard')
redirect(adminContentFeedback('notice', 'admin_banner_saved'))
```

- [ ] **Step 8: Run content page and action tests**

Run: `pnpm vitest run "src/app/(admin)/admin/content/__tests__/page.test.tsx" src/components/admin/__tests__/DashboardBannerEditor.test.tsx src/app/actions/__tests__/dashboardBannerRouting.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the Content feature route**

```bash
git add "src/app/(admin)/admin/content" src/components/admin/DashboardBannerEditor.tsx src/components/admin/__tests__/DashboardBannerEditor.test.tsx src/app/actions/dashboardBanner.ts src/app/actions/__tests__/dashboardBannerRouting.test.ts
git commit -m "feat(admin): separate dashboard content route"
```

### Task 7: Integrate trainer routes with the admin workspace

**Files:**
- Modify: `src/app/(admin)/admin/trainers/page.tsx`
- Modify: `src/app/(admin)/admin/trainers/[applicationId]/page.tsx`
- Create: `src/app/(admin)/admin/trainers/__tests__/page.test.tsx`
- Create: `src/app/(admin)/admin/trainers/[applicationId]/__tests__/page.test.tsx`
- Modify: `src/components/admin/TrainerApplicationReview.tsx:50-121`
- Modify: `src/components/admin/__tests__/trainerApplicationReview.test.tsx`
- Modify: `src/app/actions/adminTrainers.ts:245-300`
- Modify: `src/app/actions/__tests__/adminTrainers.test.ts`

**Interfaces:**
- Preserves: `TrainerApplicationQueue({ applications, selectedStatus, timeZone })`.
- Preserves: `TrainerApplicationReview({ application, timeZone, initialActionStates? })`.
- Consumes: `AdminPageHeader` and the existing `normalizeAdminTrainerStatus()`.
- Produces: `/admin` revalidation after every successful trainer state transition.

- [ ] **Step 1: Write failing trainer page tests**

For the queue, mock an application and `status=submitted`; assert the local admin header, selected filter, and link to its existing detail URL:

```tsx
// src/app/(admin)/admin/trainers/__tests__/page.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import AdminTrainersPage from '../page'

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const { listApplicationsMock } = vi.hoisted(() => ({ listApplicationsMock: vi.fn() }))
vi.mock('@/lib/auth/adminTrainers', () => ({
  listAdminTrainerApplications: listApplicationsMock,
  normalizeAdminTrainerStatus: (value?: string) => value === 'submitted' ? 'submitted' : undefined,
}))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({ resolveUserTimeZone: () => 'America/Havana' }))
vi.mock('@/components/admin/TrainerApplicationReview', () => ({
  TrainerApplicationQueue: ({ applications, selectedStatus }: {
    applications: Array<{ id: string }>
    selectedStatus?: string
  }) => (
    <div>
      <select defaultValue={selectedStatus}><option value="submitted">Enviadas</option></select>
      {applications.map(application => <a key={application.id} href={`/admin/trainers/${application.id}`}>Abrir expediente</a>)}
    </div>
  ),
}))

it('keeps the trainer queue inside its feature route', async () => {
  listApplicationsMock.mockResolvedValue([{ id: APPLICATION_ID }])
  const queueHtml = renderToStaticMarkup(
    await AdminTrainersPage({ searchParams: { status: 'submitted' } }),
  )

  expect(queueHtml).toContain('Cola de verificación profesional')
  expect(queueHtml).toContain('value="submitted" selected=""')
  expect(queueHtml).toContain(`href="/admin/trainers/${APPLICATION_ID}"`)
})
```

For the detail test, make the success and missing-record branches independent so `notFound()` is proven explicitly:

```tsx
// src/app/(admin)/admin/trainers/[applicationId]/__tests__/page.test.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import AdminTrainerApplicationPage from '../page'

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const { getApplicationMock, notFoundMock } = vi.hoisted(() => ({
  getApplicationMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))
vi.mock('next/navigation', () => ({ notFound: notFoundMock }))
vi.mock('@/lib/auth/adminTrainers', () => ({ getAdminTrainerApplication: getApplicationMock }))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({ resolveUserTimeZone: () => 'America/Havana' }))
vi.mock('@/components/admin/TrainerApplicationReview', () => ({
  TrainerApplicationReview: () => <div>Revisión del expediente</div>,
}))

beforeEach(() => vi.clearAllMocks())

it('renders the private record with a route-local return link', async () => {
  getApplicationMock.mockResolvedValue({ professionalName: 'Ada Entrenadora' })
  const detailHtml = renderToStaticMarkup(
    await AdminTrainerApplicationPage({ params: { applicationId: APPLICATION_ID } }),
  )
  expect(detailHtml).toContain('Expediente privado')
  expect(detailHtml).toContain('href="/admin/trainers"')
})

it('preserves notFound for an unknown application', async () => {
  getApplicationMock.mockResolvedValue(null)
  await expect(AdminTrainerApplicationPage({ params: { applicationId: APPLICATION_ID } }))
    .rejects.toThrow('NEXT_NOT_FOUND')
  expect(notFoundMock).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run trainer page tests and confirm old `PageTopBar` structure fails**

Run: `pnpm vitest run "src/app/(admin)/admin/trainers/__tests__/page.test.tsx" "src/app/(admin)/admin/trainers/[applicationId]/__tests__/page.test.tsx"`

Expected: FAIL because the pages still render the product top bar and full-screen wrappers.

- [ ] **Step 3: Refactor both route pages to use `AdminPageHeader`**

Queue page body:

```tsx
<main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
  <AdminPageHeader title="Entrenadores" description="Cola de verificación profesional" />
  <div className="mt-8">
    <TrainerApplicationQueue applications={applications} selectedStatus={selectedStatus} timeZone={timeZone} />
  </div>
</main>
```

Detail page body:

```tsx
<main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
  <AdminPageHeader
    eyebrow="Entrenadores"
    title="Expediente privado"
    description={application.professionalName}
    backHref="/admin/trainers"
    backLabel="Volver a entrenadores"
  />
  <div className="mt-8"><TrainerApplicationReview application={application} timeZone={timeZone} /></div>
</main>
```

Remove `PageTopBar` imports and do not introduce a second shell.

- [ ] **Step 4: Improve queue filter hierarchy without changing its data contract**

Keep the native `<select>` for all statuses, add a summary line using `applications.length`, retain the existing empty state, and change `Abrir expediente` to `min-h-11`. Do not add contact fields to the queue; the existing privacy test must continue to reject them.

- [ ] **Step 5: Run trainer page and privacy tests**

Run: `pnpm vitest run "src/app/(admin)/admin/trainers/__tests__/page.test.tsx" "src/app/(admin)/admin/trainers/[applicationId]/__tests__/page.test.tsx" src/components/admin/__tests__/trainerApplicationReview.test.tsx`

Expected: PASS, including the signed-document and private-projection assertions.

- [ ] **Step 6: Add failing action revalidation assertions**

Import the mocked `revalidatePath` in `adminTrainers.test.ts`. After a successful `startTrainerReview` and another successful transition, assert:

```ts
expect(revalidatePath).toHaveBeenCalledWith('/admin')
expect(revalidatePath).toHaveBeenCalledWith('/admin/trainers')
expect(revalidatePath).toHaveBeenCalledWith(`/admin/trainers/${APPLICATION_ID}`)
```

- [ ] **Step 7: Run the action test and confirm `/admin` is missing**

Run: `pnpm vitest run src/app/actions/__tests__/adminTrainers.test.ts`

Expected: FAIL because `applicationTransition()` does not yet revalidate `/admin`.

- [ ] **Step 8: Revalidate the overview after every successful transition**

Add `revalidatePath('/admin')` immediately before the existing queue/detail revalidations in `applicationTransition()`. Keep the existing reinstatement revalidations, including public `/trainers`.

- [ ] **Step 9: Run all trainer admin tests**

Run: `pnpm vitest run src/app/actions/__tests__/adminTrainers.test.ts src/components/admin/__tests__/trainerApplicationReview.test.tsx "src/app/(admin)/admin/trainers/__tests__/page.test.tsx" "src/app/(admin)/admin/trainers/[applicationId]/__tests__/page.test.tsx"`

Expected: PASS.

- [ ] **Step 10: Commit the trainer integration**

```bash
git add "src/app/(admin)/admin/trainers" src/components/admin/TrainerApplicationReview.tsx src/components/admin/__tests__/trainerApplicationReview.test.tsx src/app/actions/adminTrainers.ts src/app/actions/__tests__/adminTrainers.test.ts
git commit -m "refactor(admin): integrate trainer workspace routes"
```

### Task 8: Route states, accessibility acceptance, and complete verification

**Files:**
- Create: `src/components/admin/AdminRouteLoading.tsx`
- Create: `src/components/admin/AdminRouteError.tsx`
- Create: `src/components/admin/__tests__/AdminRouteStates.test.tsx`
- Create: `src/app/(admin)/admin/loading.tsx`
- Create: `src/app/(admin)/admin/error.tsx`
- Create: `src/app/(admin)/admin/users/loading.tsx`
- Create: `src/app/(admin)/admin/users/error.tsx`
- Create: `src/app/(admin)/admin/trainers/loading.tsx`
- Create: `src/app/(admin)/admin/trainers/error.tsx`
- Create: `src/app/(admin)/admin/trainers/[applicationId]/loading.tsx`
- Create: `src/app/(admin)/admin/content/loading.tsx`
- Create: `src/app/(admin)/admin/content/error.tsx`
- Modify: `tests/e2e/trainer-accessibility.spec.ts`

**Interfaces:**
- Produces: `AdminRouteLoading({ title, cards?, rows? })`.
- Produces: `AdminRouteError({ reset, title? })`.
- Consumes: the Task 1 shell already provided by the parent layout; route states render content only.

- [ ] **Step 1: Write failing route-state component tests**

```tsx
it('renders an accessible loading geometry without a second shell', () => {
  const html = renderToStaticMarkup(<AdminRouteLoading title="Usuarios" cards={4} rows={3} />)
  expect(html).toContain('aria-label="Cargando Usuarios"')
  expect(html).toContain('data-admin-loading-card')
  expect(html).not.toContain('Navegación administrativa')
})

it('announces the route error and exposes a 44px retry target', () => {
  const html = renderToStaticMarkup(<AdminRouteError reset={() => undefined} title="No se pudieron cargar los usuarios" />)
  expect(html).toContain('role="alert"')
  expect(html).toContain('Reintentar')
  expect(html).toContain('min-h-11')
})
```

- [ ] **Step 2: Run the route-state test and confirm missing components**

Run: `pnpm vitest run src/components/admin/__tests__/AdminRouteStates.test.tsx`

Expected: FAIL because the shared state components do not exist.

- [ ] **Step 3: Implement shared loading and error components**

`AdminRouteLoading` is server-safe and composes the existing `Shimmer` from `@/components/feedback/RouteLoading` inside the standard admin content width:

```tsx
type AdminRouteLoadingProps = { title: string; cards?: number; rows?: number }

export function AdminRouteLoading({ title, cards = 4, rows = 4 }: AdminRouteLoadingProps) {
  return (
    <main aria-label={`Cargando ${title}`} aria-busy="true" className="mx-auto w-full max-w-7xl px-4 py-8">
      <Shimmer className="h-9 w-52" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => <Shimmer key={index} data-admin-loading-card className="h-28 rounded-2xl" />)}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }, (_, index) => <Shimmer key={index} className="h-16 rounded-xl" />)}
      </div>
    </main>
  )
}
```

`AdminRouteError` begins with `'use client'`, accepts `reset`, renders `role="alert"`, and calls `reset` from a `Button` with `min-h-11`:

```tsx
type AdminRouteErrorProps = { reset: () => void; title?: string }

export function AdminRouteError({ reset, title = 'No se pudo cargar esta vista' }: AdminRouteErrorProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <section role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-red-300" />
        <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tus datos siguen guardados. Intenta nuevamente.</p>
        <Button type="button" onClick={reset} className="mt-5 min-h-11">Reintentar</Button>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Run the route-state tests**

Run: `pnpm vitest run src/components/admin/__tests__/AdminRouteStates.test.tsx`

Expected: PASS.

- [ ] **Step 5: Add thin state files to every route**

Each `loading.tsx` returns `AdminRouteLoading` with its route title and useful geometry. Each `error.tsx` begins with `'use client'` and returns `AdminRouteError`. Example:

```tsx
// src/app/(admin)/admin/users/loading.tsx
export default function Loading() {
  return <AdminRouteLoading title="Usuarios" cards={3} rows={5} />
}

// src/app/(admin)/admin/users/error.tsx
'use client'
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminRouteError reset={reset} title="No se pudieron cargar los usuarios" />
}
```

The trainer detail needs only `loading.tsx`; its unknown identifier continues through `notFound()` rather than a custom error branch.

- [ ] **Step 6: Add the failing admin workspace E2E acceptance flow**

Extend the admin portion of `trainer-accessibility.spec.ts` after signing in as `fixture.admin.email`:

```ts
test('workspace administrativo replaces product navigation and keeps feature routes accessible', async ({ page }) => {
if (!fixture) throw new Error('Trainer accessibility fixture was not created')
await signIn(page, fixture.admin.email)
await page.goto('/settings')
await page.getByRole('link', { name: 'Administración', exact: true }).click()
await expect(page).toHaveURL(/\/admin$/)

const adminNav = page.locator('nav[aria-label="Navegación administrativa"]:visible')
await expect(adminNav).toBeVisible()
await expect(page.locator('nav[aria-label="Navegación principal"]:visible')).toHaveCount(0)
await expect(page.getByText('Estado general de la plataforma', { exact: true })).toBeVisible()
await auditCriticalAndSeriousAccessibility(page)
await expectResponsiveGeometry(page)
await expectActionTargetsAtLeast44(page)

for (const destination of [
  { label: 'Usuarios', path: '/admin/users' },
  { label: 'Entrenadores', path: '/admin/trainers' },
  { label: 'Contenido', path: '/admin/content' },
]) {
  await page.locator('nav[aria-label="Navegación administrativa"]:visible')
    .getByRole('link', { name: destination.label, exact: true })
    .click()
  expect(new URL(page.url()).pathname).toBe(destination.path)
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('nav[aria-label="Navegación principal"]:visible')).toHaveCount(0)
  await expect(page.locator(`a[aria-current="page"][href="${destination.path}"]:visible`)).toBeVisible()
  await auditCriticalAndSeriousAccessibility(page)
  await expectResponsiveGeometry(page)
  await expectActionTargetsAtLeast44(page)
}

await auditRoute(page, `/admin/trainers/${fixture.trainerA.applicationId}`)
await expect(page.locator('nav[aria-label="Navegación principal"]:visible')).toHaveCount(0)
await expect(page.locator('a[aria-current="page"][href="/admin/trainers"]:visible')).toBeVisible()
await page.getByRole('link', { name: /Volver a Vekira|Salir a Vekira/ }).filter({ visible: true }).click()
await expect(page).toHaveURL(/\/dashboard$/)
})
```

Use the existing `auditRoute`, Axe, geometry, target-size, and cleanup helpers; do not create another fixture or another admin account. The three module transitions must be link clicks through the visible administrative navigation, not direct `page.goto()` calls.

- [ ] **Step 7: Run the focused E2E and confirm the current behavior fails first**

Run: `pnpm test:e2e:trainer-marketplace -- --grep "workspace administrativo"`

Expected before the final UI wiring is complete: FAIL on the missing dedicated navigation or product-navigation absence assertion. If the required remote trainer E2E gate is not configured, record that environmental prerequisite and rely on the complete Vitest, type, lint, and build gates below; do not weaken the E2E test.

- [ ] **Step 8: Fix only accessibility findings exposed by the focused E2E**

Adjust the responsible admin component: accessible nav name, active link, 44px target, safe-area spacing, heading hierarchy, or horizontal overflow. Do not suppress Axe rules and do not change the acceptance assertions to accommodate an inaccessible result.

- [ ] **Step 9: Run the complete related Vitest set**

Run: `pnpm vitest run src/components/admin src/lib/admin src/lib/auth/__tests__/admin-access.test.ts src/lib/auth/__tests__/admin-e2e-boundary.test.ts src/lib/auth/__tests__/adminOverview.test.ts src/app/actions/__tests__/trainerSuspension.test.ts src/app/actions/__tests__/dashboardBannerRouting.test.ts src/app/actions/__tests__/adminTrainers.test.ts "src/app/(admin)/admin" src/components/settings/__tests__/settingsOverview.test.tsx`

Expected: PASS with zero failed tests and no React warnings.

- [ ] **Step 10: Run the full unit suite**

Run: `pnpm test`

Expected: exit 0 with all Vitest projects passing.

- [ ] **Step 11: Run static verification**

Run: `pnpm type-check`

Expected: exit 0.

Run: `pnpm lint`

Expected: exit 0 with no errors.

- [ ] **Step 12: Run the production build**

Run: `pnpm build`

Expected: exit 0 and the route manifest includes `/admin`, `/admin/users`, `/admin/trainers`, `/admin/trainers/[applicationId]`, and `/admin/content` exactly once each.

- [ ] **Step 13: Re-run the focused E2E when its environment is configured**

Run: `pnpm test:e2e:trainer-marketplace -- --grep "workspace administrativo"`

Expected: PASS in the configured mobile, tablet, and desktop projects. The admin nav is visible, product nav is absent, trainer detail keeps its active section, and the exit reaches `/dashboard`.

- [ ] **Step 14: Inspect the final diff against the specification**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only implementation files named in this plan, plus this plan artifact if it has not been committed separately, are modified or untracked.

- [ ] **Step 15: Commit route states and acceptance coverage**

```bash
git add src/components/admin/AdminRouteLoading.tsx src/components/admin/AdminRouteError.tsx src/components/admin/__tests__/AdminRouteStates.test.tsx "src/app/(admin)/admin" tests/e2e/trainer-accessibility.spec.ts
git commit -m "test(admin): cover dedicated workspace acceptance"
```

## Final Acceptance Checklist

- [ ] `/admin` renders the operational overview without the full user directory or banner editor.
- [ ] `/admin/users`, `/admin/trainers`, and `/admin/content` own their features and URL state.
- [ ] `/admin/trainers/[applicationId]` keeps Entrenadores active and preserves `notFound()`.
- [ ] Product navigation, workspace switching, and active-workout dock are absent throughout `/admin`.
- [ ] Desktop and mobile admin navigation consume one destination source and expose a real `/dashboard` exit.
- [ ] Every route and mutation retains server-side admin authorization.
- [ ] User and banner actions redirect to their owning routes and revalidate both owner route and overview.
- [ ] Unknown overview sources render `No disponible`, never zero.
- [ ] No migration, dependency, role, or unrelated product refactor appears in the diff.
- [ ] Relevant tests, full Vitest, type-check, lint, build, and configured E2E provide fresh passing evidence.
