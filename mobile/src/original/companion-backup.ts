import type { AppState, AppStore } from './types'

type Dependencies = {
  read(): Promise<AppState | null>
  sessionVersion(): number
  hasCompanion(owner: string): Promise<boolean>
  online(): boolean
  synchronize(owner: string, sessionVersion: number, stillCurrent: () => boolean): Promise<{ pending: boolean }>
  updated(owner: string, sessionVersion: number, stillCurrent: () => boolean): void | Promise<void>
}

const BACKUP_ATTEMPT_TIMEOUT = 30_000
const changed = () => new Error('Companion backup session changed')

// Gateway checks cannot cover waits for the catalog or the SQLite queue. Bind
// local operations to this exact login and attempt as well as its account ID.
export function createCompanionBackupStore(store: AppStore, owner: string, version: number, active: () => boolean): AppStore {
  const assertLive = () => { if (!active() || store.sessionVersion() !== version) throw changed() }
  const assertOwner = (state: AppState | null) => {
    assertLive()
    if (state?.accountId !== owner || state.remoteUserId !== owner) throw changed()
  }
  const read = async () => { assertLive(); const value = await store.read(); assertOwner(value); return value }
  return new Proxy(store, { get(target, property) {
    if (property === 'read') return read
    if (property === 'mutate') return async <T,>(fn: (draft: AppState) => T | Promise<T>): Promise<T> => {
      await read()
      assertLive()
      const result = await store.mutate(async draft => {
        // Never call read() inside mutate: both share the same SQLite queue.
        assertOwner(draft)
        const value = await fn(draft)
        assertOwner(draft)
        return value
      })
      assertLive()
      return result
    }
    if (property === 'markSynced') return async (accountId: string, revision: number, remoteRevision: string) => {
      if (accountId !== owner) throw changed()
      await read()
      assertLive()
      await store.markSynced(accountId, revision, remoteRevision)
      assertLive()
    }
    if (property === 'replaceFromCloud') return async (incoming: AppState, revision: number) => {
      assertOwner(incoming)
      await read()
      assertLive()
      await store.replaceFromCloud(incoming, revision)
      assertLive()
    }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

// Only training/identity changes trigger automatic use of the existing private
// backup. Unrelated settings and measurements do not schedule another upload.
function progressFingerprint(state: AppState) {
  const profile = state.tables.profiles?.find(row => row.id === state.accountId)
  const sessions = (state.tables.progress_logs ?? []).filter(row => row.user_id === state.accountId)
    .map(row => [row.id, row.client_session_id, row.completed_at, row.updated_at]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const plans = (state.tables.workout_plans ?? []).filter(row => row.user_id === state.accountId && row.is_active === true)
    .map(row => [row.id, row.days_per_week, row.updated_at]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  return JSON.stringify([state.accountId, sessions, plans, profile?.days_per_week, profile?.timezone, profile?.full_name, profile?.avatar_url])
}

export function createCompanionBackupCoordinator(dependencies: Dependencies) {
  let running: { version: number; owner?: string; cancel(): void } | null = null
  let queued = false, forceQueued = false, attempted = ''
  async function check(force = false): Promise<void> {
    if (running) {
      queued = true; forceQueued ||= force
      const prior = running
      if (prior.version !== dependencies.sessionVersion()) prior.cancel()
      else try {
        const account = await dependencies.read()
        if (running === prior && prior.owner && account?.accountId !== prior.owner) prior.cancel()
      } catch { prior.cancel() }
      return
    }
    const version = dependencies.sessionVersion()
    let active = true, timer: ReturnType<typeof setTimeout> | undefined, key = ''
    let cancel!: () => void
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => { if (active) { active = false; reject(changed()) } }
      timer = setTimeout(() => { if (attempted === key) attempted = ''; cancel() }, BACKUP_ATTEMPT_TIMEOUT)
    })
    const attempt = { version, owner: undefined as string | undefined, cancel }
    running = attempt
    const stillCurrent = () => active && dependencies.sessionVersion() === version && dependencies.online()
    const execute = async () => {
      const state = await dependencies.read()
      if (!stillCurrent() || !state || state.remoteUserId !== state.accountId) return
      attempt.owner = state.accountId
      if (state.revision === state.lastSyncedRevision && state.remoteRevision) return
      if (!await dependencies.hasCompanion(state.accountId) || !stillCurrent()) return
      const current = await dependencies.read()
      if (!stillCurrent() || current?.accountId !== state.accountId || current.remoteUserId !== state.accountId) return
      key = `${version}:${progressFingerprint(current)}`
      if (!force && attempted === key) return
      attempted = key
      const result = await dependencies.synchronize(current.accountId, version, stillCurrent)
      if (!stillCurrent() || (await dependencies.read())?.accountId !== current.accountId || !stillCurrent()) return
      if (!result.pending) await dependencies.updated(current.accountId, version, stillCurrent)
    }
    try {
      await Promise.race([execute(), cancelled])
    } catch {
      // A conflict or disconnected account leaves local data untouched. Retry
      // on the next connectivity/visibility signal or relevant training change.
    } finally {
      active = false; clearTimeout(timer)
      if (running === attempt) running = null
      if (queued) { const retry = forceQueued; queued = false; forceQueued = false; await check(retry) }
    }
  }
  return { check }
}

export async function installCompanionBackupSync(): Promise<() => void> {
  const [{ getAppStore }, { parseCompanionSnapshot }, { loadCompanion }] = await Promise.all([
    import('./storage'), import('@/lib/companions/validation'), import('./companion-actions'),
  ])
  const store = await getAppStore()
  let stopped = false, scheduledForce = false, timer: ReturnType<typeof setTimeout> | undefined
  const coordinator = createCompanionBackupCoordinator({
    read: () => store.read(), sessionVersion: () => store.sessionVersion(),
    online: () => !stopped && navigator.onLine !== false,
    hasCompanion: async owner => {
      const cached = await store.getAccountCache('companion-summary', owner) as { snapshot?: unknown } | null
      return parseCompanionSnapshot(cached?.snapshot, owner)?.status === 'active'
    },
    synchronize: async (owner, version, stillCurrent) => {
      const [{ createConnectedClient }, { createOriginalGateway, createOriginalSynchronizer }] = await Promise.all([import('./bridge-client'), import('./sync')])
      const scopedStore = createCompanionBackupStore(store, owner, version, () => !stopped && stillCurrent())
      const assertCurrent = async () => {
        if (stopped || navigator.onLine === false || !stillCurrent()) throw changed()
        await scopedStore.read()
      }
      await assertCurrent()
      const client = await createConnectedClient(owner)
      await assertCurrent()
      const gateway = createOriginalGateway(client)
      const guard = <Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) => async (...args: Args) => {
        await assertCurrent(); const result = await operation(...args); await assertCurrent(); return result
      }
      return createOriginalSynchronizer(scopedStore, {
        identity: guard(gateway.identity), signIn: async () => { throw new Error('Background sync cannot sign in') },
        downloadWeb: guard(gateway.downloadWeb), readBackup: guard(gateway.readBackup), pushBackup: guard(gateway.pushBackup),
      }).synchronize()
    },
    updated: async (owner, version, stillCurrent) => {
      if (stopped || !stillCurrent() || store.sessionVersion() !== version || (await store.read())?.accountId !== owner || !stillCurrent()) return
      const result = await loadCompanion()
      if (!stopped && stillCurrent() && result.ok) window.dispatchEvent(new CustomEvent('vekira:original-state-changed'))
    },
  })
  const schedule = (force = false) => {
    scheduledForce ||= force
    clearTimeout(timer)
    timer = setTimeout(() => { const retry = scheduledForce; scheduledForce = false; if (!stopped) void coordinator.check(retry) }, 1500)
  }
  const stateChanged = () => schedule()
  const connected = () => schedule(true)
  const visible = () => { if (document.visibilityState === 'visible') schedule(true) }
  window.addEventListener('vekira:original-state-changed', stateChanged)
  window.addEventListener('vekira:companion-confirmed', stateChanged)
  window.addEventListener('online', connected)
  document.addEventListener('visibilitychange', visible)
  schedule()
  return () => {
    stopped = true; clearTimeout(timer)
    window.removeEventListener('vekira:original-state-changed', stateChanged)
    window.removeEventListener('vekira:companion-confirmed', stateChanged)
    window.removeEventListener('online', connected)
    document.removeEventListener('visibilitychange', visible)
  }
}
