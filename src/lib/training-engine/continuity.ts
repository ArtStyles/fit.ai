import type { EvidencePlan, PlanExercise } from './types'

const STALL_SESSION_COUNT = 3
const EPSILON = 0.01

export interface ExerciseProgressHistoryEntry {
  exerciseId: string
  completedAt: string
  weightsKg: number[] | null
  repsCompleted: number[] | null
}

function bestPreviousExercise(exercises: PlanExercise[]): PlanExercise | undefined {
  return [...exercises].sort((a, b) => {
    const basisScore = (exercise: PlanExercise) => exercise.weight_suggestion_basis === 'based_on_previous_logs' ? 1 : 0
    return basisScore(b) - basisScore(a) || (b.weight_kg ?? 0) - (a.weight_kg ?? 0)
  })[0]
}

/** Preserve user-earned targets when an exercise survives a plan regeneration. */
export function carryForwardProgression(
  plan: EvidencePlan,
  previousPlan: EvidencePlan,
): EvidencePlan {
  const previousByExercise = new Map<string, PlanExercise[]>()
  for (const day of previousPlan.days) {
    for (const exercise of day.exercises) {
      const entries = previousByExercise.get(exercise.exercise_id) ?? []
      entries.push(exercise)
      previousByExercise.set(exercise.exercise_id, entries)
    }
  }

  return {
    ...plan,
    days: plan.days.map((day, dayIndex) => {
      const previousDay = previousPlan.days[dayIndex]
      const previousDayByExercise = new Map(
        previousDay?.exercises.map(exercise => [exercise.exercise_id, exercise]) ?? [],
      )

      return {
        ...day,
        exercises: day.exercises.map(exercise => {
          if (exercise.duration_seconds !== null) return exercise
          const previous = previousDayByExercise.get(exercise.exercise_id)
            ?? bestPreviousExercise(previousByExercise.get(exercise.exercise_id) ?? [])
          if (!previous || previous.duration_seconds !== null) return exercise

          return {
            ...exercise,
            reps: previous.reps ?? exercise.reps,
            weight_kg: previous.weight_kg,
            weight_suggestion_basis: previous.weight_suggestion_basis,
            notes: previous.notes ?? exercise.notes,
          }
        }),
      }
    }),
  }
}

function maxPositive(values: number[] | null): number {
  return Math.max(0, ...(values ?? []).filter(value => Number.isFinite(value) && value > 0))
}

/** Detect exercises with three recent sessions and no load or rep improvement. */
export function findStalledExerciseIds(entries: ExerciseProgressHistoryEntry[]): string[] {
  const byExercise = new Map<string, ExerciseProgressHistoryEntry[]>()
  for (const entry of entries) {
    const history = byExercise.get(entry.exerciseId) ?? []
    history.push(entry)
    byExercise.set(entry.exerciseId, history)
  }

  const stalled: string[] = []
  for (const [exerciseId, history] of Array.from(byExercise.entries())) {
    const recent = history
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, STALL_SESSION_COUNT)
    if (recent.length < STALL_SESSION_COUNT) continue

    const weights = recent.map(entry => maxPositive(entry.weightsKg))
    const reps = recent.map(entry => maxPositive(entry.repsCompleted))
    const sameWeight = weights.every(weight => Math.abs(weight - weights[0]) < EPSILON)
    const newestImproved = weights[0] > weights[weights.length - 1] + EPSILON
      || (sameWeight && reps[0] > reps[reps.length - 1])

    if (sameWeight && !newestImproved) stalled.push(exerciseId)
  }

  return stalled
}
