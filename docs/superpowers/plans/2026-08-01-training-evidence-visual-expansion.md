# Training Evidence Visual Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Vekira's approved Athlete Line visual system to Calendar, Progress, History, completed-session detail, and exercise detail as one responsive evidence journey.

**Architecture:** Keep authentication and initial queries in existing server pages, move repeated evidence calculations into pure `src/lib/training-evidence` helpers, and let small client components own only date/range/filter/disclosure state. Recompose each route around one dominant evidence surface plus a secondary insight column, while preserving existing routes, persistence, and domain rules.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5, Tailwind CSS 3, Vitest 4, Playwright 1.61, Supabase, Lucide React, existing Vekira i18n and UI primitives.

## Global Constraints

- Work on the current `main` branch as requested; do not create a migration or change the database schema.
- Do not add dependencies, readiness/recovery scores, estimated 1RM, or unbacked training recommendations.
- Preserve `/calendario`, `/progress`, `/history`, `/history/[logId]`, and `/exercises/[exerciseId]`.
- Keep violet for identity/selection, lime for immediate physical action, green for completed state, and orange for warning/effort.
- Every new user-facing string must resolve in Spanish and English through `src/lib/i18n/index.ts`.
- Use 44 × 44 px minimum touch targets, visible focus, semantic headings, non-color status labels, and `prefers-reduced-motion`.
- Use existing volume/best-set rules; unsupported duration/distance modalities must not be converted to kilograms.
- Verify 360 × 800, 390 × 844, 768 × 1024, and 1280 × 800 without horizontal clipping.
- Preserve the user-owned untracked `.superpowers/` directory and stage only task files.

---

## File Structure

### Shared evidence domain

- Create `src/lib/training-evidence/performance.ts`: normalize set arrays and calculate volume, best set, average RPE, and safe percentage changes.
- Create `src/lib/training-evidence/timeline.ts`: month filtering, comparable-session lookup, and chronological grouping.
- Create `src/lib/training-evidence/__tests__/performance.test.ts`.
- Create `src/lib/training-evidence/__tests__/timeline.test.ts`.

### Shared evidence presentation

- Create `src/components/evidence/EvidenceHero.tsx`.
- Create `src/components/evidence/MetricStrip.tsx`.
- Create `src/components/evidence/EvidenceInsight.tsx`.
- Create `src/components/evidence/PeriodSelector.tsx`.
- Create `src/components/evidence/DisclosureSection.tsx`.
- Create `src/components/evidence/SessionSummaryRow.tsx`.
- Create `src/components/evidence/EvidenceRouteError.tsx`.
- Create `src/components/evidence/__tests__/evidencePrimitives.test.tsx`.
- Modify `src/lib/i18n/index.ts` and `src/lib/i18n/__tests__/i18n.test.ts`.

### Calendar

- Create `src/components/calendar/calendarViewModel.ts` and `src/components/calendar/__tests__/calendarViewModel.test.ts`.
- Create `src/components/calendar/CalendarDayPanel.tsx`.
- Modify `src/lib/calendar/aggregate.ts` and its tests only for the new per-session summary type/aggregation.
- Modify `src/app/(app)/calendario/page.tsx`.
- Create `src/app/(app)/calendario/error.tsx` and modify `loading.tsx`.
- Modify `src/components/calendar/CalendarView.tsx`, `CalendarSummary.tsx`, `MonthGrid.tsx`, `ContributionHeatmap.tsx`, and `EmptyCalendar.tsx`.

### Progress

- Create `src/components/progress/progressViewModel.ts` and `src/components/progress/__tests__/progressViewModel.test.ts`.
- Create `src/components/progress/TrainingLoadChart.tsx`.
- Modify `src/app/(app)/progress/page.tsx`.
- Create `src/app/(app)/progress/error.tsx` and modify `loading.tsx`.
- Rewrite `src/components/progress/ProgressHub.tsx` around the new view model.
- Modify `src/components/progress/progressSummary.ts` and its test only where neutral copy must match the new snapshot rules.

### History and completed session

- Create `src/components/history/historyViewModel.ts` and `src/components/history/__tests__/historyViewModel.test.ts`.
- Create `src/components/history/HistoryHighlights.tsx`.
- Modify `src/app/(app)/history/page.tsx` and `src/components/history/HistorySessionList.tsx`.
- Create `src/app/(app)/history/error.tsx` and modify `loading.tsx`.
- Create `src/components/history/sessionDebrief.ts` and `src/components/history/__tests__/sessionDebrief.test.ts`.
- Create `src/components/history/SessionExerciseDisclosure.tsx`.
- Modify `src/app/(app)/history/[logId]/page.tsx`.

### Exercise detail

- Create `src/components/exercises/exerciseDetailViewModel.ts` and `src/components/exercises/__tests__/exerciseDetailViewModel.test.ts`.
- Create `src/components/exercises/ExerciseProgressChart.tsx`.
- Modify `src/app/(app)/exercises/[exerciseId]/page.tsx`.
- Create `src/app/(app)/exercises/error.tsx` and modify `loading.tsx`.

### Acceptance

- Modify `tests/e2e/helpers/core-product.ts`.
- Create `tests/e2e/training-evidence.spec.ts`.
- Modify `tests/e2e/accessibility.spec.ts`.

---

### Task 1: Centralize evidence calculations

**Files:**

- Create: `src/lib/training-evidence/performance.ts`
- Create: `src/lib/training-evidence/timeline.ts`
- Test: `src/lib/training-evidence/__tests__/performance.test.ts`
- Test: `src/lib/training-evidence/__tests__/timeline.test.ts`

**Interfaces:**

- Produces: `buildEvidenceSets`, `summarizeExercisePerformance`, `percentChange`, `findPreviousComparableSession`, `sessionsInMonth`, and `groupEvidenceSessions`.
- Consumes: ISO `YYYY-MM-DD` strings already generated with the user timezone.

- [ ] **Step 1: Write failing performance tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  buildEvidenceSets,
  percentChange,
  summarizeExercisePerformance,
} from '../performance'

describe('training evidence performance', () => {
  it('zips uneven set arrays without inventing values', () => {
    expect(buildEvidenceSets([40, 45], [10], [7, null])).toEqual([
      { weightKg: 40, reps: 10, rpe: 7 },
      { weightKg: 45, reps: 0, rpe: null },
    ])
  })

  it('uses load then reps to choose the best set', () => {
    expect(summarizeExercisePerformance([40, 45, 45], [10, 6, 8], [7, 8, 9])).toMatchObject({
      volumeKg: 1030,
      bestSet: { weightKg: 45, reps: 8, rpe: 9 },
      averageRpe: 8,
    })
  })

  it('requires a non-zero prior value for percentage change', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(120, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the performance test and confirm red**

Run: `pnpm vitest run src/lib/training-evidence/__tests__/performance.test.ts`

Expected: FAIL because `../performance` does not exist.

- [ ] **Step 3: Implement the pure performance contract**

```ts
export type EvidenceSet = { weightKg: number; reps: number; rpe: number | null }

export type ExercisePerformanceSummary = {
  sets: EvidenceSet[]
  completedSets: number
  volumeKg: number
  bestSet: EvidenceSet | null
  averageRpe: number | null
}

export function buildEvidenceSets(
  weights: number[] | null,
  reps: number[] | null,
  rpes: (number | null)[] | null = null,
): EvidenceSet[] {
  const size = Math.max(weights?.length ?? 0, reps?.length ?? 0, rpes?.length ?? 0)
  return Array.from({ length: size }, (_, index) => {
    const rpe = rpes?.[index]
    return {
      weightKg: Number(weights?.[index]) || 0,
      reps: Number(reps?.[index]) || 0,
      rpe: typeof rpe === 'number' ? rpe : null,
    }
  })
}

export function summarizeExercisePerformance(
  weights: number[] | null,
  reps: number[] | null,
  rpes: (number | null)[] | null = null,
): ExercisePerformanceSummary {
  const sets = buildEvidenceSets(weights, reps, rpes)
  const bestSet = sets.reduce<EvidenceSet | null>((best, set) => {
    if (!best || set.weightKg > best.weightKg) return set
    if (set.weightKg === best.weightKg && set.reps > best.reps) return set
    return best
  }, null)
  const recordedRpes = sets.flatMap(set => set.rpe === null ? [] : [set.rpe])
  return {
    sets,
    completedSets: sets.length,
    volumeKg: Math.round(sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0)),
    bestSet,
    averageRpe: recordedRpes.length === 0
      ? null
      : Math.round((recordedRpes.reduce((sum, value) => sum + value, 0) / recordedRpes.length) * 10) / 10,
  }
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
```

- [ ] **Step 4: Write failing timeline tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  findPreviousComparableSession,
  groupEvidenceSessions,
  sessionsInMonth,
  type EvidenceSession,
} from '../timeline'

const sessions: EvidenceSession[] = [
  { id: 'new', workoutId: 'w1', date: '2026-08-10', completedAt: '2026-08-10T10:00:00Z', volumeKg: 1200 },
  { id: 'other', workoutId: 'w2', date: '2026-08-09', completedAt: '2026-08-09T10:00:00Z', volumeKg: 900 },
  { id: 'old', workoutId: 'w1', date: '2026-08-03', completedAt: '2026-08-03T10:00:00Z', volumeKg: 1000 },
]

describe('training evidence timeline', () => {
  it('compares only the previous completed session of the same workout', () => {
    expect(findPreviousComparableSession(sessions, sessions[0])?.id).toBe('old')
  })

  it('filters a visible calendar month', () => {
    expect(sessionsInMonth(sessions, 2026, 8)).toHaveLength(3)
    expect(sessionsInMonth(sessions, 2026, 7)).toEqual([])
  })

  it('groups the current week before older months', () => {
    expect(groupEvidenceSessions(sessions, '2026-08-10')[0].key).toBe('current-week')
  })
})
```

- [ ] **Step 5: Run the timeline test and confirm red**

Run: `pnpm vitest run src/lib/training-evidence/__tests__/timeline.test.ts`

Expected: FAIL because `../timeline` does not exist.

- [ ] **Step 6: Implement deterministic timeline helpers**

```ts
import { shiftDateStr } from '@/lib/calendar/aggregate'

export type EvidenceSession = {
  id: string
  workoutId: string | null
  date: string
  completedAt: string
  volumeKg: number
}

export function findPreviousComparableSession(
  sessions: EvidenceSession[],
  current: EvidenceSession,
): EvidenceSession | null {
  if (!current.workoutId) return null
  return [...sessions]
    .filter(item => item.workoutId === current.workoutId && item.completedAt < current.completedAt)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] ?? null
}

export function sessionsInMonth(sessions: EvidenceSession[], year: number, month: number): EvidenceSession[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return sessions.filter(session => session.date.startsWith(prefix))
}

export function groupEvidenceSessions(sessions: EvidenceSession[], todayStr: string) {
  const [year, month, day] = todayStr.split('-').map(Number)
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  const weekStart = shiftDateStr(todayStr, -weekday)
  const groups = new Map<string, EvidenceSession[]>()
  for (const session of [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))) {
    const key = session.date >= weekStart ? 'current-week' : session.date.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), session])
  }
  return Array.from(groups, ([key, items]) => ({ key, sessions: items }))
}
```

- [ ] **Step 7: Run both helper suites**

Run: `pnpm vitest run src/lib/training-evidence/__tests__/performance.test.ts src/lib/training-evidence/__tests__/timeline.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 8: Commit shared evidence calculations**

```powershell
git add -- src/lib/training-evidence
git commit -m "feat: centralize training evidence metrics"
```

---

### Task 2: Build the shared evidence presentation system

**Files:**

- Create: `src/components/evidence/EvidenceHero.tsx`
- Create: `src/components/evidence/MetricStrip.tsx`
- Create: `src/components/evidence/EvidenceInsight.tsx`
- Create: `src/components/evidence/PeriodSelector.tsx`
- Create: `src/components/evidence/DisclosureSection.tsx`
- Create: `src/components/evidence/SessionSummaryRow.tsx`
- Create: `src/components/evidence/EvidenceRouteError.tsx`
- Test: `src/components/evidence/__tests__/evidencePrimitives.test.tsx`
- Modify: `src/lib/i18n/index.ts`
- Modify: `src/lib/i18n/__tests__/i18n.test.ts`

**Interfaces:**

- `EvidenceHero({ eyebrow, title, description, action, children })` renders an `h2`, never another page `h1`.
- `MetricStrip({ items })` renders labeled values with dividers and no nested cards.
- `EvidenceInsight({ title, children, tone })` pairs color with an icon and visible label.
- `PeriodSelector({ value, options, onChange, label })` uses `aria-pressed` buttons.
- `DisclosureSection({ summary, children, defaultOpen })` uses native `details/summary`.
- `SessionSummaryRow` accepts stable href, date/title/context, metrics, and one optional signal.

- [ ] **Step 1: Add failing rendering and localization tests**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EvidenceHero } from '../EvidenceHero'
import { MetricStrip } from '../MetricStrip'
import { translate } from '@/lib/i18n'

describe('evidence primitives', () => {
  it('keeps the page h1 owned by PageTopBar', () => {
    const html = renderToStaticMarkup(<EvidenceHero eyebrow="Evidence" title="Progress" description="Measured data" />)
    expect(html).toContain('<h2')
    expect(html).not.toContain('<h1')
  })

  it('renders metric labels beside values', () => {
    const html = renderToStaticMarkup(<MetricStrip items={[{ label: 'Sessions', value: '3', detail: '12 weeks' }]} />)
    expect(html).toContain('Sessions')
    expect(html).toContain('3')
  })

  it('has English copy for the evidence journey', () => {
    expect(translate('en', 'Evidencia acumulada')).toBe('Accumulated evidence')
    expect(translate('en', 'Secuencia de la sesión')).toBe('Session sequence')
    expect(translate('en', 'Pasaporte del movimiento')).toBe('Movement passport')
  })
})
```

- [ ] **Step 2: Run the primitive test and confirm red**

Run: `pnpm vitest run src/components/evidence/__tests__/evidencePrimitives.test.tsx`

Expected: FAIL because the evidence components do not exist.

- [ ] **Step 3: Create the server-safe structural primitives**

```tsx
export type MetricStripItem = { label: string; value: React.ReactNode; detail?: React.ReactNode }

export function MetricStrip({ items }: { items: MetricStripItem[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3" data-evidence-metrics>
      {items.map(item => (
        <div key={item.label} className="min-w-0 border-t border-border/60 pt-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{item.value}</dd>
          {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
        </div>
      ))}
    </dl>
  )
}
```

Create `EvidenceHero` with `rounded-3xl border border-violet-500/20 bg-violet-500/[0.06]`, `EvidenceInsight` with `data-evidence-tone`, and `DisclosureSection` using native `<details>` so keyboard behavior does not depend on JavaScript.

Create `EvidenceRouteError({ reset })` as a client wrapper around `ScreenState kind="error"` with a 44 px retry button that calls `reset()`; route `error.tsx` files will reuse it.

- [ ] **Step 4: Create the two client primitives**

```tsx
'use client'

export type PeriodOption<T extends number> = { value: T; label: string }

export function PeriodSelector<T extends number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: PeriodOption<T>[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/50 bg-background/40 p-1" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className="min-h-11 rounded-xl px-3 text-xs font-semibold transition-colors aria-pressed:bg-violet-600 aria-pressed:text-white">
          {option.label}
        </button>
      ))}
    </div>
  )
}
```

Create `SessionSummaryRow` as one `PendingLink` with a visible title/date, a `<dl>` metric row, optional `AchievementMarker`, and focus classes matching the violet selection token.

- [ ] **Step 5: Add the exact English catalog entries**

Add these key/value pairs to `ENGLISH` and to an `it.each` table in `src/lib/i18n/__tests__/i18n.test.ts`:

```ts
[
  ['Ritmo de entrenamiento', 'Training rhythm'],
  ['Días este mes', 'Days this month'],
  ['Racha actual', 'Current streak'],
  ['Actividad del mes', 'Monthly activity'],
  ['Día seleccionado', 'Selected day'],
  ['Resumen anual', 'Year overview'],
  ['Evidencia acumulada', 'Accumulated evidence'],
  ['Tu progreso tiene dirección', 'Your progress has direction'],
  ['Sin comparación', 'No comparison'],
  ['Ejercicios destacados', 'Highlighted exercises'],
  ['Registro cronológico', 'Chronological log'],
  ['Hitos recientes', 'Recent milestones'],
  ['Debrief de entrenamiento', 'Workout debrief'],
  ['Secuencia de la sesión', 'Session sequence'],
  ['Series completadas', 'Completed sets'],
  ['Mostrar series', 'Show sets'],
  ['Pasaporte del movimiento', 'Movement passport'],
  ['Evolución de fuerza', 'Strength progression'],
  ['Último estímulo', 'Latest stimulus'],
  ['Mostrar instrucciones', 'Show instructions'],
] as const
```

- [ ] **Step 6: Run evidence and i18n tests**

Run: `pnpm vitest run src/components/evidence/__tests__/evidencePrimitives.test.tsx src/lib/i18n/__tests__/i18n.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the evidence presentation system**

```powershell
git add -- src/components/evidence src/lib/i18n/index.ts src/lib/i18n/__tests__/i18n.test.ts
git commit -m "feat: add shared evidence presentation"
```

---

### Task 3: Turn Calendar into a temporal navigator

**Files:**

- Create: `src/components/calendar/calendarViewModel.ts`
- Create: `src/components/calendar/__tests__/calendarViewModel.test.ts`
- Create: `src/components/calendar/CalendarDayPanel.tsx`
- Modify: `src/lib/calendar/aggregate.ts`
- Modify: `src/lib/calendar/__tests__/aggregate.test.ts`
- Modify: `src/app/(app)/calendario/page.tsx`
- Create: `src/app/(app)/calendario/error.tsx`
- Modify: `src/app/(app)/calendario/loading.tsx`
- Modify: `src/components/calendar/CalendarView.tsx`
- Modify: `src/components/calendar/CalendarSummary.tsx`
- Modify: `src/components/calendar/MonthGrid.tsx`
- Modify: `src/components/calendar/ContributionHeatmap.tsx`
- Modify: `src/components/calendar/EmptyCalendar.tsx`

**Interfaces:**

- `CalendarSessionSummary`: `{ id, date, completedAt, workoutName, focus, durationMin, sets, volumeKg }`.
- `CalendarView({ days, sessions, todayStr })` owns visible month and selected date.
- `MonthGrid` emits `onSelectDate(date)` and receives `selectedDate`.
- `CalendarDayPanel` renders zero, one, or many `SessionSummaryRow` items.

- [ ] **Step 1: Write failing calendar view-model tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildCalendarMonthView, type CalendarSessionSummary } from '../calendarViewModel'

const sessions: CalendarSessionSummary[] = [
  { id: 'a', date: '2026-08-12', completedAt: '2026-08-12T10:00:00Z', workoutName: 'Push', focus: 'Pecho', durationMin: 40, sets: 8, volumeKg: 1000 },
  { id: 'b', date: '2026-08-12', completedAt: '2026-08-12T18:00:00Z', workoutName: 'Core', focus: null, durationMin: 20, sets: 4, volumeKg: 200 },
  { id: 'c', date: '2026-07-30', completedAt: '2026-07-30T10:00:00Z', workoutName: 'Legs', focus: 'Piernas', durationMin: 50, sets: 10, volumeKg: 1800 },
]

describe('calendar month view', () => {
  it('keeps all sessions from the selected day', () => {
    const view = buildCalendarMonthView(sessions, 2026, 8, '2026-08-12')
    expect(view.selectedSessions.map(session => session.id)).toEqual(['b', 'a'])
    expect(view.trainedDays).toBe(1)
    expect(view.sessionCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run the calendar view-model test and confirm red**

Run: `pnpm vitest run src/components/calendar/__tests__/calendarViewModel.test.ts`

Expected: FAIL because `calendarViewModel.ts` does not exist.

- [ ] **Step 3: Implement month selection and session aggregation**

```ts
export type CalendarSessionSummary = {
  id: string
  date: string
  completedAt: string
  workoutName: string
  focus: string | null
  durationMin: number
  sets: number
  volumeKg: number
}

export function buildCalendarMonthView(
  sessions: CalendarSessionSummary[],
  year: number,
  month: number,
  selectedDate: string,
) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const monthSessions = sessions.filter(session => session.date.startsWith(prefix))
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const calendarWeeks = Math.ceil((firstWeekday + daysInMonth) / 7)
  return {
    monthSessions,
    trainedDays: new Set(monthSessions.map(session => session.date)).size,
    sessionCount: monthSessions.length,
    frequency: Math.round((monthSessions.length / calendarWeeks) * 10) / 10,
    selectedSessions: monthSessions
      .filter(session => session.date === selectedDate)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
  }
}
```

Add `expect(buildCalendarMonthView(sessions, 2026, 8, '2026-08-12').frequency).toBe(0.3)` to cover August's six calendar rows.

- [ ] **Step 4: Extend the server loader without changing SQL**

In `page.tsx`, add a raw read-only payload loader that selects existing columns:

```ts
type CalendarProgressRow = RawProgressLog & {
  workout_id: string | null
  workout: { name: string; focus: string | null } | { name: string; focus: string | null }[] | null
}

async function loadCalendarSessionPayload(supabase: AppSupabaseClient, userId: string, timeZone: string) {
  const from = addDays(new Date(), -365).toISOString()
  const { data: logs } = await supabase
    .from('progress_logs')
    .select('id, workout_id, completed_at, duration_minutes, workout:workouts(name, focus)')
    .eq('user_id', userId)
    .not('workout_id', 'is', null)
    .gte('completed_at', from)
    .order('completed_at', { ascending: false })
  const logIds = (logs ?? []).map(log => log.id)
  const { data: exerciseLogs } = logIds.length === 0
    ? { data: [] }
    : await supabase.from('exercise_logs').select('progress_log_id, sets_completed, weights_kg, reps_completed').in('progress_log_id', logIds)
  return buildCalendarSessionPayload(logs ?? [], exerciseLogs ?? [], timeZone)
}
```

`buildCalendarSessionPayload` must return both raw-derived `days` and `CalendarSessionSummary[]`; keep `get_calendar_payload` as the preferred aggregate source and use the raw-derived days only if the RPC is unavailable.

Throw when either raw table query returns an error so `error.tsx` can announce the failure and expose retry. The RPC error remains a supported fallback signal, not a route failure.

- [ ] **Step 5: Recompose CalendarView and MonthGrid**

Use this client-state contract:

```tsx
const [visibleMonth, setVisibleMonth] = useState({ year: todayY, month: todayM })
const [selectedDate, setSelectedDate] = useState(todayStr)

const selectMonth = (year: number, month: number) => {
  setVisibleMonth({ year, month })
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const fallback = [...sessions].find(session => session.date.startsWith(prefix))?.date ?? `${prefix}-01`
  setSelectedDate(fallback)
}
```

Render `EvidenceHero`, `CalendarSummary`, a desktop grid `lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem_.8fr)]`, `MonthGrid`, and `CalendarDayPanel`. Change each non-future date in `MonthGrid` to a 44 px button with `aria-selected`; do not navigate from the date cell.

- [ ] **Step 6: Demote the annual heatmap to a non-interactive overview**

Replace each heatmap `<button>` with a labeled `<span aria-hidden="true">`, keep one concise screen-reader summary on the containing figure, and remove `onSelectDate` from `ContributionHeatmap`. Preserve horizontal containment and the four-level legend.

- [ ] **Step 7: Widen the route and verify calendar tests**

Set calendar main width to `max-w-6xl`, keep `PageTopBar` as the only `h1`, recompose `loading.tsx` with the same hero/grid geometry, and add `error.tsx` that renders `EvidenceRouteError`. Then run:

`pnpm vitest run src/lib/calendar/__tests__/aggregate.test.ts src/components/calendar/__tests__/calendarViewModel.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Calendar**

```powershell
git add -- 'src/app/(app)/calendario/page.tsx' src/components/calendar src/lib/calendar
git commit -m "feat: redesign calendar evidence view"
```

---

### Task 4: Make Progress performance-first

**Files:**

- Create: `src/components/progress/progressViewModel.ts`
- Create: `src/components/progress/__tests__/progressViewModel.test.ts`
- Create: `src/components/progress/TrainingLoadChart.tsx`
- Modify: `src/app/(app)/progress/page.tsx`
- Create: `src/app/(app)/progress/error.tsx`
- Modify: `src/app/(app)/progress/loading.tsx`
- Modify: `src/components/progress/ProgressHub.tsx`
- Modify: `src/components/progress/progressSummary.ts`
- Modify: `src/components/progress/__tests__/progressSummary.test.ts`

**Interfaces:**

- Move `ProgressRangeWeeks`, `ProgressSession`, `ProgressRecord`, and `ProgressMeasurement` from `ProgressHub.tsx` to `progressViewModel.ts`; update the server page to import the types from the view-model module.
- Add `ProgressExercisePoint`: `{ exerciseId, exerciseName, date, maxWeightKg, repsAtMaxWeight, volumeKg }`.
- `buildProgressSnapshot(input, weeks)` returns range dates, weekly buckets, volume delta, sessions/week, record count, and up to three normalized exercise highlights.
- `TrainingLoadChart({ buckets, locale })` owns selected-week presentation only; `ProgressHub` owns the range.

- [ ] **Step 1: Write the failing progress snapshot tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildProgressSnapshot } from '../progressViewModel'

describe('progress snapshot', () => {
  it('keeps comparison absent when the prior period has zero volume', () => {
    const snapshot = buildProgressSnapshot({
      todayStr: '2026-08-28',
      weeks: 4,
      sessions: [{ id: 'a', completedAt: '2026-08-20T10:00:00Z', date: '2026-08-20', durationMinutes: 40, volumeKg: 1000 }],
      days: [{ date: '2026-08-20', sessions: 1, volumeKg: 1000, durationMin: 40, logIds: ['a'] }],
      records: [],
      exercisePoints: [],
    })
    expect(snapshot.volumeDelta).toBeNull()
    expect(snapshot.comparisonLabel).toBe('none')
  })

  it('normalizes exercise change inside the same movement', () => {
    const snapshot = buildProgressSnapshot({
      todayStr: '2026-08-28', weeks: 4, sessions: [], days: [], records: [],
      exercisePoints: [
        { exerciseId: 'bench', exerciseName: 'Bench', date: '2026-08-02', maxWeightKg: 50, repsAtMaxWeight: 5, volumeKg: 500 },
        { exerciseId: 'bench', exerciseName: 'Bench', date: '2026-08-20', maxWeightKg: 55, repsAtMaxWeight: 5, volumeKg: 550 },
      ],
    })
    expect(snapshot.exerciseHighlights[0]).toMatchObject({ exerciseId: 'bench', changePercent: 10 })
  })
})
```

- [ ] **Step 2: Run the progress snapshot test and confirm red**

Run: `pnpm vitest run src/components/progress/__tests__/progressViewModel.test.ts`

Expected: FAIL because `progressViewModel.ts` does not exist.

- [ ] **Step 3: Move range derivation into the pure snapshot**

```ts
export type ProgressExercisePoint = {
  exerciseId: string
  exerciseName: string
  date: string
  maxWeightKg: number
  repsAtMaxWeight: number
  volumeKg: number
}

export type ProgressSnapshotInput = {
  todayStr: string
  weeks: ProgressRangeWeeks
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  exercisePoints: ProgressExercisePoint[]
}

function buildExerciseHighlights(points: ProgressExercisePoint[], startDate: string, endDate: string) {
  const grouped = new Map<string, ProgressExercisePoint[]>()
  for (const point of points.filter(item => item.date >= startDate && item.date <= endDate && item.maxWeightKg > 0)) {
    grouped.set(point.exerciseId, [...(grouped.get(point.exerciseId) ?? []), point])
  }
  return Array.from(grouped.values()).flatMap(items => {
    const ordered = [...items].sort((a, b) => a.date.localeCompare(b.date))
    if (ordered.length < 2) return []
    const first = ordered[0]
    const latest = ordered[ordered.length - 1]
    const changePercent = percentChange(latest.maxWeightKg, first.maxWeightKg)
    return changePercent === null ? [] : [{
      exerciseId: latest.exerciseId,
      exerciseName: latest.exerciseName,
      latestWeightKg: latest.maxWeightKg,
      changePercent,
    }]
  }).sort((a, b) => b.changePercent - a.changePercent).slice(0, 3)
}

export function buildProgressSnapshot(input: ProgressSnapshotInput) {
  const startDate = shiftDateStr(input.todayStr, -(input.weeks * 7 - 1))
  const priorStart = shiftDateStr(startDate, -(input.weeks * 7))
  const priorEnd = shiftDateStr(startDate, -1)
  const selected = input.sessions.filter(item => item.date >= startDate && item.date <= input.todayStr)
  const prior = input.sessions.filter(item => item.date >= priorStart && item.date <= priorEnd)
  const volume = selected.reduce((sum, item) => sum + item.volumeKg, 0)
  const priorVolume = prior.reduce((sum, item) => sum + item.volumeKg, 0)
  return {
    startDate,
    priorStart,
    priorEnd,
    selected,
    weeklyBuckets: buildWeekBuckets(input.days, startDate, input.todayStr, input.weeks),
    volumeKg: Math.round(volume),
    volumeDelta: percentChange(volume, priorVolume),
    comparisonLabel: priorVolume > 0 ? 'available' as const : 'none' as const,
    sessionsPerWeek: Math.round((selected.length / input.weeks) * 10) / 10,
    recordCount: input.records.filter(record => record.bestDate >= startDate && record.bestDate <= input.todayStr).length,
    exerciseHighlights: buildExerciseHighlights(input.exercisePoints, startDate, input.todayStr),
  }
}
```

Export `buildWeekBuckets` from this file and remove duplicate private implementations from `ProgressHub.tsx`.

- [ ] **Step 4: Add exercise trend points in the server loader**

Map each `ExerciseLogRow` with a valid localized exercise and log into `ProgressExercisePoint`. Use `summarizeExercisePerformance` for best set and volume. Pass `exercisePoints` to `ProgressHub`; do not add a new request.

Capture and throw errors from the progress-log, measurement, and exercise-log selects. Add `error.tsx` with `EvidenceRouteError` and update `loading.tsx` to mirror the hero/chart/two-column hierarchy.

- [ ] **Step 5: Build the selectable weekly load chart**

`TrainingLoadChart` must render one button per week with:

```tsx
<button
  type="button"
  aria-pressed={selectedIndex === index}
  aria-label={`${weekLabel}: ${bucket.volumeKg} kg · ${bucket.sessions} sesiones`}
  onClick={() => setSelectedIndex(index)}
  className="group flex min-h-44 min-w-0 flex-1 flex-col justify-end rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
>
  <span aria-hidden="true" className="w-full rounded-t-lg bg-violet-500/35 transition-[height,background-color] group-aria-pressed:bg-violet-400" style={{ height: `${height}%` }} />
  <span className="mt-2 text-[11px] text-muted-foreground">{bucket.sessions}</span>
</button>
```

Place the selected week's date, volume, and session count in one visible detail line below the chart.

- [ ] **Step 6: Recompose ProgressHub**

Keep `rangeWeeks` state and render in this order:

1. `EvidenceHero` with `PeriodSelector`.
2. `MetricStrip` with volume change or `Sin comparación`, sessions/week, and records.
3. `TrainingLoadChart` as the full-width dominant surface.
4. Desktop asymmetric grid for consistency, exercise highlights, and recent records.
5. Low-contrast body-measurement section.
6. Compact text links to History, Calendar, and Measures.

Remove `MetricCard` repetition and remove `ExerciseProgressionSection` from this route. Preserve `MetricTextSummary` for deterministic insights.

- [ ] **Step 7: Run progress tests**

Run: `pnpm vitest run src/components/progress/__tests__/progressViewModel.test.ts src/components/progress/__tests__/progressSummary.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Progress**

```powershell
git add -- 'src/app/(app)/progress/page.tsx' src/components/progress
git commit -m "feat: prioritize performance evidence in progress"
```

---

### Task 5: Convert History into a chronological result log

**Files:**

- Create: `src/components/history/historyViewModel.ts`
- Create: `src/components/history/__tests__/historyViewModel.test.ts`
- Create: `src/components/history/HistoryHighlights.tsx`
- Modify: `src/app/(app)/history/page.tsx`
- Create: `src/app/(app)/history/error.tsx`
- Modify: `src/app/(app)/history/loading.tsx`
- Modify: `src/components/history/HistorySessionList.tsx`

**Interfaces:**

- Extend history exercise rows with `sets_completed`, `rpe_values`, and `notes` using existing columns.
- `buildHistoryEvidence(sessionLogs, exerciseLogs, todayStr, timeZone)` returns `HistoryEvidenceRow[]` and groups.
- Signal priority is `record` → comparable workout volume → recorded average RPE → none.

- [ ] **Step 1: Write failing history signal tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildHistoryEvidence } from '../historyViewModel'

describe('history evidence', () => {
  it('prefers a new record over a volume comparison', () => {
    const result = buildHistoryEvidence({
      todayStr: '2026-08-10',
      sessions: [
        { id: 'new', workoutId: 'w1', date: '2026-08-10', completedAt: '2026-08-10T10:00:00Z', workoutName: 'Push', focus: null, durationMinutes: 40 },
        { id: 'old', workoutId: 'w1', date: '2026-08-03', completedAt: '2026-08-03T10:00:00Z', workoutName: 'Push', focus: null, durationMinutes: 40 },
      ],
      exercises: [
        { progressLogId: 'new', exerciseId: 'bench', weightsKg: [60], repsCompleted: [5], rpeValues: [8], setsCompleted: 1 },
        { progressLogId: 'old', exerciseId: 'bench', weightsKg: [50], repsCompleted: [5], rpeValues: [7], setsCompleted: 1 },
      ],
    })
    expect(result.rows[0].signal).toMatchObject({ kind: 'record' })
  })
})
```

- [ ] **Step 2: Run the history test and confirm red**

Run: `pnpm vitest run src/components/history/__tests__/historyViewModel.test.ts`

Expected: FAIL because `historyViewModel.ts` does not exist.

- [ ] **Step 3: Implement row evidence and grouping**

Use `summarizeExercisePerformance` per exercise, sum completed sets/volume per log, locate the previous same-workout session with `findPreviousComparableSession`, and mark a record only when a current best set exceeds every older best set for the same `exerciseId`.

```ts
export type HistorySignal =
  | { kind: 'record'; count: number }
  | { kind: 'volume'; changePercent: number }
  | { kind: 'rpe'; value: number }
  | null

export type HistoryEvidenceRow = {
  id: string
  workoutId: string | null
  date: string
  completedAt: string
  workoutName: string
  focus: string | null
  durationMinutes: number
  sets: number
  volumeKg: number
  signal: HistorySignal
  searchText: string
}
```

- [ ] **Step 4: Load the existing exercise columns directly**

Replace the runtime `get_history_payload` branch with the existing-table fallback queries capped at 50 sessions. Extend the exercise select to:

```sql
progress_log_id,
exercise_id,
sets_completed,
weights_kg,
reps_completed,
rpe_values,
notes,
exercise:exercises(name, name_es, muscle_groups, muscle_groups_es, is_compound)
```

Do not edit `supabase/migrations` or `src/types/database.ts`.

Throw on either direct-query error. Add the segment-level `error.tsx` with `EvidenceRouteError`, and update `loading.tsx` to preserve the timeline plus side-column geometry for both History and its detail route.

- [ ] **Step 5: Recompose the history page and filters**

Set the route main width to `max-w-6xl`. Render `EvidenceHero`, a three-item `MetricStrip`, and `lg:grid-cols-[minmax(0,1fr)_20rem]` with `HistorySessionList` left and `HistoryHighlights` right. Remove the large amber records card and `ExerciseProgressionSection` from this route.

Update `HistorySessionList` to receive `HistoryEvidenceRow[]`, group with `groupEvidenceSessions`, keep query/mode state, and render each result with `SessionSummaryRow`. `Sin resultados` must show `Limpiar filtros`; an empty database history must remain the page-level empty state.

- [ ] **Step 6: Run history tests and type-check the route**

Run: `pnpm vitest run src/components/history/__tests__/historyViewModel.test.ts`

Run: `pnpm type-check`

Expected: both PASS.

- [ ] **Step 7: Commit History**

```powershell
git add -- 'src/app/(app)/history/page.tsx' src/components/history
git commit -m "feat: turn history into an evidence timeline"
```

---

### Task 6: Recompose completed-session detail as a debrief

**Files:**

- Create: `src/components/history/sessionDebrief.ts`
- Create: `src/components/history/__tests__/sessionDebrief.test.ts`
- Create: `src/components/history/SessionExerciseDisclosure.tsx`
- Modify: `src/app/(app)/history/[logId]/page.tsx`

**Interfaces:**

- `buildSessionDebrief(log, exerciseLogs, previousByExercise)` returns session totals, achievements, and ordered `SessionExerciseEvidence[]`.
- `previousByExercise` means the immediately previous appearance by timestamp, not the historical maximum.
- `SessionExerciseDisclosure` receives already localized labels and uses native details.

- [ ] **Step 1: Write the failing debrief tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildSessionDebrief } from '../sessionDebrief'

describe('session debrief', () => {
  it('excludes skipped exercises and compares the immediately previous appearance', () => {
    const result = buildSessionDebrief({
      durationMinutes: 50,
      exercises: [
        { id: 'current', exerciseId: 'bench', exerciseName: 'Bench', muscleGroups: ['Chest'], setsCompleted: 2, weightsKg: [60, 60], repsCompleted: [5, 5], rpeValues: [8, 8], notes: null },
        { id: 'skip', exerciseId: 'row', exerciseName: 'Row', muscleGroups: ['Back'], setsCompleted: 0, weightsKg: [], repsCompleted: [], rpeValues: [], notes: 'Saltado: dolor' },
      ],
      previousByExercise: new Map([
        ['bench', { weightsKg: [55], repsCompleted: [5], rpeValues: [7] }],
      ]),
    })
    expect(result.totalSets).toBe(2)
    expect(result.skippedCount).toBe(1)
    expect(result.exercises[0].comparison?.weightDeltaKg).toBe(5)
  })
})
```

- [ ] **Step 2: Run the debrief test and confirm red**

Run: `pnpm vitest run src/components/history/__tests__/sessionDebrief.test.ts`

Expected: FAIL because `sessionDebrief.ts` does not exist.

- [ ] **Step 3: Implement the debrief view model**

Use `summarizeExercisePerformance` for all set calculations and expose:

```ts
export type SessionExerciseEvidence = {
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  skipped: boolean
  notes: string | null
  sets: EvidenceSet[]
  completedSets: number
  volumeKg: number
  bestSet: EvidenceSet | null
  averageRpe: number | null
  comparison: { weightDeltaKg: number; repsDelta: number } | null
  isRecord: boolean
}
```

The record flag may compare against all older history; the visible comparison must use only the latest older appearance.

- [ ] **Step 4: Correct the previous-log query**

Include `reps_completed` and nested `progress_logs.completed_at`, sort descending, and keep the first row per `exercise_id` for `previousByExercise`. Separately retain the all-time prior max only for `isRecord`.

- [ ] **Step 5: Create the exercise disclosure**

Render a numbered summary row with best set, volume, RPE, comparison text, and a `PendingLink` to `/exercises/{exerciseId}`. Put the semantic set table inside:

```tsx
<DisclosureSection summary={t('Mostrar series')}>
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead><tr><th>Set</th><th>{t('Peso')}</th><th>{t('Reps')}</th><th>RPE</th></tr></thead>
      <tbody>{tableRows}</tbody>
    </table>
  </div>
</DisclosureSection>
```

- [ ] **Step 6: Recompose the detail route**

Keep `PageTopBar` as the only `h1`. Use `max-w-6xl`, `EvidenceHero`, a three-item `MetricStrip`, and `lg:grid-cols-[minmax(0,1fr)_20rem]`. Put the ordered exercise sequence in the main column and mood/PR/skipped/share context in the side column. Omit empty result modules.

- [ ] **Step 7: Run debrief and localization tests**

Run: `pnpm vitest run src/components/history/__tests__/sessionDebrief.test.ts src/lib/i18n/__tests__/i18n.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit session debrief**

```powershell
git add -- 'src/app/(app)/history/[logId]/page.tsx' src/components/history/sessionDebrief.ts src/components/history/SessionExerciseDisclosure.tsx src/components/history/__tests__/sessionDebrief.test.ts src/lib/i18n
git commit -m "feat: redesign completed session debrief"
```

---

### Task 7: Rebuild exercise detail as a movement passport

**Files:**

- Create: `src/components/exercises/exerciseDetailViewModel.ts`
- Create: `src/components/exercises/__tests__/exerciseDetailViewModel.test.ts`
- Create: `src/components/exercises/ExerciseProgressChart.tsx`
- Modify: `src/app/(app)/exercises/[exerciseId]/page.tsx`
- Create: `src/app/(app)/exercises/error.tsx`
- Modify: `src/app/(app)/exercises/loading.tsx`

**Interfaces:**

- `ExerciseProgressPoint`: `{ logId, date, completedAt, maxWeightKg, repsAtMaxWeight, volumeKg, averageRpe }`.
- `buildExerciseDetailView(logs)` returns all points, all-time best, latest stimulus, latest average RPE, and neutral trend.
- `ExerciseProgressChart` supports 4/12/24-week ranges and selected-point detail with an explicit session link.

- [ ] **Step 1: Write failing exercise view-model tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildExerciseDetailView, filterExercisePoints } from '../exerciseDetailViewModel'

describe('exercise detail view model', () => {
  it('keeps all points and separates latest stimulus from all-time totals', () => {
    const view = buildExerciseDetailView([
      { logId: 'new', completedAt: '2026-08-20T10:00:00Z', weightsKg: [60], repsCompleted: [5], rpeValues: [8] },
      { logId: 'old', completedAt: '2026-07-01T10:00:00Z', weightsKg: [55], repsCompleted: [6], rpeValues: [7] },
    ], 'es', 'America/Havana')
    expect(view.points).toHaveLength(2)
    expect(view.latest).toMatchObject({ maxWeightKg: 60, volumeKg: 300, averageRpe: 8 })
    expect(view.best).toMatchObject({ maxWeightKg: 60 })
  })

  it('filters points by an exact week window', () => {
    const points = [
      { logId: 'a', date: '2026-08-20', completedAt: '2026-08-20T10:00:00Z', maxWeightKg: 60, repsAtMaxWeight: 5, volumeKg: 300, averageRpe: 8 },
      { logId: 'b', date: '2026-06-01', completedAt: '2026-06-01T10:00:00Z', maxWeightKg: 50, repsAtMaxWeight: 5, volumeKg: 250, averageRpe: 7 },
    ]
    expect(filterExercisePoints(points, '2026-08-28', 4).map(point => point.logId)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run the exercise view-model test and confirm red**

Run: `pnpm vitest run src/components/exercises/__tests__/exerciseDetailViewModel.test.ts`

Expected: FAIL because `exerciseDetailViewModel.ts` does not exist.

- [ ] **Step 3: Extract the server-page calculations**

Implement `buildExerciseDetailView(logs, locale, timeZone)` with `summarizeExercisePerformance`; do not slice points to eight. Derive each ISO date with `getLocalDateString(new Date(completedAt), timeZone)`, use `dateLocale(locale)` for visible labels, and define trend only from the latest two valid max-weight points. A missing/zero load yields `baseline`, not a negative judgment.

- [ ] **Step 4: Build the interactive exercise chart**

Use `PeriodSelector<4 | 12 | 24>`, default 12 weeks, and local `selectedLogId`. Each bar is a button with an accessible date/load label; selecting it updates one detail line. The line contains a separate `PendingLink` to `/history/{logId}` so selecting a point does not navigate accidentally.

```tsx
const visiblePoints = useMemo(
  () => filterExercisePoints(points, todayStr, rangeWeeks),
  [points, rangeWeeks, todayStr],
)
const selected = visiblePoints.find(point => point.logId === selectedLogId)
  ?? visiblePoints[visiblePoints.length - 1]
```

- [ ] **Step 5: Recompose the movement passport**

Use `max-w-6xl` and this order:

1. compact hero with image, name context, muscles/equipment, and anchor link to `#tecnica`;
2. four-item `MetricStrip` in a responsive 2 × 2/4-column arrangement;
3. main chart plus latest/best insight column;
4. `#tecnica` editorial block for description and equipment;
5. `DisclosureSection` for long instructions;
6. chronological appearance history linking to sessions.

Replace total lifetime volume in the hero strip with latest-appearance volume and replace lifetime average RPE with latest-appearance average RPE. Keep all-time sessions and best load.

Ensure the exercise RPC fallback throws only after the direct fallback also fails. Add `error.tsx` with `EvidenceRouteError` and update `loading.tsx` so the list and detail routes retain a stable top region without horizontal overflow.

- [ ] **Step 6: Run exercise and existing image tests**

Run: `pnpm vitest run src/components/exercises/__tests__/exerciseDetailViewModel.test.ts src/components/exercises/__tests__/zoomable.test.ts src/components/exercises/__tests__/resolveExerciseImage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit exercise detail**

```powershell
git add -- 'src/app/(app)/exercises/[exerciseId]/page.tsx' src/components/exercises
git commit -m "feat: redesign exercise movement passport"
```

---

### Task 8: Add cross-route acceptance and finish verification

**Files:**

- Modify: `tests/e2e/helpers/core-product.ts`
- Create: `tests/e2e/training-evidence.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`

**Interfaces:**

- `seedCoreProgressHistory` returns `{ progressLogId }` after creating the completed session.
- The acceptance test uses the existing E2E account and never depends on production data.

- [ ] **Step 1: Write the failing cross-route E2E test**

```ts
import { expect, test } from './fixtures'
import { seedCoreProductFixture, seedCoreProgressHistory } from './helpers/core-product'
import { signInAsE2EUser } from './helpers/auth'

test('training evidence routes form one navigable journey', async ({ page }) => {
  test.setTimeout(180_000)
  const fixture = await seedCoreProductFixture('es')
  const { progressLogId } = await seedCoreProgressHistory(fixture)
  await signInAsE2EUser(page)

  await page.goto('/calendario')
  await expect(page.getByRole('heading', { name: /actividad del mes|monthly activity/i })).toBeVisible()
  await expect(page.getByText(/día seleccionado|selected day/i)).toBeVisible()

  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: /tu progreso tiene dirección|your progress has direction/i })).toBeVisible()
  await page.getByRole('button', { name: /4 semanas|4 weeks/i }).click()

  await page.goto('/history')
  await expect(page.getByRole('heading', { name: /registro cronológico|chronological log/i })).toBeVisible()

  await page.goto(`/history/${progressLogId}`)
  await expect(page.getByRole('heading', { name: /secuencia de la sesión|session sequence/i })).toBeVisible()

  await page.goto(`/exercises/${fixture.exerciseId}`)
  await expect(page.getByRole('heading', { name: /evolución de fuerza|strength progression/i })).toBeVisible()
})
```

- [ ] **Step 2: Run the new E2E test and confirm red**

Run: `pnpm playwright test tests/e2e/training-evidence.spec.ts --project=mobile-375`

Expected: FAIL on the first new approved heading before the route rewrites are complete.

- [ ] **Step 3: Return the seeded history identifier**

Change the helper signature and add the return after the existing two successful insert blocks:

```ts
export async function seedCoreProgressHistory(
  fixture: CoreProductFixture,
): Promise<{ progressLogId: string }> {
  const progressLogId = randomUUID()
  const completedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await createProgressLogFixture(fixture, progressLogId, completedAt)
  await createExerciseLogFixture(fixture, progressLogId)
  return { progressLogId }
}
```

Rename the current progress-log insert block to `createProgressLogFixture(fixture, progressLogId, completedAt)` and the current exercise-log insert block to `createExerciseLogFixture(fixture, progressLogId)` without changing their payload fields.

- [ ] **Step 4: Expand route-level accessibility coverage**

Add Calendar, History, completed-session detail, and exercise detail to the authenticated route table after seeding history. Use these primary controls:

```ts
[
  { path: '/calendario', primary: /hoy|today/i },
  { path: '/progress', primary: /12 semanas|12 weeks/i },
  { path: '/history', primary: /todas|all/i },
  { path: `/history/${progressLogId}`, primary: /mostrar series|show sets/i },
  { path: `/exercises/${fixture.exerciseId}`, primary: /12 semanas|12 weeks/i },
]
```

Keep `expectOneH1`, touch-target checks, and axe audit for every route.

- [ ] **Step 5: Run targeted unit suites**

Run:

```powershell
pnpm vitest run src/lib/training-evidence src/lib/calendar/__tests__/aggregate.test.ts src/components/calendar/__tests__/calendarViewModel.test.ts src/components/evidence/__tests__/evidencePrimitives.test.tsx src/components/progress/__tests__ src/components/history/__tests__ src/components/exercises/__tests__ src/lib/i18n/__tests__/i18n.test.ts
```

Expected: PASS with zero failing tests.

- [ ] **Step 6: Run static verification**

Run:

```powershell
pnpm lint
pnpm type-check
pnpm build
```

Expected: all three commands exit 0.

- [ ] **Step 7: Run browser acceptance at mobile and desktop widths**

Run:

```powershell
pnpm playwright test tests/e2e/training-evidence.spec.ts tests/e2e/accessibility.spec.ts --project=mobile-375
pnpm playwright test tests/e2e/training-evidence.spec.ts tests/e2e/accessibility.spec.ts --project=desktop-1440
```

Expected: both projects PASS. Then inspect `/calendario`, `/progress`, `/history`, the seeded session, and the seeded exercise at 360 × 800, 390 × 844, 768 × 1024, and 1280 × 800. Confirm one reachable primary action, real two-column layouts at desktop widths, no horizontal clipping, and correct reduced-motion behavior.

- [ ] **Step 8: Commit acceptance coverage**

```powershell
git add -- tests/e2e
git commit -m "test: cover training evidence journey"
```

- [ ] **Step 9: Review the complete diff and push `main`**

Run:

```powershell
git diff --check HEAD~8..HEAD
git status --short
git log --oneline -10
git push origin main
```

Expected: `git diff --check` exits 0; status contains only the pre-existing untracked `.superpowers/`; the design/plan and eight implementation commits are visible; push succeeds.
