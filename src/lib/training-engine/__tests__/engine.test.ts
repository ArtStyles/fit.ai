import { describe, expect, it } from 'vitest'
import {
  generateEvidencePlan,
  previewPlanAdjustment,
  regenerateEvidencePlan,
  validateGeneratedPlan,
} from '..'
import type {
  CardioModality,
  EngineExercise,
  FitnessLevel,
  TrainingGoal,
  TrainingPlanInput,
} from '..'

const strengthPatterns = [
  ['squat', ['quadriceps']],
  ['hinge', ['hamstrings', 'glutes']],
  ['horizontal_push', ['chest']],
  ['horizontal_pull', ['middle back']],
  ['vertical_push', ['shoulders']],
  ['vertical_pull', ['lats']],
  ['core', ['abdominals']],
  ['isolation', ['biceps']],
] as const

const strengthExercises: EngineExercise[] = strengthPatterns.flatMap(([pattern, muscles], patternIndex) =>
  Array.from({ length: 3 }, (_, variant) => ({
    id: `strength-${pattern}-${variant}`,
    name: `${pattern} ${variant}`,
    muscleGroups: [...muscles],
    equipment: [],
    exerciseType: 'strength' as const,
    difficulty: variant === 2 ? 'advanced' as const : 'beginner' as const,
    isCompound: pattern !== 'core' && pattern !== 'isolation',
    movementPatterns: [pattern],
    cardioModality: null,
    impactLevel: patternIndex % 2 === 0 ? 'low' as const : 'moderate' as const,
    jointStressTags: [],
  })),
)

const cardioModalities: CardioModality[] = [
  'walking',
  'running',
  'cycling',
  'elliptical',
  'rowing',
  'stairs',
  'jump_rope',
]

const cardioExercises: EngineExercise[] = cardioModalities.map((modality, index) => ({
  id: `cardio-${modality}`,
  name: modality,
  muscleGroups: ['cardiovascular'],
  equipment: [],
  exerciseType: 'cardio',
  difficulty: 'beginner',
  isCompound: false,
  movementPatterns: ['locomotion'],
  cardioModality: modality,
  impactLevel: index === 1 || index === 6 ? 'high' : 'low',
  jointStressTags: [],
}))

const exercises = [...strengthExercises, ...cardioExercises]

function makeInput(
  goal: TrainingGoal = 'build_muscle',
  level: FitnessLevel = 'intermediate',
  daysPerWeek = 4,
  duration = 60,
): TrainingPlanInput {
  return {
    seed: 'user-1:week-1',
    weekNumber: 1,
    exercises,
    profile: {
      language: 'es',
      fitnessLevel: level,
      primaryGoal: goal,
      daysPerWeek,
      sessionDurationMinutes: duration,
      gymType: 'full_gym',
      availableEquipment: [],
      preferredWorkoutDays: null,
      cardioPreferences: ['walking', 'cycling'],
      age: 30,
      readiness: {
        status: 'cleared',
        currentlyActive: true,
        warningSymptoms: [],
        knownCardiovascularMetabolicOrRenalDisease: false,
        medicallyCleared: false,
        recentSurgery: false,
        limitations: [],
      },
    },
  }
}

describe('evidence training engine', () => {
  it('is deterministic for the same seed and input', () => {
    const first = generateEvidencePlan(makeInput())
    const second = generateEvidencePlan(makeInput())
    expect(first.success).toBe(true)
    expect(second.plan).toEqual(first.plan)
  })

  it.each([
    'lose_weight',
    'build_muscle',
    'gain_strength',
    'improve_endurance',
    'stay_active',
  ] as TrainingGoal[])('generates valid plans for %s', goal => {
    for (const level of ['beginner', 'intermediate', 'advanced'] as FitnessLevel[]) {
      for (const days of [2, 3, 4, 5, 6]) {
        for (const duration of [30, 45, 60, 90]) {
          const input = makeInput(goal, level, days, duration)
          const result = generateEvidencePlan(input)
          expect(result.success, JSON.stringify(result.issues)).toBe(true)
          expect(result.plan?.days).toHaveLength(days)
          expect(validateGeneratedPlan(result.plan!, input).filter(issue => issue.severity === 'error')).toEqual([])
        }
      }
    }
  })

  it('blocks plans that require professional clearance', () => {
    const input = makeInput()
    input.profile.readiness.warningSymptoms = ['chest_discomfort']
    const result = generateEvidencePlan(input)
    expect(result.success).toBe(false)
    expect(result.requiresReadinessReview).toBe(true)
    expect(result.issues.some(issue => issue.code === 'PROFESSIONAL_CLEARANCE_REQUIRED')).toBe(true)
  })

  it('excludes prohibited stable movements', () => {
    const input = makeInput('build_muscle', 'intermediate', 3, 60)
    input.profile.readiness.status = 'modified'
    input.profile.readiness.limitations = [{
      region: 'knee',
      status: 'stable',
      movementsToAvoid: ['squat'],
      clinicianCleared: true,
    }]
    const result = generateEvidencePlan(input)
    expect(result.success).toBe(true)
    const squatIds = new Set(strengthExercises.filter(exercise => exercise.movementPatterns.includes('squat')).map(exercise => exercise.id))
    expect(result.plan?.days.flatMap(day => day.exercises).some(exercise => squatIds.has(exercise.exercise_id))).toBe(false)
  })

  it('requires a readiness review after pain is logged', () => {
    const input = makeInput()
    input.history = {
      scheduledSessions: 4,
      completedSessions: 3,
      adherenceRatio: 0.75,
      avgRpe: 8,
      painReported: true,
      stalledExerciseIds: [],
    }
    const result = regenerateEvidencePlan(input)
    expect(result.success).toBe(false)
    expect(result.issues[0].code).toBe('PAIN_REQUIRES_REVIEW')
  })

  it('uses adaptive deload instead of a fixed week number', () => {
    const input = makeInput('gain_strength')
    input.weekNumber = 9
    input.history = {
      scheduledSessions: 4,
      completedSessions: 2,
      adherenceRatio: 0.5,
      avgRpe: 9,
      painReported: false,
      stalledExerciseIds: ['a', 'b', 'c'],
    }
    const result = regenerateEvidencePlan(input)
    expect(result.success).toBe(true)
    expect(result.plan?.days.flatMap(day => day.exercises).every(exercise => exercise.target_rpe <= 6)).toBe(true)
    expect(result.metadata.warnings.join(' ')).toMatch(/descarga/i)
  })

  it('keeps earned targets for exercises retained in a weekly regeneration', () => {
    const initialInput = makeInput('gain_strength', 'intermediate', 3, 60)
    const previous = generateEvidencePlan(initialInput).plan!
    const retained = previous.days[0].exercises[0]
    retained.weight_kg = 72.5
    retained.reps = 6
    retained.weight_suggestion_basis = 'based_on_previous_logs'

    const nextInput = makeInput('gain_strength', 'intermediate', 3, 60)
    nextInput.weekNumber = 2
    nextInput.previousPlan = { plan: previous }
    const result = regenerateEvidencePlan(nextInput)
    const next = result.plan?.days.flatMap(day => day.exercises)
      .find(exercise => exercise.exercise_id === retained.exercise_id)

    expect(result.success).toBe(true)
    expect(next).toMatchObject({
      reps: 6,
      weight_kg: 72.5,
      weight_suggestion_basis: 'based_on_previous_logs',
    })
    expect(result.metadata.appliedRuleIds).toContain('FITAI-PROGRESSION-CONTINUITY-1')
  })

  it('previews a full-plan duration adjustment', () => {
    const input = makeInput()
    const current = generateEvidencePlan(input).plan!
    const preview = previewPlanAdjustment(input, current, {
      type: 'change_duration',
      sessionDurationMinutes: 30,
    })
    expect(preview.result.success).toBe(true)
    expect(preview.diff).not.toBeNull()
    expect(preview.result.plan?.days).toHaveLength(current.days.length)
  })
})
