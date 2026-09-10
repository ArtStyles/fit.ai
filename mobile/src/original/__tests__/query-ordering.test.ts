import { afterEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppClient } from '../query'
import { createAppStore } from '../storage'
import type { AppState } from '../types'

const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })

function historyState(accountId = 'account-a'): AppState {
  return {
    version: 1, accountId, remoteUserId: null, email: '', revision: 0,
    remoteRevision: null, lastSyncedRevision: 0,
    tables: {
      profiles: [{ id: accountId }],
      workout_plans: [{ id: 'plan-1', user_id: accountId }],
      workouts: [
        { id: 'workout-2', user_id: accountId, plan_id: 'plan-1', day_of_week: 5 },
        { id: 'workout-1', user_id: accountId, plan_id: 'plan-1', day_of_week: 3 },
      ],
      workout_exercises: [
        { id: 'we-2', workout_id: 'workout-1', exercise_id: 'exercise-1', order_index: 2 },
        { id: 'we-1', workout_id: 'workout-1', exercise_id: 'exercise-1', order_index: 1 },
      ],
      exercises: [{ id: 'exercise-1', is_public: true, name: 'Sentadilla' }],
      progress_logs: [
        { id: 'log-2', user_id: accountId, workout_id: 'workout-1', completed_at: '2026-09-09T12:00:00.000Z' },
        { id: 'log-1', user_id: accountId, workout_id: 'workout-1', completed_at: '2026-09-08T12:00:00.000Z' },
        { id: 'log-current', user_id: accountId, workout_id: 'workout-1', completed_at: '2026-09-10T12:00:00.000Z' },
      ],
      exercise_logs: [
        { id: 'el-1', progress_log_id: 'log-1', exercise_id: 'exercise-1', sets_completed: 2, weights_kg: [20, 20], reps_completed: [10, 10], rpe_values: [7, 8] },
        { id: 'el-2', progress_log_id: 'log-2', exercise_id: 'exercise-1', sets_completed: 3, weights_kg: [25, 25, 25], reps_completed: [10, 10, 8], rpe_values: [7, 8, 9] },
        { id: 'el-null', progress_log_id: 'log-2', exercise_id: 'exercise-1', sets_completed: null },
        { id: 'el-3', progress_log_id: 'log-2', exercise_id: 'exercise-1', sets_completed: 3 },
        { id: 'el-current', progress_log_id: 'log-current', exercise_id: 'exercise-1', sets_completed: 4 },
      ],
    },
  }
}

async function fixture() {
  const driver = new NodeSqliteDriver(':memory:')
  drivers.push(driver)
  const store = await createAppStore(driver)
  await store.create(historyState())
  return { store, client: createAppClient(store) }
}

describe('original application embedded ordering', () => {
  it('loads previous exercise evidence for a completed session without changing the to-one relationship or root order', async () => {
    const { client } = await fixture()
    const result = await client.from('exercise_logs')
      .select('exercise_id, weights_kg, reps_completed, rpe_values, progress_logs!inner(user_id, completed_at)')
      .in('exercise_id', ['exercise-1'])
      .eq('progress_logs.user_id', 'account-a')
      .lt('progress_logs.completed_at', '2026-09-10T12:00:00.000Z')
      .order('id')
      .order('completed_at', { referencedTable: 'progress_logs', ascending: false })

    expect(result.error).toBeNull()
    expect(result.data?.map(row => row.id)).toEqual(['el-1', 'el-2', 'el-3', 'el-null'])
    expect(result.data?.[0]).toMatchObject({ weights_kg: [20, 20], progress_logs: { completed_at: '2026-09-08T12:00:00.000Z' } })
    expect(result.data?.[1].progress_logs).toMatchObject({ completed_at: '2026-09-09T12:00:00.000Z' })
  })

  it('sorts each embedded array with chained keys and explicit null ordering, independently of root pagination', async () => {
    const { store, client } = await fixture()
    const before = await store.read()
    const result = await client.from('progress_logs')
      .select('id, entries:exercise_logs(id, sets_completed)', { count: 'exact' })
      .order('sets_completed', { referencedTable: 'entries', ascending: false, nullsFirst: false })
      .order('id', { foreignTable: 'entries', ascending: false })
      .order('id')
      .range(1, 1)

    expect(result.error).toBeNull()
    expect(result.count).toBe(3)
    expect(result.data?.map(row => row.id)).toEqual(['log-2'])
    expect(result.data?.[0].entries.map((row: { id: string }) => row.id)).toEqual(['el-3', 'el-2', 'el-null'])
    expect(await store.read()).toEqual(before)
    const nullsFirst = await client.from('progress_logs').select('entries:exercise_logs(id, sets_completed)')
      .eq('id', 'log-2').order('sets_completed', { referencedTable: 'entries', nullsFirst: true }).single()
    expect(nullsFirst.data?.entries.map((row: { id: string }) => row.id)).toEqual(['el-null', 'el-2', 'el-3'])
  })

  it('orders a nested aliased collection within each parent and retains empty collections', async () => {
    const { client } = await fixture()
    const result = await client.from('workout_plans')
      .select('sessions:workouts(id, movements:workout_exercises(id, order_index))')
      .order('day_of_week', { referencedTable: 'sessions' })
      .order('order_index', { referencedTable: 'sessions.movements' })
      .single()

    expect(result.error).toBeNull()
    expect(result.data?.sessions.map((row: { id: string }) => row.id)).toEqual(['workout-1', 'workout-2'])
    expect(result.data?.sessions[0].movements.map((row: { id: string }) => row.id)).toEqual(['we-1', 'we-2'])
    expect(result.data?.sessions[1].movements).toEqual([])
  })

  it('rejects unselected and ambiguous embedded order paths even when the root query has no rows', async () => {
    const { client } = await fixture()
    await expect(client.from('progress_logs').select('id').eq('id', 'missing')
      .order('sets_completed', { referencedTable: 'exercise_logs' })).rejects.toThrow(/relationship.*exercise_logs/i)
    await expect(client.from('progress_logs').select('first:exercise_logs(id), second:exercise_logs(id)')
      .order('id', { referencedTable: 'exercise_logs' })).rejects.toThrow(/ambiguous.*exercise_logs/i)
  })

  it('keeps nested reads bound to the original account after another account becomes active', async () => {
    const { store, client } = await fixture()
    await client.from('profiles').select('*')
    const other = historyState('account-b')
    other.tables.exercise_logs[0].weights_kg = [99, 99]
    await store.create(other)
    const stale = await client.from('progress_logs').select('entries:exercise_logs(*)')
      .order('id', { referencedTable: 'entries' })
    expect(stale.data).toBeNull()
    expect(stale.error?.code).toBe('28000')
    const current = await createAppClient(store).from('progress_logs').select('entries:exercise_logs(*)')
      .eq('id', 'log-1').order('id', { referencedTable: 'entries' }).single()
    expect(current.data?.entries[0].weights_kg).toEqual([99, 99])
    await store.activate('account-a')
    const original = await createAppClient(store).from('progress_logs').select('entries:exercise_logs(*)')
      .eq('id', 'log-1').order('id', { referencedTable: 'entries' }).single()
    expect(original.data?.entries[0].weights_kg).toEqual([20, 20])
  })
})
