// Canonical database rows deliberately retain every field, including JSON snapshots.
export type AppRow = Record<string, any>

export interface AppState {
  version: 1
  accountId: string
  remoteUserId: string | null
  email: string
  tables: Record<string, AppRow[]>
  revision: number
  remoteRevision: string | null
  lastSyncedRevision: number
}

export interface AppStore {
  read(): Promise<AppState | null>
  list(): Promise<AppState[]>
  create(state: AppState, expectedSessionVersion?: number): Promise<void>
  activate(accountId: string, expectedSessionVersion?: number): Promise<void>
  deactivate(): Promise<void>
  sessionVersion(): number
  getAccountCache(key: string, expectedAccountId: string): Promise<unknown>
  setAccountCache(key: string, value: unknown, expectedSessionVersion: number, expectedAccountId: string): Promise<void>
  mutate<T>(fn: (draft: AppState) => T | Promise<T>): Promise<T>
  importBackup(json: string): Promise<void>
  exportBackup(): Promise<string>
  markSynced(accountId: string, expectedLocalRevision: number, remoteRevision: string): Promise<void>
  replaceFromCloud(state: AppState, expectedLocalRevision: number): Promise<void>
}

export const ORIGINAL_STATE_CHANGED = 'vekira:original-state-changed'
