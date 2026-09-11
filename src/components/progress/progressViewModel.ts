import { shiftDateStr, type DayAggregate } from '@/lib/calendar/aggregate'
import { percentChange } from '@/lib/training-evidence/performance'
import type { FreeTrainingDetail } from '@/lib/session/freeTrainingEvidence'
import { MAX_SESSION_REPS, MAX_SESSION_SETS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'

export type ProgressRangeWeeks = 1 | 4 | 12 | 24

export type ProgressSession = {
  id: string
  completedAt: string
  date: string
  durationMinutes: number
  volumeKg: number
  detailLevel?: FreeTrainingDetail | null
}

export type ProgressRecord = {
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  bestCompletedAt: string
  bestDate: string
  maxWeightKg: number
  repsAtMaxWeight: number
  maxReps: number
  totalVolumeKg: number
  sessionCount: number
}

export type ProgressMeasurement = {
  id: string
  recordedAt: string
  recordedDate: string
  weightKg: number | null
  bodyFatPercentage: number | null
  waistCm: number | null
}

export type ProgressExercisePoint = {
  exerciseId: string
  exerciseName: string
  date: string
  completedAt?: string
  sessionId?: string
  maxWeightKg: number
  repsAtMaxWeight: number
  volumeKg: number
}

export type ProgressSetEvidenceSummary = {
  bestSet: { weightKg: number; reps: number }
  maxReps: number
  volumeKg: number
}

export function summarizeProgressSetEvidence({
  setsCompleted,
  weightsKg,
  repsCompleted,
}: {
  setsCompleted: unknown
  weightsKg: unknown
  repsCompleted: unknown
}): ProgressSetEvidenceSummary | null {
  if (typeof setsCompleted !== 'number' || !Number.isInteger(setsCompleted) || setsCompleted < 1 || setsCompleted > MAX_SESSION_SETS || !Array.isArray(weightsKg) || !Array.isArray(repsCompleted)) return null

  const sets: Array<{ weightKg: number; reps: number }> = []
  const limit = Math.min(setsCompleted, weightsKg.length, repsCompleted.length)
  for (let index = 0; index < limit; index += 1) {
    const weightKg = weightsKg[index]
    const reps = repsCompleted[index]
    if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0 || weightKg > MAX_SESSION_WEIGHT_KG) continue
    if (typeof reps !== 'number' || !Number.isInteger(reps) || reps < 1 || reps > MAX_SESSION_REPS) continue
    sets.push({ weightKg, reps })
  }
  if (sets.length === 0) return null

  const bestSet = sets.reduce((best, set) => (
    set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps) ? set : best
  ))
  return {
    bestSet,
    maxReps: Math.max(...sets.map(set => set.reps)),
    volumeKg: sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0),
  }
}

export function normalizeProgressDayVolumes(days: DayAggregate[], sessions: ProgressSession[]): DayAggregate[] {
  const volumeByDate = new Map<string, number>()
  for (const session of sessions) volumeByDate.set(session.date, (volumeByDate.get(session.date) ?? 0) + session.volumeKg)
  return days.map(day => ({ ...day, volumeKg: Math.round(volumeByDate.get(day.date) ?? 0) }))
}

export type ProgressWeekBucket = {
  startDate: string
  endDate: string
  sessions: number
  trainedDays: number
  volumeKg: number
}

export type ProgressExerciseHighlight = {
  exerciseId: string
  exerciseName: string
  latestWeightKg: number
  changePercent: number
}

export type ProgressSnapshotInput = {
  todayStr: string
  weeks: ProgressRangeWeeks
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  exercisePoints: ProgressExercisePoint[]
}

export function buildWeekBuckets(
  days: DayAggregate[],
  startDate: string,
  todayStr: string,
  weeks: ProgressRangeWeeks,
): ProgressWeekBucket[] {
  const byDate = new Map(days.map(day => [day.date, day]))

  return Array.from({ length: weeks }, (_, weekIndex) => {
    const weekStart = shiftDateStr(startDate, weekIndex * 7)
    const weekEnd = shiftDateStr(weekStart, 6)
    let sessions = 0
    let trainedDays = 0
    let volumeKg = 0

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = shiftDateStr(weekStart, dayIndex)
      if (date > todayStr) break
      const day = byDate.get(date)
      if (!day) continue
      sessions += day.sessions
      trainedDays += 1
      volumeKg += day.volumeKg
    }

    return {
      startDate: weekStart,
      endDate: weekEnd > todayStr ? todayStr : weekEnd,
      sessions,
      trainedDays,
      volumeKg: Math.round(volumeKg),
    }
  })
}

function buildExerciseHighlights(
  points: ProgressExercisePoint[],
  startDate: string,
  endDate: string,
): ProgressExerciseHighlight[] {
  const grouped = new Map<string, ProgressExercisePoint[]>()

  for (const point of points.filter(item => item.date >= startDate && item.date <= endDate && item.maxWeightKg > 0)) {
    grouped.set(point.exerciseId, [...(grouped.get(point.exerciseId) ?? []), point])
  }

  return Array.from(grouped.values())
    .flatMap(items => {
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
    })
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 3)
}

export function buildProgressSnapshot(input: ProgressSnapshotInput) {
  const startDate = shiftDateStr(input.todayStr, -(input.weeks * 7 - 1))
  const priorStart = shiftDateStr(startDate, -(input.weeks * 7))
  const priorEnd = shiftDateStr(startDate, -1)
  const selected = input.sessions.filter(item => item.date >= startDate && item.date <= input.todayStr)
  const prior = input.sessions.filter(item => item.date >= priorStart && item.date <= priorEnd)
  const incomplete = (item: ProgressSession) => item.detailLevel === 'attendance' || item.detailLevel === 'partial'
  const volumeKg = selected.reduce((sum, item) => sum + item.volumeKg, 0)
  const priorVolumeKg = prior.reduce((sum, item) => sum + item.volumeKg, 0)
  const selectedRecords = input.records.filter(record => record.bestDate >= startDate && record.bestDate <= input.todayStr)

  return {
    startDate,
    priorStart,
    priorEnd,
    selected,
    selectedRecords,
    incompleteSessionCount: selected.filter(incomplete).length,
    comparisonHasIncompleteEvidence: selected.some(incomplete) || prior.some(incomplete),
    weeklyBuckets: buildWeekBuckets(input.days, startDate, input.todayStr, input.weeks),
    volumeKg: Math.round(volumeKg),
    priorVolumeKg: Math.round(priorVolumeKg),
    volumeDelta: percentChange(volumeKg, priorVolumeKg),
    comparisonLabel: priorVolumeKg > 0 ? 'available' as const : 'none' as const,
    sessionsPerWeek: Math.round((selected.length / input.weeks) * 10) / 10,
    recordCount: selectedRecords.length,
    exerciseHighlights: buildExerciseHighlights(input.exercisePoints, startDate, input.todayStr),
  }
}
