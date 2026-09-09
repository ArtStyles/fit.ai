import { expect, it } from 'vitest'
import { filterExercisesForUser } from './filter'
import type { AppState } from '../types'
import type { UserContext } from '@/lib/ai/types'

it('never relaxes equipment constraints for home training, including the original Spanish catalog', async () => {
  const state = { tables: { exercises: [
    { id: 'body', name: 'Push up', muscle_groups: ['pectoral mayor'], equipment: ['peso corporal'], is_public: true, exercise_type: 'strength', difficulty: 'beginner', is_compound: true },
    { id: 'dumbbell', name: 'Curl', muscle_groups: ['bíceps braquial'], equipment: ['mancuernas'], is_public: true, exercise_type: 'strength', difficulty: 'beginner', is_compound: false },
    { id: 'machine', name: 'Leg press', muscle_groups: ['cuádriceps'], equipment: ['machine'], is_public: true, exercise_type: 'strength', difficulty: 'beginner', is_compound: true },
  ] } } as unknown as AppState
  const user = { fitness_level: 'beginner', primary_goal: 'build_muscle', gym_type: 'home_no_equipment', available_equipment: [], injuries: '' } as unknown as UserContext
  const body = await filterExercisesForUser(state, user)
  expect(body.map(row => row.id)).toEqual(['body'])
  expect(body[0].muscle_groups).toEqual(['chest'])
  expect((await filterExercisesForUser(state, { ...user, gym_type: 'home_basic', available_equipment: ['dumbbells'] })).map(row => row.id)).toEqual(['body', 'dumbbell'])
})
