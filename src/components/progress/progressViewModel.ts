import { shiftDateStr, type DayAggregate } from '@/lib/calendar/aggregate'
import { percentChange } from '@/lib/training-evidence/performance'

export type ProgressRangeWeeks = 4 | 12 | 24

export type ProgressSession = {
  id: string
  completedAt: string
  date: string
  durationMinutes: number
  volumeKg: number
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
  maxWeightKg: number
  repsAtMaxWeight: number
  volumeKg: number
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
  const volumeKg = selected.reduce((sum, item) => sum + item.volumeKg, 0)
  const priorVolumeKg = prior.reduce((sum, item) => sum + item.volumeKg, 0)
  const selectedRecords = input.records.filter(record => record.bestDate >= startDate && record.bestDate <= input.todayStr)

  return {
    startDate,
    priorStart,
    priorEnd,
    selected,
    selectedRecords,
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
