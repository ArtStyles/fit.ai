import { createCompanionClient } from '@/lib/companions/client'
import { parseCompanionSnapshot } from '@/lib/companions/validation'
import type { CompanionCode, CompanionCodePreview, CompanionResult, CompanionSnapshot } from '@/lib/companions/types'
import { createConnectedClient } from './bridge-client'
import { getAppStore, type AppStore } from './storage'

const CACHE_KEY = 'companion-summary'
const CACHE_TTL = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT = 8_000
type Client = ReturnType<typeof createCompanionClient>
type Activity = { mutation: number; read: number; mutating: boolean; sessionVersion: number }
const activity = new WeakMap<AppStore, Map<string, Activity>>()
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

class CompanionBoundaryError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}
const connectionRequired = () => new CompanionBoundaryError('connection_required', 'Conecta a internet para actualizar tu compañero de constancia.')
const accountChanged = () => new CompanionBoundaryError('account_changed', 'La cuenta cambió. Vuelve a abrir esta pantalla.')
const staleResult = () => new CompanionBoundaryError('stale_result', 'El estado de tu compañero cambió. Vuelve a actualizarlo.')
const busy = () => new CompanionBoundaryError('busy', 'Espera a que termine el cambio de tu compañero.')
function failure(error: unknown): CompanionResult<never> {
  return error instanceof CompanionBoundaryError ? { ok: false, code: error.code, error: error.message }
    : { ok: false, code: 'unavailable', error: 'No se pudo actualizar tu compañero. Inténtalo de nuevo.' }
}
function accountActivity(store: AppStore, owner: string, sessionVersion: number) {
  let accounts = activity.get(store)
  if (!accounts) { accounts = new Map(); activity.set(store, accounts) }
  let current = accounts.get(owner)
  if (!current || current.sessionVersion !== sessionVersion) {
    current = { mutation: 0, read: 0, mutating: false, sessionVersion }; accounts.set(owner, current)
  }
  return current
}

async function withDeadline<T>(operation: () => Promise<T>, expire: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        expire()
        reject(new CompanionBoundaryError('unavailable', 'La conexión está tardando. Intenta actualizar tu compañero de nuevo.'))
      }, REQUEST_TIMEOUT) }),
    ])
  } finally { clearTimeout(timer) }
}

async function getLocalContext() {
  const store = await getAppStore()
  const sessionVersion = store.sessionVersion()
  const state = await store.read()
  if (!state || state.remoteUserId !== state.accountId) throw connectionRequired()
  const owner = state.accountId
  const assertCurrent = async () => {
    const current = await store.read()
    if (store.sessionVersion() !== sessionVersion || current?.accountId !== owner || current.remoteUserId !== owner) throw accountChanged()
  }
  await assertCurrent()
  return { store, owner, sessionVersion, assertCurrent, activity: accountActivity(store, owner, sessionVersion) }
}
type Context = Awaited<ReturnType<typeof getLocalContext>>

async function getOnlineContext(context: Context, assertCurrent: () => Promise<void>, beforeRequest?: () => Promise<void>): Promise<Client> {
  if (!online()) throw connectionRequired()
  const client = await createConnectedClient(context.owner)
  await assertCurrent()
  return createCompanionClient({
    viewerId: context.owner,
    rpc: async (name, args) => {
      await assertCurrent()
      if (!online()) throw connectionRequired()
      await beforeRequest?.()
      await assertCurrent()
      return await client.rpc(name, args)
    },
  })
}

async function saveSnapshot(context: Context, snapshot: CompanionSnapshot, assertCurrent: () => Promise<void>) {
  await assertCurrent()
  const valid = parseCompanionSnapshot(snapshot, context.owner)
  if (!valid) throw new CompanionBoundaryError('unavailable', 'No se pudo comprobar el resumen de tu compañero.')
  await context.store.setAccountCache(CACHE_KEY, { version: 1, snapshot: { ...valid, offline: false } }, context.sessionVersion, context.owner)
  await assertCurrent()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vekira:companion-confirmed'))
}

export async function loadCompanion(): Promise<CompanionResult<CompanionSnapshot>> {
  try {
    const context = await getLocalContext()
    const current = context.activity
    if (current.mutating) throw busy()
    const read = ++current.read
    const mutation = current.mutation
    let expired = false
    const assertCurrent = async () => {
      await context.assertCurrent()
      if (expired || read !== current.read || mutation !== current.mutation || current.mutating) throw staleResult()
    }
    if (!online()) {
      const cached = await context.store.getAccountCache(CACHE_KEY, context.owner) as { version?: unknown; snapshot?: unknown } | null
      await assertCurrent()
      const value = cached?.version === 1 ? parseCompanionSnapshot(cached.snapshot, context.owner) : null
      const age = value ? Date.now() - Date.parse(value.fetchedAt) : NaN
      if (!value || !Number.isFinite(age) || age < 0 || age >= CACHE_TTL) throw connectionRequired()
      return { ok: true, value: { ...value, offline: true } }
    }
    const result = await withDeadline(async () => {
      const client = await getOnlineContext(context, assertCurrent)
      return client.loadCompanion()
    }, () => { expired = true })
    await assertCurrent()
    if (result.ok) await saveSnapshot(context, result.value, assertCurrent)
    return result
  } catch (error) { return failure(error) }
}

async function readOnline<T>(operation: (client: Client) => Promise<CompanionResult<T>>): Promise<CompanionResult<T>> {
  try {
    const context = await getLocalContext()
    const mutation = context.activity.mutation
    let expired = false
    const assertCurrent = async () => {
      await context.assertCurrent()
      if (expired || context.activity.mutation !== mutation) throw staleResult()
    }
    const result = await withDeadline(async () => {
      const client = await getOnlineContext(context, assertCurrent)
      return operation(client)
    }, () => { expired = true })
    await assertCurrent()
    return result
  } catch (error) { return failure(error) }
}

async function changeCompanion(operation: (client: Client) => Promise<CompanionResult<CompanionSnapshot>>): Promise<CompanionResult<CompanionSnapshot>> {
  let current: Activity | undefined
  try {
    const context = await getLocalContext()
    if (!online()) throw connectionRequired()
    if (context.activity.mutating) throw busy()
    current = context.activity
    current.mutating = true
    const mutation = ++current.mutation
    let expired = false
    const assertCurrent = async () => {
      await context.assertCurrent()
      if (expired || context.activity.mutation !== mutation) throw staleResult()
    }
    const result = await withDeadline(async () => {
      const client = await getOnlineContext(context, assertCurrent, async () => {
        // Once sent, a lost response cannot prove the old relationship still exists.
        await context.store.setAccountCache(CACHE_KEY, null, context.sessionVersion, context.owner)
      })
      return operation(client)
    }, () => { expired = true })
    await assertCurrent()
    if (result.ok) await saveSnapshot(context, result.value, assertCurrent)
    return result
  } catch (error) { return failure(error) }
  finally { if (current) current.mutating = false }
}

export async function getCompanionCode(): Promise<CompanionResult<CompanionCode>> { return readOnline(client => client.getCompanionCode()) }
export async function previewCompanionCode(code: string): Promise<CompanionResult<CompanionCodePreview>> { return readOnline(client => client.previewCompanionCode(code)) }
export async function sendCompanionInvitation(code: string): Promise<CompanionResult<CompanionSnapshot>> { return changeCompanion(client => client.sendCompanionInvitation(code)) }
export async function respondCompanionInvitation(id: string, accept: boolean): Promise<CompanionResult<CompanionSnapshot>> { return changeCompanion(client => client.respondCompanionInvitation(id, accept)) }
export async function cancelCompanionInvitation(id: string): Promise<CompanionResult<CompanionSnapshot>> { return changeCompanion(client => client.cancelCompanionInvitation(id)) }
export async function leaveCompanion(id: string): Promise<CompanionResult<CompanionSnapshot>> { return changeCompanion(client => client.leaveCompanion(id)) }
export async function sendCompanionGreeting(id: string, message: string, requestId: string): Promise<CompanionResult<CompanionSnapshot>> { return changeCompanion(client => client.sendCompanionGreeting(id, message, requestId)) }
