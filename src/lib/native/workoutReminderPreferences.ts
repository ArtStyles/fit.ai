export type WorkoutReminderPreference = { enabled: boolean; time: string }
export const WORKOUT_REMINDER_PREFERENCE_CHANGED = 'vekira:workout-reminder-preference-changed'
export const DEFAULT_REMINDER_TIME = '18:00'
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
const key = (accountId: string) => `fitai:workout-reminders:${accountId}`
export const validReminderTime = (time: unknown): time is string => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

export function loadWorkoutReminderPreference(accountId: string, storage?: PreferenceStorage): WorkoutReminderPreference {
  const fallback = { enabled: false, time: DEFAULT_REMINDER_TIME }
  if (!accountId) return fallback
  try {
    const parsed = JSON.parse((storage ?? globalThis.localStorage).getItem(key(accountId)) ?? 'null')
    return parsed && typeof parsed.enabled === 'boolean' && validReminderTime(parsed.time) ? { enabled: parsed.enabled, time: parsed.time } : fallback
  } catch { return fallback }
}
export function persistWorkoutReminderPreference(accountId: string, preference: WorkoutReminderPreference, storage?: PreferenceStorage): void {
  if (!accountId || !validReminderTime(preference.time)) throw new Error('Invalid workout reminder preference')
  ;(storage ?? globalThis.localStorage).setItem(key(accountId), JSON.stringify(preference))
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WORKOUT_REMINDER_PREFERENCE_CHANGED, { detail: { accountId } }))
}
export function reminderTime(time: string) {
  const [hour, minute] = (validReminderTime(time) ? time : DEFAULT_REMINDER_TIME).split(':').map(Number)
  return { hour, minute }
}
