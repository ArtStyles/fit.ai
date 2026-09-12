import { describe, expect, it } from 'vitest'
import type { AppState } from '../types'
import { projectLocalFitnessCard } from './projection'

describe('projectLocalFitnessCard', () => {
  it('projects only the active account with its language and timezone', () => {
    const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const exercise = '11111111-1111-4111-8111-111111111111'
    const state: AppState = {
      version: 1, accountId: owner, remoteUserId: null, email: '', revision: 1, remoteRevision: null, lastSyncedRevision: 0,
      tables: {
        profiles: [{ id: owner, language: 'en', timezone: 'America/Havana' }],
        exercises: [{ id: exercise, name: 'Push-up', name_es: 'Flexión', muscle_groups: ['chest'], muscle_groups_es: ['pecho'] }],
        progress_logs: [{ id: 'session', user_id: owner, completed_at: '2026-09-12T15:00:00.000Z' }],
        exercise_logs: [{ id: 'row', progress_log_id: 'session', exercise_id: exercise, sets_completed: 1, weights_kg: [0], reps_completed: [20] }],
      },
    }

    const result = projectLocalFitnessCard(state, new Date('2026-09-12T16:00:00.000Z'))

    expect(result.records[0]).toMatchObject({ name: 'Push-up', weightKg: 0, reps: 20 })
    expect(result.rangeTo).toBe('2026-09-12')
  })
})
