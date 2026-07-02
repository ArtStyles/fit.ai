import { prohibitedMovementTags, validateReadiness } from './safety'
import type {
  EvidencePlan,
  PlanExercise,
  TrainingPlanInput,
  ValidationIssue,
} from './types'

function estimateExerciseMinutes(exercise: PlanExercise): number {
  if (exercise.duration_seconds !== null) {
    return exercise.sets * (exercise.duration_seconds + exercise.rest_seconds) / 60
  }
  return exercise.sets * (45 + exercise.rest_seconds) / 60
}

export function estimateDayMinutes(day: EvidencePlan['days'][number]): number {
  return Math.ceil(day.exercises.reduce((total, exercise) => total + estimateExerciseMinutes(exercise), 0))
}

export function validateGeneratedPlan(
  plan: EvidencePlan,
  input: TrainingPlanInput,
): ValidationIssue[] {
  const issues = validateReadiness(input.profile)
  const exerciseById = new Map(input.exercises.map(exercise => [exercise.id, exercise]))
  const prohibited = prohibitedMovementTags(input.profile)

  if (plan.days.length !== input.profile.daysPerWeek) {
    issues.push({
      severity: 'error',
      code: 'DAY_COUNT_MISMATCH',
      message: `El plan debe contener ${input.profile.daysPerWeek} días.`,
      path: 'days',
    })
  }

  plan.days.forEach((day, dayIndex) => {
    if (day.day_number !== dayIndex + 1) {
      issues.push({ severity: 'error', code: 'INVALID_DAY_ORDER', message: 'Los días deben ser secuenciales.', path: `days.${dayIndex}` })
    }
    if (day.exercises.length === 0) {
      issues.push({ severity: 'error', code: 'EMPTY_DAY', message: 'Cada día debe contener ejercicios.', path: `days.${dayIndex}.exercises` })
    }

    const seen = new Set<string>()
    day.exercises.forEach((exercise, exerciseIndex) => {
      const path = `days.${dayIndex}.exercises.${exerciseIndex}`
      const catalogExercise = exerciseById.get(exercise.exercise_id)
      if (!catalogExercise) {
        issues.push({ severity: 'error', code: 'UNKNOWN_EXERCISE', message: 'El ejercicio no pertenece al catálogo permitido.', path })
        return
      }
      if (seen.has(exercise.exercise_id)) {
        issues.push({ severity: 'error', code: 'DUPLICATE_EXERCISE', message: 'Un ejercicio no puede repetirse dentro de la misma sesión.', path })
      }
      seen.add(exercise.exercise_id)

      const hasReps = exercise.reps !== null
      const hasDuration = exercise.duration_seconds !== null
      if (hasReps === hasDuration) {
        issues.push({ severity: 'error', code: 'INVALID_PRESCRIPTION_MODE', message: 'El ejercicio debe usar repeticiones o duración, pero no ambos.', path })
      }
      if (exercise.sets < 1 || exercise.target_rpe < 1 || exercise.target_rpe > 10) {
        issues.push({ severity: 'error', code: 'INVALID_DOSE', message: 'Series y RPE están fuera de rango.', path })
      }

      const tags = [...catalogExercise.movementPatterns, ...catalogExercise.jointStressTags]
        .map(tag => tag.toLowerCase())
      if (tags.some(tag => prohibited.has(tag))) {
        issues.push({ severity: 'error', code: 'PROHIBITED_MOVEMENT', message: 'El ejercicio entra en conflicto con una limitación declarada.', path })
      }
    })

    const estimatedMinutes = estimateDayMinutes(day)
    if (estimatedMinutes > input.profile.sessionDurationMinutes + 5) {
      issues.push({
        severity: 'error',
        code: 'SESSION_TOO_LONG',
        message: `La sesión estimada (${estimatedMinutes} min) supera el tiempo disponible.`,
        path: `days.${dayIndex}`,
      })
    }
  })

  return issues
}

