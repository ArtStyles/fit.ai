# Phase 1 UI, Localization, and Technical SEO Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the shared visual, navigation, bilingual-routing, metadata, accessibility, and test foundations required by every later Vekira UI/SEO phase.

**Architecture:** Keep authenticated routes unprefixed and add explicit public locale routes through pure routing helpers. Centralize navigation and metadata contracts, then render them through separate mobile and desktop shells. Add browser-level accessibility verification without changing product behavior.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Vitest, Playwright, Axe.

## Global Constraints

- Preserve the Vekira brand and violet identity; this is not a rebrand.
- Spanish for Latin America is primary; supported public locales are exactly `es` and `en`.
- Meet WCAG 2.2 AA, allow browser zoom, and retain `prefers-reduced-motion` support.
- Validate 375, 768, 1024, and 1440 px.
- Authenticated routes remain unprefixed.
- Do not implement or simulate payments.
- Preserve Android safe-area behavior and the internal scroll viewport.

---

### Task 0: Restore a clean lint baseline

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `src/app/actions/posts.ts`
- Modify if required by the root-cause fix: `src/components/social/PostMedia.tsx`
- Modify if required by the root-cause fix: `src/components/social/ProfilePostGrid.tsx`

**Interfaces:**
- Produces: a clean ESLint baseline without disabling unknown rules.
- Consumes: the existing flat ESLint configuration and current Next.js/TypeScript dependencies.

- [ ] **Step 1: Reproduce and document the three baseline errors**

Run: `& '.\node_modules\.bin\eslint.cmd' .`

Expected before the fix: one `@typescript-eslint/ban-types` error in `posts.ts` and two missing-rule errors for `@next/next/no-img-element` in the social image components.

- [ ] **Step 2: Investigate the root causes before editing**

Inspect `eslint.config.mjs`, the three reported files, installed ESLint packages, and recent commits touching them. Record in the task report why the generic default type is rejected and why inline suppressions reference a rule that the active flat config does not register.

- [ ] **Step 3: Apply the smallest root-cause fixes**

Replace the banned empty-object default with a type-safe empty object that preserves the `ActionResult` generic contract:

```ts
export type ActionResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string }
```

For the two image files, either register the existing Next.js lint plugin correctly in the flat configuration or remove the stale suppressions only if investigation proves the project intentionally does not enable Next lint rules. Do not add a new dependency, disable ESLint globally, or convert the images as part of this baseline task.

- [ ] **Step 4: Verify the baseline**

Run:

```powershell
& '.\node_modules\.bin\eslint.cmd' .
& '.\node_modules\.bin\tsc.cmd' --noEmit --incremental false
& '.\node_modules\.bin\vitest.cmd' run
```

Expected: ESLint and TypeScript exit 0; all 236 baseline tests pass. The known Vite `vite-tsconfig-paths` deprecation notice may remain because changing the test runner is outside this task.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs src/app/actions/posts.ts src/components/social/PostMedia.tsx src/components/social/ProfilePostGrid.tsx
git commit -m "fix(lint): restore clean baseline"
```

### Task 1: Design tokens, zoom, and skip navigation

**Files:**
- Create: `src/components/accessibility/SkipLink.tsx`
- Create: `src/components/feedback/ScreenState.tsx`
- Create: `src/styles/__tests__/design-system.test.ts`
- Modify: `src/styles/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: CSS tokens `--surface-*`, `--status-*`, `--space-*`, `--radius-*`, `--motion-*`, and element id `app-main-content`.
- Consumes: existing fonts, safe-area variables, dark theme, and `prefers-reduced-motion` rule.

- [ ] **Step 1: Write the failing source-contract test**

```ts
// src/styles/__tests__/design-system.test.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
const layout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')

describe('global design system contract', () => {
  it('defines semantic surfaces, statuses, spacing, radius, and motion', () => {
    for (const token of [
      '--surface-1', '--surface-2', '--status-success', '--status-warning',
      '--space-1', '--space-6', '--radius-control', '--motion-fast',
    ]) expect(css).toContain(token)
  })

  it('allows zoom and renders a skip link', () => {
    expect(layout).not.toContain('userScalable: false')
    expect(layout).not.toContain('maximumScale: 1')
    expect(layout).toContain('<SkipLink')
  })
})
```

- [ ] **Step 2: Run the test and verify the contract is missing**

Run: `pnpm test -- src/styles/__tests__/design-system.test.ts`

Expected: FAIL because semantic tokens and `SkipLink` are absent and zoom is disabled.

- [ ] **Step 3: Implement the skip link and semantic tokens**

```tsx
// src/components/accessibility/SkipLink.tsx
export function SkipLink() {
  return (
    <a
      href="#app-main-content"
      className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
    >
      Saltar al contenido
    </a>
  )
}
```

Add the shared state primitive:

```tsx
// src/components/feedback/ScreenState.tsx
import type { ReactNode } from 'react'

export type ScreenStateKind = 'loading' | 'empty' | 'error' | 'success' | 'blocked' | 'offline'

export function ScreenState({ kind, title, description, action }: {
  kind: ScreenStateKind
  title: string
  description: string
  action?: ReactNode
}) {
  const urgent = kind === 'error' || kind === 'blocked'
  return (
    <section role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'} className="rounded-card border bg-surface-1 p-6 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  )
}
```

Add under both `:root` and `.dark` appropriate HSL values for this exact token set:

```css
--surface-1: 240 4% 7%;
--surface-2: 240 4% 10%;
--surface-3: 240 4% 14%;
--status-success: 142 71% 45%;
--status-warning: 38 92% 50%;
--status-danger: 0 72% 51%;
--space-1: 0.25rem;
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-5: 1.5rem;
--space-6: 2rem;
--radius-control: 0.75rem;
--radius-card: 1rem;
--motion-fast: 150ms;
--motion-normal: 240ms;
```

Expose `surface`, `success`, `warning`, and `danger` colors through `tailwind.config.ts`. In `src/app/layout.tsx`, remove `maximumScale` and `userScalable`, import `SkipLink`, and render it as the first child of `<body>`.

- [ ] **Step 4: Give the authenticated scroll region the skip target**

Modify `src/components/navigation/AppScrollViewport.tsx`:

```tsx
<main
  id="app-main-content"
  tabIndex={-1}
  ref={viewportRef}
  className="fitai-safe-content-bottom min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none"
  data-app-scroll-viewport
>
  {children}
</main>
```

Later public layouts must use the same id on their main element.

- [ ] **Step 5: Run focused and global checks**

Run: `pnpm test -- src/styles/__tests__/design-system.test.ts && pnpm type-check && pnpm lint`

Expected: PASS; ESLint has no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/accessibility/SkipLink.tsx src/components/feedback/ScreenState.tsx src/styles/__tests__/design-system.test.ts src/styles/globals.css tailwind.config.ts src/app/layout.tsx src/components/navigation/AppScrollViewport.tsx
git commit -m "feat(ui): establish accessible design tokens"
```

### Task 2: Shared navigation model and responsive app shell

**Files:**
- Create: `src/components/navigation/appNavigation.ts`
- Create: `src/components/navigation/__tests__/appNavigation.test.ts`
- Create: `src/components/navigation/DesktopSidebar.tsx`
- Create: `src/components/navigation/AppShell.tsx`
- Create: `src/app/(app)/entrenar/page.tsx`
- Create: `src/app/(app)/progress/page.tsx`
- Modify: `src/components/navigation/BottomNav.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Delete: `src/components/navigation/ChatFab.tsx`

**Interfaces:**
- Produces: `APP_NAV_ITEMS`, `isAppNavItemActive(pathname, href)`, and `AppShell`.
- Consumes: `PendingLink`, Lucide icons, `AppScrollViewport`, native initializers, and safe-area tokens.

- [ ] **Step 1: Write navigation-model tests**

```ts
// src/components/navigation/__tests__/appNavigation.test.ts
import { describe, expect, it } from 'vitest'
import { APP_NAV_ITEMS, isAppNavItemActive } from '../appNavigation'

describe('app navigation', () => {
  it('uses the approved five destinations in order', () => {
    expect(APP_NAV_ITEMS.map(item => item.href)).toEqual([
      '/dashboard', '/plan', '/entrenar', '/progress', '/feed',
    ])
  })

  it('matches exact and nested routes without matching unrelated prefixes', () => {
    expect(isAppNavItemActive('/plan', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plan/edit', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plans/generate', '/plan')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- src/components/navigation/__tests__/appNavigation.test.ts`

Expected: FAIL because `appNavigation.ts` does not exist.

- [ ] **Step 3: Implement the pure navigation model**

```ts
// src/components/navigation/appNavigation.ts
import { BarChart3, Dumbbell, Home, Play, Users, type LucideIcon } from 'lucide-react'

export type AppNavItem = {
  href: '/dashboard' | '/plan' | '/entrenar' | '/progress' | '/feed'
  label: 'Inicio' | 'Plan' | 'Entrenar' | 'Progreso' | 'Comunidad'
  icon: LucideIcon
}

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: Home },
  { href: '/plan', label: 'Plan', icon: Dumbbell },
  { href: '/entrenar', label: 'Entrenar', icon: Play },
  { href: '/progress', label: 'Progreso', icon: BarChart3 },
  { href: '/feed', label: 'Comunidad', icon: Users },
]

export function isAppNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/dashboard' || href === '/entrenar') return false
  return pathname.startsWith(`${href}/`)
}
```

The `/entrenar` tab is a semantic action. Create `src/app/(app)/entrenar/page.tsx` as a server route that loads the active plan workouts, resolves the user timezone, selects today’s workout, and redirects to `/session/{id}` when one is available. Otherwise it redirects to `/dashboard?notice=no-workout-today`. The route must reuse `getIsoWeekday` and must not relax `getWorkoutStartAccess` rules.

Create `src/app/(app)/progress/page.tsx` as a temporary server redirect to `/history` so Phase 1 navigation never points to a missing page. Phase 3 replaces this redirect with the unified progress hub.

- [ ] **Step 4: Build desktop and shared shells**

```tsx
// src/components/navigation/AppShell.tsx
import type { ReactNode } from 'react'
import { AppScrollViewport } from './AppScrollViewport'
import { BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-[var(--app-safe-area-left)] bottom-0 top-[var(--app-safe-area-top)] flex overflow-hidden">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppScrollViewport>{children}</AppScrollViewport>
        <BottomNav />
      </div>
    </div>
  )
}
```

`DesktopSidebar` must render `APP_NAV_ITEMS`, remain hidden below `lg`, use a 16rem width, include the Vekira logo, and use `aria-current="page"`. `BottomNav` must consume the same items, hide at `lg`, and render `Entrenar` as the visually dominant central action. Remove `ChatFab` from the layout and delete its file; later pages will add contextual coach links.

- [ ] **Step 5: Wire the existing app layout**

Replace the chrome portion of `src/app/(app)/layout.tsx` with:

```tsx
<I18nProvider language={language}>
  <AndroidBackHandler />
  <SocialPushNotificationsInit />
  <TimezoneSync current={profile.timezone} />
  <AppShell>{children}</AppShell>
</I18nProvider>
```

- [ ] **Step 6: Verify navigation**

Run: `pnpm test -- src/components/navigation/__tests__/appNavigation.test.ts && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/navigation src/app/'(app)'/layout.tsx src/app/'(app)'/entrenar/page.tsx src/app/'(app)'/progress/page.tsx
git commit -m "feat(ui): add responsive product navigation"
```

### Task 3: Public locale routing contract

**Files:**
- Create: `src/lib/i18n/routing.ts`
- Create: `src/lib/i18n/__tests__/routing.test.ts`
- Create: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/page.tsx`
- Create: `src/app/language-selector/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/middleware.ts`

**Interfaces:**
- Produces: `PublicLocale`, `PUBLIC_LOCALES`, `isPublicLocale`, `localizedPath`, `alternateLocalePath`.
- Consumes: existing `AppLanguage`, `I18nProvider`, and cookie `fitai-language`.

- [ ] **Step 1: Write routing tests**

```ts
// src/lib/i18n/__tests__/routing.test.ts
import { describe, expect, it } from 'vitest'
import { alternateLocalePath, isPublicLocale, localizedPath } from '../routing'

describe('public locale routing', () => {
  it('accepts only es and en', () => {
    expect(isPublicLocale('es')).toBe(true)
    expect(isPublicLocale('en')).toBe(true)
    expect(isPublicLocale('pt')).toBe(false)
  })

  it('builds localized named routes', () => {
    expect(localizedPath('es', 'home')).toBe('/es')
    expect(localizedPath('en', 'personalized-workouts')).toBe('/en/personalized-workouts')
  })

  it('switches locale without retaining a translated slug', () => {
    expect(alternateLocalePath('/es/entrenamiento-personalizado', 'en'))
      .toBe('/en/personalized-workouts')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- src/lib/i18n/__tests__/routing.test.ts`

Expected: FAIL because the routing module is absent.

- [ ] **Step 3: Implement named-route localization**

```ts
// src/lib/i18n/routing.ts
export const PUBLIC_LOCALES = ['es', 'en'] as const
export type PublicLocale = (typeof PUBLIC_LOCALES)[number]
export type PublicRoute = 'home' | 'personalized-workouts' | 'exercises' | 'faq' | 'privacy' | 'terms'

const ROUTES: Record<PublicRoute, Record<PublicLocale, string>> = {
  home: { es: '', en: '' },
  'personalized-workouts': {
    es: 'entrenamiento-personalizado',
    en: 'personalized-workouts',
  },
  exercises: { es: 'ejercicios', en: 'exercises' },
  faq: { es: 'preguntas-frecuentes', en: 'faq' },
  privacy: { es: 'privacidad', en: 'privacy' },
  terms: { es: 'terminos', en: 'terms' },
}

export function isPublicLocale(value: string): value is PublicLocale {
  return PUBLIC_LOCALES.includes(value as PublicLocale)
}

export function localizedPath(locale: PublicLocale, route: PublicRoute): string {
  const slug = ROUTES[route][locale]
  return `/${locale}${slug ? `/${slug}` : ''}`
}

export function alternateLocalePath(pathname: string, target: PublicLocale): string {
  for (const route of Object.keys(ROUTES) as PublicRoute[]) {
    if (PUBLIC_LOCALES.some(locale => localizedPath(locale, route) === pathname)) {
      return localizedPath(target, route)
    }
  }
  return localizedPath(target, 'home')
}
```

- [ ] **Step 4: Add locale layout and neutral root selector**

`src/app/[locale]/layout.tsx` must validate `params.locale` with `isPublicLocale`, call `notFound()` for unsupported values, and render `I18nProvider` without nesting another `<html>`. Create a temporary `src/app/[locale]/page.tsx` that renders the existing hero copy in Spanish or English inside `<main id="app-main-content">`; Phase 2 replaces this page with the full landing, but Phase 1 must leave `/es` and `/en` functional.

Replace `/` with a neutral page containing two explicit links to `/es` and `/en`. It may emphasize a language based on the cookie but must not automatically redirect. Keep `/language-selector` as an alias that redirects permanently to `/`.

- [ ] **Step 5: Update middleware public-route detection**

Extract and use this predicate before Supabase redirects:

```ts
const PUBLIC_EXACT = ['/', '/login', '/register', '/auth/callback', '/privacy', '/pricing', '/suspended']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname)
    || pathname.startsWith('/auth/')
    || /^\/(es|en)(\/|$)/.test(pathname)
}
```

Authenticated users visiting `/es` or `/en` must not be forced to dashboard; only `/login` and `/register` retain the authenticated redirect.

When a path begins with `/es` or `/en`, middleware must set `x-public-locale` on the forwarded request headers and persist `fitai-language` on the response. Update the root layout to prefer `headers().get('x-public-locale')` over the existing cookie so `<html lang>` is correct on the first localized request.

- [ ] **Step 6: Run routing and regression checks**

Run: `pnpm test -- src/lib/i18n/__tests__/routing.test.ts && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n src/app/page.tsx src/app/layout.tsx src/app/language-selector src/app/'[locale]' src/middleware.ts
git commit -m "feat(i18n): add explicit public locale routing"
```

### Task 4: Metadata, robots, sitemap, and private noindex

**Files:**
- Create: `src/lib/seo/site.ts`
- Create: `src/lib/seo/metadata.ts`
- Create: `src/lib/seo/__tests__/metadata.test.ts`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `.env.example`

**Interfaces:**
- Produces: `absoluteUrl`, `buildLocalizedMetadata`, `LocalizedMetadataInput`, and `SITE_URL`.
- Consumes: `PublicLocale`, `localizedPath`, and Next.js `Metadata`/`MetadataRoute`.

- [ ] **Step 1: Write metadata tests**

```ts
// src/lib/seo/__tests__/metadata.test.ts
import { describe, expect, it } from 'vitest'
import { buildLocalizedMetadata } from '../metadata'

describe('localized metadata', () => {
  it('emits canonical and reciprocal language alternates', () => {
    const value = buildLocalizedMetadata({
      locale: 'es',
      paths: { es: '/es/entrenamiento-personalizado', en: '/en/personalized-workouts' },
      title: 'Entrenamiento personalizado', description: 'Plan que progresa contigo.',
    })
    expect(value.alternates?.canonical).toBe('/es/entrenamiento-personalizado')
    expect(value.alternates?.languages).toEqual({
      'es-419': '/es/entrenamiento-personalizado',
      en: '/en/personalized-workouts',
      'x-default': '/',
    })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- src/lib/seo/__tests__/metadata.test.ts`

Expected: FAIL because SEO helpers are absent.

- [ ] **Step 3: Implement site and metadata helpers**

```ts
// src/lib/seo/site.ts
export const SITE_URL = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString()
```

```ts
// src/lib/seo/metadata.ts
import type { Metadata } from 'next'
import type { PublicLocale } from '@/lib/i18n/routing'

export type LocalizedMetadataInput = {
  locale: PublicLocale
  paths: Partial<Record<PublicLocale, string>>
  title: string
  description: string
  image?: string
  index?: boolean
}

export function buildLocalizedMetadata(input: LocalizedMetadataInput): Metadata {
  const canonical = input.paths[input.locale]
  if (!canonical) throw new Error(`Missing canonical path for locale ${input.locale}`)
  const languages: Record<string, string> = { 'x-default': '/' }
  if (input.paths.es) languages['es-419'] = input.paths.es
  if (input.paths.en) languages.en = input.paths.en
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      languages,
    },
    robots: input.index === false ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website', locale: input.locale === 'es' ? 'es_419' : 'en_US',
      url: canonical, title: input.title, description: input.description,
      images: input.image ? [input.image] : ['/opengraph-image.png'],
    },
    twitter: { card: 'summary_large_image', title: input.title, description: input.description },
  }
}
```

- [ ] **Step 4: Add technical crawl routes**

`robots.ts` must allow crawling and point to `/sitemap.xml`; do not disallow private routes because their `noindex` must remain readable. `sitemap.ts` initially returns `/`, `/es`, and `/en`, with localized alternates on the latter two. Later phases extend it with commercial and content entries.

Export this metadata from `src/app/(app)/layout.tsx`:

```ts
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}
```

Set `metadataBase: SITE_URL` in the root metadata and add `NEXT_PUBLIC_APP_URL=http://localhost:3000` to `.env.example`.

- [ ] **Step 5: Run SEO checks**

Run: `pnpm test -- src/lib/seo/__tests__/metadata.test.ts && pnpm type-check && pnpm build`

Expected: PASS; build emits `/robots.txt` and `/sitemap.xml`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/seo src/app/robots.ts src/app/sitemap.ts src/app/layout.tsx src/app/'(app)'/layout.tsx .env.example
git commit -m "feat(seo): add bilingual metadata infrastructure"
```

### Task 5: Browser accessibility and responsive verification harness

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: scripts `test:e2e` and `test:a11y`.
- Consumes: stable route URLs from Tasks 3 and 4.

- [ ] **Step 1: Install the browser test dependencies**

Run: `pnpm add -D @playwright/test @axe-core/playwright`

Expected: package manifest and lockfile update successfully.

- [ ] **Step 2: Add Playwright configuration**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:3000', reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1024', use: { viewport: { width: 1024, height: 768 } } },
    { name: 'desktop-1440', use: { viewport: { width: 1440, height: 900 } } },
  ],
})
```

- [ ] **Step 3: Add the initial public accessibility test**

```ts
// tests/e2e/accessibility.spec.ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of ['/', '/es', '/en']) {
  test(`${path} has no serious accessibility violations or horizontal overflow`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    const result = await new AxeBuilder({ page }).analyze()
    expect(result.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })
}
```

- [ ] **Step 4: Add scripts and run**

Add to `package.json`:

```json
"test:e2e": "playwright test",
"test:a11y": "playwright test tests/e2e/accessibility.spec.ts"
```

Run: `pnpm exec playwright install chromium && pnpm test:a11y`

Expected: all 12 route/viewport cases pass.

- [ ] **Step 5: Run the phase acceptance suite**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm test:a11y && pnpm build`

Expected: every command exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e/accessibility.spec.ts
git commit -m "test(ui): add responsive accessibility coverage"
```
