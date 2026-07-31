# Core Training Visual Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir dashboard, plan y sesión activa en una experiencia continua de rendimiento premium basada en la dirección aprobada “Línea del atleta”.

**Architecture:** Mantener las reglas de producto en `dashboardViewModel`, `planViewModel` y `sessionStore`, y añadir derivaciones puras para la presentación temporal. Las pantallas compondrán componentes pequeños sobre esas interfaces; los datos persistidos, acciones del servidor y contratos de Supabase no cambian.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Radix UI, Framer Motion, Zustand, Vitest y Playwright.

## Global Constraints

- No añadir dependencias ni migraciones de base de datos.
- No crear un puntaje numérico de preparación o recuperación.
- Mantener Barlow Condensed y Plus Jakarta Sans.
- Violeta `#8B5CF6` identifica marca y estado activo; lima `#BEF264` se reserva para una acción física primaria; verde `#4ADE80` confirma; naranja `#FB923C` advierte.
- Mantener objetivos táctiles mínimos de 44 × 44 px, contraste WCAG AA y foco visible.
- Conservar español e inglés y `prefers-reduced-motion`.
- Mantener las reglas actuales de programación, acceso, ajuste de plan, guardado local, sincronización y finalización.
- No rediseñar progreso, comunidad, ajustes, autenticación o marketing fuera de los elementos compartidos por estas tres pantallas.
- Especificación de origen: `docs/superpowers/specs/2026-07-31-core-training-visual-restructure-design.md`.

---

## File Structure

### Shared training presentation

- Create `src/components/training/TimelineRail.tsx`: primitive visual compartido para nodos y segmentos temporales.
- Create `src/components/training/__tests__/timelineRail.test.tsx`: contrato semántico del rail.
- Modify `src/styles/globals.css`: tokens semánticos y movimiento no decorativo.
- Modify `src/styles/__tests__/design-system.test.ts`: presencia de tokens, duración y movimiento reducido.

### Dashboard

- Modify `src/components/dashboard/dashboardViewModel.ts`: items temporales y ubicación de avisos.
- Modify `src/components/dashboard/__tests__/dashboardViewModel.test.ts`: derivaciones y prioridades.
- Create `src/components/dashboard/DashboardWeekJourney.tsx`: resumen, pasado, hoy y siguiente acción.
- Modify `src/components/dashboard/DashboardHeader.tsx`: fecha, aviso compacto y jerarquía de saludo.
- Modify `src/components/dashboard/DashboardNotice.tsx`: variantes `primary`, `inline` y `hub`.
- Modify `src/components/dashboard/SecondaryMetrics.tsx`: resumen breve para la columna secundaria.
- Modify `src/app/(app)/dashboard/page.tsx`: composición responsive de dos columnas.
- Modify `src/components/dashboard/__tests__/dashboardStructure.test.ts`: orden y límites de componentes.
- Modify `src/components/dashboard/__tests__/dashboardLocalization.test.ts`: textos del nuevo recorrido.

### Plan

- Modify `src/components/plan/planViewModel.ts`: semana completa y cobertura muscular.
- Modify `src/components/plan/__tests__/planViewModel.test.ts`: días, descansos, sesiones sin día y distribución.
- Create `src/components/plan/PlanOverview.tsx`: selector compacto y metadatos.
- Create `src/components/plan/PlanDistribution.tsx`: cobertura muscular derivada.
- Create `src/components/plan/PlanWorkoutReadView.tsx`: detalle sin controles de edición.
- Create `src/components/plan/PlanWorkoutWorkspace.tsx`: selección, panel móvil, columna desktop y modo de edición.
- Modify `src/components/plan/PlanDayTimeline.tsx`: mapa semanal basado en entradas derivadas.
- Modify `src/components/plan/WorkoutExerciseList.tsx`: variante explícita de edición.
- Modify `src/app/(app)/plan/page.tsx`: preparar datos y componer overview/workspace.
- Create `src/components/plan/__tests__/planStructure.test.ts`: lectura antes que edición y acciones preservadas.

### Active session

- Modify `src/components/session/sessionViewModel.ts`: ventana de foco y pasos numéricos.
- Modify `src/components/session/__tests__/sessionViewModel.test.ts`: serie previa/actual/siguiente y steppers.
- Create `src/components/session/SessionExerciseHeader.tsx`: imagen, objetivo y menú.
- Create `src/components/session/CompactSetSummary.tsx`: serie previa o siguiente.
- Create `src/components/session/ActiveSetFocus.tsx`: controles de fuerza y tiempo para una serie.
- Create `src/components/session/CompleteSetDock.tsx`: CTA principal o descanso activo.
- Modify `src/components/session/ExerciseCard.tsx`: composición del ejercicio activo y estados compactos.
- Modify `src/components/session/RestTimer.tsx`: presentación embebible en el dock.
- Modify `src/components/session/SessionHeader.tsx`: progreso compacto y sincronización.
- Modify `src/app/(app)/session/[workoutId]/SessionClient.tsx`: orden del foco y herramientas al final.
- Modify `src/components/session/__tests__/sessionContracts.test.ts`: contratos de accesibilidad, foco y descanso.

### Acceptance

- Modify `tests/e2e/core-product.spec.ts`: recorrido dashboard → plan → sesión y edición de serie.
- Modify `tests/e2e/accessibility.spec.ts`: landmarks y controles principales.
- Modify `scripts/capture-marketing-screenshots.ts`: selectores estables si cambia la captura del dashboard o sesión.

---

### Task 1: Shared performance tokens and timeline primitive

**Files:**
- Create: `src/components/training/TimelineRail.tsx`
- Create: `src/components/training/__tests__/timelineRail.test.tsx`
- Modify: `src/styles/globals.css`
- Modify: `src/styles/__tests__/design-system.test.ts`

**Interfaces:**
- Consumes: `cn(...inputs)` from `src/lib/utils.ts`.
- Produces: `TimelineRail`, `TimelineNode`, and `TimelineTone = 'completed' | 'active' | 'rest' | 'upcoming' | 'missed'`.

- [ ] **Step 1: Write failing token and semantic markup tests**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TimelineNode, TimelineRail } from '../TimelineRail'

describe('training timeline', () => {
  it('exposes status as text and not only color', () => {
    const html = renderToStaticMarkup(
      <TimelineRail>
        <TimelineNode tone="completed" label="Completado">Push</TimelineNode>
      </TimelineRail>,
    )
    expect(html).toContain('aria-label="Completado"')
    expect(html).toContain('data-timeline-tone="completed"')
  })
})
```

Extend `design-system.test.ts` to assert `--training-action`,
`--training-complete`, `--training-warning`, `--motion-press` and the existing
`prefers-reduced-motion` block.

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm vitest run src/components/training/__tests__/timelineRail.test.tsx src/styles/__tests__/design-system.test.ts
```

Expected: FAIL because the training primitive and semantic tokens do not exist.

- [ ] **Step 3: Add the semantic tokens**

Add to both root and dark token scopes in `globals.css`:

```css
--training-action: 82 85% 67%;
--training-complete: 142 69% 58%;
--training-warning: 27 96% 61%;
--training-active: 258 90% 66%;
--motion-press: 140ms;
--motion-expand: 220ms;
--motion-progress: 280ms;
```

Do not add infinite animation. Preserve the existing global reduced-motion rule.

- [ ] **Step 4: Implement the primitive**

```tsx
export type TimelineTone = 'completed' | 'active' | 'rest' | 'upcoming' | 'missed'

export function TimelineRail({ children }: { children: React.ReactNode }) {
  return <ol className="relative space-y-3 before:absolute before:bottom-5 before:left-[0.4375rem] before:top-5 before:w-px before:bg-border/70">{children}</ol>
}

export function TimelineNode({ tone, label, children }: {
  tone: TimelineTone
  label: string
  children: React.ReactNode
}) {
  return (
    <li data-timeline-tone={tone} className="relative pl-8">
      <span aria-label={label} className="absolute left-0 top-4 h-3.5 w-3.5 rounded-full border-2 border-background" />
      {children}
    </li>
  )
}
```

Map tones to semantic colors with `cn`; active gets one restrained shadow and
`motion-reduce:transition-none`.

- [ ] **Step 5: Run focused tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/training src/styles/globals.css src/styles/__tests__/design-system.test.ts
git commit -m "feat(ui): add performance timeline foundation"
```

### Task 2: Dashboard temporal view model

**Files:**
- Modify: `src/components/dashboard/dashboardViewModel.ts`
- Modify: `src/components/dashboard/__tests__/dashboardViewModel.test.ts`

**Interfaces:**
- Consumes: normalized `DashboardWeekDay[]` already produced by `buildDashboardViewModel`.
- Produces: `DashboardTimelineItem`, `DashboardNoticePlacement`, `weekly.timeline`, and `noticePlacement`.

- [ ] **Step 1: Add failing derivation tests**

```ts
it('builds a chronological week without inventing readiness data', () => {
  const viewModel = buildDashboardViewModel(input({
    weekDays: [
      weekDay(1, workout, true),
      weekDay(2, null),
      { ...weekDay(3, nextWorkout, false), isToday: true },
    ],
  }))

  expect(viewModel.weekly.timeline.map(item => item.tone)).toEqual([
    'completed', 'rest', 'active',
  ])
  expect(viewModel).not.toHaveProperty('readinessScore')
})

it.each([
  ['needs-plan', 'primary'],
  ['check-in', 'inline'],
  ['ai-notes', 'hub'],
  ['promo', 'hub'],
] as const)('places %s notices in %s', (kind, placement) => {
  expect(dashboardNoticePlacement(kind)).toBe(placement)
})
```

- [ ] **Step 2: Run the dashboard view-model test**

Run:

```bash
pnpm vitest run src/components/dashboard/__tests__/dashboardViewModel.test.ts
```

Expected: FAIL on missing `timeline` and `dashboardNoticePlacement`.

- [ ] **Step 3: Implement timeline types and derivation**

```ts
export type DashboardTimelineTone = 'completed' | 'active' | 'rest' | 'upcoming' | 'missed'

export type DashboardTimelineItem = DashboardWeekDay & {
  tone: DashboardTimelineTone
  position: 'past' | 'today' | 'future'
}

export type DashboardNoticePlacement = 'primary' | 'inline' | 'hub'

export function dashboardNoticePlacement(
  kind: DashboardNotice['kind'],
): DashboardNoticePlacement {
  if (kind === 'needs-plan') return 'primary'
  if (kind === 'check-in') return 'inline'
  return 'hub'
}
```

Derive `position` from the unique `isToday` item. Completed items remain
`completed`; today with workout is `active`; no workout is `rest`; past missed
workouts are `missed`; future workouts are `upcoming`.

- [ ] **Step 4: Include the derivation in `DashboardViewModel`**

Add `timeline` to `weekly` and `noticePlacement` beside `notice`. Keep the
existing `days`, `completed` and `scheduled` fields until all consumers migrate.

- [ ] **Step 5: Run focused tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/dashboardViewModel.ts src/components/dashboard/__tests__/dashboardViewModel.test.ts
git commit -m "feat(dashboard): derive athlete timeline state"
```

### Task 3: Dashboard week journey and responsive composition

**Files:**
- Create: `src/components/dashboard/DashboardWeekJourney.tsx`
- Modify: `src/components/dashboard/DashboardHeader.tsx`
- Modify: `src/components/dashboard/DashboardNotice.tsx`
- Modify: `src/components/dashboard/SecondaryMetrics.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/__tests__/dashboardStructure.test.ts`
- Modify: `src/components/dashboard/__tests__/dashboardLocalization.test.ts`

**Interfaces:**
- Consumes: `DashboardViewModel['today']`, `DashboardViewModel['weekly']`, `DashboardViewModel['recommendation']`, `DashboardViewModel['secondaryMetrics']`.
- Produces: `DashboardWeekJourney({ dashboard })` with one DOM copy of the current workout and a two-column desktop layout.

- [ ] **Step 1: Replace structural expectations with the approved hierarchy**

```ts
it('renders one chronological journey as the dashboard composition', () => {
  const ordered = [
    '<DashboardHeader',
    '<DashboardNotice',
    '<DashboardWeekJourney',
  ].map(marker => page.indexOf(marker))
  expect(ordered.every(position => position >= 0)).toBe(true)
  expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
  expect(page.match(/<DashboardWeekJourney\b/g)).toHaveLength(1)
})

it('uses a real desktop grid', () => {
  expect(page).toContain('lg:grid-cols-[minmax(0,1fr)_22rem]')
})
```

Update localization fixtures to read `DashboardWeekJourney.tsx` and assert all
Spanish source strings have English translations.

- [ ] **Step 2: Run dashboard structure and localization tests**

Run:

```bash
pnpm vitest run src/components/dashboard/__tests__/dashboardStructure.test.ts src/components/dashboard/__tests__/dashboardLocalization.test.ts
```

Expected: FAIL because the page still renders separate today/week/recommendation blocks.

- [ ] **Step 3: Implement `DashboardWeekJourney`**

Use `TimelineRail` and `TimelineNode`. Split the temporal list into items before
and after today so the same current-workout card can sit chronologically on
mobile and in the side column on desktop. Render around this shape:

```tsx
<section aria-labelledby="week-journey-title" className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-x-8">
  <div className="lg:col-start-1 lg:row-start-1">
    <header>{t('{completed} de {scheduled} sesiones', { completed, scheduled })}</header>
    <JourneySegment items={beforeToday} />
  </div>
  <div className="lg:col-start-2 lg:row-start-1">
    <TodayJourneyCard today={today} />
  </div>
  <div className="lg:col-start-1 lg:row-start-2">
    <JourneySegment items={afterToday} />
  </div>
  <aside className="space-y-5 lg:col-start-2 lg:row-start-2 lg:self-start">
    <NextRecommendation recommendation={recommendation} />
    <SecondaryMetrics metrics={secondaryMetrics} />
  </aside>
</section>
```

Unavailable days retain a 44 px button and `aria-live="polite"` explanation.
The current CTA uses the lime token; other links remain violet.
When `weekly.timeline` has no today item, render the existing needs-plan or empty
state and omit both journey segments instead of indexing an undefined item.

- [ ] **Step 4: Rework header and notice placement**

Add `noticeContent?: React.ReactNode` and `noticeLabel?: string` to
`DashboardHeader`. Render a 44 px disclosure button only for `hub` notices.
Render `primary` and `inline` notices in main content. Keep the existing banner
components as the actual notice bodies.

- [ ] **Step 5: Compose the responsive dashboard**

Use one page H1 and let `DashboardWeekJourney` own the responsive grid so the
current workout, recommendation and metrics form the actual desktop side
column:

```tsx
<main className="mx-auto max-w-6xl space-y-6 px-4 pt-5 sm:px-6">
  {mainNotice}
  <DashboardWeekJourney dashboard={dashboard} />
</main>
```

On mobile, CSS preserves the semantic order. Do not duplicate `TodayActionCard`.

- [ ] **Step 6: Run dashboard tests and type-check**

```bash
pnpm vitest run src/components/dashboard/__tests__
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -- 'src/app/(app)/dashboard/page.tsx' src/components/dashboard
git commit -m "feat(dashboard): present the week as an athlete journey"
```

### Task 4: Plan week-map and muscle-distribution derivations

**Files:**
- Modify: `src/components/plan/planViewModel.ts`
- Modify: `src/components/plan/__tests__/planViewModel.test.ts`

**Interfaces:**
- Consumes: `PlanDaySummary[]`, `todayIso`, and `PlanDistributionInput[]`.
- Produces: `buildPlanWeekEntries(days, todayIso)` and `buildPlanDistribution(rows)`.

- [ ] **Step 1: Add failing tests for week entries and distribution**

```ts
it('fills the seven-day map with explicit rest days', () => {
  const entries = buildPlanWeekEntries([
    { id: 'pull', name: 'Pull', focus: 'Espalda', dayOfWeek: 3, orderInPlan: 1, durationMinutes: 50, exerciseCount: 5, isScheduled: true },
  ], 3)
  expect(entries).toHaveLength(7)
  expect(entries[1]).toMatchObject({ isoDay: 2, kind: 'rest', isToday: false })
  expect(entries[2]).toMatchObject({ isoDay: 3, kind: 'workout', isToday: true })
})

it('calculates relative muscle coverage from prescribed sets', () => {
  expect(buildPlanDistribution([
    { sets: 3, muscleGroups: ['espalda', 'bíceps'] },
    { sets: 2, muscleGroups: ['espalda'] },
  ])).toEqual([
    { muscleGroup: 'espalda', prescribedSets: 5, relativePercent: 100 },
    { muscleGroup: 'bíceps', prescribedSets: 3, relativePercent: 60 },
  ])
})
```

- [ ] **Step 2: Run the plan view-model test**

```bash
pnpm vitest run src/components/plan/__tests__/planViewModel.test.ts
```

Expected: FAIL on missing exports.

- [ ] **Step 3: Implement exact types and pure functions**

```ts
export type PlanWeekEntry = {
  key: string
  isoDay: number | null
  kind: 'workout' | 'rest' | 'unscheduled'
  isToday: boolean
  workouts: PlanDaySummary[]
}

export type PlanDistributionInput = {
  sets: number | null
  muscleGroups: string[] | null
}

export type PlanDistributionItem = {
  muscleGroup: string
  prescribedSets: number
  relativePercent: number
}
```

Normalize and deduplicate trimmed muscle labels per exercise. Count its sets once
for each tagged group, sort by sets descending then label, and calculate percent
against the largest group. Append one `unscheduled` entry only when needed.

- [ ] **Step 4: Run tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/planViewModel.ts src/components/plan/__tests__/planViewModel.test.ts
git commit -m "feat(plan): derive weekly map and muscle coverage"
```

### Task 5: Plan overview, workspace, and explicit edit mode

**Files:**
- Create: `src/components/plan/PlanOverview.tsx`
- Create: `src/components/plan/PlanDistribution.tsx`
- Create: `src/components/plan/PlanWorkoutReadView.tsx`
- Create: `src/components/plan/PlanWorkoutWorkspace.tsx`
- Create: `src/components/plan/__tests__/planStructure.test.ts`
- Modify: `src/components/plan/PlanDayTimeline.tsx`
- Modify: `src/components/plan/WorkoutExerciseList.tsx`
- Modify: `src/app/(app)/plan/page.tsx`

**Interfaces:**
- Consumes: `PlanWeekEntry[]`, `PlanDistributionItem[]`, localized workout/exercise rows, server actions already imported by plan components.
- Produces: `PlanWorkoutWorkspace` with `mode: 'read' | 'edit'`, mobile Dialog detail, and desktop side panel.

- [ ] **Step 1: Add a source-contract test for information hierarchy**

```ts
const page = readFileSync(new URL('../../../app/(app)/plan/page.tsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../PlanWorkoutWorkspace.tsx', import.meta.url), 'utf8')

it('renders overview and week map before editing tools', () => {
  const ordered = ['<PlanOverview', '<PlanWorkoutWorkspace', '<PlanDistribution']
    .map(marker => page.indexOf(marker))
  expect(ordered.every(position => position >= 0)).toBe(true)
  expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
  expect(workspace).toContain("useState<'read' | 'edit'>('read')")
  expect(workspace).toContain('<WorkoutExerciseList')
})
```

Also assert the page still includes `PlanAdjustButton`, `PlanRegenerateButton`,
`ShareRoutineButton`, plan switching, workout updates, and today-session links.

- [ ] **Step 2: Run the new structure test**

```bash
pnpm vitest run src/components/plan/__tests__/planStructure.test.ts
```

Expected: FAIL because the new components do not exist.

- [ ] **Step 3: Implement `PlanOverview` and `PlanDistribution`**

`PlanOverview` receives only display data:

```ts
type PlanOverviewProps = {
  name: string
  sourceLabel: string
  daysPerWeek: number
  durationMinutes: number | null
  difficultyLabel: string | null
  constraintLabels: string[]
  switcher: React.ReactNode
}
```

`PlanDistribution` renders up to four items initially and an accessible details
disclosure for the rest. Label the visualization “Cobertura relativa”; do not
call the sum “series totales”.

- [ ] **Step 4: Convert `PlanDayTimeline` to the shared timeline**

Change its props to:

```ts
type PlanDayTimelineProps = {
  entries: PlanWeekEntry[]
  selectedWorkoutId: string | null
  onSelectWorkout: (workoutId: string) => void
}
```

Use `TimelineRail` and `TimelineNode` on mobile and desktop. Rest days are compact;
today is active; unscheduled sessions appear last.

- [ ] **Step 5: Implement read view and workspace**

```ts
export type PlanWorkspaceWorkout = {
  summary: PlanDaySummary
  exercises: PlanWorkoutExerciseRow[]
}

export function PlanWorkoutWorkspace(props: {
  planId: string
  entries: PlanWeekEntry[]
  workouts: PlanWorkspaceWorkout[]
  exerciseOptions: PlanExerciseOption[]
  todayIso: number
}) {
  const [selectedId, setSelectedId] = useState(initialWorkoutId(props))
  const [mode, setMode] = useState<'read' | 'edit'>('read')
  // one selected workout; Dialog below lg; aside at lg and above
}
```

`PlanWorkoutReadView` lists exercise name, prescription and muscle groups without
drag handles or destructive actions. Its `Editar estructura` button changes
workspace mode. `WorkoutExerciseList` only renders after that change and keeps
all existing server actions.

Track `dirty` from unsent form input changes inside edit mode. Closing the mobile
Dialog, changing the selected workout, or returning to read mode must open a
confirmation when `dirty` is true. A form `onSubmit` clears the local flag once
the data has been handed to its existing server action; server errors continue
through the existing action feedback. Exercise reorders remain immediate and do
not mark the workspace dirty after their request starts.

- [ ] **Step 6: Recompose the server page**

Map `exerciseRows` to distribution inputs in the server page, call both pure
builders, and pass serializable props to the client workspace. Keep plan summary
forms and destructive actions under the top-right plan menu. Remove duplicated
today hero and per-workout `<details>` blocks.

- [ ] **Step 7: Run focused and static checks**

```bash
pnpm vitest run src/components/plan/__tests__
pnpm type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -- 'src/app/(app)/plan/page.tsx' src/components/plan
git commit -m "feat(plan): turn the active plan into a weekly map"
```

### Task 6: Session focus-window and numeric-step derivations

**Files:**
- Modify: `src/components/session/sessionViewModel.ts`
- Modify: `src/components/session/__tests__/sessionViewModel.test.ts`

**Interfaces:**
- Consumes: `Array<{ status: ExerciseSession['status']; sets: Array<{ completed: boolean }> }>` and current numeric input strings.
- Produces: `SessionFocusWindow`, `buildSessionFocusWindow(exercises)`, and `stepSessionValue(value, delta, precision)`.

- [ ] **Step 1: Add failing focus-window tests**

```ts
it('returns the previous, current, and next set around the active set', () => {
  const result = buildSessionFocusWindow([{ status: 'active', sets: [
    { completed: true }, { completed: false }, { completed: false },
  ] }])
  expect(result).toMatchObject({
    exerciseIndex: 0,
    previousSetIndex: 0,
    currentSetIndex: 1,
    nextSetIndex: 2,
  })
})

it('steps numeric strings without floating-point artifacts', () => {
  expect(stepSessionValue('35', 0.5, 1)).toBe('35.5')
  expect(stepSessionValue('0', -1, 0)).toBe('0')
})
```

Use minimal exercise fixtures matching only `status` and `sets[].completed`.

- [ ] **Step 2: Run the session view-model tests**

```bash
pnpm vitest run src/components/session/__tests__/sessionViewModel.test.ts
```

Expected: FAIL on missing functions.

- [ ] **Step 3: Implement pure helpers**

```ts
export type SessionFocusWindow = {
  exerciseIndex: number
  previousSetIndex: number | null
  currentSetIndex: number | null
  nextSetIndex: number | null
  nextExerciseIndex: number | null
}
```

Return `-1` and null indices when no active exercise exists. Clamp numeric values
to zero and round with `10 ** precision`. Do not mutate store values.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm vitest run src/components/session/__tests__/sessionViewModel.test.ts
git add src/components/session/sessionViewModel.ts src/components/session/__tests__/sessionViewModel.test.ts
git commit -m "feat(session): derive the active set focus window"
```

### Task 7: One-handed active-session interface

**Files:**
- Create: `src/components/session/SessionExerciseHeader.tsx`
- Create: `src/components/session/CompactSetSummary.tsx`
- Create: `src/components/session/ActiveSetFocus.tsx`
- Create: `src/components/session/CompleteSetDock.tsx`
- Modify: `src/components/session/ExerciseCard.tsx`
- Modify: `src/components/session/RestTimer.tsx`
- Modify: `src/components/session/SessionHeader.tsx`
- Modify: `src/app/(app)/session/[workoutId]/SessionClient.tsx`
- Modify: `src/components/session/__tests__/sessionContracts.test.ts`

**Interfaces:**
- Consumes: `ExerciseSession`, `SessionExerciseDraft[]`, `SessionFocusWindow`, and existing `sessionStore` actions.
- Produces: a single expanded active exercise, labeled numeric controls, editable completed-set dialog, and dock that switches between completion and rest.

- [ ] **Step 1: Update session source-contract tests first**

Add assertions:

```ts
const activeSet = readFileSync(new URL('../ActiveSetFocus.tsx', import.meta.url), 'utf8')
const dock = readFileSync(new URL('../CompleteSetDock.tsx', import.meta.url), 'utf8')

it('keeps the one-handed completion action accessible', () => {
  expect(activeSet).toContain("aria-label={t('Peso en kilogramos')}")
  expect(activeSet).toContain("aria-label={t('Repeticiones')}")
  expect(dock).toContain("t('Completar serie {number}'")
  expect(dock).toContain('min-h-14')
})

it('turns the completion dock into the existing rest controls', () => {
  expect(dock).toContain('<RestTimer')
  expect(restTimer).toContain('extendRestTimer')
  expect(restTimer).toContain('clearRestTimer')
})
```

Preserve the existing sync, completion ordering, RPE disabled semantics for the
active row, safe-area, haptics and request-gate assertions.

- [ ] **Step 2: Run session contract tests**

```bash
pnpm vitest run src/components/session/__tests__/sessionContracts.test.ts
```

Expected: FAIL because focus components are absent.

- [ ] **Step 3: Build the exercise header and menu**

Move image, muscle labels, targets, previous performance, replacement, skip and
remove controls out of `ExerciseCard` into `SessionExerciseHeader`. Use an
explicit 44 px menu button; do not require long press.

- [ ] **Step 4: Build compact and active set presentations**

`CompactSetSummary` receives:

```ts
type CompactSetSummaryProps = {
  setNumber: number
  data: SetData
  relation: 'previous' | 'next'
  onEdit?: () => void
}
```

`ActiveSetFocus` renders strength or timed controls based on `targetDuration`.
Keep direct numeric input. Add `−` and `+` controls using `stepSessionValue` with
0.5 kg and 1 repetition defaults. Completion calls `hapticImpact('medium')`
before `completeSet`.

- [ ] **Step 5: Preserve correction of completed sets**

Tapping a previous set opens a Radix Dialog containing enabled weight/reps/time
and RPE controls. Saving calls the existing `updateSetField`,
`updateSetDuration`, and `selectRpe` actions without changing `completed`.

- [ ] **Step 6: Implement the transforming bottom dock**

```tsx
export function CompleteSetDock({ exerciseId, setIndex, onComplete }: Props) {
  const restTimer = useSessionStore(state => state.restTimer)
  return (
    <div className="fitai-safe-bottom fixed inset-x-0 bottom-0 z-30 bg-background/95 p-4 backdrop-blur-xl">
      {restTimer
        ? <RestTimer embedded />
        : <button className="min-h-14 w-full rounded-2xl bg-[hsl(var(--training-action))]" onClick={onComplete}>…</button>}
    </div>
  )
}
```

Change `RestTimer` to accept `embedded?: boolean`; embedded mode removes its own
fixed wrapper but keeps countdown, `+30s`, skip, haptic milestones and safe-area
behavior.

- [ ] **Step 7: Recompose `ExerciseCard` and `SessionClient`**

Only the active exercise renders `SessionExerciseHeader`, previous/current/next
sets and `CompleteSetDock`. Completed, skipped and future exercises render
compact summaries. Move `SessionRoutineTools` after the exercise list. Preserve
empty, pre-session and completion states.

- [ ] **Step 8: Tighten `SessionHeader`**

Keep back, elapsed time, completed/total series, sync state and finish. Use one
progress bar and ensure the sync retry remains 44 px. Do not move sync state into
Zustand.

- [ ] **Step 9: Run session tests and type-check**

```bash
pnpm vitest run src/components/session/__tests__ src/store/__tests__/sessionStore.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -- 'src/app/(app)/session/[workoutId]/SessionClient.tsx' src/components/session
git commit -m "feat(session): focus active workouts on one set"
```

### Task 8: Cross-screen acceptance, accessibility, and visual verification

**Files:**
- Modify: `tests/e2e/core-product.spec.ts`
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `scripts/capture-marketing-screenshots.ts`
- Verify without changing: `tests/e2e/helpers/core-product.ts`

**Interfaces:**
- Consumes: final dashboard, plan and session accessible names.
- Produces: acceptance coverage for the complete core journey.

- [ ] **Step 1: Extend the core-product E2E before final verification**

After dashboard sign-in, assert the chronological landmarks and visit the plan:

```ts
await expect(page.getByRole('heading', { name: /semana en curso|week in progress/i })).toBeVisible()
await page.getByRole('link', { name: /plan/i }).click()
await expect(page.getByRole('heading', { name: /tu semana|your week/i })).toBeVisible()
await expect(page.getByRole('button', { name: /editar estructura|edit structure/i })).toBeVisible()
await page.goto('/dashboard')
```

Keep the existing session recording assertions and replace positional `.first()`
selectors with the unique current-set region:

```ts
const currentSet = page.getByRole('group', { name: /serie actual|current set/i })
await currentSet.getByLabel(/peso en kilogramos|weight in kilograms/i).fill('40')
await currentSet.getByLabel(/repeticiones|reps/i).fill('10')
await page.getByRole('button', { name: /completar serie 1|complete set 1/i }).click()
await expect(page.getByText(/descanso activo|active rest/i)).toBeVisible()
```

- [ ] **Step 2: Extend accessibility coverage**

For dashboard, plan and active session, assert one H1, named main region, no
critical axe violations, unique primary action, and keyboard-reachable notice,
workout selection and exercise menu.

- [ ] **Step 3: Run unit and static verification**

```bash
pnpm test
pnpm type-check
pnpm lint
```

Expected: all tests pass, type-check passes, and lint reports no new errors.

- [ ] **Step 4: Run focused E2E**

```bash
pnpm playwright test tests/e2e/core-product.spec.ts tests/e2e/accessibility.spec.ts
```

Expected: PASS when E2E Supabase credentials are configured. If credentials are
unavailable, record the exact missing variables and run the existing mock or
static coverage instead; do not claim E2E passed.

- [ ] **Step 5: Verify responsive layout in the browser**

Inspect dashboard, plan and session at:

```text
360 × 800
390 × 844
768 × 1024
1280 × 800
```

Confirm no horizontal overflow, one reachable lime CTA, preserved safe areas,
two real columns at 1280 px, and reduced-motion behavior.

- [ ] **Step 6: Verify screenshot selectors against stable capture markers**

Keep `data-marketing-capture="dashboard"` and
`data-marketing-capture="session"`. The capture script must target those two
attributes and not removed headings or old component text; change its selectors
to these attributes when they differ.

- [ ] **Step 7: Commit acceptance coverage**

```bash
git add tests/e2e scripts/capture-marketing-screenshots.ts
git commit -m "test(product): cover the athlete-line training journey"
```

### Task 9: Final cleanup and documentation consistency

**Files:**
- Verify without broad rewrites: files touched by Tasks 1–8
- Verify: `README.md`
- Verify: `docs/superpowers/specs/2026-07-31-core-training-visual-restructure-design.md`

**Interfaces:**
- Consumes: completed implementation and verification output.
- Produces: no dead imports, no obsolete rendered components, and accurate docs.

- [ ] **Step 1: Find obsolete imports and old compositions**

```bash
rg -n "<TodayActionCard|<WeeklyStatus|<PlanViewTabs" src/app src/components
```

Expected: no production render sites remain. Existing unreferenced historical
components can stay; this task does not broaden scope into repository-wide dead
code removal.

- [ ] **Step 2: Run formatting-neutral diff checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no generated screenshots, PWA output, logs,
`.superpowers/`, or environment files staged.

- [ ] **Step 3: Run final verification**

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
```

Expected: all commands succeed; existing lint warnings may remain only if they
were present before this work.

- [ ] **Step 4: Update README only when commands or architecture changed**

No README change is expected because the feature set, setup and stack remain the
same. If implementation adds a new documented command or directory, document
that exact change and rerun `git diff --check`.

- [ ] **Step 5: Commit cleanup if there are tracked changes**

If cleanup produces tracked changes, stage only the known implementation paths
and commit them:

```bash
git add -- 'src/app/(app)/dashboard/page.tsx' 'src/app/(app)/plan/page.tsx' 'src/app/(app)/session/[workoutId]/SessionClient.tsx' src/components/dashboard src/components/plan src/components/session src/components/training src/styles tests/e2e scripts/capture-marketing-screenshots.ts
git commit -m "chore(ui): finish core training visual restructure"
```

Skip this commit when cleanup produces no tracked diff.
