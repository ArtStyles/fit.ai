import initSqlJs from 'sql.js'

import type {
  MobileSqliteDriver,
  SqliteParameters,
  SqliteRow,
} from './driver'

const STORE_DATABASE = 'vekira-mobile-sqlite'
const STORE_NAME = 'databases'
const STORE_VERSION = 1
const DATABASE_KEY = 'vekira-offline'

export async function openBrowserSqliteDriver(): Promise<MobileSqliteDriver> {
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
  const bytes = await readDatabase()
  let database = bytes ? new SQL.Database(bytes) : new SQL.Database()
  database.run('PRAGMA foreign_keys = ON')
  let inTransaction = false

  const persist = async (): Promise<void> => {
    await writeDatabase(database.export())
  }

  return {
    async execute(sql: string, parameters: SqliteParameters = []) {
      if (parameters.length === 0 && sql.includes(';')) database.exec(sql)
      else database.run(sql, parameters)
      const changes = database.getRowsModified()
      if (!inTransaction) await persist()
      return { changes }
    },

    async query<T extends SqliteRow = SqliteRow>(
      sql: string,
      parameters: SqliteParameters = [],
    ): Promise<T[]> {
      const statement = database.prepare(sql, parameters)
      try {
        const rows: T[] = []
        while (statement.step()) rows.push(statement.getAsObject() as T)
        return rows
      } finally {
        statement.free()
      }
    },

    async transaction<T>(work: () => Promise<T>): Promise<T> {
      if (inTransaction) throw new Error('Nested mobile SQLite transactions are not supported')
      const snapshot = database.export()
      database.run('BEGIN IMMEDIATE')
      inTransaction = true
      try {
        const result = await work()
        database.run('COMMIT')
        inTransaction = false
        try {
          await persist()
        } catch (error) {
          database.close()
          database = new SQL.Database(snapshot)
          database.run('PRAGMA foreign_keys = ON')
          throw error
        }
        return result
      } catch (error) {
        if (inTransaction) {
          try {
            database.run('ROLLBACK')
          } finally {
            inTransaction = false
          }
        }
        throw error
      }
    },

    async close(): Promise<void> {
      if (inTransaction) throw new Error('Cannot close mobile SQLite during a transaction')
      await persist()
      database.close()
    },
  }
}

async function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORE_DATABASE, STORE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open mobile IndexedDB'))
    request.onblocked = () => reject(new Error('Mobile IndexedDB upgrade is blocked'))
  })
}

async function readDatabase(): Promise<Uint8Array | null> {
  const store = await openStore()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = store.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(DATABASE_KEY)
      request.onsuccess = () => {
        const value = request.result as Uint8Array | ArrayBuffer | undefined
        if (value === undefined) resolve(null)
        else if (value instanceof Uint8Array) resolve(value)
        else resolve(new Uint8Array(value))
      }
      request.onerror = () => reject(request.error ?? new Error('Could not read mobile database'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Mobile database read aborted'))
    })
  } finally {
    store.close()
  }
}

async function writeDatabase(bytes: Uint8Array): Promise<void> {
  const store = await openStore()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = store.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(bytes, DATABASE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not persist mobile database'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Mobile database persistence aborted'))
    })
  } finally {
    store.close()
  }
}
