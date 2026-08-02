import { describe, expect, it } from 'vitest'
import {
  parseSessionContextSnapshot,
  resolveSessionContext,
  type SessionContextSnapshotV1,
} from '../contextSnapshot'

const validSnapshot: SessionContextSnapshotV1 = {
  version: 1,
  workout: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Original workout',
    focus: 'Legs',
    dayOfWeek: 3,
  },
  plan: {
    id: '22222222-2222-4222-8222-222222222222',
    familyId: '33333333-3333-4333-8333-333333333333',
    name: 'Strength block',
    weekNumber: 2,
  },
  exercises: [{
    exerciseId: '44444444-4444-4444-8444-444444444444',
    name: 'Back squat',
    nameEs: 'Sentadilla trasera',
    muscleGroups: ['quadriceps', 'glutes'],
    muscleGroupsEs: ['cuádriceps', 'glúteos'],
    isCompound: true,
  }],
}

describe('session context snapshots', () => {
  it('accepts an exact version-1 snapshot', () => {
    expect(parseSessionContextSnapshot(validSnapshot)).toEqual(validSnapshot)
  })

  it('rejects a snapshot from an unknown version', () => {
    expect(parseSessionContextSnapshot({ version: 2 })).toBeNull()
  })

  it.each([
    ['an extra top-level field', { ...validSnapshot, unexpected: true }],
    ['a malformed workout id', { ...validSnapshot, workout: { ...validSnapshot.workout, id: 'workout-1' } }],
    ['a blank workout name', { ...validSnapshot, workout: { ...validSnapshot.workout, name: '  ' } }],
    ['an invalid nullable focus', { ...validSnapshot, workout: { ...validSnapshot.workout, focus: 4 } }],
    ['non-array exercise metadata', { ...validSnapshot, exercises: { ...validSnapshot.exercises[0] } }],
  ])('rejects %s', (_label, value) => {
    expect(parseSessionContextSnapshot(value)).toBeNull()
  })

  it('uses immutable snapshot context before a renamed workout relation', () => {
    expect(resolveSessionContext({
      snapshot: validSnapshot,
      workout: { name: 'Renamed', focus: null },
      fallbackWorkoutName: 'Workout',
    })).toMatchObject({ workoutName: 'Original workout', source: 'snapshot' })
  })

  it('uses the live workout relation for legacy logs without a snapshot', () => {
    expect(resolveSessionContext({
      snapshot: null,
      workout: { name: 'Legacy workout', focus: 'Core' },
      fallbackWorkoutName: 'Workout',
    })).toMatchObject({ workoutName: 'Legacy workout', source: 'workout' })
  })

  it('uses the supplied fallback when neither context source exists', () => {
    expect(resolveSessionContext({
      snapshot: null,
      workout: null,
      fallbackWorkoutName: 'Workout',
    })).toEqual({ workoutName: 'Workout', focus: null, source: 'fallback' })
  })
})
