# Phase 3 Dashboard, Session, Plan, and Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Vekira’s core authenticated experience around today’s action, frictionless session logging, a comprehensible weekly plan, and one unified progress destination.

**Architecture:** Preserve existing server queries and training logic while adding pure view-model functions between data and presentation. Build smaller page sections that consume those models, and reuse existing schedule, history, progression, and measurement components rather than duplicating data access.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase, Zustand, Framer Motion, Vitest, Playwright, Axe.

## Global Constraints

- Do not change deterministic plan generation, session access rules, progression formulas, or RLS.
- Preserve local session backup, wake lock, haptics, timers, Android back handling, and offline recovery.
- Exactly one primary action per screen.
- Coach access is contextual; do not restore the global floating action button.
- All charts require a textual summary and educational empty state.
- No payment work.

---

### Task 1: Dashboard hierarchy and single-banner policy

**Files:**
- Create: `src/components/dashboard/dashboardViewModel.ts`
- Create: `src/components/dashboard/__tests__/dashboardViewModel.test.ts`
- Create: `src/components/dashboard/TodayActionCard.tsx`
- Create: `src/components/dashboard/WeeklyStatus.tsx`
- Create: `src/components/dashboard/NextRecommendation.tsx`
- Create: `src/components/dashboard/SecondaryMetrics.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/DashboardHeader.tsx`
- Modify: `src/components/dashboard/DashboardPromoBanner.tsx`
- Modify: `src/components/dashboard/CheckInBanner.tsx`
- Modify: `src/components/dashboard/AINotesBanner.tsx`

**Interfaces:**
- Produces: `buildDashboardViewModel(input): DashboardViewModel` and `selectDashboardNotice(input): DashboardNotice | null`.
- Consumes: existing dashboard RPC payload, workout schedule helpers, banner data, check-in due state, and active plan.

- [ ] **Step 1: Write dashboard-priority tests**

```ts
// src/components/dashboard/__tests__/dashboardViewModel.test.ts
import { describe, expect, it } from 'vitest'
import { selectDashboardNotice } from '../dashboardViewModel'

describe('dashboard notice priority', () => {
  it('shows blocking plan generation before promotional content', () => {
    expect(selectDashboardNotice({ needsPlan: true, checkInDue: true, aiNotes: 'ready', promo: { title: 'Promo' } }))
      .toMatchObject({ kind: 'needs-plan' })
  })

  it('shows at most one non-blocking notice', () => {
    expect(selectDashboardNotice({ needsPlan: false, checkInDue: true, aiNotes: 'ready', promo: { title: 'Promo' } }))
      .toMatchObject({ kind: 'check-in' })
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/dashboard/__tests__/dashboardViewModel.test.ts`

Expected: FAIL because the view model is absent.

- [ ] **Step 3: Implement the priority model**

```ts
export type DashboardNotice =
  | { kind: 'needs-plan' }
  | { kind: 'check-in' }
  | { kind: 'ai-notes'; text: string }
  | { kind: 'promo'; title: string }

export function selectDashboardNotice(input: {
  needsPlan: boolean
  checkInDue: boolean
  aiNotes: string | null
  promo: { title: string } | null
}): DashboardNotice | null {
  if (input.needsPlan) return { kind: 'needs-plan' }
  if (input.checkInDue) return { kind: 'check-in' }
  if (input.aiNotes) return { kind: 'ai-notes', text: input.aiNotes }
  if (input.promo) return { kind: 'promo', title: input.promo.title }
  return null
}
```

Extend the view model with `today`, `weekly`, `recommendation`, and `secondaryMetrics` fields derived from existing page data without introducing new database requests.

- [ ] **Step 4: Recompose the page**

Render in this exact order: `DashboardHeader`, one selected notice, `TodayActionCard`, `WeeklyStatus`, `NextRecommendation`, `SecondaryMetrics`, and relevant social activity. The primary CTA is the session link when today has an available workout; otherwise it explains rest or the next scheduled day. Add a contextual link to `/chat` beside the recommendation, not as floating chrome.

- [ ] **Step 5: Verify dashboard**

Run: `pnpm test -- src/components/dashboard && pnpm type-check && pnpm lint`

Expected: PASS and no page renders more than one banner component.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard src/app/'(app)'/dashboard/page.tsx
git commit -m "feat(dashboard): focus home on today and progress"
```

### Task 2: Active-session logging hierarchy and sync state

**Files:**
- Create: `src/components/session/sessionViewModel.ts`
- Create: `src/components/session/__tests__/sessionViewModel.test.ts`
- Create: `src/components/session/SessionSyncStatus.tsx`
- Create: `src/components/session/PreviousPerformance.tsx`
- Modify: `src/app/(app)/session/[workoutId]/SessionClient.tsx`
- Modify: `src/components/session/ExerciseCard.tsx`
- Modify: `src/components/session/SetRow.tsx`
- Modify: `src/components/session/RestTimer.tsx`
- Modify: `src/components/session/CompletionScreen.tsx`
- Modify: `src/store/sessionStore.ts`

**Interfaces:**
- Produces: `SessionSyncState = 'saved-local' | 'syncing' | 'synced' | 'error'` and `setInputMode(exerciseKind)`.
- Consumes: existing session store, persistence helper, save action, exercise history, and rest timer.

- [ ] **Step 1: Write pure presentation tests**

```ts
// src/components/session/__tests__/sessionViewModel.test.ts
import { describe, expect, it } from 'vitest'
import { sessionSyncLabel, setInputMode } from '../sessionViewModel'

describe('session presentation', () => {
  it('uses numeric keyboards for workout values', () => {
    expect(setInputMode('weight')).toBe('decimal')
    expect(setInputMode('reps')).toBe('numeric')
    expect(setInputMode('rpe')).toBe('decimal')
  })

  it('localizes explicit sync states', () => {
    expect(sessionSyncLabel('saved-local', 'es')).toBe('Guardado en este dispositivo')
    expect(sessionSyncLabel('error', 'en')).toBe('Sync failed · retry')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/session/__tests__/sessionViewModel.test.ts`

Expected: FAIL because the view model is absent.

- [ ] **Step 3: Implement sync and input contracts**

```ts
export type SessionSyncState = 'saved-local' | 'syncing' | 'synced' | 'error'
export type SetFieldKind = 'weight' | 'reps' | 'rpe'

export const setInputMode = (kind: SetFieldKind): 'numeric' | 'decimal' =>
  kind === 'reps' ? 'numeric' : 'decimal'

const LABELS = {
  es: { 'saved-local': 'Guardado en este dispositivo', syncing: 'Sincronizando', synced: 'Sincronizado', error: 'Falló la sincronización · reintentar' },
  en: { 'saved-local': 'Saved on this device', syncing: 'Syncing', synced: 'Synced', error: 'Sync failed · retry' },
} as const

export function sessionSyncLabel(state: SessionSyncState, locale: 'es' | 'en') {
  return LABELS[locale][state]
}
```

- [ ] **Step 4: Recompose active exercise controls**

Keep exercise title, image, and current set above the fold. `SetRow` inputs use `inputMode`, `aria-label`, minimum 44 px height, and visible units. Render `PreviousPerformance` immediately above the current sets. Keep replace/skip/add-for-today under the existing secondary menu.

Store `syncState` in `SessionClient`, not the persisted workout payload. Set `saved-local` after every local backup, `syncing` before server save, `synced` after success, and `error` after failure. `SessionSyncStatus` exposes a retry button only in `error`.

- [ ] **Step 5: Simplify completion**

Order completion content as: session complete, concrete records/improvements, weekly continuity, progression suggestions, share action, dashboard action. Motion must respect the global reduced-motion CSS and must not block navigation.

- [ ] **Step 6: Verify session regression**

Run: `pnpm test -- src/components/session src/lib/session src/app/actions/__tests__/saveSession.test.ts && pnpm type-check`

Expected: all existing persistence and save tests remain green.

- [ ] **Step 7: Commit**

```bash
git add src/components/session src/app/'(app)'/session src/store/sessionStore.ts
git commit -m "feat(session): clarify logging and sync feedback"
```

### Task 3: Weekly plan summary and recommendation context

**Files:**
- Create: `src/components/plan/planViewModel.ts`
- Create: `src/components/plan/__tests__/planViewModel.test.ts`
- Create: `src/components/plan/WeeklyPlanSummary.tsx`
- Create: `src/components/plan/PlanDayTimeline.tsx`
- Create: `src/components/plan/AppliedConstraints.tsx`
- Modify: `src/app/(app)/plan/page.tsx`
- Modify: `src/components/plan/PlanViewTabs.tsx`
- Modify: `src/components/plan/WorkoutExerciseManager.tsx`

**Interfaces:**
- Produces: `buildPlanDaySummaries(workouts, exerciseCounts)` and `appliedConstraintLabels(profile, locale)`.
- Consumes: existing plan/workout queries, plan edit actions, adjustment button, and profile constraints.

- [ ] **Step 1: Write summary tests**

```ts
// src/components/plan/__tests__/planViewModel.test.ts
import { describe, expect, it } from 'vitest'
import { buildPlanDaySummaries } from '../planViewModel'

describe('weekly plan summary', () => {
  it('sorts scheduled workouts and preserves unscheduled sessions last', () => {
    const result = buildPlanDaySummaries([
      { id: 'b', dayOfWeek: 5, name: 'Lower', duration: 50 },
      { id: 'a', dayOfWeek: 1, name: 'Upper', duration: 45 },
      { id: 'c', dayOfWeek: null, name: 'Optional', duration: 30 },
    ], { a: 6, b: 5, c: 3 })
    expect(result.map(day => day.id)).toEqual(['a', 'b', 'c'])
    expect(result[0].exerciseCount).toBe(6)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/plan/__tests__/planViewModel.test.ts`

Expected: FAIL because the view model is absent.

- [ ] **Step 3: Implement and render the weekly overview**

Implement a stable numeric sort for ISO weekdays and map duration/exercise count. Render `WeeklyPlanSummary` before editing controls and `PlanDayTimeline` for the week. On mobile, days are horizontally scrollable tabs with visible selected state; on desktop, use a vertical timeline.

- [ ] **Step 4: Separate intent-changing actions**

Use distinct labels and placements:

- `Editar detalles` for direct fields.
- `Reemplazar ejercicio` for catalog substitution.
- `Pedir ajuste al coach` for interpreted structural changes.

Render `AppliedConstraints` from profile location, equipment, session duration, and cleared restrictions. Do not display raw medical free text.

- [ ] **Step 5: Verify plan editing**

Run: `pnpm test -- src/components/plan src/app/actions/__tests__/plan.logic.test.ts && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/plan src/app/'(app)'/plan/page.tsx
git commit -m "feat(plan): add comprehensible weekly plan overview"
```

### Task 4: Unified progress destination

**Files:**
- Modify: `src/app/(app)/progress/page.tsx`
- Create: `src/app/(app)/progress/loading.tsx`
- Create: `src/components/progress/ProgressHub.tsx`
- Create: `src/components/progress/progressSummary.ts`
- Create: `src/components/progress/__tests__/progressSummary.test.ts`
- Create: `src/components/progress/MetricTextSummary.tsx`
- Modify: `src/components/history/ExerciseProgressionSection.tsx`
- Modify: `src/components/calendar/CalendarSummary.tsx`
- Modify: `src/components/measurements/MeasurementsClient.tsx`

**Interfaces:**
- Produces: `/progress` and `summarizeProgress(input, locale)`.
- Consumes: existing history, calendar, exercise progression, records, and measurement data sources.

- [ ] **Step 1: Write summary tests**

```ts
// src/components/progress/__tests__/progressSummary.test.ts
import { describe, expect, it } from 'vitest'
import { summarizeProgress } from '../progressSummary'

describe('progress summary', () => {
  it('returns an educational empty state without inventing change', () => {
    expect(summarizeProgress({ sessions: 0, volumeNow: 0, volumeBefore: 0, records: 0 }, 'es'))
      .toBe('Completa tu primera sesión para empezar a medir constancia, volumen y marcas.')
  })

  it('describes measured improvement', () => {
    expect(summarizeProgress({ sessions: 6, volumeNow: 12000, volumeBefore: 10000, records: 2 }, 'en'))
      .toContain('20%')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm test -- src/components/progress/__tests__/progressSummary.test.ts`

Expected: FAIL because the progress module is absent.

- [ ] **Step 3: Implement the hub and reuse existing data**

`/progress` loads the same authenticated sources currently used by history, calendar, and measurements. `ProgressHub` renders sections in this order: consistency, volume, records, body evolution, exercise progression. It supports 4-, 12-, and 24-week ranges without changing stored data.

Each chart renders `MetricTextSummary` with an `aria-live="polite"` sentence. When data is insufficient, render the tested educational state instead of an empty SVG.

- [ ] **Step 4: Preserve old deep links**

Keep `/history`, `/calendario`, `/medidas`, and exercise detail routes working. Add links from the hub; do not redirect until usage and external links are audited.

- [ ] **Step 5: Verify progress**

Run: `pnpm test -- src/components/progress src/components/history src/lib/progression && pnpm type-check && pnpm lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/'(app)'/progress src/components/progress src/components/history/ExerciseProgressionSection.tsx src/components/calendar/CalendarSummary.tsx src/components/measurements/MeasurementsClient.tsx
git commit -m "feat(progress): unify training progress insights"
```

### Task 5: Core-product browser acceptance

**Files:**
- Create: `tests/e2e/core-product.spec.ts`
- Create: `scripts/capture-marketing-screenshots.ts`
- Create: `public/marketing/dashboard-es.webp`
- Create: `public/marketing/session-es.webp`
- Create: `public/marketing/progress-es.webp`
- Create: `public/marketing/dashboard-en.webp`
- Create: `public/marketing/session-en.webp`
- Create: `public/marketing/progress-en.webp`
- Modify: `src/components/marketing/ProductPreviewSection.tsx`
- Modify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**
- Produces: authenticated core-flow acceptance suite.
- Consumes: seeded E2E account and active plan fixture.

- [ ] **Step 1: Add one complete core journey**

```ts
test('user starts, logs, and completes today workout', async ({ page }) => {
  await signInAsE2EUser(page)
  await page.goto('/dashboard')
  await page.getByRole('link', { name: /comenzar entrenamiento/i }).click()
  await page.getByLabel('Peso, serie 1').fill('40')
  await page.getByLabel('Repeticiones, serie 1').fill('10')
  await page.getByRole('button', { name: /completar serie/i }).click()
  await expect(page.getByText(/guardado en este dispositivo/i)).toBeVisible()
})
```

Define `signInAsE2EUser` in `tests/e2e/helpers/auth.ts` using `E2E_USER_EMAIL` and `E2E_USER_PASSWORD`; fail immediately with a clear error when either variable is absent.

- [ ] **Step 2: Add route-level accessibility checks**

Run Axe on `/dashboard`, one active `/session/[id]`, `/plan`, and `/progress`. Assert one H1, one visible primary action, 44 px controls, and no horizontal overflow.

- [ ] **Step 3: Capture real localized product screenshots**

`scripts/capture-marketing-screenshots.ts` signs in with the E2E account, sets Spanish, captures stable `[data-marketing-capture]` regions on dashboard, active session, and progress at 390 × 844, then repeats after switching to English. It writes the six WebP files listed above with animations disabled and no personal email/name visible. `ProductPreviewSection` selects the locale-matched assets through `next/image`, with descriptive alt text and reserved aspect ratio.

- [ ] **Step 4: Run the phase acceptance suite**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm test:e2e && pnpm build`

Expected: all commands exit 0; existing training-engine and save-session tests remain green.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e scripts/capture-marketing-screenshots.ts public/marketing src/components/marketing/ProductPreviewSection.tsx
git commit -m "test(product): cover redesigned core training journey"
```
