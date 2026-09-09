import type { MobileAccount, MobilePlan, MobilePrescription, MobileSession } from '../domain/types'
import { defaultTrainingProfile } from '../domain/training'
import { exerciseCatalog } from '../domain/catalog'

// PostgREST joined rows are validated at this boundary; never expose remote image URLs offline.
export type Row = Record<string, any>
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : []
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter(v => typeof v === 'string') : []
const num = (value: unknown, fallback: number | null = null) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const localImage = (id: string) => exerciseCatalog.find(e => e.remoteId === id || e.id === id)?.imageUrl ?? null
export function mapAccount(row: Row): MobileAccount {
  const profile = defaultTrainingProfile()
  const answers = row.readiness_answers ?? {}
  const dateOfBirth = row.date_of_birth ? new Date(row.date_of_birth) : null
  return {
    id: row.id, remoteUserId: row.id, name: row.full_name || row.username || 'Mi cuenta',
    createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? new Date().toISOString(),
    profile: {
      ...profile, language: row.language === 'en' ? 'en' : 'es',
      fitnessLevel: row.fitness_level ?? profile.fitnessLevel, primaryGoal: row.primary_goal ?? profile.primaryGoal,
      daysPerWeek: row.days_per_week ?? profile.daysPerWeek, sessionDurationMinutes: row.session_duration_minutes ?? profile.sessionDurationMinutes,
      gymType: row.gym_type ?? profile.gymType, availableEquipment: strings(row.available_equipment),
      preferredWorkoutDays: Array.isArray(row.preferred_workout_days) ? row.preferred_workout_days : null,
      cardioPreferences: row.cardio_preferences ?? [],
      age: dateOfBirth && Number.isFinite(dateOfBirth.getTime()) ? Math.max(0, Math.floor((Date.now() - dateOfBirth.getTime()) / 31557600000)) : null,
      readiness: {
        status: row.readiness_status ?? 'pending', currentlyActive: answers.currentlyActive === true || answers.currently_active === true,
        warningSymptoms: strings(answers.warningSymptoms ?? answers.warning_symptoms),
        knownCardiovascularMetabolicOrRenalDisease: answers.knownCardiovascularMetabolicOrRenalDisease === true || answers.known_disease === true,
        medicallyCleared: answers.medicallyCleared === true || answers.medically_cleared === true,
        recentSurgery: answers.recentSurgery === true || answers.recent_surgery === true,
        limitations: list(row.movement_limitations).map(v => ({ region: String(v.region ?? ''), side: v.side ?? null, status: v.status ?? 'stable',
          movementsToAvoid: strings(v.movementsToAvoid ?? v.movements_to_avoid), clinicianCleared: v.clinicianCleared === true || v.clinician_cleared === true })),
      },
    },
  }
}
function prescription(row: Row): MobilePrescription {
  const exercise = (Array.isArray(row.exercises) ? row.exercises[0] : row.exercises) ?? {}
  return { id: row.id, exerciseId: row.exercise_id, name: exercise.name_es || exercise.name || 'Ejercicio', imageUrl: localImage(row.exercise_id),
    instructions: exercise.instructions_es || exercise.instructions || row.notes || '', sets: num(row.sets, 1)!, reps: num(row.reps),
    durationSeconds: num(row.duration_seconds), restSeconds: num(row.rest_seconds, 60)!, weightKg: num(row.weight_kg), targetRpe: num(row.target_rpe) }
}
export function mapPlan(row: Row, accountId: string): MobilePlan {
  return { id: row.id, remoteId: row.id, accountId, source: row.source_type === 'trainer_assigned' ? 'trainer' : 'personal',
    name: row.name || 'Rutina descargada', notes: row.ai_notes || row.description || '', createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at,
    workouts: list(row.workouts).sort((a, b) => (a.order_in_plan ?? 0) - (b.order_in_plan ?? 0)).map(w => ({ id: w.id, name: w.name || 'Entrenamiento', dayOfWeek: w.day_of_week ?? 1,
      exercises: list(w.workout_exercises).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map(prescription) })),
  }
}
export function mapSession(row: Row, accountId: string, plans: MobilePlan[]): MobileSession {
  const context = row.session_context_snapshot ?? {}
  const plan = plans.find(p => p.workouts.some(w => w.id === row.workout_id))
  const workout = plan?.workouts.find(w => w.id === row.workout_id)
  return { id: row.client_session_id || row.id, remoteId: row.id, accountId, planId: context.plan?.id || plan?.id || row.workout_id || row.id,
    workoutId: row.workout_id || context.workout?.id || row.id, workoutName: context.workout?.name || workout?.name || 'Entrenamiento importado',
    source: context.plan?.prescriptionLocked || plan?.source === 'trainer' ? 'trainer' : 'personal',
    startedAt: new Date(Date.parse(row.completed_at) - (row.duration_minutes ?? 0) * 60000).toISOString(), finishedAt: row.completed_at, rpe: null, notes: row.notes || '',
    exercises: list(row.exercise_logs).map(log => {
      const historic = list(context.exercises).find(e => e.exerciseId === log.exercise_id)
      const count = num(log.sets_completed, 0)!
      return {
        prescription: { id: log.id, exerciseId: log.exercise_id, name: historic?.nameEs || historic?.name || 'Ejercicio registrado', imageUrl: localImage(log.exercise_id),
          instructions: '', sets: Math.max(1, count), reps: null, durationSeconds: null, restSeconds: 0, weightKg: null, targetRpe: null },
        sets: Array.from({ length: count }, (_, i) => ({ id: `${log.id}:${i}`, reps: num(log.reps_completed?.[i]), weightKg: num(log.weights_kg?.[i]),
          durationSeconds: count === 1 ? num(log.duration_seconds) : null, completed: true })),
      }
    }),
  }
}
