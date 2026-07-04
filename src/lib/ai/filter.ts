/**
 * filter.ts
 *
 * filterExercisesForUser() — construye el pool de ejercicios disponibles
 * para el motor determinista de planes.
 *
 * ── Restricciones DURAS (nunca se relajan) ───────────────────────────────────
 *   1. Equipamiento: solo ejercicios que el usuario puede hacer con lo que tiene.
 *   2. Lesiones: excluye ejercicios que conflicten con las limitaciones declaradas.
 *
 * ── Cascade de relajación (en orden) ────────────────────────────────────────
 *   Nivel 1 — Estricto : equipo + lesión + dificultad exacta + tipos preferidos por objetivo
 *   Nivel 2 — Sin tipo : equipo + lesión + dificultad exacta  (relaja tipo de ejercicio)
 *   Nivel 3 — Sin dific: equipo + lesión                      (relaja dificultad)
 *   Nivel 4 — Devolver todo lo que pase equipo + lesión       (nunca se relaja más)
 *
 * MIN_POOL = 30 ejercicios. Si no se alcanza en nivel N, se pasa al N+1.
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { UserContext, FilteredExercise } from './types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MIN_POOL = 30   // mínimo de ejercicios antes de relajar filtros secundarios

// ─── Equipamiento ─────────────────────────────────────────────────────────────

/**
 * Términos que no requieren equipamiento especial del usuario.
 * Un ejercicio que SOLO usa estos términos puede hacerlo cualquier usuario.
 */
const BODYWEIGHT_TERMS = new Set([
  'body weight', 'bodyweight', 'no equipment', 'none', '',
  'body only',
  'gym mat', 'exercise mat', 'mat',
  'swiss ball', 'stability ball', 'exercise ball', 'medicine ball',
  'foam roller', 'foam roll',
])

/**
 * Mapeo de nombres de equipamiento del onboarding → términos en la DB (free-exercise-db).
 * La DB puede tener variantes; se comprueba por substring case-insensitive.
 */
const EQUIPMENT_MAP: Record<string, string[]> = {
  dumbbells:       ['dumbbell', 'dumbbells'],
  barbell:         ['barbell', 'bar', 'ez-bar', 'sz-bar', 'ez bar', 'e-z curl bar'],
  bench:           ['bench', 'weight bench', 'incline bench'],
  kettlebell:      ['kettlebell', 'kettlebells'],
  resistance_bands:['band', 'bands', 'resistance band', 'elastic band'],
  cable_machine:   ['cable', 'cables', 'pulley', 'machine'], // 'machine' amplía la compatibilidad con catálogos heterogéneos
  pull_up_bar:     ['pull-up bar', 'pullup bar', 'pull up bar', 'chin-up bar'],
  trx:             ['trx', 'suspension', 'gymnastic rings'],
}

function exerciseFitsEquipment(
  exerciseEquipment: string[],
  gymType: string,
  userEquipment: string[],
): boolean {
  // Gimnasio completo → sin restricción de equipamiento
  if (gymType === 'full_gym') return true

  if (exerciseEquipment.length === 0) return true  // sin requisitos → siempre ok

  // Construir conjunto de términos disponibles para este usuario
  const available = new Set<string>()

  // 1. Términos de peso corporal (siempre disponibles)
  BODYWEIGHT_TERMS.forEach(t => available.add(t))

  // 2. Términos que mapean al equipamiento del usuario
  for (const userEq of userEquipment) {
    const mapped = EQUIPMENT_MAP[userEq] ?? [userEq.toLowerCase()]
    mapped.forEach(t => available.add(t.toLowerCase()))
  }

  // El ejercicio es compatible si TODOS sus requisitos de equipo están cubiertos
  return exerciseEquipment.every(eq => {
    const eqLow = eq.toLowerCase()
    if (BODYWEIGHT_TERMS.has(eqLow)) return true
    // Comprobación por substring para cubrir variantes ("barbell" cubre "barbell curl")
    return Array.from(available).some(avail => eqLow.includes(avail) || avail.includes(eqLow))
  })
}

// ─── Lesiones / limitaciones ──────────────────────────────────────────────────

/**
 * Patrones de exclusión por lesión.
 * keywords: términos a buscar en el string de lesiones del usuario (case-insensitive)
 * excludePatterns: si el nombre del ejercicio contiene alguno, se excluye
 *
 * IMPORTANTE: esta es una red de seguridad de baja precisión.
 * El cribado estructurado del motor aplica restricciones adicionales.
 * El objetivo aquí es eliminar los casos más obvios y peligrosos.
 */
const INJURY_EXCLUSIONS: Array<{
  keywords: string[]
  excludePatterns: string[]
}> = [
  {
    keywords: ['rodilla', 'knee', 'menisco', 'ligamento cruzado', 'acl', 'pcl', 'rotula'],
    excludePatterns: ['squat', 'sentadilla', 'lunge', 'zancada', 'step up', 'leg press', 'leg extension', 'jump'],
  },
  {
    keywords: ['hombro', 'shoulder', 'rotador', 'manguito', 'impingement', 'supraspinatus'],
    excludePatterns: ['overhead press', 'press militar', 'shoulder press', 'lateral raise', 'front raise', 'upright row', 'arnold press', 'behind the neck'],
  },
  {
    keywords: ['lumbar', 'espalda baja', 'lower back', 'hernia discal', 'disco', 'l4', 'l5', 's1', 'ciática', 'sciatica'],
    excludePatterns: ['deadlift', 'peso muerto', 'good morning', 'hyperextension', 'back extension', 'jefferson'],
  },
  {
    keywords: ['codo', 'elbow', 'epicondilitis', 'epicóndilo', 'tendinitis lateral', 'tennis elbow', 'golfer'],
    excludePatterns: ['barbell curl', 'ez-bar curl', 'french press', 'skull crusher', 'tricep extension'],
  },
  {
    keywords: ['muñeca', 'wrist', 'carpo', 'carpal', 'tunel carpiano'],
    excludePatterns: ['wrist curl', 'wrist extension', 'push up', 'handstand'],
  },
  {
    keywords: ['cadera', 'hip', 'psoas', 'flexor cadera'],
    excludePatterns: ['hip flexor', 'leg raise', 'sit up', 'flutter kick'],
  },
  {
    keywords: ['cervical', 'cuello', 'neck'],
    excludePatterns: ['neck curl', 'shrug', 'behind the neck', 'overhead'],
  },
]

function exerciseConflictsWithInjuries(
  exerciseName: string,
  injuryText: string,
): boolean {
  if (!injuryText.trim()) return false

  const injuryLow = injuryText.toLowerCase()
  const nameLow   = exerciseName.toLowerCase()

  for (const rule of INJURY_EXCLUSIONS) {
    const injuryMatches = rule.keywords.some(kw => injuryLow.includes(kw))
    if (!injuryMatches) continue

    const exerciseMatches = rule.excludePatterns.some(p => nameLow.includes(p))
    if (exerciseMatches) return true  // conflicto detectado — excluir
  }

  return false
}

// ─── Tipos preferidos por objetivo ────────────────────────────────────────────

const GOAL_PREFERRED_TYPES: Record<string, string[]> = {
  build_muscle:      ['strength'],
  gain_strength:     ['strength'],
  lose_weight:       ['strength', 'cardio', 'hiit'],
  improve_endurance: ['cardio', 'hiit', 'strength'],
  stay_active:       ['strength', 'cardio', 'flexibility', 'balance', 'hiit'],
}

// ─── Tipo de fila de ejercicio desde la DB ────────────────────────────────────

interface ExerciseRow {
  id: string
  name: string
  muscle_groups: string[]
  equipment: string[]
  exercise_type: string | null
  difficulty: string | null
  is_compound: boolean
  movement_patterns: string[]
  cardio_modality: string | null
  impact_level: string | null
  joint_stress_tags: string[]
}

// ─── Cascade ──────────────────────────────────────────────────────────────────

interface CascadeContext {
  gymType:     string
  userEquip:   string[]
  injuries:    string
  fitnessLevel: string
  goalTypes:   string[]
  allRows:     ExerciseRow[]
}

function applyHardFilters(rows: ExerciseRow[], ctx: CascadeContext): ExerciseRow[] {
  return rows.filter(ex =>
    exerciseFitsEquipment(ex.equipment, ctx.gymType, ctx.userEquip) &&
    !exerciseConflictsWithInjuries(ex.name, ctx.injuries)
  )
}

function cascade(ctx: CascadeContext): ExerciseRow[] {
  const hard = applyHardFilters(ctx.allRows, ctx)

  // Nivel 1 — dificultad exacta + tipos preferidos
  const lvl1 = hard.filter(ex =>
    ex.difficulty === ctx.fitnessLevel &&
    (ex.exercise_type ? ctx.goalTypes.includes(ex.exercise_type) : false)
  )
  if (lvl1.length >= MIN_POOL) return lvl1

  // Nivel 2 — dificultad exacta (relaja tipo)
  const lvl2 = hard.filter(ex => ex.difficulty === ctx.fitnessLevel)
  if (lvl2.length >= MIN_POOL) return lvl2

  // Nivel 3 — sin filtro de dificultad (relaja dificultad)
  if (hard.length >= MIN_POOL) return hard

  // Nivel 4 — devolver todo lo que pase los filtros duros
  // (puede ser < MIN_POOL si el usuario tiene muy poco equipo)
  return hard
}

// ─── Función pública ──────────────────────────────────────────────────────────

/**
 * Construye el pool de ejercicios compatible con el perfil del usuario.
 *
 * @param user  Contexto completo del perfil del usuario
 * @returns     Array de ejercicios filtrados listos para incluir en el prompt
 */
export async function filterExercisesForUser(
  user: UserContext,
): Promise<FilteredExercise[]> {
  const supabase = await createClient()

  // Traer solo las columnas necesarias para filtrar y alimentar el motor.
  const result = await supabase
    .from('exercises')
    .select('id, name, muscle_groups, equipment, exercise_type, difficulty, is_compound, movement_patterns, cardio_modality, impact_level, joint_stress_tags')
    .eq('is_public', true) as unknown as {
      data: ExerciseRow[] | null
      error: { message: string } | null
    }

  if (result.error) throw new Error(`[filter] Error al cargar ejercicios: ${result.error.message}`)

  const allRows = result.data ?? []

  const goalTypes = GOAL_PREFERRED_TYPES[user.primary_goal] ?? ['strength']

  const ctx: CascadeContext = {
    gymType:      user.gym_type,
    userEquip:    user.available_equipment,
    injuries:     user.injuries,
    fitnessLevel: user.fitness_level,
    goalTypes,
    allRows,
  }

  const filtered = cascade(ctx)

  // Log del resultado de filtrado (útil para diagnóstico)
  console.log(
    `[filter] pool=${filtered.length}/${allRows.length} ` +
    `gym=${user.gym_type} level=${user.fitness_level} goal=${user.primary_goal} ` +
    `injuries=${user.injuries ? 'yes' : 'no'}`
  )

  // Convertir al tipo FilteredExercise (subconjunto de campos)
  return filtered.map(ex => ({
    id:             ex.id,
    name:           ex.name,
    muscle_groups:  ex.muscle_groups,
    equipment:      ex.equipment,
    exercise_type:  ex.exercise_type ?? 'strength',
    difficulty:     ex.difficulty,
    is_compound:    ex.is_compound,
    movement_patterns: ex.movement_patterns ?? [],
    cardio_modality: ex.cardio_modality,
    impact_level: ex.impact_level,
    joint_stress_tags: ex.joint_stress_tags ?? [],
  }))
}
