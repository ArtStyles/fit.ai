import { describe, expect, it, vi } from 'vitest'
import { defaultAnswers, type OnboardingAnswers } from '@/app/onboarding/types'
import {
  ONBOARDING_FIELD_STAGE,
  ONBOARDING_STORAGE_KEY,
  buildOnboardingStages,
  canContinueStage,
  deserializeOnboardingState,
  migrateLegacyStep,
  nextStage,
  previousStage,
  requiresProfessionalClearance,
  runAutomaticStart,
  runManualStart,
  serializeOnboardingState,
  stageProgress,
} from '../onboardingStages'

const completeAnswers: OnboardingAnswers = {
  ...defaultAnswers,
  full_name: 'Ada Lovelace',
  username: 'ada_lovelace',
  goal: 'gain_strength',
  fitness_level: 'intermediate',
  days_per_week: 4,
  session_duration: 60,
  gym_type: 'full_gym',
  cardio_preferences: ['walking'],
  activity_level: 'regularly_active',
  age: '30',
  weight_kg: '68',
  height_cm: '170',
  gender: 'female',
}

describe('onboarding stages', () => {
  it('always exposes five content stages plus generation', () => {
    expect(buildOnboardingStages()).toEqual([
      'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
    ])
  })

  it('reports user-facing progress across five stages', () => {
    expect(stageProgress('profile')).toEqual({ current: 1, total: 5, percent: 20 })
    expect(stageProgress('confirmation')).toEqual({ current: 5, total: 5, percent: 100 })
  })

  it('keeps generating at completed five-stage progress', () => {
    expect(stageProgress('generating')).toEqual({ current: 5, total: 5, percent: 100 })
  })

  it('maps every answer field to exactly one approved stage', () => {
    expect(ONBOARDING_FIELD_STAGE).toEqual({
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
    })
    expect(Object.keys(ONBOARDING_FIELD_STAGE).sort()).toEqual(Object.keys(defaultAnswers).sort())
  })

  it.each([
    ['username', 'profile'],
    ['goal', 'profile'],
    ['level', 'profile'],
    ['days', 'availability'],
    ['duration', 'availability'],
    ['cardio', 'availability'],
    ['location', 'equipment'],
    ['equipment', 'equipment'],
    ['readiness', 'safety'],
    ['limitations', 'safety'],
    ['physical', 'confirmation'],
    ['planChoice', 'confirmation'],
    ['generating', 'generating'],
  ] as const)('migrates legacy step %s to %s', (legacyStep, stage) => {
    expect(migrateLegacyStep(legacyStep)).toBe(stage)
  })

  it('persists under the existing key and resumes legacy generation safely at confirmation', () => {
    expect(ONBOARDING_STORAGE_KEY).toBe('fitai_onboarding_v2')
    const serialized = serializeOnboardingState(completeAnswers, 'safety', false)
    expect(deserializeOnboardingState(serialized)).toEqual({
      answers: completeAnswers,
      stage: 'safety',
      safetyReviewed: false,
    })

    const legacy = JSON.stringify({ answers: completeAnswers, step: 'generating' })
    expect(deserializeOnboardingState(legacy)).toEqual({
      answers: completeAnswers,
      stage: 'confirmation',
      safetyReviewed: true,
    })
  })

  it('cannot resume confirmation until safety was reviewed', () => {
    const stale = JSON.stringify({ answers: completeAnswers, stage: 'confirmation' })
    expect(deserializeOnboardingState(stale).stage).toBe('safety')

    const reviewed = JSON.stringify({ answers: completeAnswers, stage: 'confirmation', safetyReviewed: true })
    expect(deserializeOnboardingState(reviewed).stage).toBe('confirmation')
  })

  it('returns legacy progress to profile when newly required identity fields are absent', () => {
    const legacyAnswers = { ...completeAnswers } as Partial<OnboardingAnswers>
    delete legacyAnswers.full_name
    delete legacyAnswers.username
    const legacy = JSON.stringify({ answers: legacyAnswers, step: 'planChoice' })

    expect(deserializeOnboardingState(legacy).stage).toBe('profile')
  })

  it('makes safety reachable in both directions and never skippable', () => {
    expect(nextStage('equipment')).toBe('safety')
    expect(nextStage('safety')).toBe('confirmation')
    expect(previousStage('confirmation')).toBe('safety')
  })

  it('blocks incomplete safety details and flags professional clearance', () => {
    const incomplete = {
      ...completeAnswers,
      limitation_regions: ['rodilla'],
      limitation_status: null,
    }
    expect(canContinueStage('safety', incomplete)).toBe(false)

    const blocked = {
      ...completeAnswers,
      warning_symptoms: ['chest_discomfort'],
      medically_cleared: false,
    }
    expect(requiresProfessionalClearance(blocked)).toBe(true)
    expect(requiresProfessionalClearance({ ...blocked, medically_cleared: true })).toBe(false)
  })

  it('validates each stage and preserves back navigation boundaries', () => {
    expect(canContinueStage('profile', completeAnswers, true)).toBe(true)
    expect(canContinueStage('profile', { ...completeAnswers, goal: null }, true)).toBe(false)
    expect(canContinueStage('profile', completeAnswers, false)).toBe(false)
    expect(canContinueStage('profile', { ...completeAnswers, username: 'invalid name' }, true)).toBe(false)
    expect(canContinueStage('availability', completeAnswers)).toBe(true)
    expect(canContinueStage('confirmation', { ...completeAnswers, age: '17' })).toBe(false)
    expect(previousStage('profile')).toBeNull()
    expect(previousStage('safety')).toBe('equipment')
  })

  it('saves before automatic generation', async () => {
    const calls: string[] = []
    const save = vi.fn(async () => { calls.push('save') })
    const generate = vi.fn(async () => { calls.push('generate'); return { success: true as const } })

    await runAutomaticStart(completeAnswers, save, generate)

    expect(calls).toEqual(['save', 'generate'])
  })

  it('saves before manual navigation', async () => {
    const calls: string[] = []
    const save = vi.fn(async () => { calls.push('save') })
    const navigate = vi.fn(() => { calls.push('navigate') })

    await runManualStart(completeAnswers, save, navigate)

    expect(calls).toEqual(['save', 'navigate'])
  })
})
