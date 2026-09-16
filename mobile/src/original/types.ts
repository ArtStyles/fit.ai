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

export interface BackupCounts {
  plans: number
  workouts: number
  sessions: number
  sets: number
  measurements: number
  other: number
  total: number
}

export interface BackupRestorePreview {
  token: string
  accountId: string
  email: string
  source: 'file' | 'recovery'
  exportedAt: string | null
  current: BackupCounts
  incoming: BackupCounts
}

export interface BackupRecoverySummary {
  accountId: string
  savedAt: string
  counts: BackupCounts
}

export interface AppStore {
  read(): Promise<AppState | null>
  list(): Promise<AppState[]>
  create(state: AppState, expectedSessionVersion?: number): Promise<void>
  activate(accountId: string, expectedSessionVersion?: number): Promise<void>
  deactivate(): Promise<void>
  removeAccount(expectedAccountId: string, expectedSessionVersion: number): Promise<void>
  sessionVersion(): number
  getAccountCache(key: string, expectedAccountId: string): Promise<unknown>
  setAccountCache(key: string, value: unknown, expectedSessionVersion: number, expectedAccountId: string): Promise<void>
  mutate<T>(fn: (draft: AppState) => T | Promise<T>): Promise<T>
  importBackup(json: string): Promise<void>
  exportBackup(): Promise<string>
  previewBackupRestore(json: string): Promise<BackupRestorePreview>
  previewRecoveryRestore(): Promise<BackupRestorePreview>
  cancelBackupRestore(token: string): void
  restoreBackup(token: string, confirmed: boolean): Promise<void>
  readBackupRecovery(): Promise<BackupRecoverySummary | null>
  exportRecoveryBackup(): Promise<string>
  markSynced(accountId: string, expectedLocalRevision: number, remoteRevision: string): Promise<void>
  replaceFromCloud(state: AppState, expectedLocalRevision: number): Promise<void>
}

export const ORIGINAL_STATE_CHANGED = 'vekira:original-state-changed'
