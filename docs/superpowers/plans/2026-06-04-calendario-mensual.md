# Calendario mensual de entrenamientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir una página `/calendario` que muestre el historial de entrenamiento como un mapa de calor continuo (estilo GitHub) + un mes grande navegable, coloreado por volumen.

**Architecture:** Lógica pura y testeable en `src/lib/calendar/aggregate.ts` (agregación por día, intensidad, rachas, generación de rejillas). Carga de datos server-side en `page.tsx` con RPC `get_calendar_payload` + fallback JS (patrón idéntico a `get_dashboard_payload`/`get_history_payload`). Componentes cliente presentacionales en `src/components/calendar/`. Bucketing por día en la zona horaria de la app.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind, lucide-react, Supabase, Vitest, pnpm.

**Branch:** Trabajar en `feat/calendario-mensual` (o un worktree creado con superpowers:using-git-worktrees). NO trabajar sobre `main`.

**Spec:** `docs/superpowers/specs/2026-06-04-calendario-mensual-design.md`

---

## File Structure

- **Create** `src/lib/calendar/aggregate.ts` — tipos + funciones puras (agregación, intensidad, rachas, stats, rejillas).
- **Create** `src/lib/calendar/__tests__/aggregate.test.ts` — tests Vitest de la lógica pura.
- **Create** `src/components/calendar/intensity.ts` — mapeo nivel→clase Tailwind (UI).
- **Create** `src/components/calendar/CalendarSummary.tsx` — cabecera de stats.
- **Create** `src/components/calendar/MonthGrid.tsx` — mes navegable.
- **Create** `src/components/calendar/ContributionHeatmap.tsx` — tira heatmap continua.
- **Create** `src/components/calendar/CalendarView.tsx` — orquestador cliente.
- **Create** `src/components/calendar/EmptyCalendar.tsx` — estado vacío.
- **Create** `src/app/(app)/calendario/page.tsx` — server component: carga + render.
- **Create** `supabase/migrations/012_calendar_payload.sql` — RPC.
- **Modify** `src/types/database.ts` — tipo de `get_calendar_payload`.
- **Modify** `src/app/(app)/dashboard/page.tsx` — enlace "Ver calendario →".
- **Modify** `src/app/(app)/history/page.tsx` — enlace "Calendario".

---

## Task 1: Tipos + helpers de fecha + agregación

**Files:**
- Create: `src/lib/calendar/aggregate.ts`
- Test: `src/lib/calendar/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/calendar/__tests__/aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  aggregateLogsToDays,
  shiftDateStr,
  daysBetween,
} from '../aggregate'

describe('shiftDateStr', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(shiftDateStr('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('daysBetween', () => {
  it('counts whole days inclusive of direction', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7)
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7)
  })
})

describe('aggregateLogsToDays', () => {
  const TZ = 'America/Havana'

  it('groups logs by local day and sums volume + duration', () => {
    const logs = [
      { id: 'a', completed_at: '2026-02-10T15:00:00Z', duration_minutes: 50 },
      { id: 'b', completed_at: '2026-02-10T20:00:00Z', duration_minutes: 30 },
      { id: 'c', completed_at: '2026-02-12T15:00:00Z', duration_minutes: 40 },
    ]
    const exerciseLogs = [
      { progress_log_id: 'a', weights_kg: [100, 100], reps_completed: [5, 5] }, // 1000
      { progress_log_id: 'b', weights_kg: [50], reps_completed: [10] },         // 500
      { progress_log_id: 'c', weights_kg: [60], reps_completed: [10] },         // 600
    ]
    const result = aggregateLogsToDays(logs, exerciseLogs, TZ)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ date: '2026-02-10', sessions: 2, volumeKg: 1500, durationMin: 80 })
    expect(result[0].logIds).toEqual(['b', 'a']) // newest first within the day
    expect(result[1]).toMatchObject({ date: '2026-02-12', sessions: 1, volumeKg: 600, durationMin: 40 })
  })

  it('returns days sorted ascending and tolerates null arrays', () => {
    const logs = [
      { id: 'x', completed_at: '2026-02-05T12:00:00Z', duration_minutes: null },
      { id: 'y', completed_at: '2026-01-05T12:00:00Z', duration_minutes: 20 },
    ]
    const result = aggregateLogsToDays(logs, [{ progress_log_id: 'x', weights_kg: null, reps_completed: null }], TZ)
    expect(result.map(d => d.date)).toEqual(['2026-01-05', '2026-02-05'])
    expect(result[1]).toMatchObject({ volumeKg: 0, durationMin: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: FAIL — cannot find module `../aggregate`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/calendar/aggregate.ts`:

```ts
import { getLocalDateString } from '@/lib/workouts/schedule'

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface RawProgressLog {
  id: string
  completed_at: string
  duration_minutes: number | null
}

export interface RawExerciseLog {
  progress_log_id: string
  weights_kg: number[] | null
  reps_completed: number[] | null
}

export interface DayAggregate {
  date:        string   // 'YYYY-MM-DD' en zona horaria de la app
  sessions:    number
  volumeKg:    number
  durationMin: number
  logIds:      string[] // recientes primero
}

// ─── Helpers de fecha (basados en UTC, independientes de zona) ────────────────
export function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split('-').map(Number)
  const [ty, tm, td] = toStr.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

// ─── Agregación ───────────────────────────────────────────────────────────────
export function aggregateLogsToDays(
  logs: RawProgressLog[],
  exerciseLogs: RawExerciseLog[],
  timeZone: string,
): DayAggregate[] {
  const volumeByLog = new Map<string, number>()
  for (const el of exerciseLogs) {
    const weights = el.weights_kg ?? []
    const reps = el.reps_completed ?? []
    let v = volumeByLog.get(el.progress_log_id) ?? 0
    for (let i = 0; i < weights.length; i++) {
      v += (Number(weights[i]) || 0) * (Number(reps[i]) || 0)
    }
    volumeByLog.set(el.progress_log_id, v)
  }

  const byDate = new Map<string, DayAggregate>()
  const sorted = [...logs].sort((a, b) => b.completed_at.localeCompare(a.completed_at))
  for (const log of sorted) {
    const date = getLocalDateString(new Date(log.completed_at), timeZone)
    const vol = volumeByLog.get(log.id) ?? 0
    const dur = Number(log.duration_minutes) || 0
    const existing = byDate.get(date)
    if (existing) {
      existing.sessions += 1
      existing.volumeKg += vol
      existing.durationMin += dur
      existing.logIds.push(log.id)
    } else {
      byDate.set(date, { date, sessions: 1, volumeKg: vol, durationMin: dur, logIds: [log.id] })
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/aggregate.ts src/lib/calendar/__tests__/aggregate.test.ts
git commit -m "feat(calendar): add day aggregation + date helpers"
```

---

## Task 2: Intensidad (umbrales por cuantiles + nivel)

**Files:**
- Modify: `src/lib/calendar/aggregate.ts`
- Test: `src/lib/calendar/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Añade `computeIntensityThresholds, intensityLevel` al `import { ... } from '../aggregate'` que ya existe al inicio del archivo de test (no añadas una segunda línea de import), y luego anexa estos tests:

```ts
describe('computeIntensityThresholds + intensityLevel', () => {
  const days = Array.from({ length: 8 }, (_, i) => ({
    date: `2026-02-0${i + 1}`,
    sessions: 1,
    volumeKg: (i + 1) * 100, // 100..800
    durationMin: 30,
    logIds: ['l'],
  }))

  it('derives p25/p50/p75 from trained-day volumes (ignoring zeros)', () => {
    const t = computeIntensityThresholds(days)
    expect(t).toEqual([300, 500, 700])
  })

  it('maps volume to levels 1..4 (a trained day is never level 0)', () => {
    const t = computeIntensityThresholds(days)
    expect(intensityLevel(0, t)).toBe(1)
    expect(intensityLevel(300, t)).toBe(1)
    expect(intensityLevel(400, t)).toBe(2)
    expect(intensityLevel(600, t)).toBe(3)
    expect(intensityLevel(800, t)).toBe(4)
  })

  it('returns zero thresholds when there is no positive volume', () => {
    expect(computeIntensityThresholds([])).toEqual([0, 0, 0])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: FAIL — `computeIntensityThresholds` / `intensityLevel` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/calendar/aggregate.ts`:

```ts
export type IntensityThresholds = [number, number, number] // p25, p50, p75

export function computeIntensityThresholds(days: DayAggregate[]): IntensityThresholds {
  const volumes = days.map(d => d.volumeKg).filter(v => v > 0).sort((a, b) => a - b)
  if (volumes.length === 0) return [0, 0, 0]
  const q = (p: number) => volumes[Math.min(volumes.length - 1, Math.floor(p * volumes.length))]
  return [q(0.25), q(0.5), q(0.75)]
}

export function intensityLevel(volumeKg: number, thresholds: IntensityThresholds): 1 | 2 | 3 | 4 {
  const [p25, p50, p75] = thresholds
  if (volumeKg > p75) return 4
  if (volumeKg > p50) return 3
  if (volumeKg > p25) return 2
  return 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/aggregate.ts src/lib/calendar/__tests__/aggregate.test.ts
git commit -m "feat(calendar): add quantile-based intensity levels"
```

---

## Task 3: Rachas + stats

**Files:**
- Modify: `src/lib/calendar/aggregate.ts`
- Test: `src/lib/calendar/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Añade `computeStreaks, computeCalendarStats` al `import { ... } from '../aggregate'` existente (no añadas una segunda línea de import), y anexa estos tests:

```ts
describe('computeStreaks', () => {
  it('counts current streak through today', () => {
    const dates = new Set(['2026-02-08', '2026-02-09', '2026-02-10'])
    expect(computeStreaks(dates, '2026-02-10')).toEqual({ current: 3, max: 3 })
  })

  it('keeps the current streak when today is not trained but yesterday was', () => {
    const dates = new Set(['2026-02-08', '2026-02-09'])
    expect(computeStreaks(dates, '2026-02-10').current).toBe(2)
  })

  it('breaks the current streak after a full missed day', () => {
    const dates = new Set(['2026-02-01', '2026-02-02', '2026-02-08'])
    const result = computeStreaks(dates, '2026-02-10')
    expect(result.current).toBe(0)
    expect(result.max).toBe(2)
  })
})

describe('computeCalendarStats', () => {
  it('summarises trained days, streaks, average per week and volume', () => {
    const days = [
      { date: '2026-02-02', sessions: 1, volumeKg: 1000, durationMin: 60, logIds: ['a'] },
      { date: '2026-02-04', sessions: 1, volumeKg: 1500, durationMin: 50, logIds: ['b'] },
    ]
    const stats = computeCalendarStats(days, '2026-02-08')
    expect(stats.trainedDays).toBe(2)
    expect(stats.totalVolumeKg).toBe(2500)
    expect(stats.maxStreak).toBe(1)
    expect(stats.avgPerWeek).toBe(2) // 2 días en una semana de span
  })

  it('returns zeros for an empty history', () => {
    expect(computeCalendarStats([], '2026-02-08')).toEqual({
      trainedDays: 0, currentStreak: 0, maxStreak: 0, avgPerWeek: 0, totalVolumeKg: 0,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: FAIL — `computeStreaks` / `computeCalendarStats` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/calendar/aggregate.ts`:

```ts
export interface CalendarStats {
  trainedDays:   number
  currentStreak: number
  maxStreak:     number
  avgPerWeek:    number
  totalVolumeKg: number
}

export function computeStreaks(
  trainedDates: Set<string>,
  todayStr: string,
): { current: number; max: number } {
  let current = 0
  let cursor = trainedDates.has(todayStr) ? todayStr : shiftDateStr(todayStr, -1)
  while (trainedDates.has(cursor)) {
    current++
    cursor = shiftDateStr(cursor, -1)
  }

  let max = 0
  let run = 0
  let prev: string | null = null
  for (const date of Array.from(trainedDates).sort()) {
    run = prev !== null && shiftDateStr(prev, 1) === date ? run + 1 : 1
    if (run > max) max = run
    prev = date
  }

  return { current, max }
}

export function computeCalendarStats(days: DayAggregate[], todayStr: string): CalendarStats {
  const trainedDays = days.length
  const totalVolumeKg = Math.round(days.reduce((sum, d) => sum + d.volumeKg, 0))
  const { current, max } = computeStreaks(new Set(days.map(d => d.date)), todayStr)

  let avgPerWeek = 0
  if (days.length > 0) {
    const spanDays = daysBetween(days[0].date, todayStr) + 1
    avgPerWeek = Math.round((trainedDays / Math.max(1, spanDays / 7)) * 10) / 10
  }

  return { trainedDays, currentStreak: current, maxStreak: max, avgPerWeek, totalVolumeKg }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/aggregate.ts src/lib/calendar/__tests__/aggregate.test.ts
git commit -m "feat(calendar): add streaks and summary stats"
```

---

## Task 4: Generación de rejillas (mes + heatmap)

**Files:**
- Modify: `src/lib/calendar/aggregate.ts`
- Test: `src/lib/calendar/__tests__/aggregate.test.ts`

- [ ] **Step 1: Write the failing test**

Añade `buildMonthGrid, buildHeatmapWeeks` al `import { ... } from '../aggregate'` existente (no añadas una segunda línea de import), y anexa estos tests:

```ts
describe('buildMonthGrid', () => {
  it('pads to whole weeks, Monday-first, and flags today/future', () => {
    // Febrero 2026: 1 de feb es domingo → 6 huecos iniciales (L..S)
    const cells = buildMonthGrid(2026, 2, '2026-02-15')
    expect(cells.length % 7).toBe(0)
    expect(cells.slice(0, 6).every(c => c.date === null)).toBe(true)
    expect(cells[6]).toMatchObject({ date: '2026-02-01', dayNum: 1 })

    const today = cells.find(c => c.date === '2026-02-15')
    expect(today?.isToday).toBe(true)
    expect(cells.find(c => c.date === '2026-02-20')?.isFuture).toBe(true)
    expect(cells.find(c => c.date === '2026-02-10')?.isFuture).toBe(false)
  })
})

describe('buildHeatmapWeeks', () => {
  it('returns Monday-first columns covering from..to with future padding as null', () => {
    const weeks = buildHeatmapWeeks('2026-02-04', '2026-02-15') // mié → dom
    expect(weeks).toHaveLength(2)
    expect(weeks[0][0]).toBe('2026-02-02') // lunes de la primera semana
    expect(weeks[0][6]).toBe('2026-02-08') // domingo
    expect(weeks[1][0]).toBe('2026-02-09')
    expect(weeks[1][6]).toBe('2026-02-15')
  })

  it('fills days after toDate with null', () => {
    const weeks = buildHeatmapWeeks('2026-02-09', '2026-02-11') // lun → mié
    expect(weeks).toHaveLength(1)
    expect(weeks[0].slice(0, 3)).toEqual(['2026-02-09', '2026-02-10', '2026-02-11'])
    expect(weeks[0].slice(3)).toEqual([null, null, null, null])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: FAIL — `buildMonthGrid` / `buildHeatmapWeeks` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/calendar/aggregate.ts`:

```ts
export interface MonthCell {
  date:     string | null
  dayNum:   number | null
  isToday:  boolean
  isFuture: boolean
}

export type HeatmapWeek = (string | null)[] // longitud 7, L→D

function mondayOfStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // 0 = lunes
  return shiftDateStr(dateStr, -dow)
}

export function buildMonthGrid(year: number, month: number, todayStr: string): MonthCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = (first.getUTCDay() + 6) % 7
  const cells: MonthCell[] = []

  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: null, dayNum: null, isToday: false, isFuture: false })
  }

  const mm = String(month).padStart(2, '0')
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`
    cells.push({ date, dayNum: d, isToday: date === todayStr, isFuture: date > todayStr })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayNum: null, isToday: false, isFuture: false })
  }

  return cells
}

export function buildHeatmapWeeks(fromDateStr: string, toDateStr: string): HeatmapWeek[] {
  const weeks: HeatmapWeek[] = []
  let cursor = mondayOfStr(fromDateStr)

  while (cursor <= toDateStr) {
    const week: HeatmapWeek = []
    for (let i = 0; i < 7; i++) {
      week.push(cursor > toDateStr ? null : cursor)
      cursor = shiftDateStr(cursor, 1)
    }
    weeks.push(week)
  }

  return weeks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/calendar/__tests__/aggregate.test.ts`
Expected: PASS (toda la suite del archivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/calendar/aggregate.ts src/lib/calendar/__tests__/aggregate.test.ts
git commit -m "feat(calendar): add month + heatmap grid builders"
```

---

## Task 5: Migración SQL del RPC + tipo en database.ts

**Files:**
- Create: `supabase/migrations/012_calendar_payload.sql`
- Modify: `src/types/database.ts` (bloque `Functions`)

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/012_calendar_payload.sql`:

```sql
-- ============================================================
-- Migration 012: calendar payload helper
-- ============================================================
-- Objetivo:
--   - Exponer una RPC segura por auth.uid() que devuelve los
--     agregados por día (sesiones, volumen, duración, log_ids)
--     para la vista /calendario.
--   - Agrupar por día en la zona horaria de la app.
-- PREREQUISITO: aplicar 001-011 antes de esta migración.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_calendar_payload(
  p_time_zone text DEFAULT 'America/Havana',
  p_from      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH day_sessions AS (
  SELECT
    (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COUNT(*)::int AS sessions,
    COALESCE(SUM(pl.duration_minutes), 0)::int AS duration_min,
    jsonb_agg(pl.id ORDER BY pl.completed_at DESC) AS log_ids
  FROM progress_logs pl
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
),
day_volume AS (
  SELECT
    (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COALESCE(SUM(weight_value * rep_value), 0)::numeric AS volume_kg
  FROM progress_logs pl
  JOIN exercise_logs el ON el.progress_log_id = pl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'date',         to_char(ds.day, 'YYYY-MM-DD'),
    'sessions',     ds.sessions,
    'duration_min', ds.duration_min,
    'volume_kg',    COALESCE(dv.volume_kg, 0),
    'log_ids',      ds.log_ids
  ) ORDER BY ds.day
), '[]'::jsonb)
FROM day_sessions ds
LEFT JOIN day_volume dv ON dv.day = ds.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_payload(text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_calendar_payload(text, timestamptz) IS
  'Agregados por día (sesiones, volumen, duración, log_ids) del usuario autenticado para el calendario.';
```

- [ ] **Step 2: Add the RPC type**

In `src/types/database.ts`, find the `Functions: {` block (donde están `get_dashboard_payload` y `get_history_payload`) and add this entry alongside the others:

```ts
get_calendar_payload: {
  Args: {
    p_time_zone?: string
    p_from?: string | null
  }
  Returns: {
    date: string
    sessions: number
    duration_min: number
    volume_kg: number | string
    log_ids: string[]
  }[]
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_calendar_payload.sql src/types/database.ts
git commit -m "feat(calendar): add get_calendar_payload RPC + types"
```

> Nota de despliegue: aplicar la migración en Supabase (SQL editor o CLI). Hasta entonces, la página usa el fallback JS (Task 9).

---

## Task 6: Helper de intensidad (UI) + CalendarSummary

**Files:**
- Create: `src/components/calendar/intensity.ts`
- Create: `src/components/calendar/CalendarSummary.tsx`

- [ ] **Step 1: Create the intensity class helper**

Create `src/components/calendar/intensity.ts`:

```ts
import { intensityLevel, type IntensityThresholds } from '@/lib/calendar/aggregate'

export type CellLevel = 0 | 1 | 2 | 3 | 4

const LEVEL_CLASS: Record<CellLevel, string> = {
  0: 'border border-border/40 bg-transparent',
  1: 'bg-violet-500/20',
  2: 'bg-violet-500/40',
  3: 'bg-violet-500/65',
  4: 'bg-violet-500/90 shadow-[0_0_8px_rgba(139,92,246,0.45)]',
}

/** Nivel 0 cuando no hay registro (volumeKg === null); 1..4 para días entrenados. */
export function levelFor(volumeKg: number | null, thresholds: IntensityThresholds): CellLevel {
  if (volumeKg === null) return 0
  return intensityLevel(volumeKg, thresholds)
}

export function intensityClass(level: CellLevel): string {
  return LEVEL_CLASS[level]
}
```

- [ ] **Step 2: Create CalendarSummary**

Create `src/components/calendar/CalendarSummary.tsx`:

```tsx
import { CalendarCheck, Dumbbell, Flame, TrendingUp } from 'lucide-react'
import type { CalendarStats } from '@/lib/calendar/aggregate'

export function CalendarSummary({ stats }: { stats: CalendarStats }) {
  const items = [
    { label: 'Días',     value: stats.trainedDays,         icon: CalendarCheck },
    { label: 'Racha',    value: `${stats.currentStreak}d`, icon: Flame },
    { label: 'Récord',   value: `${stats.maxStreak}d`,     icon: TrendingUp },
    { label: 'Días/sem', value: stats.avgPerWeek,          icon: Dumbbell },
  ]

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl border border-border/60 bg-muted/10 p-3 text-center">
          <Icon className="mx-auto h-4 w-4 text-violet-300" />
          <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/intensity.ts src/components/calendar/CalendarSummary.tsx
git commit -m "feat(calendar): add intensity class helper + summary header"
```

---

## Task 7: MonthGrid

**Files:**
- Create: `src/components/calendar/MonthGrid.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/calendar/MonthGrid.tsx`:

```tsx
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import { buildMonthGrid, type DayAggregate, type IntensityThresholds } from '@/lib/calendar/aggregate'
import { intensityClass, levelFor } from './intensity'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

interface Props {
  year:       number
  month:      number // 1-12
  todayStr:   string
  byDate:     Map<string, DayAggregate>
  thresholds: IntensityThresholds
  onPrev:     () => void
  onNext:     () => void
  onToday:    () => void
}

function monthLabel(year: number, month: number): string {
  const label = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthGrid({ year, month, todayStr, byDate, thresholds, onPrev, onNext, onToday }: Props) {
  const cells = buildMonthGrid(year, month, todayStr)
  const isCurrentMonth = todayStr.startsWith(`${year}-${String(month).padStart(2, '0')}`)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button" onClick={onPrev} aria-label="Mes anterior"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="text-center">
          <p className="font-display text-lg font-bold text-foreground" aria-live="polite">
            {monthLabel(year, month)}
          </p>
          {!isCurrentMonth && (
            <button type="button" onClick={onToday} className="text-xs font-medium text-violet-400 hover:underline">
              Hoy
            </button>
          )}
        </div>

        <button
          type="button" onClick={onNext} aria-label="Mes siguiente"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={`wd-${i}`} className="pb-1 text-[10px] font-semibold uppercase text-muted-foreground/70">{d}</span>
        ))}

        {cells.map((cell, i) => {
          if (!cell.date) return <span key={`pad-${i}`} />

          const agg = byDate.get(cell.date)
          const level = cell.isFuture ? 0 : levelFor(agg ? agg.volumeKg : null, thresholds)
          const label = agg
            ? `${cell.date}: ${Math.round(agg.volumeKg)} kg · ${agg.durationMin} min`
            : `${cell.date}: sin registro`

          const inner = (
            <div className={cn(
              'flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition-colors',
              intensityClass(level),
              cell.isFuture && 'opacity-30',
              cell.isToday && 'ring-2 ring-violet-500',
              level >= 3 ? 'text-white' : 'text-foreground',
            )}>
              {cell.dayNum}
            </div>
          )

          if (agg && !cell.isFuture) {
            return (
              <PendingLink key={cell.date} href={`/history/${agg.logIds[0]}`} aria-label={label} title={label} showSpinner={false}>
                {inner}
              </PendingLink>
            )
          }

          return <div key={cell.date} aria-label={label} title={label}>{inner}</div>
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/MonthGrid.tsx
git commit -m "feat(calendar): add navigable month grid"
```

---

## Task 8: ContributionHeatmap

**Files:**
- Create: `src/components/calendar/ContributionHeatmap.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/calendar/ContributionHeatmap.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { buildHeatmapWeeks, type DayAggregate, type IntensityThresholds } from '@/lib/calendar/aggregate'
import { intensityClass, levelFor, type CellLevel } from './intensity'

interface Props {
  fromDate:     string
  toDate:       string
  byDate:       Map<string, DayAggregate>
  thresholds:   IntensityThresholds
  onSelectDate: (dateStr: string) => void
}

function monthShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function ContributionHeatmap({ fromDate, toDate, byDate, thresholds, onSelectDate }: Props) {
  const weeks = buildHeatmapWeeks(fromDate, toDate)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  // Etiqueta de mes: en la primera semana en la que aparece un mes nuevo.
  let lastMonth = ''
  const labels = weeks.map(week => {
    const firstDate = week.find((c): c is string => c !== null)
    if (!firstDate) return ''
    const month = firstDate.slice(0, 7)
    if (month !== lastMonth) { lastMonth = month; return monthShort(firstDate) }
    return ''
  })

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-1" role="img" aria-label="Mapa de constancia de entrenamientos">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1">
          {labels.map((label, i) => (
            <span key={`lbl-${i}`} className="w-3.5 shrink-0 text-[9px] text-muted-foreground/70">{label}</span>
          ))}
        </div>

        <div className="flex gap-1">
          {weeks.map((week, wi) => (
            <div key={`wk-${wi}`} className="flex flex-col gap-1">
              {week.map((date, di) => {
                if (!date) return <span key={`e-${di}`} className="h-3.5 w-3.5" />
                const agg = byDate.get(date)
                const level = levelFor(agg ? agg.volumeKg : null, thresholds)
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelectDate(date)}
                    title={agg ? `${date}: ${Math.round(agg.volumeKg)} kg` : date}
                    aria-label={agg ? `${date}, ${Math.round(agg.volumeKg)} kilos` : `${date}, sin registro`}
                    className={cn('h-3.5 w-3.5 shrink-0 rounded-sm transition-transform hover:scale-125', intensityClass(level))}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground/70">
          <span>menos</span>
          {([1, 2, 3, 4] as CellLevel[]).map(l => (
            <span key={l} className={cn('h-2.5 w-2.5 rounded-sm', intensityClass(l))} />
          ))}
          <span>más</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/ContributionHeatmap.tsx
git commit -m "feat(calendar): add contribution heatmap strip"
```

---

## Task 9: CalendarView + EmptyCalendar

**Files:**
- Create: `src/components/calendar/EmptyCalendar.tsx`
- Create: `src/components/calendar/CalendarView.tsx`

- [ ] **Step 1: Create EmptyCalendar**

Create `src/components/calendar/EmptyCalendar.tsx`:

```tsx
import { CalendarRange } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'

export function EmptyCalendar() {
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
        <CalendarRange className="h-6 w-6 text-violet-400" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-foreground">Aún no hay constancia que mostrar</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Cuando completes entrenamientos verás aquí tu mapa de constancia mes a mes.
      </p>
      <PendingLink
        href="/dashboard"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-600"
      >
        Ir al dashboard
      </PendingLink>
    </section>
  )
}
```

- [ ] **Step 2: Create CalendarView**

Create `src/components/calendar/CalendarView.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { CalendarSummary } from './CalendarSummary'
import { ContributionHeatmap } from './ContributionHeatmap'
import { MonthGrid } from './MonthGrid'
import {
  computeCalendarStats,
  computeIntensityThresholds,
  shiftDateStr,
  type DayAggregate,
} from '@/lib/calendar/aggregate'

export function CalendarView({ days, todayStr }: { days: DayAggregate[]; todayStr: string }) {
  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const thresholds = useMemo(() => computeIntensityThresholds(days), [days])
  const stats = useMemo(() => computeCalendarStats(days, todayStr), [days, todayStr])

  const [todayY, todayM] = todayStr.split('-').map(Number)
  const [selected, setSelected] = useState({ year: todayY, month: todayM })

  const fromDate = days.length > 0 ? days[0].date : shiftDateStr(todayStr, -180)

  const goPrev = () =>
    setSelected(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }))
  const goNext = () =>
    setSelected(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }))
  const goToday = () => setSelected({ year: todayY, month: todayM })
  const selectDate = (dateStr: string) => {
    const [y, m] = dateStr.split('-').map(Number)
    setSelected({ year: y, month: m })
  }

  return (
    <div className="space-y-8">
      <CalendarSummary stats={stats} />

      <section>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Tu constancia</p>
        <ContributionHeatmap
          fromDate={fromDate}
          toDate={todayStr}
          byDate={byDate}
          thresholds={thresholds}
          onSelectDate={selectDate}
        />
      </section>

      <section>
        <MonthGrid
          year={selected.year}
          month={selected.month}
          todayStr={todayStr}
          byDate={byDate}
          thresholds={thresholds}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/EmptyCalendar.tsx src/components/calendar/CalendarView.tsx
git commit -m "feat(calendar): add calendar orchestrator + empty state"
```

---

## Task 10: Página /calendario (carga server + render)

**Files:**
- Create: `src/app/(app)/calendario/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(app)/calendario/page.tsx`:

```tsx
import { ArrowLeft, CalendarRange } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { CalendarView } from '@/components/calendar/CalendarView'
import { EmptyCalendar } from '@/components/calendar/EmptyCalendar'
import { requireAppUserContext } from '@/lib/auth/server'
import { addDays, getAppTimeZone, getLocalDateString } from '@/lib/workouts/schedule'
import {
  aggregateLogsToDays,
  type DayAggregate,
  type RawExerciseLog,
  type RawProgressLog,
} from '@/lib/calendar/aggregate'

export const metadata = { title: 'Calendario · FitAI' }

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type CalendarRpcRow = {
  date: string
  sessions: number
  duration_min: number
  volume_kg: number | string
  log_ids: string[]
}

type CalendarRpcClient = {
  rpc: (
    functionName: 'get_calendar_payload',
    args: { p_time_zone: string },
  ) => Promise<{ data: CalendarRpcRow[] | null; error: { message?: string } | null }>
}

async function loadCalendarFallback(
  supabase: AppSupabaseClient,
  userId: string,
  timeZone: string,
): Promise<DayAggregate[]> {
  const from = addDays(new Date(), -365).toISOString()

  const { data: logs } = await supabase
    .from('progress_logs')
    .select('id, completed_at, duration_minutes')
    .eq('user_id', userId)
    .not('workout_id', 'is', null)
    .gte('completed_at', from)
    .order('completed_at', { ascending: false }) as unknown as { data: RawProgressLog[] | null }

  const ids = (logs ?? []).map(log => log.id)
  let exerciseLogs: RawExerciseLog[] = []

  if (ids.length > 0) {
    const { data } = await supabase
      .from('exercise_logs')
      .select('progress_log_id, weights_kg, reps_completed')
      .in('progress_log_id', ids) as unknown as { data: RawExerciseLog[] | null }
    exerciseLogs = data ?? []
  }

  return aggregateLogsToDays(logs ?? [], exerciseLogs, timeZone)
}

async function loadCalendarDays(
  supabase: AppSupabaseClient,
  userId: string,
  timeZone: string,
): Promise<DayAggregate[]> {
  try {
    const { data, error } = await (supabase as unknown as CalendarRpcClient)
      .rpc('get_calendar_payload', { p_time_zone: timeZone })

    if (!error && data) {
      return data.map(row => ({
        date: row.date,
        sessions: Number(row.sessions),
        volumeKg: Number(row.volume_kg),
        durationMin: Number(row.duration_min),
        logIds: row.log_ids ?? [],
      }))
    }
  } catch {
    // La migración 012 puede no estar aplicada todavía; el fallback mantiene la pantalla usable.
  }

  return loadCalendarFallback(supabase, userId, timeZone)
}

export default async function CalendarPage() {
  const { supabase, user } = await requireAppUserContext()
  const timeZone = getAppTimeZone()
  const todayStr = getLocalDateString()
  const days = await loadCalendarDays(supabase, user.id, timeZone)

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="mx-auto max-w-lg px-4 py-8">
        <PendingLink
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </PendingLink>

        <header className="mt-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            <CalendarRange className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Calendario</h1>
            <p className="text-sm text-muted-foreground">Tu historial de entrenamiento mes a mes</p>
          </div>
        </header>

        {days.length === 0 ? (
          <EmptyCalendar />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-3 mt-8 duration-500">
            <CalendarView days={days} todayStr={todayStr} />
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Manual verification (dev server)**

Run: `pnpm dev`, abrir `/calendario` autenticado.
Expected: carga sin errores; con sesiones se ven resumen + heatmap + mes; sin sesiones se ve el estado vacío. (El usuario valida la estética.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/calendario/page.tsx"
git commit -m "feat(calendar): add /calendario page with RPC + fallback loader"
```

---

## Task 11: Enlaces de entrada (dashboard + historial)

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` (sección del `WeekCalendar`, ~líneas 532-545)
- Modify: `src/app/(app)/history/page.tsx` (cabecera, ~líneas 238-245 + import)

- [ ] **Step 1: Dashboard — añadir enlace junto a "Ver plan completo →"**

En `src/app/(app)/dashboard/page.tsx`, reemplazar:

```tsx
            <WeekCalendar days={weekDays} todayIso={todayIso} />
            <PendingLink
              href="/plan"
              className="mt-4 inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
            >
              Ver plan completo →
            </PendingLink>
```

por:

```tsx
            <WeekCalendar days={weekDays} todayIso={todayIso} />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <PendingLink
                href="/plan"
                className="inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
              >
                Ver plan completo →
              </PendingLink>
              <PendingLink
                href="/calendario"
                className="inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
              >
                Ver calendario →
              </PendingLink>
            </div>
```

- [ ] **Step 2: Historial — añadir enlace "Calendario" en la cabecera**

En `src/app/(app)/history/page.tsx`, añadir `CalendarRange` al import de `lucide-react` (junto a `ArrowLeft, History, Medal, Trophy`), y reemplazar el enlace de retorno:

```tsx
        <PendingLink
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </PendingLink>
```

por:

```tsx
        <div className="flex items-center justify-between">
          <PendingLink
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
            showSpinner={false}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </PendingLink>
          <PendingLink
            href="/calendario"
            className="inline-flex items-center text-sm font-medium text-violet-400 hover:underline"
            showSpinner={false}
          >
            <CalendarRange className="mr-1.5 h-4 w-4" />
            Calendario
          </PendingLink>
        </div>
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" "src/app/(app)/history/page.tsx"
git commit -m "feat(calendar): link /calendario from dashboard and history"
```

---

## Task 12: Verificación final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Tests completos**

Run: `pnpm test`
Expected: PASS (toda la suite, incluida `aggregate.test.ts`).

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: sin errores nuevos en `src/lib/calendar/**`, `src/components/calendar/**`, `src/app/(app)/calendario/**`.

- [ ] **Step 4: Verificación manual (usuario)**

Con `pnpm dev`: navegar Dashboard → "Ver calendario →"; comprobar heatmap (scroll, tap salta de mes), mes navegable (‹ ›, "Hoy"), tap en día entrenado → detalle `/history/[logId]`, estado vacío en cuenta sin sesiones. El usuario valida la estética en el navegador.

- [ ] **Step 5: Commit final (si hubo ajustes)**

```bash
git add -A
git commit -m "chore(calendar): final verification pass"
```

---

## Notas de cierre

- **Despliegue de la migración 012** en Supabase para activar la vía RPC (hasta entonces corre el fallback de 12 meses).
- Fuera de alcance v1 (follow-up): sheet multi-sesión por día, marcadores de PR en el heatmap, overlay de programado/saltado en meses pasados, carga > 12 meses en el fallback.
