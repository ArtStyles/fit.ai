import { defaultAnswers, type OnboardingAnswers } from '@/app/onboarding/types'
import { validateUsername } from '@/lib/social/username'
import { parseDecimalAge } from '@/lib/profile/age'
import { EQUIPMENT_OPTIONS, FITNESS_LEVELS, GYM_TYPES, SESSION_DURATIONS, TRAINING_FREQUENCIES, TRAINING_GOALS } from '@/lib/profile/trainingPreferences'
import { validateConfirmationFields } from './confirmationValidation'

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

const GOALS = TRAINING_GOALS.filter(option => option.value !== 'other').map(option => option.value)
const FITNESS_LEVEL_VALUES = FITNESS_LEVELS.map(option => option.value)
const GYM_TYPE_VALUES = GYM_TYPES.map(option => option.value)
const EQUIPMENT = EQUIPMENT_OPTIONS.map(option => option.value)
const CARDIO = ['walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope'] as const
const ACTIVITY_LEVELS = ['inactive', 'insufficiently_active', 'regularly_active'] as const
const WARNING_SYMPTOMS = ['chest_discomfort', 'dyspnea_at_rest_or_mild', 'dizziness_or_syncope', 'palpitations_or_unusual_fatigue'] as const
const LIMITATION_REGIONS = ['hombro', 'codo', 'muñeca', 'espalda', 'cadera', 'rodilla', 'tobillo'] as const
const LIMITATION_STATUSES = ['stable', 'acute', 'recovering'] as const
const GENDERS = ['male', 'female', 'other'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string | number>(value: unknown, options: readonly T[]): value is T {
  return (typeof value === 'string' || typeof value === 'number') && (options as readonly (string | number)[]).includes(value)
}

function isNullableOneOf<T extends string>(value: unknown, options: readonly T[]): value is T | null {
  return value === null || isOneOf(value, options)
}

function isStringArrayOf<T extends string>(value: unknown, options: readonly T[]): value is T[] {
  return Array.isArray(value) && value.every(item => isOneOf(item, options))
}

function isBoundedNumericString(value: unknown, min: number, max: number, integer = false): value is string {
  if (value === '') return true
  if (typeof value !== 'string' || value.trim() === '') return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed))
}

function parsePersistedAnswers(value: unknown): OnboardingAnswers | null {
  if (!isRecord(value)) return null

  const fullName = value.full_name === undefined ? '' : value.full_name
  const username = value.username === undefined ? '' : value.username

  if (
    typeof fullName !== 'string' ||
    typeof username !== 'string' ||
    !isNullableOneOf(value.goal, GOALS) ||
    !isNullableOneOf(value.fitness_level, FITNESS_LEVEL_VALUES) ||
    !(value.days_per_week === null || isOneOf(value.days_per_week, TRAINING_FREQUENCIES)) ||
    !(value.session_duration === null || isOneOf(value.session_duration, SESSION_DURATIONS)) ||
    !isNullableOneOf(value.gym_type, GYM_TYPE_VALUES) ||
    !isStringArrayOf(value.equipment, EQUIPMENT) ||
    typeof value.injuries !== 'string' ||
    !isStringArrayOf(value.cardio_preferences, CARDIO) ||
    !isNullableOneOf(value.activity_level, ACTIVITY_LEVELS) ||
    !isStringArrayOf(value.warning_symptoms, WARNING_SYMPTOMS) ||
    typeof value.known_disease !== 'boolean' ||
    typeof value.medically_cleared !== 'boolean' ||
    typeof value.recent_surgery !== 'boolean' ||
    !isStringArrayOf(value.limitation_regions, LIMITATION_REGIONS) ||
    !isNullableOneOf(value.limitation_status, LIMITATION_STATUSES) ||
    typeof value.movements_to_avoid !== 'string' ||
    typeof value.clinician_cleared !== 'boolean' ||
    !(value.age === '' || typeof value.age === 'string' && parseDecimalAge(value.age) !== null) ||
    !isBoundedNumericString(value.weight_kg, 30, 300) ||
    !isBoundedNumericString(value.height_cm, 100, 250) ||
    !isNullableOneOf(value.gender, GENDERS)
  ) return null

  return {
    full_name: fullName,
    username,
    goal: value.goal,
    fitness_level: value.fitness_level,
    days_per_week: value.days_per_week,
    session_duration: value.session_duration,
    gym_type: value.gym_type,
    equipment: value.equipment,
    injuries: value.injuries,
    cardio_preferences: value.cardio_preferences,
    activity_level: value.activity_level,
    warning_symptoms: value.warning_symptoms,
    known_disease: value.known_disease,
    medically_cleared: value.medically_cleared,
    recent_surgery: value.recent_surgery,
    limitation_regions: value.limitation_regions,
    limitation_status: value.limitation_status,
    movements_to_avoid: value.movements_to_avoid,
    clinician_cleared: value.clinician_cleared,
    age: value.age,
    weight_kg: value.weight_kg,
    height_cm: value.height_cm,
    gender: value.gender,
  }
}

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
      return validateConfirmationFields(answers).valid
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

export function hydrateOnboardingState(raw: string): {
  answers: OnboardingAnswers
  stage: OnboardingStageId
  safetyReviewed: boolean
} {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed)) throw new Error('Invalid persisted onboarding state')
    const saved = parsed
    const answers = parsePersistedAnswers(saved.answers)
    if (!answers) throw new Error('Invalid persisted onboarding answers')
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

export const deserializeOnboardingState = hydrateOnboardingState

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
