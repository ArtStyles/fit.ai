import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createMobileRepository } from '../data/repository'
import { createAppStore } from './storage'
import { newLocalState } from './defaults'
import { createPersonalPlan, createWorkoutSession, defaultTrainingProfile } from '../domain/training'
import { recoverPreviousLocalProfiles } from './previousLocalProfiles'
import type { MobileAccount } from '../domain/types'

const drivers: NodeSqliteDriver[] = []
beforeEach(() => { const values = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }) })
afterEach(async () => { vi.unstubAllGlobals(); for (const driver of drivers.splice(0)) await driver.close() })
async function fixture() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const old = await createMobileRepository(driver)
  const account: MobileAccount = { id: crypto.randomUUID(), remoteUserId: crypto.randomUUID(), name: 'Ana', profile: { ...defaultTrainingProfile(), readiness: { ...defaultTrainingProfile().readiness, status: 'cleared' } }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  await old.saveAccount(account)
  const plan = createPersonalPlan(account); await old.savePlan(plan); await old.setActivePlan(account.id, plan.id)
  const session = createWorkoutSession(account.id, plan, plan.workouts[0]); session.finishedAt = new Date().toISOString(); session.rpe = 7; session.notes = 'Nota guardada en el APK anterior'; session.exercises[0].sets[0] = { ...session.exercises[0].sets[0], completed: true, weightKg: 30, reps: 8 }
  await old.saveSession(session)
  await old.saveMeasurement({ id: crypto.randomUUID(), accountId: account.id, date: '2026-09-08', weightKg: 78, waistCm: 82, notes: 'Medida anterior', updatedAt: new Date().toISOString(), deletedAt: null })
  const store = await createAppStore(driver)
  return { driver, old, account, plan, session, store }
}
describe('additive recovery from the rejected reduced APK', () => {
  it('adds an isolated local profile with real history and metrics, preserving every old payload and the current profile', async () => {
    const { driver, old, account, store } = await fixture()
    const existing = await newLocalState(); await store.create(existing)
    const before = await old.exportBackup(account.id)
    expect(await recoverPreviousLocalProfiles({ driver, store })).toEqual({ recovered: 1, skipped: 0 })
    expect(await store.read()).toEqual(existing)
    const recovered = (await store.list()).find(row => row.accountId !== existing.accountId)!
    expect(recovered.remoteUserId).toBeNull()
    expect(recovered.tables.profiles[0].full_name).toContain('Ana')
    expect(recovered.tables.workout_plans[0].source_type).toBe('imported')
    expect(recovered.tables.progress_logs).toHaveLength(1)
    expect(recovered.tables.exercise_logs[0]).toMatchObject({ reps_completed: [8], weights_kg: [30], rpe_values: [null] })
    expect(recovered.tables.progress_logs[0]).toMatchObject({ mood_rating: null, mobile_imported_session_rpe: 7 })
    expect(recovered.tables.measurements[0]).toMatchObject({ weight_kg: 78, waist_cm: 82, chest_cm: null, body_fat_percentage: null, muscle_mass_kg: null })
    expect(recovered.tables.mobile_previous_source[0].account).toEqual(account)
    const beforeJson = JSON.parse(before); const afterJson = JSON.parse(await old.exportBackup(account.id)); delete beforeJson.exportedAt; delete afterJson.exportedAt
    expect(afterJson).toEqual(beforeJson)
    expect(await recoverPreviousLocalProfiles({ driver, store })).toEqual({ recovered: 0, skipped: 1 })
    expect(await store.list()).toHaveLength(2)
  })
  it('never turns incomplete trainer metadata into executable or editable personal prescriptions', async () => {
    const { driver, old, account, plan, store } = await fixture()
    await old.savePlan({ ...plan, id: crypto.randomUUID(), source: 'trainer', name: 'Plan del entrenador' })
    await recoverPreviousLocalProfiles({ driver, store })
    const recovered = (await store.read())!
    expect(recovered.tables.workout_plans.every(row => row.name !== 'Plan del entrenador')).toBe(true)
    expect(recovered.tables.mobile_previous_source[0].plans.some((row: { source: string }) => row.source === 'trainer')).toBe(true)
    expect((await old.loadData(account.id)).plans).toHaveLength(2)
  })
  it('rolls back destination failures and leaves the previous APK database readable', async () => {
    const { driver, old, account, store } = await fixture()
    driver.failNextCommit()
    await expect(recoverPreviousLocalProfiles({ driver, store })).rejects.toThrow(/commit/i)
    expect(await store.list()).toHaveLength(0)
    expect((await old.loadData(account.id)).sessions).toHaveLength(1)
    expect(await recoverPreviousLocalProfiles({ driver, store })).toEqual({ recovered: 1, skipped: 0 })
  })
})
