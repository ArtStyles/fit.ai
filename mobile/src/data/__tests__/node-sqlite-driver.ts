import { DatabaseSync } from 'node:sqlite'

import type {
  MobileSqliteDriver,
  SqliteParameters,
  SqliteRow,
  SqliteValue,
} from '../driver'

export class NodeSqliteDriver implements MobileSqliteDriver {
  readonly database: DatabaseSync
  private failCommit = false

  constructor(path: string) {
    this.database = new DatabaseSync(path)
    this.database.exec('PRAGMA foreign_keys = ON')
  }

  async execute(sql: string, parameters: SqliteParameters = []): Promise<{ changes: number }> {
    if (parameters.length === 0 && sql.includes(';')) {
      this.database.exec(sql)
      return { changes: 0 }
    }

    const result = this.database.prepare(sql).run(...parameters)
    return { changes: Number(result.changes) }
  }

  async query<T extends SqliteRow = SqliteRow>(
    sql: string,
    parameters: SqliteParameters = [],
  ): Promise<T[]> {
    return this.database.prepare(sql).all(...parameters) as T[]
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = await work()
      if (this.failCommit) {
        this.failCommit = false
        throw new Error('injected commit failure')
      }
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  failNextCommit(): void {
    this.failCommit = true
  }

  async close(): Promise<void> {
    this.database.close()
  }
}

export const sqliteValue = (value: unknown): SqliteValue => value as SqliteValue
