import { describe, expect, it } from 'vitest'
import {
  exerciseLanguage,
  localizeEquipment,
  localizeExercise,
  localizeMuscleGroup,
} from '../localization'

const exercise = {
  name: 'Barbell Squat',
  description: 'English description',
  instructions: 'English instructions',
  muscle_groups: ['quadriceps'],
  equipment: ['barbell'],
  name_es: 'Sentadilla con barra',
  description_es: 'Descripción en español',
  instructions_es: 'Instrucciones en español',
  muscle_groups_es: ['cuádriceps'],
  equipment_es: ['barra'],
}

describe('exercise localization', () => {
  it('defaults invalid and empty preferences to Spanish', () => {
    expect(exerciseLanguage(null)).toBe('es')
    expect(exerciseLanguage('fr')).toBe('es')
    expect(exerciseLanguage('en')).toBe('en')
  })

  it('uses all Spanish fields when available', () => {
    const localized = localizeExercise(exercise, 'es')
    expect(localized.name).toBe('Sentadilla con barra')
    expect(localized.instructions).toBe('Instrucciones en español')
    expect(localized.muscle_groups).toEqual(['cuádriceps'])
    expect(localized.equipment).toEqual(['barra'])
  })

  it('falls back field by field and leaves English untouched', () => {
    const partial = { ...exercise, name_es: null, equipment_es: [] }
    expect(localizeExercise(partial, 'es').name).toBe('Barbell Squat')
    expect(localizeExercise(partial, 'es').equipment).toEqual(['barbell'])
    expect(localizeExercise(exercise, 'en')).toBe(exercise)
  })

  it('uses stable Spanish taxonomy labels without changing filter values', () => {
    expect(localizeMuscleGroup('quadriceps', 'es')).toBe('cuádriceps')
    expect(localizeEquipment('barbell', 'es')).toBe('barra')
    expect(localizeEquipment('barbell', 'en')).toBe('barbell')
  })
})
