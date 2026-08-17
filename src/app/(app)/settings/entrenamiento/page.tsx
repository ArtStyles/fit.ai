import { SettingsScreen } from '@/components/settings/SettingsScreen'
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

function normalizeTrainingProfile(profile: TrainingProfile | null): TrainingSettingsValue {
  const gymType = optionOrFirst(GYM_TYPES, profile?.gym_type)
  const availableEquipment = gymType === 'home_no_equipment'
    ? []
    : (profile?.available_equipment ?? []).filter(equipment =>
      EQUIPMENT_OPTIONS.some(option => option.value === equipment),
    )

  return {
    primaryGoal: optionOrFirst(TRAINING_GOALS, profile?.primary_goal) as TrainingSettingsValue['primaryGoal'],
    fitnessLevel: optionOrFirst(FITNESS_LEVELS, profile?.fitness_level) as TrainingSettingsValue['fitnessLevel'],
    daysPerWeek: numericOptionOrDefault(TRAINING_FREQUENCIES, profile?.days_per_week ?? null, 3),
    sessionDurationMinutes: numericOptionOrDefault(SESSION_DURATIONS, profile?.session_duration_minutes ?? null, 60),
    gymType: gymType as TrainingSettingsValue['gymType'],
    // Show legacy selections unchanged so the client can ask the user to correct them.
    preferredWorkoutDays: profile?.preferred_workout_days ?? [],
    availableEquipment: availableEquipment as TrainingSettingsValue['availableEquipment'],
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
  ]) as unknown as [
    { data: TrainingProfile | null },
    { data: { id: string } | null },
  ]

  const initial = normalizeTrainingProfile(profileResult.data)

  return (
    <SettingsScreen
      title={t('Entrenamiento')}
      description={t('Elige el objetivo y el nivel que guiarán tus próximas generaciones.')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="dumbbell"
    >
      <TrainingSettingsForm
        initial={initial}
        readinessStatus={profileResult.data?.readiness_status ?? 'pending'}
        hasActivePlan={Boolean(activePlanResult.data)}
      />
    </SettingsScreen>
  )
}
