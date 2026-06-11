import { describe, expect, it } from 'vitest'
import { detectPersonalRecord, epley1Rm } from '../records'

describe('epley1Rm()', () => {
  it('estimates the 1RM with the Epley formula', () => {
    expect(epley1Rm(40, 10)).toBeCloseTo(53.3, 1)
    expect(epley1Rm(100, 1)).toBeCloseTo(103.3, 1)
  })
})

describe('detectPersonalRecord()', () => {
  const exerciseName = 'Bench Press'

  it('detects a weight PR when the max load beats history', () => {
    const result = detectPersonalRecord({
      exerciseName,
      currentSets: [{ weightKg: 45, reps: 8 }],
      historySets: [{ weightKg: 40, reps: 10 }],
      hasHistory: true,
    })

    expect(result).toMatchObject({ kind: 'weight', weightKg: 45 })
  })

  it('detects an e1RM PR when more reps beat history at the same weight', () => {
    const result = detectPersonalRecord({
      exerciseName,
      currentSets: [{ weightKg: 40, reps: 12 }],
      historySets: [{ weightKg: 40, reps: 10 }],
      hasHistory: true,
    })

    expect(result).toMatchObject({ kind: 'e1rm', weightKg: 40 })
    expect(result?.e1rmKg).toBeCloseTo(56, 1)
  })

  it('returns null when neither weight nor e1RM improve', () => {
    const result = detectPersonalRecord({
      exerciseName,
      currentSets: [{ weightKg: 40, reps: 8 }],
      historySets: [{ weightKg: 40, reps: 10 }],
      hasHistory: true,
    })

    expect(result).toBeNull()
  })

  it('treats the first weighted session as the initial record', () => {
    const result = detectPersonalRecord({
      exerciseName,
      currentSets: [{ weightKg: 40, reps: 10 }],
      historySets: [],
      hasHistory: false,
    })

    expect(result).toMatchObject({ kind: 'weight', weightKg: 40 })
  })

  it('detects a rep PR for bodyweight work', () => {
    const result = detectPersonalRecord({
      exerciseName: 'Pull Up',
      currentSets: [{ weightKg: 0, reps: 12 }],
      historySets: [{ weightKg: 0, reps: 10 }],
      hasHistory: true,
    })

    expect(result).toMatchObject({ kind: 'reps', reps: 12 })
  })

  it('does not celebrate the first bodyweight session', () => {
    const result = detectPersonalRecord({
      exerciseName: 'Pull Up',
      currentSets: [{ weightKg: 0, reps: 10 }],
      historySets: [],
      hasHistory: false,
    })

    expect(result).toBeNull()
  })

  it('returns null without completed work', () => {
    const result = detectPersonalRecord({
      exerciseName,
      currentSets: [],
      historySets: [{ weightKg: 40, reps: 10 }],
      hasHistory: true,
    })

    expect(result).toBeNull()
  })
})
