import { defaultAnswers, type OnboardingAnswers } from '@/app/onboarding/types'
import { validateUsername } from '@/lib/social/username'

export const ONBOARDING_STAGES = [
  'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
] as const

export type OnboardingStageId = (typeof ONBOARDING_STAGES)[number]
export type OnboardingContentStageId = Exclude<OnboardingStageId, 'generating'>

export const ONBOARDING_STORAGE_KEY = 'fitai_onboarding_v2'

export const ONBOARDING_FIELD_STAGE = {
  full_name: 'profile',
  username: 'profile',
  goal: 'profile',
  fitness_level: 'profile',
  days_per_week: 'availability',
  session_duration: 'availability',
  gym_type: 'equipment',
  equipment: 'equipment',
  injuries: 'safety',
  cardio_preferences: 'availability',
  activity_level: 'availability',
  warning_symptoms: 'safety',
  known_disease: 'safety',
  medically_cleared: 'safety',
  recent_surgery: 'safety',
  limitation_regions: 'safety',
  limitation_status: 'safety',
  movements_to_avoid: 'safety',
  clinician_cleared: 'safety',
  age: 'confirmation',
  weight_kg: 'confirmation',
  height_cm: 'confirmation',
  gender: 'confirmation',
} as const satisfies Record<keyof OnboardingAnswers, OnboardingContentStageId>

const LEGACY_STAGE_MAP = {
  username: 'profile',
  goal: 'profile',
  level: 'profile',
  days: 'availability',
  duration: 'availability',
  cardio: 'availability',
  location: 'equipment',
  equipment: 'equipment',
  readiness: 'safety',
  limitations: 'safety',
  physical: 'confirmation',
  planChoice: 'confirmation',
  generating: 'generating',
} as const satisfies Record<string, OnboardingStageId>

export function buildOnboardingStages(): OnboardingStageId[] {
  return [...ONBOARDING_STAGES]
}

export function stageProgress(stage: OnboardingStageId) {
  const index = ONBOARDING_STAGES.indexOf(stage)
  const current = stage === 'generating' ? 5 : index + 1
  return { current, total: 5, percent: (current / 5) * 100 }
}

function isStage(value: unknown): value is OnboardingStageId {
  return typeof value === 'string' && (ONBOARDING_STAGES as readonly string[]).includes(value)
}

export function migrateLegacyStep(step: unknown): OnboardingStageId {
  if (isStage(step)) return step
  if (typeof step === 'string' && step in LEGACY_STAGE_MAP) {
    return LEGACY_STAGE_MAP[step as keyof typeof LEGACY_STAGE_MAP]
  }
  return 'profile'
}

export function nextStage(stage: OnboardingStageId): OnboardingStageId | null {
  const index = ONBOARDING_STAGES.indexOf(stage)
  return ONBOARDING_STAGES[index + 1] ?? null
}

export function previousStage(stage: OnboardingStageId): OnboardingStageId | null {
  const index = ONBOARDING_STAGES.indexOf(stage)
  return index > 0 ? ONBOARDING_STAGES[index - 1] : null
}

export function canContinueStage(
  stage: OnboardingStageId,
  answers: OnboardingAnswers,
  usernameAvailable = false,
): boolean {
  switch (stage) {
    case 'profile':
      return Boolean(
        answers.full_name.trim() &&
        validateUsername(answers.username).ok &&
        answers.goal &&
        answers.fitness_level &&
        usernameAvailable,
      )
    case 'availability':
      return Boolean(
        answers.days_per_week !== null &&
        answers.session_duration !== null &&
        answers.cardio_preferences.length > 0 &&
        answers.activity_level !== null,
      )
    case 'equipment':
      return answers.gym_type !== null
    case 'safety':
      return answers.limitation_regions.length === 0 || answers.limitation_status !== null
    case 'confirmation': {
      const age = Number(answers.age)
      return age >= 18 && age <= 100 && answers.weight_kg !== '' && answers.height_cm !== '' && answers.gender !== null
    }
    case 'generating':
      return true
  }
}

export function requiresProfessionalClearance(answers: OnboardingAnswers): boolean {
  const hasUnclearedLimitation = answers.limitation_regions.length > 0 && (
    !answers.clinician_cleared ||
    answers.limitation_status === 'acute' ||
    (answers.limitation_status === 'recovering' && !answers.clinician_cleared)
  )

  return (
    (answers.warning_symptoms.length > 0 && !answers.medically_cleared) ||
    (answers.recent_surgery && !answers.medically_cleared) ||
    (answers.known_disease && !answers.medically_cleared) ||
    hasUnclearedLimitation
  )
}

export function serializeOnboardingState(
  answers: OnboardingAnswers,
  stage: OnboardingStageId,
  safetyReviewed: boolean,
): string {
  return JSON.stringify({ answers, stage, safetyReviewed })
}

export function deserializeOnboardingState(raw: string): {
  answers: OnboardingAnswers
  stage: OnboardingStageId
  safetyReviewed: boolean
} {
  try {
    const saved = JSON.parse(raw) as {
      answers?: Partial<OnboardingAnswers>
      stage?: unknown
      step?: unknown
      safetyReviewed?: unknown
    }
    const answers = { ...defaultAnswers, ...saved.answers }
    const isLegacyState = saved.stage === undefined && saved.step !== undefined
    const legacySafetyWasCompleted = isLegacyState && (
      saved.step === 'physical' || saved.step === 'planChoice' || saved.step === 'generating'
    )
    const safetyReviewed = saved.safetyReviewed === true || legacySafetyWasCompleted
    const migratedStage = migrateLegacyStep(saved.stage ?? saved.step)
    const requestedStage = migratedStage === 'generating' ? 'confirmation' : migratedStage

    let earliestIncomplete: OnboardingContentStageId = 'confirmation'
    if (!answers.full_name.trim() || !validateUsername(answers.username).ok || !answers.goal || !answers.fitness_level) {
      earliestIncomplete = 'profile'
    } else if (!canContinueStage('availability', answers)) {
      earliestIncomplete = 'availability'
    } else if (!canContinueStage('equipment', answers)) {
      earliestIncomplete = 'equipment'
    } else if (!canContinueStage('safety', answers) || !safetyReviewed) {
      earliestIncomplete = 'safety'
    }

    const requestedIndex = ONBOARDING_STAGES.indexOf(requestedStage)
    const incompleteIndex = ONBOARDING_STAGES.indexOf(earliestIncomplete)
    return {
      answers,
      stage: requestedIndex > incompleteIndex ? earliestIncomplete : requestedStage,
      safetyReviewed,
    }
  } catch {
    return { answers: { ...defaultAnswers }, stage: 'profile', safetyReviewed: false }
  }
}

export async function runAutomaticStart<T>(
  answers: OnboardingAnswers,
  save: (answers: OnboardingAnswers) => Promise<void>,
  generate: () => Promise<T>,
): Promise<T> {
  await save(answers)
  return generate()
}

export async function runManualStart(
  answers: OnboardingAnswers,
  save: (answers: OnboardingAnswers) => Promise<void>,
  navigate: () => void,
): Promise<void> {
  await save(answers)
  navigate()
}
