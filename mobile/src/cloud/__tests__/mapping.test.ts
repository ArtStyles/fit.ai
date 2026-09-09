import { describe, expect, it } from 'vitest'
import { mapAccount, mapPlan, mapSession } from '../mapping'

describe('Supabase import', () => {
  it('keeps remote workout and exercise IDs and frozen trainer prescriptions', () => {
    const plan = mapPlan({ id: 'p', user_id: 'u', source_type: 'trainer_assigned', created_at: '2026-01-01', updated_at: '2026-01-02', workouts: [{ id: 'w', day_of_week: 3, workout_exercises: [{ id: 'we', exercise_id: 'e', sets: 4, reps: 8, weight_kg: 12, exercises: { name_es: 'Sentadilla' } }] }] }, 'u')
    expect(plan.source).toBe('trainer'); expect(plan.workouts[0].id).toBe('w')
    expect(plan.workouts[0].exercises[0]).toMatchObject({ id: 'we', exerciseId: 'e', sets: 4, reps: 8, weightKg: 12 })
  })
  it('uses historical names and recorded sets instead of current plan prescription', () => {
    const session = mapSession({ id: 'log', workout_id: 'gone', completed_at: '2026-09-01T10:30:00Z', duration_minutes: 30,
      session_context_snapshot: { workout: { id: 'gone', name: 'Rutina anterior' }, plan: { id: 'old', prescriptionLocked: true }, exercises: [{ exerciseId: 'e', nameEs: 'Nombre anterior' }] },
      exercise_logs: [{ id: 'el', exercise_id: 'e', sets_completed: 2, reps_completed: [8, 7], weights_kg: [10, 12] }] }, 'u', [])
    expect(session.workoutName).toBe('Rutina anterior'); expect(session.source).toBe('trainer')
    expect(session.exercises[0].prescription.name).toBe('Nombre anterior')
    expect(session.exercises[0].sets.map(s => s.reps)).toEqual([8, 7])
  })
  it('never turns an incomplete remote readiness assessment into clearance', () => {
    expect(mapAccount({ id: 'u' }).profile.readiness.status).toBe('pending')
    const profile = mapAccount({ id: 'u', readiness_status: 'professional_clearance_required', readiness_answers: { warning_symptoms: ['dolor'] } }).profile
    expect(profile.readiness.status).toBe('professional_clearance_required')
    expect(profile.readiness.warningSymptoms).toEqual(['dolor'])
  })
  it('imports skipped historical exercises with a valid prescription and no invented completed set', () => {
    const session = mapSession({ id: 'log', completed_at: '2026-09-01T10:30:00Z', exercise_logs: [{ id: 'el', exercise_id: 'e', sets_completed: 0 }] }, 'u', [])
    expect(session.exercises[0].prescription.sets).toBe(1)
    expect(session.exercises[0].sets).toEqual([])
  })
})
