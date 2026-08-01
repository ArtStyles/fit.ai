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

export interface CalendarWorkoutSummary {
  name: string
  focus: string | null
}

export interface RawCalendarProgressLog extends RawProgressLog {
  workout_id: string | null
  workout: CalendarWorkoutSummary | CalendarWorkoutSummary[] | null
}

export interface RawCalendarExerciseLog extends RawExerciseLog {
  sets_completed: number | null
}

export interface CalendarSessionSummary {
  id: string
  date: string
  completedAt: string
  workoutName: string
  focus: string | null
  durationMin: number
  sets: number
  volumeKg: number
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

export function buildCalendarSessionPayload(
  logs: RawCalendarProgressLog[],
  exerciseLogs: RawCalendarExerciseLog[],
  timeZone: string,
): { days: DayAggregate[]; sessions: CalendarSessionSummary[] } {
  const exerciseLogsBySession = new Map<string, RawCalendarExerciseLog[]>()
  for (const exerciseLog of exerciseLogs) {
    const rows = exerciseLogsBySession.get(exerciseLog.progress_log_id) ?? []
    rows.push(exerciseLog)
    exerciseLogsBySession.set(exerciseLog.progress_log_id, rows)
  }

  const sessions = [...logs]
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
    .map(log => {
      const sessionExerciseLogs = exerciseLogsBySession.get(log.id) ?? []
      const workout = Array.isArray(log.workout) ? log.workout[0] ?? null : log.workout
      const sets = sessionExerciseLogs.reduce((sum, row) => {
        const fallback = Math.max(row.weights_kg?.length ?? 0, row.reps_completed?.length ?? 0)
        return sum + (row.sets_completed ?? fallback)
      }, 0)
      const volumeKg = sessionExerciseLogs.reduce((sessionVolume, row) => {
        const weights = row.weights_kg ?? []
        const reps = row.reps_completed ?? []
        return sessionVolume + weights.reduce(
          (exerciseVolume, weight, index) => exerciseVolume + (Number(weight) || 0) * (Number(reps[index]) || 0),
          0,
        )
      }, 0)

      return {
        id: log.id,
        date: getLocalDateString(new Date(log.completed_at), timeZone),
        completedAt: log.completed_at,
        workoutName: workout?.name?.trim() || 'Entrenamiento',
        focus: workout?.focus ?? null,
        durationMin: Number(log.duration_minutes) || 0,
        sets,
        volumeKg,
      }
    })

  return {
    days: aggregateLogsToDays(logs, exerciseLogs, timeZone),
    sessions,
  }
}

// ─── Intensidad (cuantiles del propio usuario) ────────────────────────────────
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

// ─── Rachas y resumen ─────────────────────────────────────────────────────────
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

// ─── Generación de rejillas ───────────────────────────────────────────────────
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
