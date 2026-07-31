import { describe, expect, it } from 'vitest'
import {
  appliedConstraintLabels,
  buildPlanDistribution,
  buildPlanDaySummaries,
  buildPlanWeekEntries,
} from '../planViewModel'

describe('weekly plan summary', () => {
  it('fills the seven-day map with explicit rest days', () => {
    const entries = buildPlanWeekEntries([{
      id: 'pull',
      name: 'Pull',
      focus: 'Espalda',
      dayOfWeek: 3,
      orderInPlan: 1,
      durationMinutes: 50,
      exerciseCount: 5,
      isScheduled: true,
    }], 3)

    expect(entries).toHaveLength(7)
    expect(entries[1]).toMatchObject({ isoDay: 2, kind: 'rest', isToday: false })
    expect(entries[2]).toMatchObject({ isoDay: 3, kind: 'workout', isToday: true })
  })

  it('appends unscheduled sessions after the seven-day map', () => {
    const entries = buildPlanWeekEntries([{
      id: 'optional',
      name: 'Optional',
      focus: null,
      dayOfWeek: null,
      orderInPlan: 4,
      durationMinutes: 30,
      exerciseCount: 3,
      isScheduled: false,
    }], 1)

    expect(entries).toHaveLength(8)
    expect(entries.at(-1)).toMatchObject({ isoDay: null, kind: 'unscheduled', isToday: false })
  })

  it('calculates relative muscle coverage from prescribed sets', () => {
    expect(buildPlanDistribution([
      { sets: 3, muscleGroups: ['espalda', 'bíceps'] },
      { sets: 2, muscleGroups: ['espalda'] },
    ])).toEqual([
      { muscleGroup: 'espalda', prescribedSets: 5, relativePercent: 100 },
      { muscleGroup: 'bíceps', prescribedSets: 3, relativePercent: 60 },
    ])
  })

  it('deduplicates repeated muscle tags within one exercise', () => {
    expect(buildPlanDistribution([
      { sets: 4, muscleGroups: [' Cuádriceps ', 'cuádriceps', ''] },
    ])).toEqual([
      { muscleGroup: 'Cuádriceps', prescribedSets: 4, relativePercent: 100 },
    ])
  })

  it('sorts scheduled workouts and preserves unscheduled sessions last', () => {
    const result = buildPlanDaySummaries([
      { id: 'b', dayOfWeek: 5, name: 'Lower', duration: 50 },
      { id: 'a', dayOfWeek: 1, name: 'Upper', duration: 45 },
      { id: 'c', dayOfWeek: null, name: 'Optional', duration: 30 },
    ], { a: 6, b: 5, c: 3 })

    expect(result.map(day => day.id)).toEqual(['a', 'b', 'c'])
    expect(result[0]).toMatchObject({
      id: 'a',
      dayOfWeek: 1,
      exerciseCount: 6,
      durationMinutes: 45,
      isScheduled: true,
    })
    expect(result[2]).toMatchObject({
      id: 'c',
      dayOfWeek: null,
      exerciseCount: 3,
      isScheduled: false,
    })
  })

  it('uses workout order as a tie-breaker for repeated weekdays', () => {
    const result = buildPlanDaySummaries([
      { id: 'late', dayOfWeek: 2, name: 'Second Tuesday', orderInPlan: 2, duration: null },
      { id: 'early', dayOfWeek: 2, name: 'First Tuesday', orderInPlan: 1, duration: null },
    ], {})

    expect(result.map(day => day.id)).toEqual(['early', 'late'])
  })
})

describe('applied constraint labels', () => {
  it('summarizes safe profile constraints without exposing raw medical text', () => {
    const result = appliedConstraintLabels({
      gymType: 'home_basic',
      availableEquipment: ['mancuernas', 'bandas'],
      sessionDurationMinutes: 45,
      injuries: 'molestia de rodilla con sentadilla profunda',
      readinessStatus: 'modified',
      movementLimitations: [
        {
          region: 'rodilla',
          status: 'stable',
          movementsToAvoid: ['sentadilla profunda'],
          clinicianCleared: true,
        },
        {
          region: 'hombro',
          status: 'acute',
          movementsToAvoid: ['press vertical'],
          clinicianCleared: false,
        },
      ],
    }, 'es')

    expect(result).toEqual([
      'Casa con equipo básico',
      'Equipo: mancuernas, bandas',
      'Sesiones de 45 min',
      '1 restricción autorizada considerada',
    ])
    expect(result.join(' ')).not.toMatch(/rodilla|sentadilla|hombro|press|molestia/i)
  })

  it('localizes location and duration labels in English', () => {
    expect(appliedConstraintLabels({
      gymType: 'full_gym',
      availableEquipment: [],
      sessionDurationMinutes: 60,
      injuries: null,
      readinessStatus: 'cleared',
      movementLimitations: [],
    }, 'en')).toEqual([
      'Full gym',
      '60-minute sessions',
    ])
  })
})
