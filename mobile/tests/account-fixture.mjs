import initSqlJs from 'sql.js'
import { require as tsRequire } from 'tsx/cjs/api'

const { newLocalState } = tsRequire('../src/original/defaults.ts', import.meta.url)
const SQL = await initSqlJs()

// Test-only setup for an account that authenticated before the browser journey.
// Never expose profile activation hooks in the production app to seed tests.
export async function newTestAccount({ linked = true } = {}) {
  const state = await newLocalState()
  if (linked) {
    state.remoteUserId = state.accountId
    state.email = 'browser-fixture@example.invalid'
  }
  return state
}

export async function installAccountFixture(page, state, { active = true } = {}) {
  const database = new SQL.Database()
  try {
    database.exec(`
      CREATE TABLE original_app_accounts (
        account_id TEXT PRIMARY KEY NOT NULL,
        remote_user_id TEXT UNIQUE,
        state_json TEXT NOT NULL
      );
      CREATE TABLE original_app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `)
    database.run('INSERT INTO original_app_accounts VALUES (?, ?, ?)', [state.accountId, state.remoteUserId, JSON.stringify(state)])
    if (active) database.run('INSERT INTO original_app_settings VALUES (?, ?)', ['active_account', state.accountId])
    const bytes = Array.from(database.export())
    await page.evaluate(bytes => new Promise((resolve, reject) => {
      const request = indexedDB.open('vekira-mobile-sqlite', 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('databases')) request.result.createObjectStore('databases')
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('databases', 'readwrite')
        transaction.objectStore('databases').put(new Uint8Array(bytes), 'vekira-offline')
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => { database.close(); reject(transaction.error) }
      }
    }), bytes)
  } finally { database.close() }
}

export async function storedAccountSnapshot(page) {
  const bytes = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('vekira-mobile-sqlite', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const read = database.transaction('databases').objectStore('databases').get('vekira-offline')
      read.onerror = () => { database.close(); reject(read.error) }
      read.onsuccess = () => { resolve(Array.from(read.result)); database.close() }
    }
  }))
  const database = new SQL.Database(new Uint8Array(bytes))
  try {
    return {
      active: database.exec("SELECT value FROM original_app_settings WHERE key = 'active_account'")[0]?.values[0]?.[0] ?? null,
      accounts: (database.exec('SELECT state_json FROM original_app_accounts ORDER BY account_id')[0]?.values ?? []).map(row => JSON.parse(row[0])),
    }
  } finally { database.close() }
}
