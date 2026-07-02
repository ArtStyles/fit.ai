import { generateEvidencePlan } from './generator'
import { validateGeneratedPlan } from './validator'
import type {
  EngineResult,
  EvidencePlan,
  PlanAdjustmentIntent,
  PlanDiff,
  TrainingPlanInput,
} from './types'

function planExerciseMap(plan: EvidencePlan): Map<string, string> {
  return new Map(
    plan.days.flatMap(day => day.exercises.map(exercise => [exercise.exercise_id, JSON.stringify(exercise)] as const)),
  )
}

export function diffPlans(before: EvidencePlan, after: EvidencePlan): PlanDiff {
  const beforeMap = planExerciseMap(before)
  const afterMap = planExerciseMap(after)
  return {
    daysBefore: before.days.length,
    daysAfter: after.days.length,
    exercisesAdded: Array.from(afterMap.keys()).filter(id => !beforeMap.has(id)),
    exercisesRemoved: Array.from(beforeMap.keys()).filter(id => !afterMap.has(id)),
    changedPrescriptionCount: Array.from(afterMap.entries()).filter(([id, value]) => beforeMap.has(id) && beforeMap.get(id) !== value).length,
  }
}

export function previewPlanAdjustment(
  input: TrainingPlanInput,
  currentPlan: EvidencePlan,
  intent: PlanAdjustmentIntent,
): { result: EngineResult; diff: PlanDiff | null; warnings: string[] } {
  if (intent.type === 'health_change') {
    return {
      result: {
        success: false,
        metadata: {
          engineVersion: '1.0.0',
          evidenceVersion: '2026.1',
          appliedRuleIds: [],
          warnings: [],
          generatedAt: new Date().toISOString(),
        },
        issues: [{ severity: 'error', code: 'READINESS_REVIEW_REQUIRED', message: 'Actualiza primero el cribado de preparación.' }],
        requiresReadinessReview: true,
      },
      diff: null,
      warnings: ['Los cambios de salud no se interpretan ni aplican mediante IA.'],
    }
  }

  const nextInput: TrainingPlanInput = {
    ...input,
    previousPlan: { plan: currentPlan },
    profile: { ...input.profile },
    exercises: input.exercises,
  }

  switch (intent.type) {
    case 'change_days':
      nextInput.profile.daysPerWeek = intent.daysPerWeek
      nextInput.profile.preferredWorkoutDays = intent.preferredWorkoutDays ?? null
      break
    case 'change_duration':
      nextInput.profile.sessionDurationMinutes = intent.sessionDurationMinutes
      break
    case 'change_intensity':
      nextInput.history = {
        scheduledSessions: currentPlan.days.length,
        completedSessions: currentPlan.days.length,
        adherenceRatio: 1,
        avgRpe: intent.direction === 'easier' ? 9 : 6,
        painReported: false,
        stalledExerciseIds: intent.direction === 'easier' ? ['manual-1', 'manual-2', 'manual-3'] : [],
      }
      break
    case 'equipment_unavailable': {
      const unavailable = new Set(intent.equipment)
      nextInput.profile.availableEquipment = nextInput.profile.availableEquipment.filter(item => !unavailable.has(item))
      nextInput.exercises = nextInput.exercises.filter(exercise => exercise.equipment.every(item => !unavailable.has(item)))
      break
    }
    case 'replace_exercise':
      nextInput.exercises = nextInput.exercises.filter(exercise => exercise.id !== intent.exerciseId)
      break
    case 'change_cardio_preferences':
      nextInput.profile.cardioPreferences = intent.cardioPreferences
      break
  }

  let result = generateEvidencePlan(nextInput)
  if (intent.type === 'change_intensity' && intent.direction === 'harder' && result.plan) {
    const adjustedPlan: EvidencePlan = {
      ...result.plan,
      days: result.plan.days.map(day => ({
        ...day,
        exercises: day.exercises.map(exercise => ({
          ...exercise,
          target_rpe: Math.min(9, exercise.target_rpe + 1),
        })),
      })),
    }
    const issues = validateGeneratedPlan(adjustedPlan, nextInput)
    result = { ...result, plan: adjustedPlan, issues, success: !issues.some(issue => issue.severity === 'error') }
  }
  return {
    result,
    diff: result.plan ? diffPlans(currentPlan, result.plan) : null,
    warnings: result.metadata.warnings,
  }
}
