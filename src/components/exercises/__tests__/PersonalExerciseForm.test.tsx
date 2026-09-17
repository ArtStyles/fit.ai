import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PersonalExerciseFormView, formatPersonalExerciseError, type PersonalExerciseDraft } from '../PersonalExerciseForm'

const draft: PersonalExerciseDraft = { name: '', description: '', recording: 'reps', muscleGroups: [], illustration: null }
const handlers = { onChange() {}, onSubmit() {}, onCancel() {} }

describe('personal exercise form', () => {
  it('requires a name but allows no muscles or illustration', () => {
    const html = renderToStaticMarkup(<PersonalExerciseFormView {...handlers} draft={draft} ready />)
    expect(html).toContain('Nombre')
    expect(html.match(/<input[^>]*name="name"[^>]*>/)?.[0]).toContain('required=""')
    expect(html).toContain('Descripción')
    expect(html).toContain('Músculos')
    expect(html).toContain('Ancóneo')
    expect(html).toContain('Manguito rotador')
    expect(html).toContain('Sin imagen')
    expect(html).toContain('Elegir ilustración')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('role="dialog"')
  })

  it('localizes labels and keeps a failed draft visible for correction', () => {
    const html = renderToStaticMarkup(<PersonalExerciseFormView {...handlers} language="en" draft={{ ...draft, name: 'Wall hold', recording: 'time', muscleGroups: ['quads'] }} ready error="Could not save" />)
    expect(html).toContain('Wall hold')
    expect(html).toContain('Description')
    expect(html).toContain('Repetitions')
    expect(html).toContain('Time')
    expect(html).toContain('Only you')
    expect(html).toContain('Quadriceps')
    expect(html).toContain('No image')
    expect(html).toContain('Create exercise')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Could not save')
  })

  it('disables mutation and cancellation controls while creation is pending', () => {
    const html = renderToStaticMarkup(<PersonalExerciseFormView {...handlers} draft={{ ...draft, name: 'Hold' }} ready busy />)
    expect(html).toContain('Guardando')
    expect(html).toContain('aria-busy="true"')
    expect(html).toMatch(/<fieldset[^>]*disabled=""/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Volver/)
  })

  it('does not display an illustration for an unselected muscle', () => {
    const html = renderToStaticMarkup(<PersonalExerciseFormView {...handlers} draft={{ ...draft, name: 'Hold', muscleGroups: ['quads'], illustration: 'chest' }} ready />)
    expect(html).toContain('Sin imagen')
    expect(html).not.toContain('/exercises/personal/chest.svg')
  })

  it('shows the selected muscle illustration without making it required', () => {
    const html = renderToStaticMarkup(<PersonalExerciseFormView {...handlers} draft={{ ...draft, name: 'Hold', muscleGroups: ['quads'], illustration: 'quads' }} ready />)
    expect(html).toContain('/exercises/personal/quads.svg')
    expect(html).toContain('Quitar')
    expect(html).toContain('no demostraciones de la técnica')
  })

  it('localizes actionable service errors instead of exposing Spanish text in English', () => {
    const cause = Object.assign(new Error('La cuenta cambió.'), { code: 'account-changed' })
    expect(formatPersonalExerciseError(cause, 'en')).toContain('account changed')
    expect(formatPersonalExerciseError(cause, 'en')).not.toContain('cuenta')
    expect(formatPersonalExerciseError(new Error('SQL failure'), 'en')).toContain('Try again')
  })
})
