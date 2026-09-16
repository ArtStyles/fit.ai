import { PushNotifications } from '@capacitor/push-notifications'
import { cancelWorkoutReminders, remindersSupported, scheduleWorkoutReminders } from '@/lib/native/notifications'
import { loadWorkoutReminderPreference, WORKOUT_REMINDER_PREFERENCE_CHANGED } from '@/lib/native/workoutReminderPreferences'
import { createProductPushLifecycle, getOrCreatePushDeviceId } from '@/lib/native/productPushLifecycle'
import { productPushAvailable } from '@/lib/native/pushCapability'
import { getPlatform } from '@/lib/native/platform'
import { getAppStore } from './storage'
import { ORIGINAL_STATE_CHANGED } from './types'
import { createConnectedClient } from './bridge-client'
import { createReminderReconciler } from './reminder-lifecycle'
import { navigate } from './router'

let stopActive: (() => Promise<void>) | null = null
let installation = 0
export function stopMobileNotifications(): Promise<void> {
  return stopActive?.() ?? cancelWorkoutReminders()
}

export async function installMobileNotificationLifecycle(): Promise<() => void> {
  const installed = ++installation
  const store = await getAppStore()
  if (installed !== installation) return () => {}
  const reminders = createReminderReconciler({ readPreference: loadWorkoutReminderPreference, schedule: scheduleWorkoutReminders, cancel: cancelWorkoutReminders })
  const push = createProductPushLifecycle(PushNotifications)
  let disposed = false, readVersion = 0
  let activeAccountId: string | null = null, pushKey: string | null = null
  const stop = () => {
    readVersion++
    activeAccountId = null; pushKey = null
    return Promise.allSettled([reminders.update(null), push.update(null)]).then(() => undefined)
  }
  stopActive = stop

  async function reconcile() {
    const attempt = ++readVersion
    const state = await store.read()
    if (disposed || attempt !== readVersion) return
    activeAccountId = state?.accountId ?? null
    const profile = state?.tables.profiles.find(row => row.id === state.accountId)
    void reminders.update(state && remindersSupported() ? {
      accountId: state.accountId, days: Array.isArray(profile?.preferred_workout_days) ? profile.preferred_workout_days : [], language: profile?.language === 'en' ? 'en' : 'es',
    } : null).catch(() => {})
    const preference = state?.tables.product_notification_preferences?.find(row => row.user_id === state.accountId)
    const platform = getPlatform()
    const enabled = state && state.remoteUserId === state.accountId && preference?.push_enabled === true && productPushAvailable() && remindersSupported() && (platform === 'android' || platform === 'ios')
    const key = enabled ? `${state.accountId}:${navigator.onLine}` : null
    if (key === pushKey) return
    pushKey = key
    void push.update(enabled ? {
      accountId: state.accountId, requestPermission: false, navigate,
      onRegistrationFailure: () => {
        // Retry on the next connectivity/account event, never in an automatic
        // loop. The push lifecycle suppresses failures from obsolete callbacks.
        if (!disposed && activeAccountId === state.accountId && pushKey === key) pushKey = null
      },
      registerToken: async (token, isCurrent) => {
        if (!isCurrent() || disposed || activeAccountId !== state.accountId) return
        const client = await createConnectedClient(state.accountId)
        if (!isCurrent() || disposed || activeAccountId !== state.accountId) return
        const { error } = await client.from('product_push_tokens').upsert({ user_id: state.accountId, token, platform, device_id: getOrCreatePushDeviceId(), enabled: true, last_seen_at: new Date().toISOString() }, { onConflict: 'user_id,device_id' })
        if (error) throw error
      },
    } : null).catch(() => { if (!disposed && pushKey === key) pushKey = null })
  }
  const update = (event: Event) => {
    if (event.type === ORIGINAL_STATE_CHANGED && (event as CustomEvent).detail?.accountId !== activeAccountId) void stop()
    void reconcile().catch(() => {})
  }
  for (const name of [ORIGINAL_STATE_CHANGED, WORKOUT_REMINDER_PREFERENCE_CHANGED, 'online']) window.addEventListener(name, update)
  void reconcile().catch(() => {})
  return () => {
    disposed = true
    for (const name of [ORIGINAL_STATE_CHANGED, WORKOUT_REMINDER_PREFERENCE_CHANGED, 'online']) window.removeEventListener(name, update)
    if (stopActive === stop) stopActive = null
    if (installed === installation) void stop()
  }
}
