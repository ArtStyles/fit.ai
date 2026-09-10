import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore } from '../storage'
import { createAppClient } from '../query'
import type { AppState } from '../types'

const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })

function state(id = 'account-a'): AppState {
  return {
    version: 1, accountId: id, remoteUserId: null, email: '', revision: 0,
    remoteRevision: null, lastSyncedRevision: 0,
    tables: {
      profiles: [{ id, full_name: 'Ana', height_cm: 171, date_of_birth: '1991-03-05', timezone: 'America/Havana' }],
      workout_plans: [{ id: 'plan-1', user_id: id, is_active: true, family_id: 'family-1', prescription_locked: false }],
      workouts: [{ id: 'workout-1', user_id: id, plan_id: 'plan-1', name: 'Piernas', focus: 'Fuerza', day_of_week: 2 }],
      exercises: [{ id: 'exercise-1', name: 'Sentadilla', is_public: true, is_compound: true }],
      workout_exercises: [{ id: 'we-1', workout_id: 'workout-1', exercise_id: 'exercise-1', order_index: 0, notes: 'Controla el descenso', weight_suggestion_basis: 'based_on_previous_logs' }],
      progress_logs: [{ id: 'log-1', user_id: id, workout_id: 'workout-1', completed_at: '2026-09-10T12:00:00.000Z', mood_rating: 4, session_context_snapshot: { plan: { weekNumber: 2 }, exercises: [{ name: 'Nombre histórico' }] } }],
      exercise_logs: [{ id: 'el-1', progress_log_id: 'log-1', exercise_id: 'exercise-1', rpe_values: [7, null, 8], reps_completed: [10, 8, 7], weights_kg: [30, 35, 35], duration_seconds: [45, 40, 35], notes: 'Reemplazo', original_exercise_id: 'previous', status: 'completed' }],
      measurements: [{ id: 'm-1', user_id: id, recorded_at: '2026-09-10T12:00:00.000Z', weight_kg: null, body_fat_percentage: 21, muscle_mass_kg: 48, chest_cm: 90, waist_cm: 71, hips_cm: 98, arms_cm: 29, legs_cm: 52, notes: 'Sin peso' }],
    },
  }
}

async function store() {
  const driver = new NodeSqliteDriver(':memory:')
  drivers.push(driver)
  return createAppStore(driver)
}

describe('original application SQLite state', () => {
  it('isolates display caches by account without dirtying or exporting user data', async () => {
    const app = await store(); await app.create(state())
    const before = JSON.parse(await app.exportBackup()).state
    await app.setAccountCache('summary', { allowed: true }, app.sessionVersion(), 'account-a')
    expect(await app.getAccountCache('summary', 'account-a')).toEqual({ allowed: true })
    expect(JSON.parse(await app.exportBackup()).state).toEqual(before)
    await app.create(state('account-b'))
    expect(await app.getAccountCache('summary', 'account-a')).toBeNull()
    expect(await app.getAccountCache('summary', 'account-b')).toBeNull()
    await expect(app.setAccountCache('summary', { allowed: true }, app.sessionVersion(), 'account-a')).rejects.toThrow()
    await app.activate('account-a')
    expect(await app.getAccountCache('summary', 'account-a')).toEqual({ allowed: true })
    const session = app.sessionVersion()
    await app.deactivate()
    expect(await app.getAccountCache('summary', 'account-a')).toBeNull()
    await expect(app.setAccountCache('summary', {}, session, 'account-a')).rejects.toThrow()
  })
  it('preserves complete original metric and session rows through SQLite and backup', async () => {
    const app = await store()
    const initial = state()
    await app.create(initial)
    expect(await app.read()).toEqual(initial)
    const backup = await app.exportBackup()
    const restored = await store()
    await restored.create(state('signed-in-account'))
    await restored.importBackup(backup)
    expect((await restored.read())?.tables).toEqual(initial.tables)
  })

  it('isolates accounts, cloned reads and serialized mutations', async () => {
    const app = await store()
    await app.create(state())
    const copy = await app.read()
    copy!.tables.profiles[0].full_name = 'external change'
    await Promise.all(Array.from({ length: 5 }, () => app.mutate(async draft => {
      const count = draft.tables.profiles[0].counter ?? 0
      await Promise.resolve()
      draft.tables.profiles[0].counter = count + 1
    })))
    expect((await app.read())?.tables.profiles[0]).toMatchObject({ full_name: 'Ana', counter: 5 })
    expect((await app.read())?.revision).toBe(5)
    await app.create(state('account-b'))
    expect((await app.read())?.accountId).toBe('account-b')
    await app.activate('account-a')
    expect((await app.read())?.tables.profiles[0].counter).toBe(5)
    await expect(app.mutate(draft => { draft.accountId = 'account-b' })).rejects.toThrow(/identity/i)
    await expect(app.mutate(draft => { draft.tables.measurements[0].user_id = 'account-b' })).rejects.toThrow(/owner/i)
  })

  it('rolls back mutation failures without changing revision or partial values', async () => {
    const app = await store()
    await app.create(state())
    await expect(app.mutate(draft => {
      draft.tables.profiles[0].full_name = 'Lost update'
      throw new Error('expected failure')
    })).rejects.toThrow('expected failure')
    expect(await app.read()).toEqual(state())
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Saved' })
    expect((await app.read())?.revision).toBe(1)
  })

  it('does not advance revision or emit refresh for idempotent authorization retries', async () => {
    const app = await store(); await app.create(state())
    await app.mutate(draft => { draft.tables.session_authorizations = [{ id: 'auth-1', user_id: draft.accountId, client_session_id: 'session-1' }] })
    const revision = (await app.read())!.revision
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await app.mutate(draft => draft.tables.session_authorizations.find(row => row.client_session_id === 'session-1'))
      expect(result?.id).toBe('auth-1')
    }
    expect((await app.read())?.revision).toBe(revision)
  })

  it('rejects a setter invoked on account A behind a pending switch to B', async () => {
    const app = await store(); await app.create(state()); await app.create(state('account-b')); await app.activate('account-a')
    const switching = app.activate('account-b')
    const staleSetter = app.mutate(draft => { draft.tables.measurements[0].weight_kg = 999 })
    await Promise.all([switching, expect(staleSetter).rejects.toThrow(/account changed/i)])
    expect((await app.read())?.accountId).toBe('account-b')
    expect((await app.read())?.tables.measurements[0].weight_kg).toBeNull()
    await app.activate('account-a')
    expect((await app.read())?.tables.measurements[0].weight_kg).toBeNull()
  })

  it('imports a separate account, merges identical backups idempotently and rejects conflicts', async () => {
    const app = await store()
    await app.create(state())
    const originalBackup = await app.exportBackup()
    await app.importBackup(originalBackup)
    expect((await app.list())).toHaveLength(1)
    expect((await app.read())?.revision).toBe(0)
    await app.mutate(draft => { draft.tables.measurements = [] })
    await expect(app.importBackup(originalBackup)).rejects.toThrow(/conflict/i)
    expect((await app.read())?.tables.measurements).toEqual([])
    const other = await store()
    await other.create(state('account-b'))
    await app.importBackup(await other.exportBackup())
    expect(await app.list()).toHaveLength(2)
    expect((await app.read())?.accountId).toBe('account-b')
    await app.activate('account-a')
    expect((await app.read())?.tables.measurements).toEqual([])
  })

  it('does not use a backup to enter the application without a session', async () => {
    const source = await store(); await source.create(state())
    const app = await store()
    await expect(app.importBackup(await source.exportBackup())).rejects.toThrow(/inicia sesi[oó]n/i)
    expect(await app.read()).toBeNull()
    expect(await app.list()).toEqual([])
  })

  it.each([false, true])('does not reopen a signed-out linked=%s account by importing its backup', async linked => {
    const app = await store()
    const initial = state()
    if (linked) initial.remoteUserId = initial.accountId
    await app.create(initial)
    const backup = await app.exportBackup()
    await app.deactivate()
    await expect(app.importBackup(backup)).rejects.toThrow(/inicia sesi[oó]n/i)
    expect(await app.read()).toBeNull()
    expect(await app.list()).toEqual([initial])
  })

  it.each(['before', 'after'] as const)('rejects a queued backup import invoked %s logout starts', async order => {
    const app = await store(); const initial = state(); await app.create(initial)
    const source = await store(); await source.create(state('account-b'))
    const backup = await source.exportBackup()
    const importing = order === 'before' ? app.importBackup(backup) : null
    const signingOut = app.deactivate()
    const pendingImport = importing ?? app.importBackup(backup)
    await Promise.all([signingOut, expect(pendingImport).rejects.toThrow(/sesi[oó]n/i)])
    expect(await app.read()).toBeNull()
    expect(await app.list()).toEqual([initial])
  })

  it('rolls back an in-progress backup import when logout starts before activation', async () => {
    const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
    const app = await createAppStore(driver); const initial = state(); await app.create(initial)
    const source = await store(); await source.create(state('account-b'))
    const backup = await source.exportBackup()
    let release!: () => void; let started!: () => void
    const paused = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { started = resolve })
    const execute = driver.execute.bind(driver)
    vi.spyOn(driver, 'execute').mockImplementation(async (sql, parameters) => {
      const result = await execute(sql, parameters)
      if (sql.startsWith('INSERT INTO original_app_accounts') && parameters?.[0] === 'account-b') {
        started(); await paused
      }
      return result
    })
    const importing = app.importBackup(backup).then(() => null, error => error)
    await entered
    const signingOut = app.deactivate()
    release()
    const result = await importing
    await signingOut
    expect(result).toBeInstanceOf(Error)
    expect(await app.read()).toBeNull()
    expect(await app.list()).toEqual([initial])
  })

  it('rejects remote identity collision and forged descendant ownership', async () => {
    const app = await store()
    const first = state(); first.remoteUserId = first.accountId
    await app.create(first)
    const second = state('account-b'); second.remoteUserId = first.accountId
    await expect(app.create(second)).rejects.toThrow(/identity/i)
    await expect(app.mutate(draft => { draft.tables.exercise_logs[0].progress_log_id = 'foreign-log' })).rejects.toThrow(/parent/i)
    expect(await app.list()).toHaveLength(1)
  })

  it('acknowledges uploaded revisions without marking subsequent edits as synchronized', async () => {
    const app = await store(); const initial = state(); initial.remoteUserId = initial.accountId
    await app.create(initial)
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Revision one' })
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Revision two' })
    await app.markSynced(initial.accountId, 1, 'remote-v1')
    expect(await app.read()).toMatchObject({ revision: 2, lastSyncedRevision: 1, remoteRevision: 'remote-v1' })
    await app.markSynced(initial.accountId, 2, 'remote-v2')
    await expect(app.markSynced(initial.accountId, 1, 'remote-v1')).rejects.toThrow(/stale/i)
    expect(await app.read()).toMatchObject({ revision: 2, lastSyncedRevision: 2, remoteRevision: 'remote-v2' })
  })

  it('restores remote data only for clean same-owner state with an unchanged revision', async () => {
    const app = await store(); const initial = state(); initial.remoteUserId = initial.accountId
    await app.create(initial)
    const remote = structuredClone(initial); remote.remoteRevision = 'remote-v1'; remote.tables.profiles[0].full_name = 'Remote profile'
    await app.replaceFromCloud(remote, 0)
    expect(await app.read()).toMatchObject({ revision: 1, lastSyncedRevision: 1, remoteRevision: 'remote-v1' })
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Local edit' })
    await expect(app.replaceFromCloud(remote, 1)).rejects.toThrow(/conflict/i)
    await expect(app.replaceFromCloud(remote, 2)).rejects.toThrow(/pending/i)
    expect((await app.read())?.tables.profiles[0].full_name).toBe('Local edit')
  })

  it('rolls back a failed SQLite commit without clearing durable original data', async () => {
    const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
    const app = await createAppStore(driver); await app.create(state())
    driver.failNextCommit()
    await expect(app.mutate(draft => { draft.tables.measurements = [] })).rejects.toThrow('injected commit failure')
    expect((await app.read())?.tables.measurements[0].body_fat_percentage).toBe(21)
    expect((await app.read())?.revision).toBe(0)
  })
})

describe('original application query adapter', () => {
  it('reads original aliases, nested joins, filters and counts', async () => {
    const app = await store(); await app.create(state())
    const client = createAppClient(app)
    const logs = await client.from('exercise_logs')
      .select('id, exercise:exercises(name), progress_logs!inner(user_id, workout:workouts(name))', { count: 'exact' })
      .eq('progress_logs.user_id', 'account-a').lt('progress_logs.completed_at', '2026-09-11').order('id').range(0, 0)
    expect(logs.error).toBeNull()
    expect(logs.count).toBe(1)
    expect(logs.data).toEqual([expect.objectContaining({ exercise: expect.objectContaining({ name: 'Sentadilla' }), progress_logs: expect.objectContaining({ workout: expect.objectContaining({ name: 'Piernas' }) }) })])
    const workout = await client.from('workouts').select('*, workout_exercises(*, exercises(*))').single()
    expect(workout.data?.workout_exercises[0].exercises.name).toBe('Sentadilla')
    const sessionPrescription = await client.from('workout_exercises').select(`id,
      exercises (
        id, name, name_es, image_url, instructions, instructions_es,
        is_compound, muscle_groups, muscle_groups_es
      )`).single()
    expect(sessionPrescription.data?.exercises.name).toBe('Sentadilla')
    const exerciseHistory = await client.from('exercise_logs')
      .select('id, progress_log:progress_logs!inner(id, workout_id, completed_at, user_id)')
      .eq('exercise_id', 'exercise-1').eq('progress_logs.user_id', 'account-a')
    expect(exerciseHistory.data).toEqual([expect.objectContaining({
      id: 'el-1', progress_log: expect.objectContaining({ id: 'log-1', user_id: 'account-a' }),
    })])
    const empty = await client.from('measurements').select('*').eq('user_id', 'account-b')
    expect(empty.data).toEqual([])
  })

  it('handles nulls, ranges, chained ordering, maybeSingle and unsupported operations', async () => {
    const app = await store(); await app.create(state())
    await app.mutate(draft => {
      draft.tables.measurements.push({ id: 'm-2', user_id: draft.accountId, weight_kg: 60, recorded_at: '2026-09-12' })
      draft.tables.measurements.push({ id: 'm-3', user_id: draft.accountId, weight_kg: 61, recorded_at: '2026-09-12' })
    })
    const client = createAppClient(app)
    expect((await client.from('measurements').select('*').is('weight_kg', null)).data).toHaveLength(1)
    expect((await client.from('measurements').select('*').in('id', ['m-2', 'm-3']).gte('weight_kg', 60).lte('weight_kg', 61).neq('id', 'm-2')).data).toHaveLength(1)
    expect((await client.from('measurements').select('*').gt('weight_kg', 59).lt('weight_kg', 62).order('recorded_at', { ascending: false }).order('id', { ascending: false }).limit(1)).data?.[0].id).toBe('m-3')
    expect((await client.from('measurements').select('*').eq('id', 'absent').maybeSingle()).data).toBeNull()
    expect((await client.from('measurements').select('*').single()).error?.code).toBe('PGRST116')
    expect((await client.rpc('get_dashboard_payload')).error?.code).toBe('0A000')
    expect(() => client.from('measurements').delete()).toThrow(/unsupported/i)
    expect(() => client.from('measurements').insert({})).toThrow(/unsupported/i)
  })

  it('supports original catalogue name search and array filters', async () => {
    const app = await store(); await app.create(state())
    await app.mutate(draft => {
      Object.assign(draft.tables.exercises[0], { name: 'Squat', name_es: 'Sentadilla', equipment: ['dumbbell'], muscle_groups: ['quadriceps'] })
      draft.tables.exercises.push({ id: 'exercise-2', name: 'Row', name_es: 'Remo', is_public: true, equipment: ['barbell'], muscle_groups: ['back'] })
    })
    const client = createAppClient(app)
    const spanish = await client.from('exercises').select('*').eq('is_public', true)
      .or('name.ilike.%sentad%,name_es.ilike.%sentad%').contains('equipment', ['dumbbell'])
    expect(spanish.data?.map(row => row.id)).toEqual(['exercise-1'])
    expect((await client.from('exercises').select('*').ilike('name', 'r_w')).data?.map(row => row.id)).toEqual(['exercise-2'])
    expect((await client.from('exercises').select('*').contains('muscle_groups', ['quadriceps', 'back'])).data).toEqual([])
    expect(() => client.from('exercises').or('id.eq.exercise-1')).toThrow(/unsupported/i)
    expect(() => client.from('exercises').contains('equipment', { invalid: true } as never)).toThrow(/unsupported/i)
  })

  it('does not let an old client render the newly selected account', async () => {
    const app = await store(); await app.create(state())
    const client = createAppClient(app)
    await client.from('profiles').select('*')
    await app.create(state('account-b'))
    const result = await client.from('profiles').select('*')
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('28000')
    expect((await createAppClient(app).from('profiles').select('*')).data?.[0].id).toBe('account-b')
  })
})
