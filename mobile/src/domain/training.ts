import { generateEvidencePlan } from '@/lib/training-engine'
import type { EvidencePlan, TrainingProfile } from '@/lib/training-engine'
import type { MobileAccount, MobilePlan, MobileSession, MobileWorkout } from './types'
import { catalogueForProfile, exerciseCatalog } from './catalog'

export function defaultTrainingProfile(): TrainingProfile {
  return {
    language: 'es', fitnessLevel: 'beginner', primaryGoal: 'build_muscle', daysPerWeek: 3,
    sessionDurationMinutes: 45, gymType: 'full_gym', availableEquipment: [],
    preferredWorkoutDays: [1, 3, 5], cardioPreferences: ['walking', 'cycling'], age: null,
    readiness: {
      status: 'pending', currentlyActive: false, warningSymptoms: [],
      knownCardiovascularMetabolicOrRenalDisease: false, medicallyCleared: false,
      recentSurgery: false, limitations: [],
    },
  }
}

function previousEvidencePlan(previous: MobilePlan): EvidencePlan {
  return {
    display_name: previous.name, ai_notes: previous.notes,
    days: previous.workouts.map((workout, index) => ({
      day_number: index + 1, display_name: workout.name, focus: '',
      exercises: workout.exercises.map(exercise => ({
        exercise_id: exercise.exerciseId, sets: exercise.sets, reps: exercise.reps,
        duration_seconds: exercise.durationSeconds, rest_seconds: exercise.restSeconds,
        target_rpe: exercise.targetRpe ?? 7, weight_kg: exercise.weightKg,
        weight_suggestion_basis: 'based_on_previous_logs' as const, notes: null,
      })),
    })),
  }
}

export function createPersonalPlan(account: MobileAccount, previousPlan?: MobilePlan): MobilePlan {
  if (previousPlan && (previousPlan.accountId !== account.id || previousPlan.source !== 'personal')) {
    throw new Error('Solo puedes regenerar una rutina personal de esta cuenta.')
  }
  const profile = account.profile
  if (!Number.isInteger(profile.daysPerWeek) || profile.daysPerWeek < 3 || profile.daysPerWeek > 6) {
    throw new Error('Selecciona entre 3 y 6 días de entrenamiento.')
  }
  if (![30, 45, 60, 90].includes(profile.sessionDurationMinutes)) {
    throw new Error('Selecciona sesiones de 30, 45, 60 o 90 minutos.')
  }
  const id = crypto.randomUUID()
  const result = generateEvidencePlan({
    profile, exercises: catalogueForProfile(profile), seed: `${account.id}:${id}`,
    previousPlan: previousPlan ? { plan: previousEvidencePlan(previousPlan) } : null,
  })
  if (!result.success || !result.plan) {
    throw new Error(result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message).join(' ') || 'No se pudo generar una rutina con este equipamiento.')
  }
  const requestedDays = [...new Set(profile.preferredWorkoutDays ?? [])]
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 7).sort((a, b) => a - b)
  const days = requestedDays.length >= profile.daysPerWeek ? requestedDays :
    ({ 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6] } as Record<number, number[]>)[profile.daysPerWeek]
  const createdAt = new Date().toISOString()
  return {
    id, accountId: account.id, remoteId: null, source: 'personal', name: result.plan.display_name,
    notes: result.plan.ai_notes, createdAt, updatedAt: createdAt,
    workouts: result.plan.days.map((day, index) => ({
      id: crypto.randomUUID(), name: day.display_name, dayOfWeek: days[index],
      exercises: day.exercises.map(exercise => {
        const catalog = exerciseCatalog.find(item => item.id === exercise.exercise_id)!
        return {
          id: crypto.randomUUID(), exerciseId: catalog.id, name: catalog.name,
          imageUrl: catalog.imageUrl, instructions: catalog.instructions,
          sets: exercise.sets, reps: exercise.reps, durationSeconds: exercise.duration_seconds,
          restSeconds: exercise.rest_seconds, weightKg: exercise.weight_kg, targetRpe: exercise.target_rpe,
        }
      }),
    })),
  }
}

export function createWorkoutSession(accountId: string, plan: MobilePlan, workout: MobileWorkout): MobileSession {
  if (plan.accountId !== accountId || !plan.workouts.some(item => item.id === workout.id)) {
    throw new Error('La rutina no pertenece a esta cuenta.')
  }
  return {
    id: crypto.randomUUID(), accountId, planId: plan.id, workoutId: workout.id,
    workoutName: workout.name, source: plan.source, startedAt: new Date().toISOString(),
    finishedAt: null, rpe: null, notes: '', remoteId: null,
    exercises: workout.exercises.map(prescription => ({
      prescription: structuredClone(prescription),
      sets: Array.from({ length: prescription.sets }, () => ({
        id: crypto.randomUUID(), reps: prescription.reps, weightKg: prescription.weightKg,
        durationSeconds: prescription.durationSeconds, completed: false,
      })),
    })),
  }
}

export function sessionVolume(session: MobileSession): number {
  return session.exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) =>
    sum + (set.completed ? (set.reps ?? 0) * (set.weightKg ?? 0) : 0), 0), 0)
}
