/**
 * mockPlanGenerator.test.ts
 *
 * Tests de integración para el mock de generación de planes.
 * No requieren API key ni conexión a Supabase — solo usan mockGenerateInitialPlan()
 * con ejercicios de fixture.
 *
 * Al pasar a producción con la API real, los mismos tests siguen siendo válidos
 * porque validan estructura y contratos, no contenido específico del modelo.
 */

import { describe, it, expect } from 'vitest'
import { mockGenerateInitialPlan }         from '../mock-planGenerator'
import type { UserContext, FilteredExercise } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Crea un UUID falso pero único para tests */
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

/** Pool de ejercicios de test — cubre los grupos musculares principales */
const TEST_EXERCISES: FilteredExercise[] = [
  // Compounds — pecho
  { id: uid(1),  name: 'Bench Press',        muscle_groups: ['chest', 'triceps'],           equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  { id: uid(2),  name: 'Incline Bench Press', muscle_groups: ['chest', 'shoulders'],         equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  // Compounds — espalda
  { id: uid(3),  name: 'Pull Up',             muscle_groups: ['back', 'biceps'],             equipment: [],         exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  { id: uid(4),  name: 'Barbell Row',         muscle_groups: ['back', 'biceps'],             equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  // Compounds — piernas
  { id: uid(5),  name: 'Squat',               muscle_groups: ['quadriceps', 'glutes'],       equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  { id: uid(6),  name: 'Deadlift',            muscle_groups: ['hamstrings', 'back'],         equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  { id: uid(7),  name: 'Leg Press',           muscle_groups: ['quadriceps', 'glutes'],       equipment: ['barbell'], exercise_type: 'strength', difficulty: 'beginner',     is_compound: true  },
  // Compounds — hombros
  { id: uid(8),  name: 'Overhead Press',      muscle_groups: ['shoulders', 'triceps'],       equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  // Isolations — pecho/hombros/tríceps
  { id: uid(9),  name: 'Cable Fly',           muscle_groups: ['chest'],                      equipment: ['cable'],   exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(10), name: 'Lateral Raise',       muscle_groups: ['shoulders', 'deltoids'],      equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(11), name: 'Tricep Pushdown',     muscle_groups: ['triceps'],                    equipment: ['cable'],   exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  // Isolations — espalda/bíceps
  { id: uid(12), name: 'Bicep Curl',          muscle_groups: ['biceps'],                     equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(13), name: 'Face Pull',           muscle_groups: ['back', 'shoulders'],          equipment: ['cable'],   exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  // Isolations — piernas
  { id: uid(14), name: 'Leg Curl',            muscle_groups: ['hamstrings'],                 equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(15), name: 'Calf Raise',          muscle_groups: ['calves', 'gastrocnemius'],    equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  // Core
  { id: uid(16), name: 'Plank',               muscle_groups: ['core', 'abs'],                equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(17), name: 'Crunch',              muscle_groups: ['abs', 'core'],                equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  // Extras para garantizar pool suficiente
  { id: uid(18), name: 'Dumbbell Row',        muscle_groups: ['back', 'biceps'],             equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: true  },
  { id: uid(19), name: 'Push Up',             muscle_groups: ['chest', 'triceps'],           equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: true  },
  { id: uid(20), name: 'Glute Bridge',        muscle_groups: ['glutes', 'hamstrings'],       equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(21), name: 'Lunge',               muscle_groups: ['quadriceps', 'glutes'],       equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: true  },
  { id: uid(22), name: 'Hip Thrust',          muscle_groups: ['glutes'],                     equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: false },
  { id: uid(23), name: 'Shoulder Press DB',   muscle_groups: ['shoulders', 'deltoids'],      equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: true  },
  { id: uid(24), name: 'Chest Dip',           muscle_groups: ['chest', 'triceps'],           equipment: [],         exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  { id: uid(25), name: 'Romanian Deadlift',   muscle_groups: ['hamstrings', 'glutes'],       equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: true  },
  { id: uid(26), name: 'Front Squat',         muscle_groups: ['quadriceps', 'core'],         equipment: ['barbell'], exercise_type: 'strength', difficulty: 'advanced',     is_compound: true  },
  { id: uid(27), name: 'Seated Row',          muscle_groups: ['back', 'biceps'],             equipment: ['cable'],   exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(28), name: 'Pec Deck',            muscle_groups: ['chest'],                      equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(29), name: 'Hammer Curl',         muscle_groups: ['biceps'],                     equipment: [],         exercise_type: 'strength', difficulty: 'beginner',     is_compound: false },
  { id: uid(30), name: 'Skullcrusher',        muscle_groups: ['triceps'],                    equipment: ['barbell'], exercise_type: 'strength', difficulty: 'intermediate', is_compound: false },
]

const VALID_IDS = new Set(TEST_EXERCISES.map(e => e.id))

/** Perfil de usuario base — se sobreescribe en cada test según necesidad */
const BASE_USER: UserContext = {
  fitness_level:             'intermediate',
  primary_goal:              'build_muscle',
  days_per_week:             4,
  session_duration_minutes:  60,
  gym_type:                  'full_gym',
  available_equipment:       ['barbell', 'cable_machine'],
  injuries:                  '',
  gender:                    'male',
  weight_kg:                 80,
  age:                       28,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mockGenerateInitialPlan()', () => {

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it('genera exactamente days_per_week días', async () => {
    for (const days of [2, 3, 4, 5, 6]) {
      const user = { ...BASE_USER, days_per_week: days }
      const result = await mockGenerateInitialPlan(user, TEST_EXERCISES)

      expect(result.plan.days).toHaveLength(days)

      // day_number debe ser secuencial desde 1
      result.plan.days.forEach((day, idx) => {
        expect(day.day_number).toBe(idx + 1)
      })
    }
  }, 30_000)  // timeout generoso por la latencia simulada

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it('todos los exercise_id existen en el catálogo recibido', async () => {
    const result = await mockGenerateInitialPlan(BASE_USER, TEST_EXERCISES)

    for (const day of result.plan.days) {
      for (const ex of day.exercises) {
        expect(VALID_IDS.has(ex.exercise_id)).toBe(true)
      }
    }
  }, 15_000)

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it('el primer ejercicio de cada día es compound', async () => {
    const result = await mockGenerateInitialPlan(BASE_USER, TEST_EXERCISES)

    const compoundIds = new Set(
      TEST_EXERCISES.filter(e => e.is_compound).map(e => e.id),
    )

    for (const day of result.plan.days) {
      if (day.exercises.length === 0) continue
      const firstExId = day.exercises[0].exercise_id
      expect(
        compoundIds.has(firstExId),
        `Día ${day.day_number}: primer ejercicio (${firstExId}) no es compound`,
      ).toBe(true)
    }
  }, 15_000)

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it('la duración estimada no excede session_duration_minutes + 10', async () => {
    const sessionMin = 45
    const user = { ...BASE_USER, session_duration_minutes: sessionMin }
    const result = await mockGenerateInitialPlan(user, TEST_EXERCISES)

    for (const day of result.plan.days) {
      // Estimación: ~3.5 min/serie × series totales del día
      const totalSets = day.exercises.reduce((sum, ex) => sum + ex.sets, 0)
      const estimatedMin = Math.round(totalSets * 3.5)

      expect(
        estimatedMin,
        `Día ${day.day_number}: ${estimatedMin} min estimados (${totalSets} series) supera ${sessionMin + 10} min`,
      ).toBeLessThanOrEqual(sessionMin + 10)
    }
  }, 15_000)

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it('genera un plan estructuralmente válido sin API key (modo mock)', async () => {
    const result = await mockGenerateInitialPlan(BASE_USER, TEST_EXERCISES)

    // Estructura raíz
    expect(result).toHaveProperty('plan')
    expect(result.plan).toHaveProperty('display_name')
    expect(result.plan).toHaveProperty('ai_notes')
    expect(result.plan).toHaveProperty('days')
    expect(typeof result.plan.display_name).toBe('string')
    expect(typeof result.plan.ai_notes).toBe('string')
    expect(Array.isArray(result.plan.days)).toBe(true)

    // Cada día y ejercicio cumplen el schema mínimo
    for (const day of result.plan.days) {
      expect(typeof day.day_number).toBe('number')
      expect(typeof day.display_name).toBe('string')
      expect(day.display_name.length).toBeLessThanOrEqual(30)
      expect(day.display_name).not.toMatch(/^Día\s+\d+/i)
      expect(typeof day.focus).toBe('string')
      expect(day.exercises.length).toBeGreaterThan(0)

      for (const ex of day.exercises) {
        expect(typeof ex.exercise_id).toBe('string')
        expect(ex.sets).toBeGreaterThanOrEqual(1)
        expect(typeof ex.rest_seconds).toBe('number')
        expect(ex.target_rpe).toBeGreaterThanOrEqual(1)
        expect(ex.target_rpe).toBeLessThanOrEqual(10)

        // Exactamente uno de reps/duration_seconds debe ser no-null
        const hasReps     = ex.reps !== null && ex.reps !== undefined
        const hasDuration = ex.duration_seconds !== null && ex.duration_seconds !== undefined
        expect(hasReps !== hasDuration).toBe(true)

        // weight_suggestion_basis siempre presente
        expect(ex.weight_suggestion_basis).toBeDefined()
      }
    }

    // El ai_notes del mock incluye el marcador [MOCK] para identificarlo fácilmente
    expect(result.plan.ai_notes).toContain('[MOCK]')
  }, 15_000)
})

describe('mockGenerateInitialPlan() — periodización', () => {

  it('aplica la descarga en la semana de deload', async () => {
    const result = await mockGenerateInitialPlan(BASE_USER, TEST_EXERCISES, {
      weekNumber: 4,
      cyclePhase: 'deload',
      previousWeek: null,
    })

    for (const day of result.plan.days) {
      for (const ex of day.exercises) {
        expect(ex.sets).toBeLessThanOrEqual(3)
        expect(ex.target_rpe).toBeLessThanOrEqual(6)
      }
    }

    expect(result.plan.ai_notes.toLowerCase()).toContain('descarga')
  }, 15_000)

  it('sube un punto de RPE en la semana de intensificación', async () => {
    const result = await mockGenerateInitialPlan(BASE_USER, TEST_EXERCISES, {
      weekNumber: 3,
      cyclePhase: 'intensify',
      previousWeek: null,
    })

    // Intermedio: base 7 → primer ejercicio 8, resto 9
    for (const day of result.plan.days) {
      day.exercises.forEach((ex, i) => {
        expect(ex.target_rpe).toBe(i === 0 ? 8 : 9)
      })
    }
  }, 15_000)

  it('menciona la adherencia de la semana anterior en las notas', async () => {
    const result = await mockGenerateInitialPlan(BASE_USER, TEST_EXERCISES, {
      weekNumber: 2,
      cyclePhase: 'build',
      previousWeek: {
        scheduledSessions: 4,
        completedSessions: 3,
        adherenceRatio: 0.75,
        avgRpe: 7.5,
        skippedExercises: [],
      },
    })

    expect(result.plan.ai_notes).toContain('3/4')
  }, 15_000)
})
