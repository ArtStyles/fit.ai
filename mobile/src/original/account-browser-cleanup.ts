export type AccountBrowserStorage = Pick<Storage, 'key' | 'length' | 'getItem' | 'removeItem'>

/** Called only after acknowledged remote deletion and guarded SQLite removal.
 * Legacy records without a provable owner are preserved for other profiles.
 */
export function clearDeletedAccountBrowserData(owner: string, workouts: string[], storage: AccountBrowserStorage): void {
  const scoped = encodeURIComponent(owner), workoutIds = new Set(workouts)
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => !!key)
  for (const key of keys) {
    let owned = key.startsWith(`fitai_session_v2_${scoped}_`) || key === `fitai_active_session_v2_${scoped}`
      || key === `fitai:workout-reminders:${owner}` || key.startsWith(`vekira-rest:${owner}:`)
    if (!owned && (key === 'fitai_active_session' || (key.startsWith('fitai_session_') && !key.startsWith('fitai_session_v2_')))) {
      try {
        const value = JSON.parse(storage.getItem(key) ?? 'null')
        owned = !!value && (value.userId === owner || (!value.userId && workoutIds.has(value.workoutId)))
      } catch { /* An unreadable legacy value cannot establish ownership. */ }
    }
    if (owned) storage.removeItem(key)
  }
}
