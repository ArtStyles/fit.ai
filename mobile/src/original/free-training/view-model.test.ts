import { describe, expect, it } from 'vitest'
import { addExercise, formFromInput, inputFromForm, restoreDraft, reusePrevious, localizeSaveError } from './view-model'
import type { FreeTrainingInput, FreeTrainingCatalogItem } from './types'
const initial: FreeTrainingInput = { accountId: 'a', sessionId: 's', operationId: 'o', expectedVersion: null, date: '2026-09-11', name: '', durationMinutes: null, notes: '', detailLevel: 'attendance', exercises: [] }
const exercise: FreeTrainingCatalogItem = { id: 'e', name: 'Press', muscleGroups: [], timed: false, previous: [{ weightKg: 30, reps: 8 }], previousDate: '2026-09-10' }
describe('free training form evidence and recovery', () => {
  it('offers English recovery for action conflicts and account changes while retaining Spanish details', () => {
    const account = 'La cuenta cambió. Vuelve a abrir esta pantalla.'
    const conflict = 'Este registro cambió desde que lo abriste. Vuelve a abrirlo antes de editar.'
    expect(localizeSaveError(account, 'en')).toMatch(/original account/i)
    expect(localizeSaveError(conflict, 'en')).toMatch(/fields are preserved.*reopen/i)
    expect(localizeSaveError(conflict, 'es')).toBe(conflict)
    expect(localizeSaveError('No se encontró el entrenamiento.', 'en')).toMatch(/could not be found/i)
    expect(localizeSaveError('El ejercicio no está disponible en el catálogo público.', 'en')).toMatch(/choose another exercise/i)
    expect(localizeSaveError('SQLITE_FULL', 'en')).toMatch(/device.*try again/i)
    expect(localizeSaveError('unknown', 'en')).toBe('Could not save. Your fields are preserved; reopen this entry or try again.')
  })
  it('adding an exercise never counts its reference sets and requires performed reps', () => {
    const form = addExercise(formFromInput(initial), exercise)
    expect(form.exercises[0].sets).toEqual([{ weightKg: '', reps: '', durationSeconds: '' }])
    expect(() => inputFromForm(form, initial, '2026-09-11')).toThrow()
  })
  it('copies reference sets only after explicit reuse and defaults to partial detail', () => {
    const form = reusePrevious(addExercise(formFromInput(initial), exercise), exercise)
    expect(inputFromForm(form, initial, '2026-09-11')).toMatchObject({ detailLevel: 'partial', exercises: [{ exerciseId: 'e', sets: [{ weightKg: 30, reps: 8 }] }] })
    form.exercises[0].sets[0].reps = '9'
    expect(exercise.previous?.[0].reps).toBe(8)
  })
  it('keeps attendance without fabricated duration or exercise evidence', () => {
    expect(inputFromForm(formFromInput(initial), initial, '2026-09-11')).toMatchObject({ durationMinutes: null, detailLevel: 'attendance', exercises: [] })
  })
  it('round-trips unfinished raw fields only for the same account/session/version', () => {
    const form = addExercise(formFromInput(initial), exercise)
    form.exercises[0].sets[0].weightKg = '12.'
    const draft = { ...initial, uiDraft: form }
    expect(restoreDraft(initial, draft).exercises[0].sets[0].weightKg).toBe('12.')
    expect(restoreDraft(initial, { ...draft, accountId: 'other' }).exercises).toEqual([])
    expect(restoreDraft(initial, { ...draft, expectedVersion: 3 }).exercises).toEqual([])
  })
  it('keeps the saved weekly goal visible when a recovered draft had no goal selected', () => {
    const known = { ...initial, weeklyGoal: 3 }
    const recovered = restoreDraft(known, { ...initial, uiDraft: formFromInput(initial) })
    expect(recovered.weeklyGoal).toBe('3')
    expect(inputFromForm(recovered, known, initial.date).weeklyGoal).toBe(3)
    recovered.weeklyGoal = '5'
    expect(inputFromForm(recovered, known, initial.date).weeklyGoal).toBe(5)
  })
  it('accepts timed evidence without inventing reps and rejects impossible civil dates', () => {
    const timed = { ...exercise, timed: true, previous: [{ weightKg: 0, reps: 0, durationSeconds: 45 }] }
    const form = reusePrevious(addExercise(formFromInput(initial), timed), timed)
    expect(inputFromForm(form, initial, '2026-09-11').exercises[0].sets[0]).toEqual({ weightKg: 0, reps: 0, durationSeconds: 45 })
    form.date = '2026-02-30'
    expect(() => inputFromForm(form, initial, '2026-09-11')).toThrow()
  })
  it('retains historical timed sets when the exercise no longer has a catalog entry', () => {
    const old = { ...initial, expectedVersion: 2, detailLevel: 'partial' as const, exercises: [{ exerciseId: 'archived', sets: [{ weightKg: 0, reps: 0, durationSeconds: 90 }] }] }
    const form = formFromInput(old)
    expect(form.exercises[0].timed).toBe(true)
    expect(inputFromForm(form, old, initial.date).exercises).toEqual(old.exercises)
  })
  it('matches the session limits and accepts comma decimals without accepting fractional reps', () => {
    const form = reusePrevious(addExercise(formFromInput(initial), exercise), exercise)
    form.exercises[0].sets[0].weightKg = '12,5'
    expect(inputFromForm(form, initial, initial.date).exercises[0].sets[0].weightKg).toBe(12.5)
    form.exercises[0].sets[0].weightKg = '501'
    expect(() => inputFromForm(form, initial, initial.date)).toThrow()
    form.exercises[0].sets[0].weightKg = ''
    form.exercises[0].sets[0].reps = '101'
    expect(() => inputFromForm(form, initial, initial.date)).toThrow()
    form.exercises[0].sets[0].reps = '5.5'
    expect(() => inputFromForm(form, initial, initial.date)).toThrow()
  })
  it('rejects oversized or fractional duration without turning missing duration into zero', () => {
    const form = formFromInput(initial)
    for (const duration of ['721', '1.5', '0', 'abc']) {
      form.durationMinutes = duration
      expect(() => inputFromForm(form, initial, initial.date)).toThrow()
    }
    form.durationMinutes = ''
    expect(inputFromForm(form, initial, initial.date).durationMinutes).toBeNull()
  })
})
