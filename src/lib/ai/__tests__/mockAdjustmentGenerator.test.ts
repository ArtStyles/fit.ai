import { describe, expect, it } from 'vitest'
import { mockAdjustmentSuggestion } from '../mock-adjustmentGenerator'
import type { AdjustmentContext } from '../adjustments'

const CONTEXT: AdjustmentContext = {
  workoutName: 'Push — Pecho',
  workoutFocus: 'Pecho · Tríceps',
  exercises: [
    { workoutExerciseId: 'we-1', name: 'Press Banca', sets: 3, reps: 8, targetRpe: 7 },
    { workoutExerciseId: 'we-2', name: 'Press Militar', sets: 3, reps: 10, targetRpe: 7 },
    { workoutExerciseId: 'we-3', name: 'Cable Fly', sets: 3, reps: 12, targetRpe: 8 },
    { workoutExerciseId: 'we-4', name: 'Lateral Raise', sets: 3, reps: 15, targetRpe: 8 },
    { workoutExerciseId: 'we-5', name: 'Tricep Pushdown', sets: 3, reps: 12, targetRpe: 8 },
  ],
}

describe('mockAdjustmentSuggestion() — cambios estructurados', () => {
  it('propone subir series y RPE en los primeros ejercicios al pedir más intensidad', async () => {
    const result = await mockAdjustmentSuggestion('Quiero aumentar la intensidad', CONTEXT)

    expect(result.changes).toEqual([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 4, targetRpe: 8 },
      { type: 'update_exercise', workoutExerciseId: 'we-2', sets: 4, targetRpe: 8 },
    ])
  }, 10_000)

  it('propone bajar series y RPE en todos los ejercicios al pedir algo más fácil', async () => {
    const result = await mockAdjustmentSuggestion('Dame una variante más fácil', CONTEXT)

    expect(result.changes).toHaveLength(CONTEXT.exercises.length)
    for (const change of result.changes) {
      expect(change).toMatchObject({ type: 'update_exercise', sets: 2 })
    }
  }, 10_000)

  it('propone quitar los últimos ejercicios al pedir una sesión más corta', async () => {
    const result = await mockAdjustmentSuggestion('Hazlo más corto, tengo poco tiempo', CONTEXT)

    expect(result.changes).toEqual([
      { type: 'remove_exercise', workoutExerciseId: 'we-4' },
      { type: 'remove_exercise', workoutExerciseId: 'we-5' },
    ])
  }, 10_000)

  it('no propone cambios automáticos ante una lesión', async () => {
    const result = await mockAdjustmentSuggestion('Me duele el hombro', CONTEXT)

    expect(result.changes).toEqual([])
  }, 10_000)
})
