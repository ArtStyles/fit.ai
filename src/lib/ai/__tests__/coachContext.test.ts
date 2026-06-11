import { describe, expect, it } from 'vitest'
import { buildCoachContextText } from '../coachContext'

describe('buildCoachContextText()', () => {
  it('compacta perfil, plan activo y sesiones recientes en español', () => {
    const text = buildCoachContextText({
      profile: {
        fitnessLevel: 'intermediate',
        primaryGoal: 'build_muscle',
        daysPerWeek: 4,
        injuries: 'molestia en hombro derecho',
        weightKg: 80,
      },
      activePlan: {
        name: 'Plan Intermedio · 4 días',
        weekNumber: 3,
        workouts: [
          { name: 'Upper A', dayOfWeek: 1, exerciseCount: 5 },
          { name: 'Lower A', dayOfWeek: 3, exerciseCount: 6 },
        ],
      },
      recentSessions: [
        { workoutName: 'Upper A', completedAt: '2026-06-08T16:00:00.000Z', durationMinutes: 55 },
        { workoutName: 'Lower A', completedAt: '2026-06-10T16:00:00.000Z', durationMinutes: 60 },
      ],
    })

    expect(text).toContain('intermediate')
    expect(text).toContain('build_muscle')
    expect(text).toContain('Plan Intermedio · 4 días')
    expect(text).toContain('semana 3')
    expect(text).toContain('Upper A')
    expect(text).toContain('molestia en hombro derecho')
    expect(text).toContain('2 sesiones')
  })

  it('indica cuando no hay plan ni sesiones', () => {
    const text = buildCoachContextText({
      profile: {
        fitnessLevel: 'beginner',
        primaryGoal: 'lose_weight',
        daysPerWeek: 3,
        injuries: null,
        weightKg: null,
      },
      activePlan: null,
      recentSessions: [],
    })

    expect(text).toContain('Sin plan activo')
    expect(text).toContain('Sin sesiones registradas')
    expect(text).not.toContain('Lesiones')
  })
})
