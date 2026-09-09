import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createOriginalGateway } from './sync'
import type { AppRow } from './types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function remoteFixture(failLaterMeasurements = false) {
  const tables: Record<string, AppRow[]> = {
    profiles: [{ id: owner, full_name: 'Ana', movement_limitations: [{ side: 'left' }] }],
    workout_plans: [{ id: 'plan', user_id: owner, prescription_locked: true, trainer_assignment_version_id: 'version' }],
    workouts: [{ id: 'workout', plan_id: 'plan', user_id: owner }],
    workout_exercises: Array.from({ length: 501 }, (_, n) => ({ id: `we-${String(n).padStart(4, '0')}`, workout_id: 'workout', exercise_id: 'private', target_rpe: 7, notes: 'Original' })),
    exercises: [{ id: 'public', is_public: true }, { id: 'private', is_public: false, instructions_es: ['No simplificar'] }],
    progress_logs: [{ id: 'log', user_id: owner, session_context_snapshot: { original: { value: 'retained' } } }],
    exercise_logs: [{ id: 'el', progress_log_id: 'log', exercise_id: 'private', original_exercise_id: 'public', rpe_values: [7, null], weights_kg: [20, 22], duration_seconds: [45, 42] }],
    measurements: Array.from({ length: 1001 }, (_, n) => ({ id: `m-${String(n).padStart(4, '0')}`, user_id: owner, weight_kg: null, body_fat_percentage: 21, muscle_mass_kg: 48, chest_cm: 90, waist_cm: 71, hips_cm: 98, arms_cm: 29, legs_cm: 52 })),
    trainer_profiles: [{ id: 'trainer', user_id: owner, status: 'active' }, { id: 'other', user_id: 'another', status: 'active' }],
  }
  const calls: Array<{ table: string; start: number }> = []
  class Query {
    filters: Array<(row: AppRow) => boolean> = []
    constructor(readonly table: string) {}
    select(columns: string) { expect(columns).toBe('*'); return this }
    eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this }
    in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this }
    order() { return this }
    async range(start: number, end: number) {
      calls.push({ table: this.table, start })
      if (failLaterMeasurements && this.table === 'measurements' && start === 500) return { data: null, error: { message: 'Interrupted page' } }
      return { data: (tables[this.table] ?? []).filter(row => this.filters.every(filter => filter(row))).slice(start, end + 1), error: null }
    }
  }
  return { tables, calls, client: { from: (table: string) => new Query(table) } as unknown as SupabaseClient }
}

describe('original Supabase download gateway', () => {
  it('paginates original tables and child rows while retaining private referenced exercises and all fields', async () => {
    const source = remoteFixture()
    const downloaded = await createOriginalGateway(source.client).downloadWeb(owner)
    expect(downloaded.tables.measurements).toEqual(source.tables.measurements)
    expect(downloaded.tables.workout_exercises).toEqual(source.tables.workout_exercises)
    expect(downloaded.tables.progress_logs).toEqual(source.tables.progress_logs)
    expect(downloaded.tables.exercise_logs).toEqual(source.tables.exercise_logs)
    expect(downloaded.tables.exercises).toEqual(source.tables.exercises)
    expect(downloaded.tables.trainer_profiles).toHaveLength(1)
    expect(source.calls.filter(call => call.table === 'measurements').map(call => call.start)).toEqual([0, 500, 1000])
    expect(source.calls.filter(call => call.table === 'workout_exercises').map(call => call.start)).toEqual([0, 500])
  })

  it('rejects a partial required download instead of replacing local history with its first page', async () => {
    const source = remoteFixture(true)
    await expect(createOriginalGateway(source.client).downloadWeb(owner)).rejects.toThrow('Interrupted page')
  })
})
