import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  connections: new Map<string, { database: DatabaseSync; open: boolean }>(),
  failNextOpen: false,
}))

vi.mock('@capacitor-community/sqlite', async importOriginal => {
  const original = await importOriginal<typeof import('@capacitor-community/sqlite')>()
  function connection(database: string) {
    const result = native.connections.get(database)
    if (!result) throw new Error(`Query: No available connection for database ${database}`)
    return result
  }
  return { ...original, CapacitorSQLite: {
    async checkConnectionsConsistency({ dbNames }: { dbNames: string[] }) {
      // Android removes native connections missing from this JS manager's registry.
      if (!dbNames.length) {
        for (const entry of native.connections.values()) entry.database.close()
        native.connections.clear()
        return { result: false }
      }
      return { result: dbNames.every(name => native.connections.has(name)) }
    },
    async createConnection({ database }: { database: string }) {
      if (native.connections.has(database)) throw new Error('Connection already exists')
      native.connections.set(database, { database: new DatabaseSync(':memory:'), open: false })
    },
    async isDBOpen({ database }: { database: string }) {
      return { result: connection(database).open }
    },
    async open({ database }: { database: string }) {
      if (native.failNextOpen) { native.failNextOpen = false; throw new Error('Temporary native open failure') }
      connection(database).open = true
    },
    async close({ database }: { database: string }) { connection(database).open = false },
    async execute({ database, statements }: { database: string; statements: string }) {
      connection(database).database.exec(statements)
      return { changes: { changes: 0 } }
    },
    async query({ database, statement, values = [] }: { database: string; statement: string; values?: string[] }) {
      const entry = connection(database)
      if (!entry.open) throw new Error('Database is closed')
      return { values: entry.database.prepare(statement).all(...values) }
    },
  } }
})

beforeEach(() => { vi.resetModules(); native.failNextOpen = false })
afterEach(() => {
  for (const entry of native.connections.values()) entry.database.close()
  native.connections.clear()
})

describe('shared native database lifecycle', () => {
  it('keeps stored data readable while previous-profile detection requests the database again', async () => {
    const { openNativeSqliteDriver } = await import('../native-driver')
    const storeDriver = await openNativeSqliteDriver()
    await storeDriver.execute("CREATE TABLE saved_profile (name TEXT); INSERT INTO saved_profile VALUES ('Ana');")

    const [recoveryOpening, currentRead] = await Promise.allSettled([
      openNativeSqliteDriver(),
      storeDriver.query('SELECT name FROM saved_profile'),
    ])
    expect(currentRead).toEqual({ status: 'fulfilled', value: [{ name: 'Ana' }] })
    if (recoveryOpening.status === 'rejected') throw recoveryOpening.reason
    const recoveryDriver = recoveryOpening.value
    await expect(recoveryDriver.query('SELECT name FROM saved_profile')).resolves.toEqual([{ name: 'Ana' }])
  })

  it('lets simultaneous consumers finish opening and read the same database', async () => {
    const { openNativeSqliteDriver } = await import('../native-driver')
    const [first, second] = await Promise.all([openNativeSqliteDriver(), openNativeSqliteDriver()])
    await first.execute("CREATE TABLE saved_profile (name TEXT); INSERT INTO saved_profile VALUES ('Bea');")
    await expect(second.query('SELECT name FROM saved_profile')).resolves.toEqual([{ name: 'Bea' }])
  })

  it('permits a later open after a transient initialization failure', async () => {
    const { openNativeSqliteDriver } = await import('../native-driver')
    native.failNextOpen = true
    await expect(openNativeSqliteDriver()).rejects.toThrow('Temporary native open failure')
    const recovered = await openNativeSqliteDriver()
    await expect(recovered.query('PRAGMA foreign_keys')).resolves.toEqual([{ foreign_keys: 1 }])
  })
})
