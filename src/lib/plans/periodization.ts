/**
 * periodization.ts
 *
 * Lógica pura de periodización del ciclo de planes semanales:
 *
 *  - getCyclePhase: ciclo de 4 semanas (build, build, intensify, deload)
 *    derivado de workout_plans.week_number.
 *  - buildWeeklySummary: resume el rendimiento de la semana anterior
 *    (adherencia, RPE promedio, ejercicios saltados con motivo) para
 *    alimentar la regeneración semanal del plan.
 *  - applyDeloadToPlan: transforma un plan generado en su versión de
 *    descarga (menos series, RPE tope 6) sin tocar la selección de
 *    ejercicios. La usa el generador mock; el generador real recibe la
 *    instrucción vía prompt.
 */

import type { AIPlan } from '@/lib/ai/types'

export const CYCLE_LENGTH_WEEKS = 4

export type CyclePhase = 'build' | 'intensify' | 'deload'

const DELOAD_VOLUME_RATIO = 0.6
const DELOAD_MAX_RPE = 6

export function getCyclePhase(weekNumber: number): CyclePhase {
  const position = ((Math.max(1, weekNumber) - 1) % CYCLE_LENGTH_WEEKS) + 1

  if (position === CYCLE_LENGTH_WEEKS) return 'deload'
  if (position === CYCLE_LENGTH_WEEKS - 1) return 'intensify'
  return 'build'
}

// ─── Resumen semanal ──────────────────────────────────────────────────────────

export interface WeeklySummary {
  scheduledSessions: number
  completedSessions: number
  /** 0..1 — sesiones completadas / programadas. */
  adherenceRatio: number
  avgRpe: number | null
  skippedExercises: { name: string; count: number; lastReason: string | null }[]
}

export interface WeeklyExerciseRow {
  exerciseName: string | null
  rpeValues: (number | null)[] | null
  note: string | null
}

/** Extrae el motivo de una nota "Saltado: <motivo>." generada por saveSession. */
function parseSkipReason(note: string | null): string | null {
  if (!note) return null
  const match = note.match(/^Saltado:\s*(.+?)\.?$/)
  return match ? match[1] : null
}

export function buildWeeklySummary(params: {
  scheduledSessions: number
  completedSessions: number
  exerciseRows: WeeklyExerciseRow[]
}): WeeklySummary {
  const { scheduledSessions, completedSessions, exerciseRows } = params

  const rpeValues = exerciseRows
    .flatMap(row => row.rpeValues ?? [])
    .filter((rpe): rpe is number => typeof rpe === 'number' && rpe >= 1 && rpe <= 10)

  const avgRpe = rpeValues.length > 0
    ? Math.round((rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length) * 10) / 10
    : null

  const skippedByName = new Map<string, { count: number; lastReason: string | null }>()
  for (const row of exerciseRows) {
    const reason = parseSkipReason(row.note)
    if (reason === null || !row.exerciseName) continue

    const entry = skippedByName.get(row.exerciseName) ?? { count: 0, lastReason: null }
    entry.count += 1
    entry.lastReason = reason
    skippedByName.set(row.exerciseName, entry)
  }

  return {
    scheduledSessions,
    completedSessions,
    adherenceRatio: scheduledSessions > 0 ? completedSessions / scheduledSessions : 0,
    avgRpe,
    skippedExercises: Array.from(skippedByName.entries()).map(([name, entry]) => ({
      name,
      count: entry.count,
      lastReason: entry.lastReason,
    })),
  }
}

export function describeWeeklySummary(summary: WeeklySummary): string {
  const lines = [
    `Adherencia: ${summary.completedSessions}/${summary.scheduledSessions} sesiones completadas` +
      ` (${Math.round(summary.adherenceRatio * 100)}%).`,
  ]

  if (summary.avgRpe !== null) {
    lines.push(`RPE promedio de la semana: ${summary.avgRpe}.`)
  }

  if (summary.skippedExercises.length > 0) {
    const skips = summary.skippedExercises
      .map(skip =>
        `${skip.name} (${skip.count} ${skip.count === 1 ? 'vez' : 'veces'}` +
        (skip.lastReason ? `; último motivo: "${skip.lastReason}"` : '') + ')',
      )
      .join(', ')
    lines.push(`Ejercicios saltados: ${skips}.`)
  }

  return lines.join(' ')
}

export function describeCyclePhase(phase: CyclePhase, weekNumber: number): string {
  if (phase === 'deload') {
    return (
      `Semana ${weekNumber}: SEMANA DE DESCARGA. Reduce el volumen ~40% ` +
      `(menos series por ejercicio) y deja el RPE objetivo en ${DELOAD_MAX_RPE} o menos. ` +
      `Mantén los mismos patrones de movimiento para no perder técnica.`
    )
  }

  if (phase === 'intensify') {
    return (
      `Semana ${weekNumber}: fase de intensificación. Mantén o reduce ligeramente el ` +
      `volumen y sube la intensidad (RPE objetivo +1 respecto a la fase de construcción).`
    )
  }

  return (
    `Semana ${weekNumber}: fase de construcción. Volumen y progresión de cargas normales ` +
    `según el nivel del usuario.`
  )
}

// ─── Contexto semanal para el generador de planes ─────────────────────────────

export interface WeekContext {
  weekNumber: number
  cyclePhase: CyclePhase
  previousWeek: WeeklySummary | null
}

// ─── Transformación de deload (generador mock) ────────────────────────────────

export function applyDeloadToPlan(plan: AIPlan): AIPlan {
  return {
    ...plan,
    days: plan.days.map(day => ({
      ...day,
      exercises: day.exercises.map(exercise => ({
        ...exercise,
        sets: Math.max(1, Math.ceil(exercise.sets * DELOAD_VOLUME_RATIO)),
        target_rpe: Math.min(exercise.target_rpe, DELOAD_MAX_RPE),
      })),
    })),
  }
}
