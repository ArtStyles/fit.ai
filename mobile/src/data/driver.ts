export type SqliteValue = string | number | Uint8Array | null
export type SqliteParameters = SqliteValue[]
export type SqliteRow = Record<string, SqliteValue>

export interface MobileSqliteDriver {
  execute(sql: string, parameters?: SqliteParameters): Promise<{ changes: number }>
  query<T extends SqliteRow = SqliteRow>(sql: string, parameters?: SqliteParameters): Promise<T[]>
  transaction<T>(work: () => Promise<T>): Promise<T>
  close?(): Promise<void>
}
