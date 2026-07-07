import { describe, expect, it } from 'vitest'
import { parseSessionResultSnapshot } from '../resultSnapshot'

const validWeightProgression = {
  exerciseId: 'exercise-1',
  exerciseName: 'Press Banca',
  progressionType: 'weight',
  currentWeightKg: 80,
  nextWeightKg: 82.5,
  currentTargetReps: null,
  nextTargetReps: null,
  action: 'increase',
  reason: 'Completaste el objetivo.',
  confidence: 'high',
}

function snapshotWith(pr: Record<string, unknown>) {
  return { version: 1, prs: [pr], progressions: [validWeightProgression] }
}

describe('parseSessionResultSnapshot', () => {
  it.each([
    { exerciseName: 'Press', weightKg: 100, kind: 'weight' },
    { exerciseName: 'Press', weightKg: 90, kind: 'e1rm', e1rmKg: 114 },
    { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: 12 },
  ])('accepts a completion-safe $kind personal record', personalRecord => {
    const parsed = parseSessionResultSnapshot(snapshotWith(personalRecord))

    expect(parsed?.prs).toEqual([personalRecord])
    const details = parsed?.prs.map(pr => {
      if (pr.kind === 'e1rm') return `1RM: ${pr.e1rmKg} kg`
      if (pr.kind === 'reps') return `${pr.reps} reps`
      return `${pr.weightKg} kg`
    })
    expect(details?.join(' ')).not.toContain('undefined')
  })

  it.each([
    ['e1rm missing e1rmKg', { exerciseName: 'Press', weightKg: 90, kind: 'e1rm' }],
    ['e1rm with wrong e1rmKg', { exerciseName: 'Press', weightKg: 90, kind: 'e1rm', e1rmKg: '114' }],
    ['e1rm with nonfinite e1rmKg', { exerciseName: 'Press', weightKg: 90, kind: 'e1rm', e1rmKg: Infinity }],
    ['e1rm with reps field', { exerciseName: 'Press', weightKg: 90, kind: 'e1rm', e1rmKg: 114, reps: 8 }],
    ['reps missing reps', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps' }],
    ['reps with wrong reps', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: '12' }],
    ['reps with negative reps', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: -1 }],
    ['reps with zero reps', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: 0 }],
    ['reps with fractional reps', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: 1.5 }],
    ['reps with nonfinite reps', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: Infinity }],
    ['reps with loaded weight', { exerciseName: 'Dominadas', weightKg: 10, kind: 'reps', reps: 12 }],
    ['reps with e1rm field', { exerciseName: 'Dominadas', weightKg: 0, kind: 'reps', reps: 12, e1rmKg: 20 }],
    ['weight with e1rm field', { exerciseName: 'Press', weightKg: 100, kind: 'weight', e1rmKg: 120 }],
    ['weight with reps field', { exerciseName: 'Press', weightKg: 100, kind: 'weight', reps: 8 }],
    ['weight with impossible value', { exerciseName: 'Press', weightKg: -1, kind: 'weight' }],
    ['record with unknown extra field', { exerciseName: 'Press', weightKg: 100, kind: 'weight', extra: true }],
  ])('rejects %s', (_label, personalRecord) => {
    expect(parseSessionResultSnapshot(snapshotWith(personalRecord))).toBeNull()
  })

  it.each([
    ['nonfinite weight', { ...validWeightProgression, nextWeightKg: Infinity }],
    ['negative weight', { ...validWeightProgression, nextWeightKg: -1 }],
    ['weight progression with rep targets', { ...validWeightProgression, nextTargetReps: 8 }],
    ['reps progression with weights', {
      ...validWeightProgression,
      progressionType: 'reps',
      currentWeightKg: 10,
      nextWeightKg: null,
      currentTargetReps: 8,
      nextTargetReps: 9,
    }],
    ['reps progression with fractional target', {
      ...validWeightProgression,
      progressionType: 'reps',
      currentWeightKg: null,
      nextWeightKg: null,
      currentTargetReps: 8,
      nextTargetReps: 9.5,
    }],
    ['missing reason', Object.fromEntries(Object.entries(validWeightProgression).filter(([key]) => key !== 'reason'))],
    ['unknown progression field', { ...validWeightProgression, extra: true }],
    ['invalid stalled flag', { ...validWeightProgression, stalled: 'yes' }],
  ])('rejects malformed progression: %s', (_label, progression) => {
    const value = {
      version: 1,
      prs: [{ exerciseName: 'Press', weightKg: 100, kind: 'weight' }],
      progressions: [progression],
    }

    expect(parseSessionResultSnapshot(value)).toBeNull()
  })
})
