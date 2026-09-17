import { afterEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, type AppState } from '../storage'
import { createFitnessImporter } from './data'
import { buildMuscleActivity } from '@/lib/muscles/activity'
import { isGuidedSessionLog } from '@/lib/workouts/occurrences'

const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
const owner = '11111111-1111-4111-8111-111111111111'
const exercise = '22222222-2222-4222-8222-222222222222'
const hevyHeader = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
const hevyRows = [
  'Push,2024-06-01 10:00,2024-06-01 11:00,,Bench Press,,,0,warmup,20,12,,,6',
  'Push,2024-06-01 10:00,2024-06-01 11:00,,Bench Press,,,1,normal,60,8,,,8',
]
async function setup() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver)
  const state: AppState = { version: 1, accountId: owner, remoteUserId: owner, email: '', revision: 0, lastSyncedRevision: 0, remoteRevision: null, tables: {
    profiles: [{ id: owner, timezone: 'America/Havana', language: 'es' }],
    exercises: [{ id: exercise, name: 'Bench Press', name_es: 'Press de banca', is_public: true, muscle_groups: ['chest', 'triceps'], muscle_groups_es: ['pecho', 'tríceps'] }],
    progress_logs: [], exercise_logs: [], workout_plans: [], workouts: [], workout_exercises: [], measurements: [],
  } }
  await store.create(state)
  return { store, importer: createFitnessImporter(store) }
}

describe('CSV parser through SQLite and training evidence', () => {
  it('imports real-shaped Hevy rows into progress and muscle totals, then omits a reordered export', async () => {
    const { store, importer } = await setup()
    const preview = await importer.prepare([hevyHeader, ...hevyRows].join('\n'))
    expect(await importer.commit(preview.token, {})).toMatchObject({ imported: 1 })
    const state = (await store.read())!; const parent = state.tables.progress_logs[0]
    expect(isGuidedSessionLog(parent as { workout_id: null })).toBe(false)
    const totals = buildMuscleActivity(state.tables.exercise_logs.map(row => ({ sets: row.sets_completed, muscleGroups: parent.session_context_snapshot.exercises.find((item: { exerciseId: string }) => item.exerciseId === row.exercise_id).muscleGroups })))
    expect(totals.groups.find(row => row.id === 'chest')?.sets).toBe(2)
    expect(totals.groups.find(row => row.id === 'triceps')?.sets).toBe(2)
    expect(await importer.prepare([hevyHeader, ...[...hevyRows].reverse()].join('\n'))).toMatchObject({ duplicateCount: 1, newWorkoutCount: 0 })
    expect(await importer.prepare([hevyHeader, ...hevyRows.map(row => row.replace('Push,', 'Upper body,'))].join('\n'))).toMatchObject({ conflictCount: 1, newWorkoutCount: 0 })
  })
  it.each([
    { source: 'strong', csv: 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n2024-06-02 10:00,Push,30m,Bench Press,1,100,8,,,paused,good,7', options: { weightUnit: 'lb' as const }, weight: 45.359237 },
    { source: 'fitnotes', csv: 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment\n2024-06-03,Bench Press,Chest,50,kg,8,,,,good', options: {}, weight: 50 },
  ])('imports $source preserving source and converted weights', async ({ source, csv, options, weight }) => {
    const { store, importer } = await setup(); const preview = await importer.prepare(csv, options)
    await importer.commit(preview.token, {})
    expect((await store.read())!.tables.exercise_logs[0].weights_kg[0]).toBeCloseTo(weight, 5)
    expect((await store.read())!.tables.progress_logs[0].mobile_import.source).toBe(source)
  })
  it('a malformed trailing row makes the entire file fail before any write', async () => {
    const { store, importer } = await setup(); const before = await store.read()
    await expect(importer.prepare([hevyHeader, ...hevyRows, 'Push,garbage,garbage,,Bench Press,,,2,normal,60,8,,,8'].join('\n'))).rejects.toThrow(/Fila/)
    expect(await store.read()).toEqual(before)
  })
  it('keeps Strong rest timers as notes without adding sets or exercise time', async () => {
    const { store, importer } = await setup()
    const text = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes\n2024-06-02 10:00,Push,30m,Bench Press,1,50,8,,,\n2024-06-02 10:00,Push,30m,Bench Press,Rest Timer,,,,90,Rest between sets'
    const preview = await importer.prepare(text, { weightUnit: 'kg' })
    expect(preview.setCount).toBe(1)
    await importer.commit(preview.token, {})
    const row = (await store.read())!.tables.exercise_logs[0]
    expect(row).toMatchObject({ sets_completed: 1, duration_seconds: null })
    expect(row.notes).toContain('90')
  })
})
