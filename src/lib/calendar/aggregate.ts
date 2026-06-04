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
