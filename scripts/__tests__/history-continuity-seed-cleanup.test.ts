import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { requireE2EConfig, seedE2EAccount } from '../seed-e2e-account'
import { seedHistoryContinuityFixture } from '../../tests/e2e/helpers/core-product'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('../seed-e2e-account', () => ({
  requireE2EConfig: vi.fn(),
  seedE2EAccount: vi.fn(),
}))

type QueryCall = { table: string; method: string; args: unknown[] }

function mockSupabaseThatFailsWhileCreatingPlanAExercise() {
  const calls: QueryCall[] = []

  const from = vi.fn((table: string) => {
    let inserted = false
    let deleting = false
    const query = new Proxy({}, {
      get(_target, property) {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown) => resolve({
            data: table === 'exercises' ? {
              id: 'exercise-id',
              name: 'Squat',
              name_es: 'Sentadilla',
              muscle_groups: ['legs'],
              muscle_groups_es: ['piernas'],
              is_compound: true,
            } : null,
            error: table === 'workout_exercises' && inserted
              ? { message: 'forced Plan A exercise failure' }
              : table === 'progress_logs' && deleting
                ? { message: 'forced compensating cleanup failure' }
              : null,
          })
        }

        return (...args: unknown[]) => {
          calls.push({ table, method: String(property), args })
          if (property === 'insert') inserted = true
          if (property === 'delete') deleting = true
          return query
        }
      },
    })
    return query
  })

  return { from, rpc: vi.fn().mockResolvedValue({ data: 39, error: null }), calls }
}

describe('seedHistoryContinuityFixture', () => {
  it('cleans the pre-generated fixture IDs when a later write fails and preserves the original error', async () => {
    const supabase = mockSupabaseThatFailsWhileCreatingPlanAExercise()
    vi.mocked(createClient).mockReturnValue(supabase as never)
    vi.mocked(requireE2EConfig).mockReturnValue({
      supabaseUrl: 'https://e2e.example.test',
      projectRef: 'e2e-project',
      serviceRoleKey: 'service-role-key',
      runId: 'history-continuity',
      email: 'e2e@example.test',
      password: 'e2e-test-password',
    })
    vi.mocked(seedE2EAccount).mockResolvedValue('e2e-user-id')
    vi.stubEnv('E2E_HISTORY_CONTINUITY_ENABLED', 'true')

    await expect(seedHistoryContinuityFixture()).rejects.toThrow('Creating Plan A exercise failed: forced Plan A exercise failure')

    const deletedTables = supabase.calls
      .filter(call => call.method === 'delete')
      .map(call => call.table)

    expect(deletedTables).toContain('progress_logs')
    expect(deletedTables).toContain('workouts')
    expect(deletedTables).toContain('workout_plans')
  })
})
