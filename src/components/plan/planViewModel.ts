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

const GYM_LABELS: Record<string, string> = {
  home_no_equipment: 'Casa sin equipo',
  home_basic: 'Casa con equipo básico',
  full_gym: 'Gimnasio completo',
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

function safeStringList(values: string[] | null | undefined): string[] {
  return (values ?? [])
    .map(value => value.trim())
    .filter(Boolean)
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
  const gymLabel = profile.gymType ? GYM_LABELS[profile.gymType] : null
  const equipment = safeStringList(profile.availableEquipment)
  const clearedCount = clearedLimitationCount(profile.movementLimitations)

  if (gymLabel) labels.push(t(gymLabel))
  if (equipment.length > 0) labels.push(t('Equipo: {items}', { items: equipment.slice(0, 4).join(', ') }))
  if (profile.sessionDurationMinutes) {
    labels.push(t('Sesiones de {minutes} min', { minutes: profile.sessionDurationMinutes }))
  }
  if (clearedCount === 1) {
    labels.push(t('{count} restricción autorizada considerada', { count: clearedCount }))
  } else if (clearedCount > 1) {
    labels.push(t('{count} restricciones autorizadas consideradas', { count: clearedCount }))
  }

  return labels
}
