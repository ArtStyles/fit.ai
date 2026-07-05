# Phase 4 Community, Profiles, Settings, and Accessibility Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align community, profiles, and settings with the new product hierarchy, then close remaining accessibility and responsive defects across authenticated routes.

**Architecture:** Keep existing social actions, privacy rules, and database schema. Add presentation models that prioritize workout context over vanity metrics, consolidate settings navigation without breaking deep links, and use the shared browser suite as a release gate.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase, Vitest, Playwright, Axe.

## Global Constraints

- Preserve social RLS, blocking, reporting, private-account, follow-request, and push-notification behavior.
- Display privacy state before publishing.
- Training actions and statistics take priority over likes and follower counts.
- Existing settings URLs remain valid.
- No payment work.
- Meet WCAG 2.2 AA at all four required viewports.

---

### Task 1: Workout-first feed and share templates

**Files:**
- Create: `src/components/social/postPresentation.ts`
- Create: `src/components/social/__tests__/postPresentation.test.ts`
- Create: `src/components/social/WorkoutShareTemplate.tsx`
- Create: `src/components/social/FeedEmptyState.tsx`
- Modify: `src/components/social/PostFeed.tsx`
- Modify: `src/components/social/PostCard.tsx`
- Modify: `src/components/social/PostComposer.tsx`
- Modify: `src/components/social/ShareSessionButton.tsx`
- Modify: `src/components/social/ShareRoutineButton.tsx`
- Modify: `src/app/(app)/feed/page.tsx`

**Interfaces:**
- Produces: `buildPostPresentation(post, locale)` and `WorkoutShareTemplate`.
- Consumes: existing `FeedPost`, snapshot builders, composer actions, media, privacy profile, and report menu.

- [ ] **Step 1: Write post-priority tests**

```ts
// src/components/social/__tests__/postPresentation.test.ts
import { describe, expect, it } from 'vitest'
import { buildPostPresentation } from '../postPresentation'

describe('social post presentation', () => {
  it('prioritizes workout result before engagement', () => {
    const result = buildPostPresentation({
      kind: 'session', title: 'Upper', durationMinutes: 48,
      volumeKg: 6400, records: 2, likes: 18, comments: 3,
    }, 'es')
    expect(result.primary).toContain('Upper')
    expect(result.metrics.slice(0, 3).map(item => item.key)).toEqual(['duration', 'volume', 'records'])
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/social/__tests__/postPresentation.test.ts`

Expected: FAIL because the presentation model is absent.

- [ ] **Step 3: Implement the presentation model and template**

The model returns `primary`, `subtitle`, `metrics`, and `engagement`. It never recalculates stored workout data. `WorkoutShareTemplate` renders title, duration, volume, records, and Vekira mark in a stable 4:5 layout suitable for feed and exported media.

- [ ] **Step 4: Recompose feed and composer**

Render post author/context, training result, media, caption, then engagement. Show current privacy state (`Público` or `Seguidores aprobados`) beside the publish action. Replace the generic empty paragraph with `FeedEmptyState`, offering user discovery and first-session sharing actions.

- [ ] **Step 5: Verify social behavior**

Run: `pnpm test -- src/components/social src/lib/social && pnpm type-check && pnpm lint`

Expected: PASS; snapshot tests remain green or are intentionally updated for the new template.

- [ ] **Step 6: Commit**

```bash
git add src/components/social src/app/'(app)'/feed/page.tsx src/lib/social/__tests__
git commit -m "feat(social): prioritize training achievements in feed"
```

### Task 2: Athlete-first public profiles and discovery

**Files:**
- Create: `src/components/social/profilePresentation.ts`
- Create: `src/components/social/__tests__/profilePresentation.test.ts`
- Create: `src/components/social/ProfileTrainingSummary.tsx`
- Modify: `src/app/(app)/u/[username]/page.tsx`
- Modify: `src/components/social/ProfileConnectionsStats.tsx`
- Modify: `src/components/social/ProfilePostGrid.tsx`
- Modify: `src/components/social/UserSearch.tsx`
- Modify: `src/components/social/UserRow.tsx`

**Interfaces:**
- Produces: `buildVisibleProfileStats(profile, viewer)` and `ProfileTrainingSummary`.
- Consumes: existing public-profile RPC/view, privacy status, follow relationship, and visible posts.

- [ ] **Step 1: Write privacy-aware profile tests**

```ts
// src/components/social/__tests__/profilePresentation.test.ts
import { describe, expect, it } from 'vitest'
import { buildVisibleProfileStats } from '../profilePresentation'

describe('profile presentation', () => {
  it('hides training details from an unapproved private viewer', () => {
    const result = buildVisibleProfileStats(
      { isPrivate: true, weeklySessions: 4, streak: 8, totalSessions: 30 },
      { isOwner: false, follows: false },
    )
    expect(result.training).toBeNull()
  })

  it('puts training summary before social counts for visible profiles', () => {
    const result = buildVisibleProfileStats(
      { isPrivate: false, weeklySessions: 4, streak: 8, totalSessions: 30 },
      { isOwner: false, follows: false },
    )
    expect(result.training).toMatchObject({ weeklySessions: 4, streak: 8 })
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/social/__tests__/profilePresentation.test.ts`

Expected: FAIL because helper is absent.

- [ ] **Step 3: Implement and render profile hierarchy**

After avatar, username, and follow action, render `ProfileTrainingSummary` with weekly sessions, streak, and completed-session count when privacy permits. Render follower/following counts second and posts third. For private profiles, keep the existing notice and do not fetch or serialize hidden training metrics.

- [ ] **Step 4: Improve discovery labels**

Where profile data already exposes it, show goal, level, or training style as optional discovery labels. Do not add new sensitive profile fields or infer categories from private logs.

- [ ] **Step 5: Verify profiles**

Run: `pnpm test -- src/components/social src/lib/social && pnpm type-check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/social src/app/'(app)'/u
git commit -m "feat(profiles): lead with visible training context"
```

### Task 3: Consolidated settings information architecture

**Files:**
- Create: `src/components/settings/settingsSections.ts`
- Create: `src/components/settings/__tests__/settingsSections.test.ts`
- Create: `src/components/settings/SettingsSectionCard.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/components/settings/SettingsScreen.tsx`
- Modify: `src/app/(app)/settings/perfil/page.tsx`
- Modify: `src/app/(app)/settings/datos/page.tsx`
- Modify: `src/app/(app)/settings/entrenamiento/page.tsx`
- Modify: `src/app/(app)/settings/notificaciones/page.tsx`
- Modify: `src/app/(app)/settings/idioma/page.tsx`
- Modify: `src/app/(app)/settings/cuenta/page.tsx`

**Interfaces:**
- Produces: `SETTINGS_GROUPS` and `settingsGroupForPath(path)`.
- Consumes: existing settings forms/actions and admin visibility.

- [ ] **Step 1: Write information-architecture tests**

```ts
// src/components/settings/__tests__/settingsSections.test.ts
import { describe, expect, it } from 'vitest'
import { SETTINGS_GROUPS, settingsGroupForPath } from '../settingsSections'

describe('settings groups', () => {
  it('uses the approved six groups', () => {
    expect(SETTINGS_GROUPS.map(group => group.id)).toEqual([
      'profile', 'training', 'privacy-security', 'notifications', 'language', 'account',
    ])
  })

  it('maps existing routes without breaking deep links', () => {
    expect(settingsGroupForPath('/settings/perfil')).toBe('profile')
    expect(settingsGroupForPath('/settings/datos')).toBe('privacy-security')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/settings/__tests__/settingsSections.test.ts`

Expected: FAIL because the groups module is absent.

- [ ] **Step 3: Define the six groups**

```ts
export const SETTINGS_GROUPS = [
  { id: 'profile', label: 'Perfil', href: '/settings/perfil' },
  { id: 'training', label: 'Entrenamiento', href: '/settings/entrenamiento' },
  { id: 'privacy-security', label: 'Privacidad y seguridad', href: '/settings/datos' },
  { id: 'notifications', label: 'Notificaciones', href: '/settings/notificaciones' },
  { id: 'language', label: 'Idioma', href: '/settings/idioma' },
  { id: 'account', label: 'Cuenta', href: '/settings/cuenta' },
] as const
```

`settingsGroupForPath` matches exact group href and nested paths, returning `null` otherwise.

- [ ] **Step 4: Recompose settings without route deletion**

Render six `SettingsSectionCard` entries with concise descriptions and consistent icons. Keep `/medidas` linked under training and keep admin as a separate conditional section. Every subpage retains `SettingsScreen`, one H1, a back link to `/settings`, and its existing server action.

- [ ] **Step 5: Verify settings**

Run: `pnpm test -- src/components/settings && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings src/app/'(app)'/settings
git commit -m "feat(settings): consolidate product preferences"
```

### Task 4: Authenticated-route accessibility closure

**Files:**
- Create: `scripts/audit-accessibility.mjs`
- Create: `docs/accessibility/ui-audit.md`
- Create: `tests/e2e/community-settings.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm audit:a11y` and a checked route matrix.
- Consumes: Playwright configuration, seeded authenticated test account, and Phase 1 tokens.

- [ ] **Step 1: Define the exact route matrix**

```js
// scripts/audit-accessibility.mjs
export const PUBLIC_ROUTES = ['/', '/es', '/en', '/register?locale=es']
export const AUTHENTICATED_ROUTES = [
  '/dashboard', '/plan', '/progress', '/history', '/calendario', '/medidas',
  '/feed', '/buscar', '/settings', '/settings/perfil', '/settings/datos',
  '/settings/entrenamiento', '/settings/notificaciones', '/settings/idioma', '/settings/cuenta',
]
```

- [ ] **Step 2: Extend the Axe test from the route matrix**

For every route, test critical/serious Axe violations, one H1, no horizontal overflow, visible focus on the first interactive element, and document zoom at 200%. Dynamic profile/session routes are supplied by fixture helpers and tested separately.

- [ ] **Step 3: Add community/settings behavior coverage**

Test private-profile concealment, composer privacy visibility, report-dialog keyboard operation, settings group navigation, language change, notification controls, and account deletion dialog without executing deletion.

- [ ] **Step 4: Add audit documentation and script**

Add `"audit:a11y": "playwright test tests/e2e/accessibility.spec.ts tests/e2e/community-settings.spec.ts"`. `docs/accessibility/ui-audit.md` contains the route matrix, viewport matrix, keyboard checklist, reader checklist, and a dated result table; it must contain actual PASS/FAIL results from the run, not unchecked placeholders.

- [ ] **Step 5: Run the phase acceptance suite**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm audit:a11y && pnpm build`

Expected: all commands exit 0 and the audit document records no unresolved critical or serious defects.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-accessibility.mjs docs/accessibility/ui-audit.md tests/e2e package.json
git commit -m "test(a11y): close authenticated interface audit"
```
