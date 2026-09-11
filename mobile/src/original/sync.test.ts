import { afterEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore } from './storage'
import { createOriginalSynchronizer, BackupUnavailableError, type OriginalCloudGateway, type CloudSnapshot } from './sync'
import type { AppRow, AppState, AppStore } from './types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function state(id = owner): AppState {
  return { version: 1, accountId: id, remoteUserId: id === owner ? owner : null, email: 'a@example.invalid', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id, full_name: 'Ana', language: 'es' }], workout_plans: [], workouts: [], workout_exercises: [], exercises: [], progress_logs: [], exercise_logs: [], measurements: [],
  } }
}
async function store() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  return createAppStore(driver)
}
function fixture(app: AppStore, catalog: AppRow[] = []) {
  let backup: CloudSnapshot | null = null
  let available = true
  let pushes = 0
  let afterPush: (() => Promise<void>) | null = null
  let loseResponse = false
  const web = state().tables
  const gateway: OriginalCloudGateway = {
    identity: async () => ({ id: owner, email: 'a@example.invalid' }),
    signIn: async () => {},
    readBackup: async () => { if (!available) throw new BackupUnavailableError(); return copy(backup) },
    downloadWeb: async () => ({ tables: copy(web), warnings: [] }),
    pushBackup: async (payload, expectedRevision) => {
      if (expectedRevision !== (backup?.revision ?? null)) throw new Error('ORIGINAL_SNAPSHOT_CONFLICT')
      pushes++; backup = { revision: `remote-${pushes}`, state: copy(payload) }
      await afterPush?.()
      if (loseResponse) { loseResponse = false; throw new Error('Lost response') }
      return backup.revision
    },
  }
  return { sync: createOriginalSynchronizer(app, gateway, async () => catalog), web,
    setBackup(value: CloudSnapshot) { backup = value }, setAvailable(value: boolean) { available = value },
    onPush(fn: () => Promise<void>) { afterPush = fn }, loseNextResponse() { loseResponse = true }, get pushes() { return pushes }, get backup() { return copy(backup) },
  }
}

describe('original app cloud boundaries', () => {
  it('retains an edited free log and its details through cloud backup restore and web refresh', async () => {
    const app = await store(); await app.create(state())
    const setup = fixture(app)
    const log = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_id: owner, client_session_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', workout_id: null,
      completed_at: '2026-09-10T12:00:00Z', updated_at: '2026-09-10T12:15:00Z', notes: 'Added the missing sets.', mobile_free_training: { version: 2, detailLevel: 'partial' },
      session_context_snapshot: { version: 1, workout: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Entrenamiento libre', focus: null, dayOfWeek: null }, plan: null, exercises: [] } }
    const detail = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', progress_log_id: log.id, exercise_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', sets_completed: 1, reps_completed: [8], weights_kg: [20] }
    await app.mutate(draft => { draft.tables.progress_logs.push(log); draft.tables.exercise_logs.push(detail) })
    await setup.sync.synchronize()
    expect(setup.backup!.state.tables.progress_logs).toEqual([log])
    expect(setup.web.progress_logs).toEqual([])
    expect(setup.web.exercise_logs).toEqual([])

    const restored = await store(); await restored.create(state())
    const second = fixture(restored); second.setBackup(setup.backup!)
    await second.sync.synchronize()
    await second.sync.synchronize()
    const recovered = (await restored.read())!
    expect(recovered.tables.progress_logs).toEqual([log])
    expect(recovered.tables.exercise_logs).toEqual([detail])
    expect(recovered.tables.workouts).toEqual([])
    expect(recovered.tables.workout_plans).toEqual([])
  })
  it('preserves local dated overrides when canonical web data refreshes', async () => {
    const app = await store(); const setup = fixture(app)
    setup.web.workout_plans.push({ id: 'plan', user_id: owner, is_active: true })
    setup.web.workouts.push({ id: 'workout', user_id: owner, plan_id: 'plan', name: 'A', day_of_week: 1 })
    const previous = state(); previous.tables = copy(setup.web)
    previous.tables.mobile_web_base = [{ id: 'canonical', tables: copy(setup.web) }]
    const override = { id: 'override', user_id: owner, plan_id: 'plan', workout_id: 'workout', source_date: '2026-09-14', target_date: '2026-09-15', policy_timezone: 'UTC', created_at: '2026-09-14T12:00:00Z', updated_at: '2026-09-14T12:00:00Z' }
    previous.tables.workout_schedule_overrides = [override]
    await app.create(previous)
    setup.web.workouts[0].name = 'Updated canonical name'
    await setup.sync.synchronize()
    const refreshed = (await app.read())!
    expect(refreshed.tables.workout_schedule_overrides).toEqual([override])
    expect(refreshed.tables.workouts[0]).toMatchObject({ name: 'Updated canonical name', day_of_week: 1 })
  })
  it('preserves private exercise goals when canonical web data refreshes', async () => {
    const app = await store(); const setup = fixture(app); setup.setAvailable(false)
    const previous = state(); previous.tables = copy(setup.web)
    previous.tables.mobile_web_base = [{ id: 'canonical', tables: copy(setup.web) }]
    const goal = { id: 'aaaaaaaa-1111-4111-8111-111111111111', user_id: owner, exercise_id: '11111111-1111-4111-8111-111111111111', exercise_name: 'Squat', exercise_name_es: 'Sentadilla', muscle_groups: [], muscle_groups_es: [], kind: 'strength', target: null, version: 1, created_at: '2026-09-11T12:00:00.000Z', updated_at: '2026-09-11T12:00:00.000Z' }
    previous.tables.mobile_exercise_goals = [goal]
    await app.create(previous)
    setup.web.profiles[0].language = 'en'
    await setup.sync.synchronize()
    expect((await app.read())?.tables.mobile_exercise_goals).toEqual([goal])
  })
  it('uses bundled media for exact catalog matches without changing downloaded exercise identities', async () => {
    const source = 'vekira-catalog-v1'
    const catalog = [
      { id: 'bundled-squat', source, external_id: 'squat', image_url: '/exercises/catalog/v1/squat/poster.webp', motion_preview_url: '/exercises/catalog/v1/squat/motion-preview.webp', is_public: true },
      { id: 'bundled-row', source, external_id: 'row', image_url: '/exercises/catalog/v1/row/poster.webp', motion_preview_url: null, is_public: true },
    ]
    const app = await store(); const setup = fixture(app, catalog); setup.setAvailable(false)
    const squat = { ...catalog[0], id: 'web-squat', image_url: 'https://cloud.invalid/squat.webp', motion_preview_url: 'https://cloud.invalid/squat-motion.webp' }
    const privateExercise = { ...squat, id: 'private', is_public: false, user_id: owner }
    const legacyExercise = { ...squat, id: 'legacy', source: 'legacy' }
    const unknownExercise = { ...squat, id: 'unknown', external_id: 'not-bundled' }
    setup.web.exercises.push(squat, privateExercise, legacyExercise, unknownExercise)
    setup.web.workouts.push({ id: 'workout', user_id: owner })
    setup.web.workout_exercises.push({ id: 'prescription', workout_id: 'workout', exercise_id: 'web-squat' })
    await setup.sync.prepareSignedInAccount()
    let active = (await app.read())!
    expect(active.tables.exercises.find(row => row.id === 'web-squat')).toMatchObject({
      id: 'web-squat', image_url: catalog[0].image_url, motion_preview_url: catalog[0].motion_preview_url,
      mobile_remote_image_url: squat.image_url, mobile_remote_motion_preview_url: squat.motion_preview_url,
    })
    expect(active.tables.exercises.find(row => row.id === 'bundled-squat')).toBeUndefined()
    expect(active.tables.workout_exercises[0].exercise_id).toBe('web-squat')
    for (const original of [privateExercise, legacyExercise, unknownExercise]) {
      expect(active.tables.exercises.find(row => row.id === original.id)).toEqual(original)
    }

    setup.web.exercises[0].image_url = 'https://cloud.invalid/squat-new-version.webp'
    setup.web.exercises.push({ ...catalog[1], id: 'new-assigned-row', image_url: 'https://cloud.invalid/row.webp' })
    setup.web.workout_exercises.push({ id: 'new-prescription', workout_id: 'workout', exercise_id: 'new-assigned-row' })
    await setup.sync.synchronize()
    active = (await app.read())!
    expect(active.tables.exercises.find(row => row.id === 'web-squat')).toMatchObject({
      image_url: catalog[0].image_url, mobile_remote_image_url: setup.web.exercises[0].image_url,
    })
    expect(active.tables.exercises.find(row => row.id === 'new-assigned-row')).toMatchObject({ image_url: catalog[1].image_url })
    expect(active.tables.workout_exercises[1].exercise_id).toBe('new-assigned-row')
    expect(active.tables.mobile_web_base[0].tables.exercises.find((row: AppRow) => row.id === 'web-squat').image_url).toBe(catalog[0].image_url)
    await setup.sync.synchronize()
    expect((await app.read())!.revision).toBe(active.revision)
  })

  it('repairs previously downloaded catalog media while retaining local exercise edits', async () => {
    const local = { id: 'local-row', source: 'vekira-catalog-v1', external_id: 'row', image_url: '/exercises/catalog/v1/row/poster.webp', is_public: true }
    const app = await store(); const setup = fixture(app, [local]); setup.setAvailable(false)
    setup.web.exercises.push({ ...local, id: 'web-row', name: 'Remote row', image_url: 'https://cloud.invalid/row.webp' })
    const previous = state(); previous.tables = copy(setup.web)
    previous.tables.mobile_web_base = [{ id: 'canonical', tables: copy(setup.web) }]
    previous.tables.exercises[0].name = 'My saved row'
    await app.create(previous)
    await setup.sync.synchronize()
    expect((await app.read())!.tables.exercises[0]).toMatchObject({ id: 'web-row', name: 'My saved row', image_url: local.image_url })
  })

  it('downloads complete rows without backup capability and preserves separate local accounts', async () => {
    const app = await store(); await app.create(state('local-profile'))
    const setup = fixture(app); setup.setAvailable(false)
    setup.web.measurements.push({ id: 'm1', user_id: owner, weight_kg: null, body_fat_percentage: 21, muscle_mass_kg: 48, chest_cm: 90, waist_cm: 71, hips_cm: 98, arms_cm: 29, legs_cm: 52 })
    setup.web.progress_logs.push({ id: 'l1', user_id: owner, session_context_snapshot: { plan: { custom: 'retained' } } })
    await setup.sync.prepareSignedInAccount()
    const active = await app.read()
    expect(active?.tables.measurements).toEqual(setup.web.measurements)
    expect(active?.tables.progress_logs).toEqual(setup.web.progress_logs)
    expect(await app.list()).toHaveLength(2)
    expect(await setup.sync.synchronize()).toMatchObject({ pending: true, message: expect.stringMatching(/habilitar/i) })
    expect(setup.pushes).toBe(0)
  })

  it('keeps local edits and deletions while downloading newly assigned web routines', async () => {
    const app = await store(); const setup = fixture(app); setup.setAvailable(false)
    setup.web.measurements.push({ id: 'm1', user_id: owner, waist_cm: 70 })
    await setup.sync.prepareSignedInAccount()
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Local Ana'; draft.tables.measurements = [] })
    setup.web.profiles[0].language = 'en'
    setup.web.workout_plans.push({ id: 'professional', user_id: owner, prescription_locked: true, is_active: true })
    await setup.sync.synchronize()
    expect((await app.read())?.tables.profiles[0]).toMatchObject({ full_name: 'Local Ana', language: 'en' })
    expect((await app.read())?.tables.measurements).toEqual([])
    expect((await app.read())?.tables.workout_plans[0].id).toBe('professional')
  })

  it('preserves the selected local routine when a new web routine is downloaded', async () => {
    const app = await store(); const setup = fixture(app); setup.setAvailable(false)
    setup.web.workout_plans.push({ id: 'web-old', user_id: owner, is_active: true })
    await setup.sync.prepareSignedInAccount()
    await app.mutate(draft => {
      draft.tables.workout_plans[0].is_active = false
      draft.tables.workout_plans.push({ id: 'local-plan', user_id: owner, is_active: true })
    })
    setup.web.workout_plans[0].is_active = false
    setup.web.workout_plans.push({ id: 'new-assigned', user_id: owner, is_active: true, prescription_locked: true })
    await setup.sync.synchronize()
    expect((await app.read())?.tables.workout_plans.filter(row => row.is_active).map(row => row.id)).toEqual(['local-plan'])
    expect((await app.read())?.tables.workout_plans.some(row => row.id === 'new-assigned')).toBe(true)
  })

  it('rejects divergent cloud data without overwriting a dirty linked account', async () => {
    const app = await store(); await app.create(state()); await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Local' })
    const setup = fixture(app); const other = state(); other.tables.profiles[0].full_name = 'Another device'
    setup.setBackup({ revision: 'newer', state: other })
    await expect(setup.sync.synchronize()).rejects.toThrow(/conflicto/i)
    expect((await app.read())?.tables.profiles[0].full_name).toBe('Local')
    expect(setup.pushes).toBe(0)
  })

  it('restores a clean account from its own full cloud backup', async () => {
    const app = await store(); await app.create(state())
    const setup = fixture(app); const other = state(); other.tables.measurements.push({ id: 'm2', user_id: owner, chest_cm: 92 })
    setup.setBackup({ revision: 'from-second-device', state: other })
    await setup.sync.synchronize()
    expect((await app.read())?.tables.measurements).toEqual(other.tables.measurements)
  })

  it('restores the newer cloud snapshot on reauthentication before a clean account becomes dirty from web refresh', async () => {
    const app = await store(); await app.create(state())
    const setup = fixture(app); const other = state(); other.tables.measurements.push({ id: 'm2', user_id: owner, legs_cm: 54 })
    setup.setBackup({ revision: 'second-device', state: other })
    await setup.sync.prepareSignedInAccount()
    expect((await app.read())?.tables.measurements).toEqual(other.tables.measurements)
  })

  it('acknowledges only the uploaded revision when training changes during the request', async () => {
    const app = await store(); await app.create(state()); const setup = fixture(app)
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Before upload' })
    setup.onPush(() => app.mutate(draft => { draft.tables.profiles[0].full_name = 'During upload' }))
    const result = await setup.sync.synchronize()
    const active = await app.read()
    expect(active?.tables.profiles[0].full_name).toBe('During upload')
    expect(active!.revision).toBeGreaterThan(active!.lastSyncedRevision)
    expect(result.pending).toBe(true)
  })

  it('recovers a lost upload response without duplicating or overwriting the accepted snapshot', async () => {
    const app = await store(); await app.create(state()); const setup = fixture(app)
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Saved' })
    setup.loseNextResponse()
    await expect(setup.sync.synchronize()).rejects.toThrow('Lost response')
    expect((await app.read())!.lastSyncedRevision).toBeLessThan((await app.read())!.revision)
    await setup.sync.synchronize()
    expect(setup.pushes).toBe(1)
    expect((await app.read())!.lastSyncedRevision).toBe((await app.read())!.revision)
  })
})
