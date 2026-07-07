import { describe, expect, it } from 'vitest'
import {
  appliedConstraintLabels,
  buildPlanDaySummaries,
} from '../planViewModel'

describe('weekly plan summary', () => {
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
