# Plan Summary and Exercise Chart Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three redundant plan-summary labels and keep the exercise progress card, period selector, and chart scroll behavior contained on mobile screens.

**Architecture:** Keep profile data and training calculations unchanged. Narrow `appliedConstraintLabels` to safety-relevant movement notices, then fix the exercise chart at the layout boundary by allowing its grid item to shrink while preserving the bars' existing minimum width inside a dedicated horizontal scroll area.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Vitest, Playwright.

## Global Constraints

- Work directly on the existing `main` branch; do not create a worktree or feature branch.
- Do not modify profile persistence, plan generation, exercise calculations, or database schema.
- Keep the top summary cards for days per week, session duration, and level unchanged.
- Preserve cleared movement-restriction notices in Spanish and English.
- Preserve the chart bars' current minimum width and contain horizontal scrolling inside the chart.
- Keep 4, 12, and 24 week controls at least 44 px high and fully inside the card.
- Do not change other `PeriodSelector` consumers.
- Preserve the untracked `.superpowers/` directory and any unrelated user changes.

---

## File Map

- `src/components/plan/planViewModel.ts`: builds the safety notices shown below the plan overview.
- `src/components/plan/__tests__/planViewModel.test.ts`: specifies which profile details may appear in that notice strip.
- `src/components/exercises/ExerciseProgressChart.tsx`: owns the progress card, period selector, bars, and internal horizontal scroll area.
- `tests/e2e/training-evidence.spec.ts`: exercises the real seeded exercise-detail route at responsive Playwright viewports.
- `tests/e2e/helpers/acceptance.ts`: provides the existing page-level horizontal-overflow assertion.

### Task 1: Remove redundant plan-summary labels while preserving safety notices

**Files:**
- Modify: `src/components/plan/__tests__/planViewModel.test.ts:94-138`
- Modify: `src/components/plan/planViewModel.ts:57-61,170-174,187-209`

**Interfaces:**
- Consumes: `appliedConstraintLabels(profile: PlanProfileConstraints, locale: AppLanguage): string[]`.
- Produces: the same function signature, now returning only cleared movement-restriction notices.

- [ ] **Step 1: Rewrite the Spanish expectation as the desired failing contract**

Replace the expectation in `summarizes safe profile constraints without exposing raw medical text` with:

```ts
expect(result).toEqual([
  '1 restricción autorizada considerada',
])
expect(result.join(' ')).not.toMatch(/rodilla|sentadilla|hombro|press|molestia/i)
```

This keeps the existing input intentionally populated with `gymType`, `availableEquipment`, and `sessionDurationMinutes`, proving those values no longer leak into the summary.

- [ ] **Step 2: Rewrite the English test to cover omission and plural localization**

Replace `localizes location and duration labels in English` with these two assertions:

```ts
it('omits non-safety profile details when no cleared restriction exists', () => {
  expect(appliedConstraintLabels({
    gymType: 'full_gym',
    availableEquipment: ['dumbbells'],
    sessionDurationMinutes: 60,
    injuries: null,
    readinessStatus: 'cleared',
    movementLimitations: [],
  }, 'en')).toEqual([])
})

it('localizes multiple cleared restriction notices in English', () => {
  expect(appliedConstraintLabels({
    movementLimitations: [
      { status: 'stable', clinicianCleared: true },
      { status: 'stable', clinician_cleared: true },
    ],
  }, 'en')).toEqual(['2 cleared restrictions considered'])
})
```

- [ ] **Step 3: Run the focused unit test and verify RED**

Run:

```bash
npx vitest run src/components/plan/__tests__/planViewModel.test.ts
```

Expected: FAIL because the current result still includes the gym, equipment, and session-duration labels.

- [ ] **Step 4: Implement the minimal view-model change**

In `src/components/plan/planViewModel.ts`:

1. Delete `GYM_LABELS`.
2. Delete `safeStringList`.
3. Remove `gymLabel`, `equipment`, and their three label-producing branches.
4. Keep only the cleared restriction count and its singular/plural localization.

The resulting function body must be:

```ts
export function appliedConstraintLabels(
  profile: PlanProfileConstraints,
  locale: AppLanguage,
): string[] {
  const t = (source: string, values?: Record<string, string | number>) => translate(locale, source, values)
  const labels: string[] = []
  const clearedCount = clearedLimitationCount(profile.movementLimitations)

  if (clearedCount === 1) {
    labels.push(t('{count} restricción autorizada considerada', { count: clearedCount }))
  } else if (clearedCount > 1) {
    labels.push(t('{count} restricciones autorizadas consideradas', { count: clearedCount }))
  }

  return labels
}
```

Retain the existing `PlanProfileConstraints` fields so callers and profile-data contracts remain unchanged.

- [ ] **Step 5: Run the focused unit test and verify GREEN**

Run:

```bash
npx vitest run src/components/plan/__tests__/planViewModel.test.ts
```

Expected: all tests in the file PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/components/plan/planViewModel.ts src/components/plan/__tests__/planViewModel.test.ts
git commit -m "fix(plan): remove redundant summary labels"
```

### Task 2: Contain the mobile exercise chart and enable internal scrolling

**Files:**
- Modify: `tests/e2e/training-evidence.spec.ts:1-28`
- Modify: `src/components/exercises/ExerciseProgressChart.tsx:34-63`

**Interfaces:**
- Consumes: the existing semantic region named by `exercise-progress-title`, the period selector's `aria-label`, and the bars' `role="group"`.
- Produces: unchanged `ExerciseProgressChart({ points, todayStr, locale })` props and behavior, with a shrinkable card and internal horizontal scroll boundary.

- [ ] **Step 1: Add the existing overflow helper import**

Add this import to `tests/e2e/training-evidence.spec.ts`:

```ts
import { expectNoHorizontalOverflow } from './helpers/acceptance'
```

- [ ] **Step 2: Write the failing mobile geometry and scroll test**

Append this test:

```ts
test('exercise chart keeps period controls inside the mobile card and scrolls bars internally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'Mobile responsive contract')
  test.setTimeout(120_000)

  const fixture = await seedCoreProductFixture('es')
  await seedCoreProgressHistory(fixture)
  await signInAsE2EUser(page)
  await page.goto(`/exercises/${fixture.exerciseId}`)

  const chart = page.getByRole('region', { name: /evolución de fuerza|strength evolution/i })
  const selector = chart.locator('[aria-label="Seleccionar periodo del gráfico"]')
  const bars = chart.getByRole('group', { name: /peso máximo por aparición|maximum weight by appearance/i })
  const scrollArea = bars.locator('..')

  await expect(chart).toBeVisible()
  await expect(selector).toBeVisible()
  await expect(bars).toBeVisible()

  for (const width of [375, 498]) {
    await page.setViewportSize({ width, height: 1080 })

    const viewport = page.viewportSize()
    const chartBox = await chart.boundingBox()
    const selectorBox = await selector.boundingBox()
    expect(viewport).not.toBeNull()
    expect(chartBox).not.toBeNull()
    expect(selectorBox).not.toBeNull()
    if (!viewport || !chartBox || !selectorBox) throw new Error('Exercise chart geometry is unavailable')

    expect(chartBox.x).toBeGreaterThanOrEqual(0)
    expect(chartBox.x + chartBox.width).toBeLessThanOrEqual(viewport.width)
    expect(selectorBox.x).toBeGreaterThanOrEqual(chartBox.x)
    expect(selectorBox.x + selectorBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width)
    await expectNoHorizontalOverflow(page)

    const scrollMetrics = await scrollArea.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth)

    await scrollArea.evaluate(element => {
      element.scrollLeft = element.scrollWidth
    })
    expect(await scrollArea.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  }
})
```

- [ ] **Step 3: Run the mobile E2E test and verify RED**

Run:

```bash
npx playwright test tests/e2e/training-evidence.spec.ts --project=mobile-375 --grep "exercise chart keeps"
```

Expected: FAIL because `chartBox.x + chartBox.width` or the selector's right edge exceeds the 375 px or 498 px viewport.

- [ ] **Step 4: Implement the minimal responsive containment fix**

In `src/components/exercises/ExerciseProgressChart.tsx`, apply these class changes:

```tsx
<section
  className="w-full min-w-0 max-w-full rounded-3xl border border-border/60 bg-muted/[0.05] p-4 sm:p-6"
  aria-labelledby="exercise-progress-title"
>
  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
```

Pass the shrinkable width contract to the selector:

```tsx
className="w-full min-w-0 max-w-full sm:w-[19rem]"
```

Constrain the existing scroll area without changing the bars' calculated minimum width:

```tsx
<div className="mt-6 max-w-full overflow-x-auto overscroll-x-contain pb-2">
```

Do not change the `Math.max(544, ...)` calculation, bar rendering, filtering, selected point, or session link.

- [ ] **Step 5: Run the mobile E2E test and verify GREEN**

Run:

```bash
npx playwright test tests/e2e/training-evidence.spec.ts --project=mobile-375 --grep "exercise chart keeps"
```

Expected: PASS at both 375 px and 498 px, with card and selector bounds inside the viewport, page-level overflow absent, and `scrollLeft > 0` inside the chart.

- [ ] **Step 6: Run the complete training-evidence journey on all configured viewports**

Run:

```bash
npx playwright test tests/e2e/training-evidence.spec.ts
```

Expected: existing journey PASS on mobile, tablet, and desktop projects; the mobile responsive test PASS on `mobile-375` and SKIP on the other projects.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/components/exercises/ExerciseProgressChart.tsx tests/e2e/training-evidence.spec.ts
git commit -m "fix(exercises): contain mobile progress chart"
```

### Task 3: Run regression and production verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the two committed task deliverables.
- Produces: verification evidence suitable for completion and push decisions.

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: all Vitest tests PASS.

- [ ] **Step 2: Run TypeScript validation**

```bash
npm run type-check
```

Expected: exit code 0 with no type errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: exit code 0 with no new lint errors.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 5: Inspect final repository state**

```bash
git status --short --branch
git log -4 --oneline --decorate
```

Expected: `main` contains the design, plan, plan-summary fix, and chart fix commits; only the pre-existing `.superpowers/` directory remains untracked.

## Completion Criteria

- The three marked plan-summary labels are absent.
- Cleared movement-restriction notices remain localized and visible when present.
- The exercise chart and all period buttons stay within 375 px and 498 px mobile widths.
- Only the bars area scrolls horizontally, with a positive reachable `scrollLeft`.
- The page does not develop horizontal overflow.
- Unit tests, responsive E2E, type-check, lint, and production build pass.
