import { translate, type AppLanguage } from '@/lib/i18n'

export type PlanWorkoutSummaryInput = {
  id: string
  name: string
  focus?: string | null
  dayOfWeek: number | null
  orderInPlan?: number | null
  duration?: number | null
}

export type PlanDaySummary = {
  id: string
  name: string
  focus: string | null
  dayOfWeek: number | null
  orderInPlan: number | null
  durationMinutes: number | null
  exerciseCount: number
  isScheduled: boolean
}

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

export type PlanProfileConstraints = {
  gymType?: 'home_no_equipment' | 'home_basic' | 'full_gym' | string | null
  availableEquipment?: string[] | null
  sessionDurationMinutes?: number | null
  injuries?: string | null
  readinessStatus?: string | null
  movementLimitations?: unknown
}

type MovementLimitationRecord = {
  status?: unknown
  clinicianCleared?: unknown
  clinician_cleared?: unknown
}

function normalizeIsoWeekday(value: number | null): number | null {
  return Number.isInteger(value) && value !== null && value >= 1 && value <= 7 ? value : null
}

export function buildPlanDaySummaries(
  workouts: PlanWorkoutSummaryInput[],
  exerciseCounts: Record<string, number>,
): PlanDaySummary[] {
  return workouts
    .map((workout, index) => {
      const dayOfWeek = normalizeIsoWeekday(workout.dayOfWeek)

      return {
        summary: {
          id: workout.id,
          name: workout.name,
          focus: workout.focus ?? null,
          dayOfWeek,
          orderInPlan: workout.orderInPlan ?? null,
          durationMinutes: workout.duration ?? null,
          exerciseCount: exerciseCounts[workout.id] ?? 0,
          isScheduled: dayOfWeek !== null,
        } satisfies PlanDaySummary,
        originalIndex: index,
      }
    })
    .sort((a, b) => {
      if (a.summary.isScheduled !== b.summary.isScheduled) {
        return a.summary.isScheduled ? -1 : 1
      }

      if (a.summary.dayOfWeek !== b.summary.dayOfWeek) {
        return (a.summary.dayOfWeek ?? 99) - (b.summary.dayOfWeek ?? 99)
      }

      return (a.summary.orderInPlan ?? a.originalIndex) - (b.summary.orderInPlan ?? b.originalIndex)
        || a.originalIndex - b.originalIndex
    })
    .map(item => item.summary)
}

export function buildPlanWeekEntries(
  days: PlanDaySummary[],
  todayIso: number,
): PlanWeekEntry[] {
  const normalizedToday = normalizeIsoWeekday(todayIso)
  const entries: PlanWeekEntry[] = Array.from({ length: 7 }, (_, index) => {
    const isoDay = index + 1
    const workouts = days.filter(day => day.dayOfWeek === isoDay)

    return {
      key: `day-${isoDay}`,
      isoDay,
      kind: workouts.length > 0 ? 'workout' : 'rest',
      isToday: isoDay === normalizedToday,
      workouts,
    }
  })
  const unscheduled = days.filter(day => day.dayOfWeek === null)

  if (unscheduled.length > 0) {
    entries.push({
      key: 'unscheduled',
      isoDay: null,
      kind: 'unscheduled',
      isToday: false,
      workouts: unscheduled,
    })
  }

  return entries
}

export function buildPlanDistribution(
  rows: PlanDistributionInput[],
): PlanDistributionItem[] {
  const prescribedSets = new Map<string, number>()
  const labels = new Map<string, string>()

  for (const row of rows) {
    const sets = Number.isFinite(row.sets) ? Math.max(0, Math.trunc(row.sets ?? 0)) : 0
    if (sets === 0) continue

    const uniqueGroups = new Set<string>()
    for (const rawGroup of row.muscleGroups ?? []) {
      const label = rawGroup.trim()
      if (!label) continue
      const key = label.toLocaleLowerCase('es')
      if (uniqueGroups.has(key)) continue
      uniqueGroups.add(key)
      labels.set(key, labels.get(key) ?? label)
      prescribedSets.set(key, (prescribedSets.get(key) ?? 0) + sets)
    }
  }

  const largestGroup = Math.max(0, ...Array.from(prescribedSets.values()))

  return Array.from(prescribedSets.entries())
    .map(([key, sets]) => ({
      muscleGroup: labels.get(key) ?? key,
      prescribedSets: sets,
      relativePercent: largestGroup === 0 ? 0 : Math.round((sets / largestGroup) * 100),
    }))
    .sort((a, b) => b.prescribedSets - a.prescribedSets
      || a.muscleGroup.localeCompare(b.muscleGroup, 'es', { sensitivity: 'base' }))
}

function clearedLimitationCount(value: unknown): number {
  if (!Array.isArray(value)) return 0

  return value.filter((item): item is MovementLimitationRecord => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const record = item as MovementLimitationRecord
    return record.status === 'stable'
      && (record.clinicianCleared === true || record.clinician_cleared === true)
  }).length
}

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
