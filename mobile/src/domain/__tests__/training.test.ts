import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPersonalPlan, createWorkoutSession, defaultTrainingProfile, sessionVolume } from '../training'
import { exerciseCatalog } from '../catalog'
import type { MobileAccount } from '../types'

function account(): MobileAccount {
  const profile = defaultTrainingProfile()
  profile.readiness.status = 'cleared'
  profile.age = 30
  return { id: 'local-owner', remoteUserId: null, name: 'Ana', profile, createdAt: '2026-09-08T10:00:00.000Z', updatedAt: '2026-09-08T10:00:00.000Z' }
}

describe('offline training through the existing engine', () => {
  it('requires readiness before generating and keeps the default profile unreviewed', () => {
    const owner = account()
    owner.profile = defaultTrainingProfile()
    expect(() => createPersonalPlan(owner)).toThrow(/preparación|cribado/i)
    owner.profile.readiness.status = 'professional_clearance_required'
    expect(() => createPersonalPlan(owner)).toThrow(/profesional/i)
  })

  it('generates three local workouts whose complete prescriptions refer to bundled exercises', () => {
    const plan = createPersonalPlan(account())
    expect(plan.accountId).toBe('local-owner')
    expect(plan.source).toBe('personal')
    expect(plan.workouts).toHaveLength(3)
    for (const workout of plan.workouts) {
      expect(workout.exercises.length).toBeGreaterThan(0)
      for (const exercise of workout.exercises) {
        expect(exerciseCatalog.some(item => item.id === exercise.exerciseId)).toBe(true)
        expect(exercise.sets).toBeGreaterThan(0)
        expect((exercise.reps === null) !== (exercise.durationSeconds === null)).toBe(true)
      }
    }
  })

  it('never supplies machine or external equipment prescriptions to a bodyweight-only profile', () => {
    const owner = account()
    owner.profile.gymType = 'home_no_equipment'
    owner.profile.availableEquipment = []
    owner.profile.primaryGoal = 'build_muscle'
    const plan = createPersonalPlan(owner)
    for (const workout of plan.workouts) for (const exercise of workout.exercises) {
      const item = exerciseCatalog.find(entry => entry.id === exercise.exerciseId)!
      expect(item.equipment.every(eq => /corporal|ninguno|colchoneta|suelo/i.test(eq))).toBe(true)
    }
  })

  it('rejects invalid profile days instead of crashing inside template selection', () => {
    const owner = account()
    owner.profile.daysPerWeek = 9
    expect(() => createPersonalPlan(owner)).toThrow(/días/i)
  })

  it('snapshots a workout and sums only completed weighted repetitions', () => {
    const plan = createPersonalPlan(account())
    const workout = plan.workouts[0]
    const session = createWorkoutSession('local-owner', plan, workout)
    const originalName = session.exercises[0].prescription.name
    workout.exercises[0].name = 'Changed remotely'
    expect(session.exercises[0].prescription.name).toBe(originalName)
    session.exercises[0].sets = [
      { id: '1', reps: 10, weightKg: 20, durationSeconds: null, completed: true },
      { id: '2', reps: 10, weightKg: 50, durationSeconds: null, completed: false },
    ]
    expect(sessionVolume(session)).toBe(200)
    expect(session.finishedAt).toBeNull()
  })

  it('rejects cross-account session creation', () => {
    const plan = createPersonalPlan(account())
    expect(() => createWorkoutSession('another-owner', plan, plan.workouts[0])).toThrow(/cuenta/i)
  })

  it('has offline text and existing local poster assets for every reviewed catalogue entry', () => {
    expect(exerciseCatalog.length).toBeGreaterThanOrEqual(50)
    for (const exercise of exerciseCatalog) {
      expect(exercise.instructions.length).toBeGreaterThan(20)
      if (exercise.imageUrl) {
        expect(exercise.imageUrl).toMatch(/^\/exercises\//)
        expect(existsSync(resolve('public', exercise.imageUrl.slice(1)))).toBe(true)
      }
    }
  })
})
