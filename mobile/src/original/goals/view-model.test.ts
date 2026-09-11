import { describe, expect, it } from 'vitest'
import { parseGoalTarget, formatGoalSet, normalizeGoalSearch } from './view-model'

describe('personal goal form', () => {
  it('matches exercise searches independently of accents and case', () => {
    expect(normalizeGoalSearch('  Flexión de BÍCEPS  ')).toContain(normalizeGoalSearch('flexion de biceps'))
  })
  it('keeps following optional and validates strength as one complete target', () => {
    expect(parseGoalTarget(false, 'strength', '', '', '', 'es')).toBeNull()
    expect(parseGoalTarget(true, 'strength', '60,5', '10', '', 'es')).toEqual({ kind: 'strength', weightKg: 60.5, reps: 10 })
    for (const weight of ['', 'Infinity', '-1', '501']) expect(() => parseGoalTarget(true, 'strength', weight, '10', '', 'es')).toThrow()
    for (const reps of ['', '1.5', '0', '101', 'NaN']) expect(() => parseGoalTarget(true, 'strength', '60', reps, '', 'en')).toThrow()
  })
  it('uses seconds per set without inventing duration from weight or reps', () => {
    expect(parseGoalTarget(true, 'duration', '', '', '45', 'en')).toEqual({ kind: 'duration', seconds: 45 })
    for (const seconds of ['', '0', '1.5', '43201', 'Infinity']) expect(() => parseGoalTarget(true, 'duration', '', '', seconds, 'en')).toThrow()
    expect(formatGoalSet({ weightKg: 0, reps: 0, seconds: 45 }, 'duration', 'en')).toBe('45 s')
    expect(formatGoalSet({ weightKg: 60, reps: 10 }, 'strength', 'en')).toBe('60 kg × 10')
  })
})
