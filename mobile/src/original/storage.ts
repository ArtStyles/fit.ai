import { Capacitor } from '@capacitor/core'
import { openBrowserSqliteDriver } from '../data/browser-driver'
import { openNativeSqliteDriver } from '../data/native-driver'
import type { MobileSqliteDriver, SqliteRow } from '../data/driver'
import { ORIGINAL_STATE_CHANGED, type AppState, type AppStore } from './types'

export type { AppState, AppStore, AppRow } from './types'

const FORMAT = 'vekira-original-app-backup'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const OWNER_TABLES = new Set(['workout_plans', 'workouts', 'progress_logs', 'measurements', 'session_authorizations', 'session_drafts', 'session_results', 'plan_generation_requests', 'notifications', 'user_preferences'])
const PARENTS: Record<string, [string, string]> = {
  workout_exercises: ['workout_id', 'workouts'],
  exercise_logs: ['progress_log_id', 'progress_logs'],
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function validateAppState(input: unknown): AppState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid application state')
  const state = clone(input) as AppState
  if (state.version !== 1 || typeof state.accountId !== 'string' || !state.accountId.trim()
    || typeof state.email !== 'string' || (state.remoteUserId !== null && state.remoteUserId !== state.accountId)
    || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !Number.isSafeInteger(state.lastSyncedRevision) || state.lastSyncedRevision < 0 || state.lastSyncedRevision > state.revision
    || (state.remoteRevision !== null && typeof state.remoteRevision !== 'string')
    || !state.tables || typeof state.tables !== 'object' || Array.isArray(state.tables)) {
    throw new Error('Invalid application state identity or version')
  }
  for (const [table, rows] of Object.entries(state.tables)) {
    if (!/^[a-z][a-z0-9_]*$/.test(table) || !Array.isArray(rows)) throw new Error(`Invalid application table: ${table}`)
    const ids = new Set<unknown>()
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Invalid ${table} row`)
      if (row.id !== undefined && row.id !== null) {
        if (ids.has(row.id)) throw new Error(`Duplicate ${table} row ID`)
        ids.add(row.id)
      }
      if (table === 'profiles' && row.id !== state.accountId) throw new Error('Profile owner mismatch')
      if (OWNER_TABLES.has(table) && row.user_id !== state.accountId) throw new Error(`${table} owner mismatch`)
      if (row.user_id !== undefined && !['exercises', 'public_profiles', 'active_trainer_directory', 'trainer_profiles', 'trainer_services'].includes(table) && row.user_id !== state.accountId) {
        throw new Error(`${table} owner mismatch`)
      }
      if (PARENTS[table]) {
        const [key, parent] = PARENTS[table]
        if (!(state.tables[parent] ?? []).some(item => item.id === row[key])) throw new Error(`${table} parent is unavailable`)
      }
    }
  }
  return state
}

function emit(accountId: string | null) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ORIGINAL_STATE_CHANGED, { detail: { accountId } }))
}

type StoredState = SqliteRow & { account_id: string; remote_user_id: string | null; state_json: string }

export async function createAppStore(driver: MobileSqliteDriver): Promise<AppStore> {
  let tail: Promise<unknown> = Promise.resolve()
  let sessionVersion = 0
  function requireCurrentSession(expected: number | undefined) {
    if (expected !== undefined && expected !== sessionVersion) {
      throw new Error('La sesión se cerró durante el acceso. Vuelve a iniciar sesión para continuar.')
    }
  }
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const current = tail.then(fn)
    tail = current.catch(() => undefined)
    return current
  }
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS original_app_accounts (
      account_id TEXT PRIMARY KEY NOT NULL,
      remote_user_id TEXT UNIQUE,
      state_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS original_app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `)
  const initiallySelected = await driver.query<{ value: string }>('SELECT value FROM original_app_settings WHERE key = ?', ['active_account'])
  let selectedAccountId: string | null = initiallySelected[0]?.value ?? null
  const readAccount = async (id: string) => {
    const rows = await driver.query<StoredState>('SELECT account_id, remote_user_id, state_json FROM original_app_accounts WHERE account_id = ?', [id])
    return rows.length ? validateAppState(JSON.parse(rows[0].state_json)) : null
  }
  const active = async () => {
    const selected = await driver.query<{ value: string }>('SELECT value FROM original_app_settings WHERE key = ?', ['active_account'])
    return selected[0] ? readAccount(selected[0].value) : null
  }
  const select = async (id: string) => {
    await driver.execute('INSERT INTO original_app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['active_account', id])
  }
  const persist = async (state: AppState) => {
    await driver.execute('INSERT INTO original_app_accounts (account_id, remote_user_id, state_json) VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET remote_user_id = excluded.remote_user_id, state_json = excluded.state_json', [state.accountId, state.remoteUserId, JSON.stringify(state)])
  }

  return {
    sessionVersion: () => sessionVersion,
    getAccountCache: (key, expectedAccountId) => {
      const invokedAccountId = selectedAccountId
      return serial(async () => {
        if (invokedAccountId !== expectedAccountId || (await active())?.accountId !== expectedAccountId) return null
        const rows = await driver.query<{ value: string }>('SELECT value FROM original_app_settings WHERE key = ?', [`cache:${invokedAccountId}:${key}`])
        try { return rows.length ? JSON.parse(rows[0].value) : null } catch { return null }
      })
    },
    setAccountCache: (key, value, expectedSessionVersion, expectedAccountId) => {
      const invokedAccountId = selectedAccountId
      return serial(async () => {
        requireCurrentSession(expectedSessionVersion)
        if (invokedAccountId !== expectedAccountId || (await active())?.accountId !== expectedAccountId) throw new Error('No active application account')
        await driver.transaction(async () => {
          await driver.execute('INSERT INTO original_app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [`cache:${invokedAccountId}:${key}`, JSON.stringify(value)])
          requireCurrentSession(expectedSessionVersion)
        })
        // Read-only presentation snapshots do not dirty user data or refresh the page.
      })
    },
    read: () => serial(active),
    list: () => serial(async () => {
      const rows = await driver.query<StoredState>('SELECT account_id, remote_user_id, state_json FROM original_app_accounts ORDER BY rowid')
      return rows.map(row => validateAppState(JSON.parse(row.state_json)))
    }),
    create: (input, expectedSessionVersion) => serial(async () => {
      requireCurrentSession(expectedSessionVersion)
      const state = validateAppState(input)
      await driver.transaction(async () => {
        if (await readAccount(state.accountId)) throw new Error('Application account already exists')
        await persist(state)
        await select(state.accountId)
      })
      selectedAccountId = state.accountId
      emit(state.accountId)
    }),
    activate: (accountId, expectedSessionVersion) => serial(async () => {
      requireCurrentSession(expectedSessionVersion)
      await driver.transaction(async () => {
        if (!await readAccount(accountId)) throw new Error('Application account not found')
        await select(accountId)
      })
      selectedAccountId = accountId
      emit(accountId)
    }),
    deactivate: () => {
      // Invalidate pending authentication before it can queue a late activation.
      sessionVersion++
      return serial(async () => {
        await driver.transaction(async () => {
          await driver.execute('DELETE FROM original_app_settings WHERE key = ?', ['active_account'])
        })
        selectedAccountId = null
        emit(null)
      })
    },
    mutate: fn => {
      const invokedAccountId = selectedAccountId
      return serial(async () => {
      let accountId = ''
      let changed = false
      const result = await driver.transaction(async () => {
        const before = await active()
        if (!before) throw new Error('No active application account')
        if (before.accountId !== invokedAccountId) throw new Error('Application account changed before the mutation started')
        accountId = before.accountId
        const draft = clone(before)
        const value = await fn(draft)
        if (draft.accountId !== before.accountId || draft.remoteUserId !== before.remoteUserId) throw new Error('Application account identity cannot change')
        draft.revision = before.revision
        if (stable(validateAppState(draft)) === stable(before)) return value
        draft.revision = before.revision + 1
        await persist(validateAppState(draft))
        changed = true
        return value
      })
      if (changed) emit(accountId)
      return result
      })
    },
    exportBackup: () => serial(async () => {
      const state = await active()
      if (!state) throw new Error('No active application account')
      return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), state })
    }),
    importBackup: json => {
      const invokedAccountId = selectedAccountId
      const expectedSessionVersion = sessionVersion
      return serial(async () => {
        requireCurrentSession(expectedSessionVersion)
        const current = await active()
        if (!invokedAccountId || current?.accountId !== invokedAccountId) {
          throw new Error('Inicia sesión para importar un respaldo.')
        }
        if (new TextEncoder().encode(json).byteLength > MAX_BACKUP_BYTES) throw new Error('Application backup is too large')
        const parsed = JSON.parse(json) as { format?: string; version?: number; state?: unknown }
        if (parsed.format !== FORMAT || parsed.version !== 1) throw new Error('Unsupported application backup format')
        const incoming = validateAppState(parsed.state)
        await driver.transaction(async () => {
          const existing = await readAccount(incoming.accountId)
          if (existing) {
            // Never replay stale rows into an account: missing rows may represent intentional deletion.
            if (existing.remoteUserId !== incoming.remoteUserId || stable(existing.tables) !== stable(incoming.tables) || existing.email !== incoming.email) {
              throw new Error('Backup conflict: this account has different local data. Existing data was preserved.')
            }
          } else {
            // A copied backup has not been verified against the current remote server.
            await persist({ ...incoming, lastSyncedRevision: 0, remoteRevision: null })
          }
          await select(incoming.accountId)
          // A logout during a SQLite operation must roll back the whole import.
          requireCurrentSession(expectedSessionVersion)
        })
        selectedAccountId = incoming.accountId
        emit(incoming.accountId)
      })
    },
    markSynced: (accountId, expectedLocalRevision, remoteRevision) => serial(async () => {
      await driver.transaction(async () => {
        const state = await readAccount(accountId)
        if (!state || !Number.isSafeInteger(expectedLocalRevision) || expectedLocalRevision < 0 || expectedLocalRevision > state.revision) throw new Error('Invalid synchronization revision')
        if (expectedLocalRevision < state.lastSyncedRevision) throw new Error('Stale synchronization response')
        if (!remoteRevision) throw new Error('Missing remote synchronization revision')
        // Newer local changes remain dirty; acknowledge only the exact uploaded revision.
        await persist({ ...state, remoteRevision, lastSyncedRevision: expectedLocalRevision })
      })
      emit(accountId)
    }),
    replaceFromCloud: (input, expectedLocalRevision) => serial(async () => {
      const incoming = validateAppState(input)
      await driver.transaction(async () => {
        const current = await readAccount(incoming.accountId)
        if (!current || current.remoteUserId === null || incoming.remoteUserId !== current.remoteUserId) throw new Error('Cloud restore owner mismatch')
        if (current.revision !== expectedLocalRevision || current.lastSyncedRevision !== current.revision) throw new Error('Cloud restore conflict: local changes are pending')
        if (!incoming.remoteRevision) throw new Error('Missing cloud revision')
        await persist({ ...incoming, revision: current.revision + 1, lastSyncedRevision: current.revision + 1 })
      })
      emit(incoming.accountId)
    }),
  }
}

let singleton: Promise<AppStore> | null = null
export function setAppStoreForTests(store: AppStore | null): void { singleton = store ? Promise.resolve(store) : null }
export async function getAppStore(): Promise<AppStore> {
  singleton ??= (async () => createAppStore(Capacitor.isNativePlatform()
    ? await openNativeSqliteDriver() : await openBrowserSqliteDriver()))()
  try { return await singleton } catch (error) { singleton = null; throw error }
}
