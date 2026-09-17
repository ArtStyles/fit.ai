import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PlanWorkoutExerciseRow } from '../WorkoutExerciseList'

vi.mock('@/app/actions/plan', () => ({ reorderWorkoutExercises() {}, removeWorkoutExercise() {}, replaceWorkoutExercise() {}, updateWorkoutExercise() {} }))
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ language: 'en', t: (source: string) => source }), useOptionalI18n: () => null }))
import { WorkoutExercisePrescriptionFields, formatExerciseDetail } from '../WorkoutExerciseManager'

const row: PlanWorkoutExerciseRow = {
  id: 'row', workout_id: 'workout', order_index: 1, sets: 3, reps: null, rest_seconds: 60, weight_kg: null,
  notes: null, target_rpe: 7, weight_suggestion_basis: null, duration_seconds: 30,
  exercise: { id: 'exercise', name: 'Hold', muscle_groups: [], equipment: [], difficulty: null, exercise_type: 'flexibility', is_compound: false },
}

describe('personal timed exercise prescription', () => {
  it('edits seconds for a timed exercise without manufacturing reps or load', () => {
    const html = renderToStaticMarkup(<WorkoutExercisePrescriptionFields row={row} />)
    expect(html).toContain('Seconds per set')
    expect(html.match(/<input[^>]*name="durationSeconds"[^>]*>/)?.[0]).toContain('value="30"')
    expect(html).not.toContain('name="reps"')
    expect(html).not.toContain('name="weightKg"')
  })
  it('keeps normal strength prescription controls intact', () => {
    const html = renderToStaticMarkup(<WorkoutExercisePrescriptionFields row={{ ...row, duration_seconds: null, reps: 8, weight_kg: 40, exercise: { ...row.exercise as NonNullable<Exclude<PlanWorkoutExerciseRow['exercise'], unknown[]>>, exercise_type: 'strength' } }} />)
    expect(html).toContain('name="reps"')
    expect(html).toContain('name="weightKg"')
    expect(html).not.toContain('name="durationSeconds"')
  })
  it('summarizes prescribed seconds instead of repetitions or invented weight', () => {
    expect(formatExerciseDetail(row, text => text)).toBe('3 × 30 s · RPE 7 · 60s descanso')
  })
})
