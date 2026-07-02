/**
 * Tipos para la generación de planes de entrenamiento con IA.
 *
 * AIPlanResponse   — estructura exacta que devuelve Claude (JSON puro).
 * UserContext      — datos del perfil del usuario que se pasan al prompt.
 * FilteredExercise — ejercicio pre-filtrado disponible para el día.
 */

import type { WeightSuggestionBasis } from '@/types/database'

// ─── Respuesta de Claude ───────────────────────────────────────────────────────

export interface AIPlanResponse {
  plan: AIPlan
}

export interface AIPlan {
  /** Nombre del plan visible al usuario, en español. Ej: "Tu Plan de Fuerza" */
  display_name: string
  /** Mensaje personalizado del entrenador IA, en español. Máx ~400 chars / 4 frases. */
  ai_notes: string
  /** Días de entrenamiento, uno por día de la semana activo */
  days: AIPlanDay[]
}

export interface AIPlanDay {
  /** Número secuencial del día en el plan (1, 2, 3…). NO es el día de la semana. */
  day_number: number
  /** Nombre visible del entrenamiento. Máx 30 chars, sin prefijo "Día X". Ej: "Pull — Espalda y Bíceps" */
  display_name: string
  /** Grupos musculares del día, separados por ·. Ej: "Pecho · Hombros · Tríceps" */
  focus: string
  /** Lista de ejercicios del día, en orden de ejecución */
  exercises: AIExercise[]
}

export interface AIExercise {
  /** UUID del ejercicio de la tabla `exercises`. Tomado del pool filtrado. */
  exercise_id: string
  /** Número de series */
  sets: number
  /**
   * Número de repeticiones por serie.
   * null para ejercicios de tiempo (duration_seconds ≠ null).
   */
  reps: number | null
  /**
   * Duración en segundos (para cardio/flexibilidad/HIIT).
   * null para ejercicios de repeticiones.
   * Exactamente uno de reps/duration_seconds debe ser no-null.
   */
  duration_seconds: number | null
  /** Descanso en segundos entre series */
  rest_seconds: number
  /** RPE objetivo (Rate of Perceived Exertion): 1=muy fácil … 10=máximo esfuerzo */
  target_rpe: number
  /**
   * Peso sugerido en kg.
   * null si se desconoce o no aplica (bodyweight, principiante sin baseline).
   */
  weight_kg: number | null
  /** Cómo se calculó la sugerencia de peso */
  weight_suggestion_basis: WeightSuggestionBasis
  /**
   * Nota técnica para este ejercicio, en español.
   * null si no hay nada relevante. Máx 3 frases / 200 chars.
   */
  notes: string | null
}

// ─── Contexto del usuario (input al sistema de IA) ────────────────────────────

export interface UserContext {
  /** Nivel de experiencia */
  fitness_level: 'beginner' | 'intermediate' | 'advanced'
  /** Objetivo principal */
  primary_goal:
    | 'lose_weight'
    | 'build_muscle'
    | 'gain_strength'
    | 'improve_endurance'
    | 'stay_active'
  /** Días de entrenamiento por semana (2-6) */
  days_per_week: number
  /** Duración de sesión en minutos */
  session_duration_minutes: number
  /** Tipo de gimnasio/equipamiento */
  gym_type: 'home_no_equipment' | 'home_basic' | 'full_gym'
  /** Equipamiento disponible */
  available_equipment: string[]
  /** Lesiones o limitaciones (string libre, puede estar vacío) */
  injuries: string
  /** Sexo: 'male' | 'female' | 'other' */
  gender: string
  /** Peso corporal en kg (para estimación de pesos) */
  weight_kg: number | null
  /** Edad en años */
  age: number | null
}

// ─── Resultado unificado del generador de planes ──────────────────────────────

/**
 * Devuelto por generateInitialPlan() tanto en modo mock como en modo real.
 * El endpoint consume este tipo independientemente de si hay API key.
 */
export interface PlanGenerationResult {
  plan:             AIPlanResponse
  /** true cuando se generó con el mock local (sin API key) */
  isMock:           boolean
  /** Modelo usado. 'mock' cuando isMock=true */
  model:            string
  /** Número de intento en el que tuvo éxito (1-3 real, siempre 1 mock) */
  attempt:          number
  /** Costo estimado en USD. 0 cuando isMock=true */
  estimatedCostUsd: number
}

// ─── Ejercicio del pool filtrado (input al prompt) ────────────────────────────

export interface FilteredExercise {
  id: string
  name: string
  muscle_groups: string[]
  equipment: string[]
  exercise_type: string
  difficulty: string | null
  is_compound: boolean
  movement_patterns?: string[]
  cardio_modality?: string | null
  impact_level?: string | null
  joint_stress_tags?: string[]
}
