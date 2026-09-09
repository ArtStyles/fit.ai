import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  MobileAccount,
  MobileMeasurement,
  MobilePlan,
  MobileSession,
} from '../../domain/types'
import { createMobileRepository } from '../repository'
import { NodeSqliteDriver } from './node-sqlite-driver'

const ACCOUNT_A = '00000000-0000-4000-8000-000000000001'
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002'
const PLAN_A = '10000000-0000-4000-8000-000000000001'
const SESSION_A = '20000000-0000-4000-8000-000000000001'

const profile = {
  language: 'es' as const,
  fitnessLevel: 'beginner' as const,
  primaryGoal: 'stay_active' as const,
  daysPerWeek: 3,
  sessionDurationMinutes: 45,
  gymType: 'home_basic' as const,
  availableEquipment: ['dumbbell'],
  preferredWorkoutDays: [1, 3, 5],
  cardioPreferences: ['walking' as const],
  age: 34,
  readiness: {
    status: 'cleared' as const,
    currentlyActive: true,
    warningSymptoms: [],
    knownCardiovascularMetabolicOrRenalDisease: false,
    medicallyCleared: true,
    recentSurgery: false,
    limitations: [],
  },
}

function account(
  id = ACCOUNT_A,
  overrides: Partial<MobileAccount> = {},
): MobileAccount {
  return {
    id,
    remoteUserId: null,
    name: id === ACCOUNT_A ? 'Ana' : 'Bea',
    profile,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  }
}

function plan(
  accountId = ACCOUNT_A,
  overrides: Partial<MobilePlan> = {},
): MobilePlan {
  return {
    id: accountId === ACCOUNT_A ? PLAN_A : '10000000-0000-4000-8000-000000000002',
    accountId,
    remoteId: null,
    source: 'personal',
    name: accountId === ACCOUNT_A ? 'Plan A' : 'Plan B',
    notes: '',
    workouts: [
      {
        id: accountId === ACCOUNT_A
          ? '11000000-0000-4000-8000-000000000001'
          : '11000000-0000-4000-8000-000000000002',
        name: 'Día 1',
        dayOfWeek: 1,
        exercises: [
          {
            id: '12000000-0000-4000-8000-000000000001',
            exerciseId: 'squat',
            name: 'Sentadilla',
            imageUrl: null,
            instructions: 'Baja con control.',
            sets: 1,
            reps: 10,
            durationSeconds: null,
            restSeconds: 60,
            weightKg: 12,
            targetRpe: 7,
          },
        ],
      },
    ],
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  }
}

function session(
  accountId = ACCOUNT_A,
  overrides: Partial<MobileSession> = {},
): MobileSession {
  const sourcePlan = plan(accountId)
  const workout = sourcePlan.workouts[0]
  return {
    id: accountId === ACCOUNT_A ? SESSION_A : '20000000-0000-4000-8000-000000000002',
    accountId,
    planId: sourcePlan.id,
    workoutId: workout.id,
    workoutName: workout.name,
    source: 'personal',
    startedAt: '2026-09-08T10:30:00.000Z',
    finishedAt: null,
    exercises: [
      {
        prescription: workout.exercises[0],
        sets: [
          {
            id: '21000000-0000-4000-8000-000000000001',
            reps: 10,
            weightKg: 12,
            durationSeconds: null,
            completed: true,
          },
        ],
      },
    ],
    rpe: null,
    notes: '',
    remoteId: null,
    ...overrides,
  }
}

const cleanup: string[] = []

async function fileDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'vekira-mobile-'))
  cleanup.push(directory)
  return { directory, path: join(directory, 'mobile.sqlite') }
}

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('mobile SQLite repository', () => {
  it('persists an unfinished workout and active plan across a real database reopen', async () => {
    const { path } = await fileDatabase()
    const firstDriver = new NodeSqliteDriver(path)
    const first = await createMobileRepository(firstDriver)
    await first.saveAccount(account(), false)
    await first.savePlan(plan(), false)
    await first.setActivePlan(ACCOUNT_A, PLAN_A)
    await first.saveSession(session(), false)
    await firstDriver.close()

    const secondDriver = new NodeSqliteDriver(path)
    const reopened = await createMobileRepository(secondDriver)
    const data = await reopened.loadData(ACCOUNT_A)

    expect(data.activePlanId).toBe(PLAN_A)
    expect(data.sessions).toEqual([session()])
    await secondDriver.close()
  })

  it('atomically stores a completed session and an immutable outbox operation', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    await repository.savePlan(plan(), false)
    const completed = session(ACCOUNT_A, {
      finishedAt: '2026-09-08T11:15:00.000Z',
      rpe: 7,
    })

    await repository.saveSession(completed)
    const [original] = await repository.pending(ACCOUNT_A)
    completed.notes = 'mutated after save'
    expect(original.kind).toBe('session')
    expect(original.entityId).toBe(SESSION_A)
    expect(original.payload).toMatchObject({ notes: '', rpe: 7 })

    await repository.saveSession(session(ACCOUNT_A, {
      finishedAt: '2026-09-08T11:15:00.000Z',
      notes: 'newer local edit',
      rpe: 8,
    }))
    const operations = await repository.pending(ACCOUNT_A)
    expect(operations).toHaveLength(2)
    expect(operations[1].id).not.toBe(original.id)
    await repository.acknowledge(ACCOUNT_A, original.id)
    expect(await repository.pending(ACCOUNT_A)).toEqual([operations[1]])
    await driver.close()
  })

  it('returns same-millisecond outbox writes in durable insertion order', async () => {
    const generatedIds = [
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      '00000000-0000-4000-8000-000000000000',
    ]
    vi.stubGlobal('crypto', {
      randomUUID: () => generatedIds.shift() ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T11:00:00.000Z'))
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)

    await repository.savePlan(plan(ACCOUNT_A, { notes: 'first' }))
    await repository.savePlan(plan(ACCOUNT_A, { notes: 'second' }))

    expect((await repository.pending(ACCOUNT_A)).map((operation) =>
      (operation.payload as MobilePlan).notes)).toEqual(['first', 'second'])
    await driver.close()
  })

  it('rolls back both session and outbox when the transaction cannot commit', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    await repository.savePlan(plan(), false)
    await repository.saveSession(session(), false)
    driver.failNextCommit()

    await expect(repository.saveSession(session(ACCOUNT_A, {
      finishedAt: '2026-09-08T11:15:00.000Z',
    }))).rejects.toThrow('injected commit failure')

    expect((await repository.loadData(ACCOUNT_A)).sessions).toEqual([session()])
    expect(await repository.pending(ACCOUNT_A)).toEqual([])
    await driver.close()
  })

  it('scopes reads and outbox acknowledgments to the owning account', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(ACCOUNT_A), false)
    await repository.saveAccount(account(ACCOUNT_B), false)
    await repository.savePlan(plan(ACCOUNT_A), false)
    await repository.savePlan(plan(ACCOUNT_B), false)
    await repository.saveSession(session(ACCOUNT_A))
    await repository.saveSession(session(ACCOUNT_B))

    expect((await repository.loadData(ACCOUNT_A)).sessions.map((value) => value.accountId)).toEqual([ACCOUNT_A])
    expect((await repository.loadData(ACCOUNT_B)).sessions.map((value) => value.accountId)).toEqual([ACCOUNT_B])
    const [operationA] = await repository.pending(ACCOUNT_A)
    await repository.acknowledge(ACCOUNT_B, operationA.id)
    expect(await repository.pending(ACCOUNT_A)).toEqual([operationA])
    await driver.close()
  })

  it('continues processing serialized writes after a rejected write', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    driver.failNextCommit()
    const failed = repository.savePlan(plan(), false)
    const measurement: MobileMeasurement = {
      id: '30000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_A,
      date: '2026-09-08',
      weightKg: 70,
      waistCm: 80,
      notes: '',
      updatedAt: '2026-09-08T12:00:00.000Z',
      deletedAt: null,
    }
    const following = repository.saveMeasurement(measurement, false)

    await expect(failed).rejects.toThrow('injected commit failure')
    await expect(following).resolves.toBeUndefined()
    expect((await repository.loadData(ACCOUNT_A)).measurements).toEqual([measurement])
    await driver.close()
  })

  it('does not let a remote plan save replace an entity with pending local writes', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    const local = plan(ACCOUNT_A, {
      notes: 'local pending edit',
      updatedAt: '2026-09-08T13:00:00.000Z',
    })
    await repository.savePlan(local)

    await repository.savePlan(plan(ACCOUNT_A, {
      notes: 'stale cloud copy',
      updatedAt: '2026-09-08T14:00:00.000Z',
    }), false)

    expect((await repository.loadData(ACCOUNT_A)).plans).toEqual([local])
    await driver.close()
  })

  it('does not let a stale remote measurement replace a newer local value', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    const local: MobileMeasurement = {
      id: '30000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_A,
      date: '2026-09-08',
      weightKg: 70,
      waistCm: null,
      notes: 'newer',
      updatedAt: '2026-09-08T14:00:00.000Z',
      deletedAt: null,
    }
    await repository.saveMeasurement(local, false)

    await repository.saveMeasurement({
      ...local,
      weightKg: 72,
      notes: 'older cloud copy',
      updatedAt: '2026-09-08T13:00:00.000Z',
    }, false)

    expect((await repository.loadData(ACCOUNT_A)).measurements).toEqual([local])
    await driver.close()
  })

  it('does not reopen a locally finished session from a stale remote save', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    const completed = session(ACCOUNT_A, { finishedAt: '2026-09-08T11:15:00.000Z' })
    await repository.saveSession(completed, false)

    await repository.saveSession(session(), false)

    expect((await repository.loadData(ACCOUNT_A)).sessions).toEqual([completed])
    await driver.close()
  })

  it('does not reopen a completed session from a later local autosave', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    const completed = session(ACCOUNT_A, { finishedAt: '2026-09-08T11:15:00.000Z' })
    await repository.saveSession(completed)

    await repository.saveSession(session())

    expect((await repository.loadData(ACCOUNT_A)).sessions).toEqual([completed])
    expect(await repository.pending(ACCOUNT_A)).toHaveLength(1)
    await driver.close()
  })

  it('durably updates an unfinished session through a local no-outbox autosave', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    await repository.saveSession(session(), false)
    const updated = session(ACCOUNT_A, {
      notes: 'progreso guardado',
      rpe: 6,
      exercises: [
        {
          ...session().exercises[0],
          sets: [{ ...session().exercises[0].sets[0], reps: 12 }],
        },
      ],
    })

    await repository.saveSession(updated, false)

    expect((await repository.loadData(ACCOUNT_A)).sessions).toEqual([updated])
    expect(await repository.pending(ACCOUNT_A)).toEqual([])
    await driver.close()
  })
})

describe('mobile backup import', () => {
  it('validates all nested data before writing and leaves existing data unchanged', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    await repository.savePlan(plan(), false)
    const backup = JSON.parse(await repository.exportBackup(ACCOUNT_A)) as Record<string, any>
    backup.data.plans[0].workouts[0].exercises[0].sets = 'three'

    await expect(repository.importBackup(JSON.stringify(backup))).rejects.toThrow(/backup/i)
    expect((await repository.loadData(ACCOUNT_A)).plans).toEqual([plan()])
    await driver.close()
  })

  it('rejects a linked identity collision with another local account', async () => {
    const sourceDriver = new NodeSqliteDriver(':memory:')
    const source = await createMobileRepository(sourceDriver)
    await source.saveAccount(account(ACCOUNT_A, { remoteUserId: 'remote-owner' }), false)
    const backup = await source.exportBackup(ACCOUNT_A)

    const targetDriver = new NodeSqliteDriver(':memory:')
    const target = await createMobileRepository(targetDriver)
    await target.saveAccount(account(ACCOUNT_B, { remoteUserId: 'remote-owner' }), false)
    await expect(target.importBackup(backup)).rejects.toThrow(/linked identity/i)
    expect(await target.listAccounts()).toEqual([account(ACCOUNT_B, { remoteUserId: 'remote-owner' })])
    await sourceDriver.close()
    await targetDriver.close()
  })

  it('preserves newer local entities and pending operations while merging a backup', async () => {
    const sourceDriver = new NodeSqliteDriver(':memory:')
    const source = await createMobileRepository(sourceDriver)
    await source.saveAccount(account(), false)
    await source.savePlan(plan(ACCOUNT_A, { notes: 'older backup' }), false)
    const backup = await source.exportBackup(ACCOUNT_A)

    const targetDriver = new NodeSqliteDriver(':memory:')
    const target = await createMobileRepository(targetDriver)
    await target.saveAccount(account(), false)
    const newer = plan(ACCOUNT_A, {
      notes: 'newer local',
      updatedAt: '2026-09-08T13:00:00.000Z',
    })
    await target.savePlan(newer)
    const pendingBefore = await target.pending(ACCOUNT_A)

    await target.importBackup(backup)

    expect((await target.loadData(ACCOUNT_A)).plans).toEqual([newer])
    expect(await target.pending(ACCOUNT_A)).toEqual(pendingBefore)
    await sourceDriver.close()
    await targetDriver.close()
  })

  it('rolls back an otherwise valid import when commit fails', async () => {
    const sourceDriver = new NodeSqliteDriver(':memory:')
    const source = await createMobileRepository(sourceDriver)
    await source.saveAccount(account(), false)
    await source.savePlan(plan(), false)
    const backup = await source.exportBackup(ACCOUNT_A)

    const targetDriver = new NodeSqliteDriver(':memory:')
    const target = await createMobileRepository(targetDriver)
    driverFor(targetDriver).failNextCommit()
    await expect(target.importBackup(backup)).rejects.toThrow('injected commit failure')
    expect(await target.listAccounts()).toEqual([])
    await sourceDriver.close()
    await targetDriver.close()
  })

  it('only remaps an explicitly selected unlinked local backup', async () => {
    const sourceDriver = new NodeSqliteDriver(':memory:')
    const source = await createMobileRepository(sourceDriver)
    await source.saveAccount(account(), false)
    await source.savePlan(plan(), false)
    const backup = await source.exportBackup(ACCOUNT_A)

    const targetDriver = new NodeSqliteDriver(':memory:')
    const target = await createMobileRepository(targetDriver)
    const remapped = await target.importBackup(backup, ACCOUNT_B)
    expect(remapped.id).toBe(ACCOUNT_B)
    expect((await target.loadData(ACCOUNT_B)).plans[0]).toMatchObject({ accountId: ACCOUNT_B })
    expect((await target.loadData(ACCOUNT_B)).plans[0].id).not.toBe(PLAN_A)

    const linked = JSON.parse(backup) as Record<string, any>
    linked.account.remoteUserId = 'remote-owner'
    await expect(target.importBackup(JSON.stringify(linked), ACCOUNT_B)).rejects.toThrow(/unlinked/i)
    await sourceDriver.close()
    await targetDriver.close()
  })

  it('maps local data into a linked account without replacing its identity or profile', async () => {
    const sourceDriver = new NodeSqliteDriver(':memory:')
    const source = await createMobileRepository(sourceDriver)
    await source.saveAccount(account(), true)
    await source.savePlan(plan(), true)
    const backup = await source.exportBackup(ACCOUNT_A)

    const targetDriver = new NodeSqliteDriver(':memory:')
    const target = await createMobileRepository(targetDriver)
    const linkedProfile = { ...profile, fitnessLevel: 'advanced' as const }
    const linkedAccount = account(ACCOUNT_B, {
      remoteUserId: 'remote-owner',
      name: 'Cuenta conectada',
      profile: linkedProfile,
      updatedAt: '2026-09-08T15:00:00.000Z',
    })
    await target.saveAccount(linkedAccount, false)

    const imported = await target.importBackup(backup, ACCOUNT_B)

    expect(imported).toEqual(linkedAccount)
    expect((await target.loadData(ACCOUNT_B)).plans[0].accountId).toBe(ACCOUNT_B)
    const importedOperations = await target.pending(ACCOUNT_B)
    expect(importedOperations).toHaveLength(2)
    expect(importedOperations.find((operation) => operation.kind === 'profile')?.payload).toEqual(linkedAccount)
    await sourceDriver.close()
    await targetDriver.close()
  })

  it('copies a local profile into a linked account with deterministic destination IDs', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    const localPlan = plan(ACCOUNT_A, { source: 'trainer', remoteId: 'remote-trainer-plan' })
    const localSession = session(ACCOUNT_A, {
      source: 'trainer',
      remoteId: 'remote-trainer-session',
      finishedAt: '2026-09-08T11:15:00.000Z',
    })
    const localMeasurement: MobileMeasurement = {
      id: '30000000-0000-4000-8000-000000000001',
      accountId: ACCOUNT_A,
      date: '2026-09-08',
      weightKg: 70,
      waistCm: 80,
      notes: '',
      updatedAt: '2026-09-08T12:00:00.000Z',
      deletedAt: null,
    }
    await repository.saveAccount(account(ACCOUNT_A), true)
    await repository.savePlan(localPlan, true)
    await repository.setActivePlan(ACCOUNT_A, localPlan.id)
    await repository.saveSession(localSession, true)
    await repository.saveMeasurement(localMeasurement, true)
    const linked = account(ACCOUNT_B, {
      remoteUserId: 'remote-owner',
      name: 'Cuenta conectada',
      updatedAt: '2026-09-08T15:00:00.000Z',
    })
    await repository.saveAccount(linked, false)
    const sourcePending = await repository.pending(ACCOUNT_A)
    const backup = await repository.exportBackup(ACCOUNT_A)

    await repository.importBackup(backup, ACCOUNT_B)
    const firstCopy = await repository.loadData(ACCOUNT_B)
    const firstPending = await repository.pending(ACCOUNT_B)
    await repository.importBackup(backup, ACCOUNT_B)
    const repeatedCopy = await repository.loadData(ACCOUNT_B)
    const repeatedPending = await repository.pending(ACCOUNT_B)

    expect(firstCopy).toEqual(repeatedCopy)
    expect(firstPending).toEqual(repeatedPending)
    expect(firstCopy.plans).toHaveLength(1)
    expect(firstCopy.sessions).toHaveLength(1)
    expect(firstPending).toHaveLength(4)
    expect(firstCopy.plans[0].id).not.toBe(localPlan.id)
    expect(firstCopy.plans[0].workouts[0].id).not.toBe(localPlan.workouts[0].id)
    expect(firstCopy.plans[0].workouts[0].exercises[0].id)
      .not.toBe(localPlan.workouts[0].exercises[0].id)
    expect(firstCopy.sessions[0].planId).toBe(firstCopy.plans[0].id)
    expect(firstCopy.sessions[0].workoutId).toBe(firstCopy.plans[0].workouts[0].id)
    expect(firstCopy.sessions[0].exercises[0].prescription.id)
      .toBe(firstCopy.plans[0].workouts[0].exercises[0].id)
    expect(firstCopy.sessions[0].exercises[0].sets[0].id)
      .not.toBe(localSession.exercises[0].sets[0].id)
    expect(firstCopy.plans[0].workouts[0].exercises[0].exerciseId).toBe('squat')
    expect(firstCopy.measurements[0].id).not.toBe(localMeasurement.id)
    expect(firstCopy.activePlanId).toBe(firstCopy.plans[0].id)
    expect(firstCopy.plans[0].remoteId).toBe('remote-trainer-plan')
    expect(firstCopy.sessions[0].remoteId).toBe('remote-trainer-session')
    expect(firstPending.map((operation) => operation.id))
      .not.toEqual(sourcePending.map((operation) => operation.id))
    expect(firstPending.find((operation) => operation.kind === 'plan')?.entityId)
      .toBe(firstCopy.plans[0].id)
    expect(firstPending.find((operation) => operation.kind === 'session')?.entityId)
      .toBe(firstCopy.sessions[0].id)
    expect(firstPending.find((operation) => operation.kind === 'measurement')?.entityId)
      .toBe(firstCopy.measurements[0].id)
    expect(firstPending.find((operation) => operation.kind === 'profile')?.entityId).toBe(ACCOUNT_B)
    expect((await repository.loadData(ACCOUNT_A)).plans).toEqual([localPlan])
    expect((await repository.loadData(ACCOUNT_A)).sessions).toEqual([localSession])
    await driver.close()
  })

  it('rejects an imported outbox whose last replay would stale a newer local entity', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    const oldPlan = plan(ACCOUNT_A, { notes: 'old', updatedAt: '2026-09-08T11:00:00.000Z' })
    await repository.savePlan(oldPlan)
    const oldBackup = await repository.exportBackup(ACCOUNT_A)
    const [oldOperation] = await repository.pending(ACCOUNT_A)
    await repository.acknowledge(ACCOUNT_A, oldOperation.id)
    const newPlan = plan(ACCOUNT_A, { notes: 'new', updatedAt: '2026-09-08T12:00:00.000Z' })
    await repository.savePlan(newPlan)

    await expect(repository.importBackup(oldBackup)).rejects.toThrow(/stale outbox/i)

    expect((await repository.loadData(ACCOUNT_A)).plans).toEqual([newPlan])
    expect((await repository.pending(ACCOUNT_A)).map((operation) =>
      (operation.payload as MobilePlan).notes)).toEqual(['new'])
    await driver.close()
  })

  it('rejects an old completed-session backup when the acknowledged local session differs', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(), false)
    const oldSession = session(ACCOUNT_A, {
      finishedAt: '2026-09-08T11:15:00.000Z',
      notes: 'old',
      rpe: 6,
    })
    await repository.saveSession(oldSession)
    const oldBackup = await repository.exportBackup(ACCOUNT_A)
    const [oldOperation] = await repository.pending(ACCOUNT_A)
    await repository.acknowledge(ACCOUNT_A, oldOperation.id)
    const correctedSession = session(ACCOUNT_A, {
      finishedAt: '2026-09-08T11:15:00.000Z',
      notes: 'new',
      rpe: 8,
    })
    await repository.saveSession(correctedSession)
    const [correctedOperation] = await repository.pending(ACCOUNT_A)
    await repository.acknowledge(ACCOUNT_A, correctedOperation.id)

    await expect(repository.importBackup(oldBackup)).rejects.toThrow(/completed session conflict/i)

    expect((await repository.loadData(ACCOUNT_A)).sessions).toEqual([correctedSession])
    expect(await repository.pending(ACCOUNT_A)).toEqual([])
    await driver.close()
  })

  it('preserves retry metadata when the same copied operation is imported again', async () => {
    const driver = new NodeSqliteDriver(':memory:')
    const repository = await createMobileRepository(driver)
    await repository.saveAccount(account(ACCOUNT_A), false)
    await repository.savePlan(plan(ACCOUNT_A), true)
    const backup = await repository.exportBackup(ACCOUNT_A)
    const linked = account(ACCOUNT_B, {
      remoteUserId: 'remote-owner',
      name: 'Cuenta conectada',
      updatedAt: '2026-09-08T15:00:00.000Z',
    })
    await repository.saveAccount(linked, false)
    await repository.importBackup(backup, ACCOUNT_B)
    const [copiedOperation] = await repository.pending(ACCOUNT_B)
    await repository.recordFailure(ACCOUNT_B, copiedOperation.id, 'sin red')

    await expect(repository.importBackup(backup, ACCOUNT_B)).resolves.toEqual(linked)

    expect(await repository.pending(ACCOUNT_B)).toEqual([
      { ...copiedOperation, attempts: 1, error: 'sin red' },
    ])
    await driver.close()
  })
})

function driverFor(driver: NodeSqliteDriver): NodeSqliteDriver {
  return driver
}
