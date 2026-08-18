import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SettingsRetryButton } from '@/components/settings/SettingsRetryButton'
import { SettingsStatus } from '@/components/settings/SettingsStatus'
import { TrainingSettingsForm } from '@/components/settings/TrainingSettingsForm'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import {
  EQUIPMENT_OPTIONS,
  FITNESS_LEVELS,
  GYM_TYPES,
  SESSION_DURATIONS,
  TRAINING_FREQUENCIES,
  TRAINING_GOALS,
  type TrainingSettingsValue,
} from '@/lib/profile/trainingPreferences'
import type { ReadinessStatus } from '@/lib/training-engine/types'

export const metadata = { title: 'Entrenamiento · Vekira' }

type TrainingProfile = {
  fitness_level: string | null
  primary_goal: string | null
  days_per_week: number | null
  session_duration_minutes: number | null
  gym_type: string | null
  available_equipment: string[] | null
  injuries: string | null
  preferred_workout_days: number[] | null
  readiness_status: ReadinessStatus | null
}

type QueryResult<T> = {
  data: T | null
  error: { message: string } | null
}

function optionOrFirst<T extends { value: string | number }>(options: readonly T[], stored: unknown): T['value'] {
  return options.some(option => option.value === stored) ? stored as T['value'] : options[0].value
}

function numericOptionOrDefault<T extends number>(
  options: readonly T[],
  stored: number | null,
  absentDefault: T,
): T {
  if (stored === null) return absentDefault
  return options.includes(stored as T) ? stored as T : options[0]
}

function normalizePreferredWorkoutDays(days: number[] | null): number[] {
  return Array.from(new Set((days ?? []).filter(day => Number.isInteger(day) && day >= 1 && day <= 7)))
    .sort((a, b) => a - b)
}

function normalizeAvailableEquipment(gymType: string, equipment: string[] | null): TrainingSettingsValue['availableEquipment'] {
  if (gymType === 'home_no_equipment') return []

  const known = new Set(equipment ?? [])
  return EQUIPMENT_OPTIONS
    .map(option => option.value)
    .filter(option => known.has(option)) as TrainingSettingsValue['availableEquipment']
}

function normalizeTrainingProfile(profile: TrainingProfile | null): TrainingSettingsValue {
  const gymType = optionOrFirst(GYM_TYPES, profile?.gym_type)

  return {
    primaryGoal: optionOrFirst(TRAINING_GOALS, profile?.primary_goal) as TrainingSettingsValue['primaryGoal'],
    fitnessLevel: optionOrFirst(FITNESS_LEVELS, profile?.fitness_level) as TrainingSettingsValue['fitnessLevel'],
    daysPerWeek: numericOptionOrDefault(TRAINING_FREQUENCIES, profile?.days_per_week ?? null, 3),
    sessionDurationMinutes: numericOptionOrDefault(SESSION_DURATIONS, profile?.session_duration_minutes ?? null, 60),
    gymType: gymType as TrainingSettingsValue['gymType'],
    preferredWorkoutDays: normalizePreferredWorkoutDays(profile?.preferred_workout_days ?? null),
    availableEquipment: normalizeAvailableEquipment(gymType, profile?.available_equipment ?? null),
    injuries: profile?.injuries ?? null,
  }
}

export default async function TrainingSettingsPage() {
  const { supabase, user, profile: appProfile } = await requireAppUserContext()
  const language = normalizeLanguage(appProfile.language)
  const t = createTranslator(language)

  const [profileResult, activePlanResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(`
        fitness_level,
        primary_goal,
        days_per_week,
        session_duration_minutes,
        gym_type,
        available_equipment,
        injuries,
        preferred_workout_days,
        readiness_status
      `)
      .eq('id', user.id)
      .single(),
    supabase
      .from('workout_plans')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),
  ]) as unknown as [QueryResult<TrainingProfile>, QueryResult<{ id: string }>]

  const loadFailed = profileResult.error !== null || activePlanResult.error !== null

  return (
    <SettingsScreen
      title={t('Entrenamiento')}
      description={t('Elige el objetivo y el nivel que guiarán tus próximas generaciones.')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="dumbbell"
    >
      {loadFailed ? (
        <div className="space-y-3">
          <SettingsStatus tone="error">{t('No se pudo cargar esta vista')}</SettingsStatus>
          <p className="text-sm leading-6 text-muted-foreground">{t('Tus datos siguen guardados. Intenta nuevamente.')}</p>
          <SettingsRetryButton
            label={t('Reintentar')}
            ariaLabel={t('Reintentar carga de entrenamiento')}
          />
        </div>
      ) : (
        <TrainingSettingsForm
          initial={normalizeTrainingProfile(profileResult.data)}
          readinessStatus={profileResult.data?.readiness_status ?? 'pending'}
          hasActivePlan={Boolean(activePlanResult.data)}
        />
      )}
    </SettingsScreen>
  )
}
