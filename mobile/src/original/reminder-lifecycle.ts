import { type WorkoutReminderPreference, reminderTime } from '@/lib/native/workoutReminderPreferences'
import type { AppLanguage } from '@/lib/i18n'
import type { ReminderTime } from '@/lib/native/notifications'

export type ReminderAccount = { accountId: string; days: number[]; language: AppLanguage }
export function createReminderReconciler(deps: {
  readPreference(accountId: string): WorkoutReminderPreference
  schedule(days: number[], time: ReminderTime, language: AppLanguage, options: { requestPermission: false; isCurrent(): boolean }): Promise<boolean>
  cancel(): Promise<void>
}) {
  let accountId: string | null = null
  let version = 0
  let signature: string | null = null
  let pending: Promise<void> = Promise.resolve()
  return {
    update(account: ReminderAccount | null): Promise<void> {
      const pref = account ? deps.readPreference(account.accountId) : { enabled: false, time: '18:00' }
      const days = [...new Set(account?.days.filter(day => Number.isInteger(day) && day >= 1 && day <= 7) ?? [])].sort((a, b) => a - b)
      const next = JSON.stringify([account?.accountId ?? null, days, account?.language, pref])
      if (signature === next) return pending
      signature = next
      const attempt = ++version
      const changed = accountId !== (account?.accountId ?? null)
      accountId = account?.accountId ?? null
      const current = () => attempt === version
      // Invoke cancellation now, before waiting for any earlier scheduling work.
      const stopped = changed || !account || !pref.enabled || !days.length ? deps.cancel() : Promise.resolve()
      pending = (async () => {
        await stopped
        if (!current() || !account || !pref.enabled || !days.length) return
        const scheduled = await deps.schedule(days, reminderTime(pref.time), account.language, { requestPermission: false, isCurrent: current })
        if (!scheduled && current()) { signature = null; await deps.cancel() }
      })().catch(error => { if (current()) signature = null; throw error })
      return pending
    },
  }
}
