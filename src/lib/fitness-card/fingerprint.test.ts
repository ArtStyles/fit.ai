import { describe, expect, it } from 'vitest'
import type { FitnessEvidence } from './types'
import { fitnessEvidenceFingerprint } from './fingerprint'

const first = {
  records: [
    { exerciseId: 'b', name: 'Press', kind: 'strength', weightKg: 50, reps: 8, seconds: null, date: '2026-09-10' },
    { exerciseId: 'a', name: 'Plank', kind: 'duration', weightKg: null, reps: null, seconds: 60, date: '2026-09-09' },
  ],
  muscles: [{ id: 'chest', sessions: 2 }, { id: 'back', sessions: 0 }],
  totalSessions: 3, partialSessions: 1, rangeFrom: '2026-06-21', rangeTo: '2026-09-12', updatedAt: 'old',
} as FitnessEvidence

describe('fitnessEvidenceFingerprint', () => {
  it('ignores object property order, updatedAt, array order and explicit zero muscles', () => {
    const equivalent = {
      updatedAt: 'new', rangeTo: '2026-09-12', rangeFrom: '2026-06-21', partialSessions: 1, totalSessions: 3,
      muscles: [{ sessions: 0, id: 'triceps' }, { sessions: 2, id: 'chest' }],
      records: [
        { date: '2026-09-09', seconds: 60, reps: null, weightKg: null, kind: 'duration', name: 'Plank', exerciseId: 'a' },
        { date: '2026-09-10', seconds: null, reps: 8, weightKg: 50, kind: 'strength', name: 'Press', exerciseId: 'b' },
      ],
    } as FitnessEvidence

    expect(fitnessEvidenceFingerprint(equivalent)).toBe(fitnessEvidenceFingerprint(first))
  })

  it('changes when shared evidence changes', () => {
    expect(fitnessEvidenceFingerprint({ ...first, totalSessions: 4 })).not.toBe(fitnessEvidenceFingerprint(first))
    expect(fitnessEvidenceFingerprint({ ...first, records: [{ ...first.records[0], reps: 9 }] })).not.toBe(fitnessEvidenceFingerprint(first))
  })
})
