import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests } from './storage'
import { newLocalState } from './defaults'
import { commitUsername } from '@/components/onboarding/profileUsername'
import { checkUsernameAvailable, updateUsername } from './auxiliary-actions'

vi.mock('./bridge-client', () => ({ remote: null, createConnectedClient: vi.fn() }))
vi.mock('./router', () => ({ navigate: vi.fn(), refresh: vi.fn() }))
let driver: NodeSqliteDriver | undefined
beforeEach(async () => {
  driver = new NodeSqliteDriver(':memory:')
  const store = await createAppStore(driver)
  await store.create(await newLocalState())
  setAppStoreForTests(store)
})
afterEach(async () => { setAppStoreForTests(null); await driver?.close(); driver = undefined })

it('advances the original onboarding username step only after the local commit succeeds', async () => {
  const { getAppStore } = await import('./storage')
  const store = await getAppStore()
  const onSuccess = vi.fn()
  expect(await commitUsername({ raw: 'Prueba_Original', update: updateUsername, getCurrentRaw: () => 'Prueba_Original', onSuccess })).toEqual({ status: 'saved', normalized: 'prueba_original' })
  expect(onSuccess).toHaveBeenCalledOnce()
  expect((await store.read())?.tables.profiles[0].username).toBe('prueba_original')
})

it('keeps the original username validation rules for local profiles', async () => {
  expect(await checkUsernameAvailable('123usuario')).toMatchObject({ available: false })
  expect(await updateUsername('too_long_name_for_original_profile')).toMatchObject({ ok: false })
})
