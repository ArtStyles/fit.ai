import { describe, it, expect } from 'vitest'
import {
  mapDifficulty,
  mapExerciseType,
  mapEquipment,
  isCompound,
  joinInstructions,
  muscleGroups,
  imageUrlFromPath,
  toExerciseInsert,
  type FreeExercise,
} from '../freeExerciseDb'

describe('mapDifficulty', () => {
  it('maps levels, sending expert to advanced', () => {
    expect(mapDifficulty('beginner')).toBe('beginner')
    expect(mapDifficulty('intermediate')).toBe('intermediate')
    expect(mapDifficulty('expert')).toBe('advanced')
    expect(mapDifficulty('whatever')).toBeNull()
  })
})

describe('mapExerciseType', () => {
  it('maps categories to our types', () => {
    expect(mapExerciseType('strength')).toBe('strength')
    expect(mapExerciseType('powerlifting')).toBe('strength')
    expect(mapExerciseType('strongman')).toBe('strength')
    expect(mapExerciseType('olympic weightlifting')).toBe('strength')
    expect(mapExerciseType('stretching')).toBe('flexibility')
    expect(mapExerciseType('cardio')).toBe('cardio')
    expect(mapExerciseType('plyometrics')).toBe('hiit')
  })
})

describe('mapEquipment', () => {
  it('wraps a real equipment string into an array', () => {
    expect(mapEquipment('dumbbell')).toEqual(['dumbbell'])
  })
  it('treats body only / empty / null as no equipment', () => {
    expect(mapEquipment('body only')).toEqual([])
    expect(mapEquipment('')).toEqual([])
    expect(mapEquipment(null)).toEqual([])
  })
})

describe('isCompound', () => {
  it('is true only for compound mechanic', () => {
    expect(isCompound('compound')).toBe(true)
    expect(isCompound('isolation')).toBe(false)
    expect(isCompound(null)).toBe(false)
  })
})

describe('joinInstructions', () => {
  it('joins non-empty trimmed steps with newlines', () => {
    expect(joinInstructions(['Step 1', 'Step 2'])).toBe('Step 1\nStep 2')
    expect(joinInstructions(['  ', ' x '])).toBe('x')
    expect(joinInstructions([])).toBeNull()
  })
})

describe('muscleGroups', () => {
  it('merges primary + secondary, deduped and trimmed', () => {
    expect(muscleGroups(['biceps'], ['forearms', 'biceps'])).toEqual(['biceps', 'forearms'])
    expect(muscleGroups([], [])).toEqual([])
  })
})

describe('imageUrlFromPath', () => {
  it('builds the full raw GitHub URL', () => {
    expect(imageUrlFromPath('3_4_Sit-Up/0.jpg')).toBe(
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/3_4_Sit-Up/0.jpg',
    )
  })
})

describe('toExerciseInsert', () => {
  it('maps a full record to our insert shape (without image_url)', () => {
    const ex: FreeExercise = {
      id: '3_4_Sit-Up',
      name: '3/4 Sit-Up',
      force: 'pull',
      level: 'beginner',
      mechanic: 'compound',
      equipment: 'body only',
      primaryMuscles: ['abdominals'],
      secondaryMuscles: [],
      instructions: ['Lie down.', 'Sit up.'],
      category: 'strength',
      images: ['3_4_Sit-Up/0.jpg', '3_4_Sit-Up/1.jpg'],
    }
    expect(toExerciseInsert(ex)).toEqual({
      name: '3/4 Sit-Up',
      description: null,
      muscle_groups: ['abdominals'],
      equipment: [],
      difficulty: 'beginner',
      exercise_type: 'strength',
      is_compound: true,
      instructions: 'Lie down.\nSit up.',
      is_public: true,
      source: 'free-exercise-db',
      external_id: '3_4_Sit-Up',
    })
  })
})
