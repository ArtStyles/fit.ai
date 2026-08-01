import { shiftDateStr } from '@/lib/calendar/aggregate'
import { dateLocale } from '@/lib/i18n'
import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { getLocalDateString } from '@/lib/workouts/schedule'

export type ExerciseDetailLogInput = {
  logId: string
  completedAt: string
  weightsKg: number[] | null
  repsCompleted: number[] | null
  rpeValues: (number | null)[] | null
}

export type ExerciseProgressPoint = {
  logId: string
  date: string
  dateLabel?: string
  completedAt: string
  maxWeightKg: number
  repsAtMaxWeight: number
  volumeKg: number
  averageRpe: number | null
}

export type ExerciseTrend = 'up' | 'same' | 'down' | 'baseline'

export function filterExercisePoints(
  points: ExerciseProgressPoint[],
  todayStr: string,
  weeks: 4 | 12 | 24,
): ExerciseProgressPoint[] {
  const startDate = shiftDateStr(todayStr, -(weeks * 7 - 1))
  return points.filter(point => point.date >= startDate && point.date <= todayStr)
}

export function buildExerciseDetailView(
  logs: ExerciseDetailLogInput[],
  locale: 'es' | 'en',
  timeZone: string,
) {
  const points: ExerciseProgressPoint[] = logs.map(log => {
    const performance = summarizeExercisePerformance(log.weightsKg, log.repsCompleted, log.rpeValues)
    const date = getLocalDateString(new Date(log.completedAt), timeZone)
    const [year, month, day] = date.split('-').map(Number)

    return {
      logId: log.logId,
      date,
      dateLabel: new Intl.DateTimeFormat(dateLocale(locale), {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, month - 1, day))),
      completedAt: log.completedAt,
      maxWeightKg: performance.bestSet?.weightKg ?? 0,
      repsAtMaxWeight: performance.bestSet?.reps ?? 0,
      volumeKg: performance.volumeKg,
      averageRpe: performance.averageRpe,
    }
  }).sort((a, b) => a.completedAt.localeCompare(b.completedAt))

  const latest = points.at(-1) ?? null
  const best = points.reduce<ExerciseProgressPoint | null>((currentBest, point) => {
    if (!currentBest) return point
    if (point.maxWeightKg > currentBest.maxWeightKg) return point
    if (point.maxWeightKg === currentBest.maxWeightKg && point.repsAtMaxWeight > currentBest.repsAtMaxWeight) return point
    return currentBest
  }, null)
  const validLoadPoints = points.filter(point => point.maxWeightKg > 0)
  const previousValid = validLoadPoints.at(-2)
  const latestValid = validLoadPoints.at(-1)
  let trend: ExerciseTrend = 'baseline'
  if (previousValid && latestValid) {
    trend = latestValid.maxWeightKg > previousValid.maxWeightKg
      ? 'up'
      : latestValid.maxWeightKg < previousValid.maxWeightKg
        ? 'down'
        : 'same'
  }

  return {
    points,
    sessions: points.length,
    latest,
    best,
    latestAverageRpe: latest?.averageRpe ?? null,
    trend,
  }
}
