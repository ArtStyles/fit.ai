import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState } from '../storage'
import { addWorkoutExercise, removeWorkoutExercise, replaceWorkoutExercise, updateWorkoutExercise } from './plan'
const route = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('../router', () => route)
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { vi.restoreAllMocks(); setAppStoreForTests(null); route.navigate.mockReset(); for (const driver of drivers.splice(0)) await driver.close() })
async function setup(options: { locked?: boolean; foreign?: boolean; timed?: boolean } = {}) {
  const state: AppState = { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: id(1) }], workout_plans: [{ id: id(2), user_id: id(1), library_slot: 'personal', prescription_locked: options.locked === true }],
    workouts: [{ id: id(3), plan_id: id(2), user_id: id(1) }], workout_exercises: [{ id: id(4), workout_id: id(3), exercise_id: id(5), order_index: 1, reps: 8, weight_kg: 20 }],
    exercises: [{ id: id(5), is_public: true, name: 'Public' }, { id: id(6), is_public: false, user_id: options.foreign ? id(99) : id(1), source: 'mobile-personal', name: 'Personal', exercise_type: options.timed ? 'flexibility' : 'strength' }],
  } }
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver); const store = await createAppStore(driver); await store.create(state); setAppStoreForTests(store); return store
}
function form() { const data = new FormData(); Object.entries({ planId: id(2), workoutId: id(3), workoutExerciseId: id(4), exerciseId: id(6), exerciseIds: id(6) }).forEach(([key, value]) => data.set(key, value)); return data }
describe('personal plan exercises', () => {
  it('adds and replaces own private exercises without changing existing row identity', async () => {
    const store = await setup(); await addWorkoutExercise(form()); await replaceWorkoutExercise(form())
    expect((await store.read())!.tables.workout_exercises).toHaveLength(2)
    expect((await store.read())!.tables.workout_exercises[0]).toMatchObject({ id: id(4), exercise_id: id(6), weight_kg: null })
  })
  it.each([{ foreign: true }, { locked: true }])('rejects inaccessible exercises and locked prescriptions: %j', async options => {
    const store = await setup(options); const before = await store.read()
    await expect(addWorkoutExercise(form())).rejects.toThrow(options.locked ? 'plan_locked' : 'missing_fields')
    await expect(replaceWorkoutExercise(form())).rejects.toThrow(options.locked ? 'plan_locked' : 'missing_fields')
    expect(await store.read()).toEqual(before)
    expect(route.navigate).not.toHaveBeenCalled()
  })
  it.each([addWorkoutExercise, replaceWorkoutExercise, updateWorkoutExercise, removeWorkoutExercise])('propagates persistence failures to the exercise manager without navigating or changing state', async action => {
    const store = await setup(); const before = await store.read()
    vi.spyOn(store, 'mutate').mockRejectedValue(new Error('storage_unavailable'))
    await expect(action(form())).rejects.toThrow('storage_unavailable')
    expect(route.navigate).not.toHaveBeenCalled()
    expect(await store.read()).toEqual(before)
  })
  it('prescribes real seconds for a private timed exercise and retains them when editing', async () => {
    const store = await setup({ timed: true }); await addWorkoutExercise(form()); await replaceWorkoutExercise(form())
    for (const row of (await store.read())!.tables.workout_exercises) expect(row).toMatchObject({ duration_seconds: 30, reps: null, weight_kg: null })
    const edit = form(); edit.set('durationSeconds', '45'); edit.set('reps', '10'); edit.set('weightKg', '20'); await updateWorkoutExercise(edit)
    expect((await store.read())!.tables.workout_exercises[0]).toMatchObject({ duration_seconds: 45, reps: null, weight_kg: null })
    edit.delete('durationSeconds'); await updateWorkoutExercise(edit)
    expect((await store.read())!.tables.workout_exercises[0].duration_seconds).toBe(45)
    edit.set('exerciseId', id(5)); await replaceWorkoutExercise(edit)
    expect((await store.read())!.tables.workout_exercises[0]).toMatchObject({ exercise_id: id(5), duration_seconds: null, reps: 10, weight_kg: null })
  })
})
