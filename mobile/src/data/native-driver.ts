import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite'

import type {
  MobileSqliteDriver,
  SqliteParameters,
  SqliteRow,
} from './driver'

const DATABASE_NAME = 'vekira_offline'
const sqlite = new SQLiteConnection(CapacitorSQLite)
let activeDriver: Promise<MobileSqliteDriver> | null = null

export function openNativeSqliteDriver(): Promise<MobileSqliteDriver> {
  // A fresh SQLiteConnection has an empty registry. Its consistency check
  // closes Android's existing connections, including the active app store.
  // Share both the registry and pending initialization across all readers.
  activeDriver ??= initializeNativeSqliteDriver().catch(error => {
    activeDriver = null
    throw error
  })
  return activeDriver
}

async function initializeNativeSqliteDriver(): Promise<MobileSqliteDriver> {
  await sqlite.checkConnectionsConsistency()
  const existing = await sqlite.isConnection(DATABASE_NAME, false)
  const connection = existing.result
    ? await sqlite.retrieveConnection(DATABASE_NAME, false)
    : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false)
  const open = await connection.isDBOpen()
  if (!open.result) await connection.open()
  await connection.execute('PRAGMA foreign_keys = ON;', false)
  const foreignKeys = await connection.query('PRAGMA foreign_keys')
  if (Number(foreignKeys.values?.[0]?.foreign_keys) !== 1) {
    throw new Error('Native SQLite foreign key enforcement is unavailable')
  }
  return capacitorDriver(connection)
}

function capacitorDriver(connection: SQLiteDBConnection): MobileSqliteDriver {
  return {
    async execute(sql: string, parameters: SqliteParameters = []) {
      const result = parameters.length === 0 && sql.includes(';')
        ? await connection.execute(sql, false)
        : await connection.run(sql, parameters, false)
      return { changes: result.changes?.changes ?? 0 }
    },

    async query<T extends SqliteRow = SqliteRow>(
      sql: string,
      parameters: SqliteParameters = [],
    ): Promise<T[]> {
      const result = await connection.query(sql, parameters)
      return (result.values ?? []) as T[]
    },

    async transaction<T>(work: () => Promise<T>): Promise<T> {
      await connection.beginTransaction()
      try {
        const result = await work()
        await connection.commitTransaction()
        return result
      } catch (error) {
        const active = await connection.isTransactionActive().catch(() => ({ result: false }))
        if (active.result) await connection.rollbackTransaction().catch(() => undefined)
        throw error
      }
    },

    async close(): Promise<void> {
      await connection.close()
      activeDriver = null
    },
  }
}
