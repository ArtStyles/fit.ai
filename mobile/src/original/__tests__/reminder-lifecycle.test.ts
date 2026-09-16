import { describe, expect, it } from 'vitest'
import { loadWorkoutReminderPreference, persistWorkoutReminderPreference } from '@/lib/native/workoutReminderPreferences'
import { createReminderReconciler } from '../reminder-lifecycle'

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
describe('account reminder reconciliation', () => {
  it('never inherits global or another account preference and validates stored time', () => {
    const local = storage()
    local.setItem('fitai:workout-reminders', JSON.stringify({ enabled: true, time: '07:00' }))
    expect(loadWorkoutReminderPreference('a', local)).toEqual({ enabled: false, time: '18:00' })
    persistWorkoutReminderPreference('a', { enabled: true, time: '08:15' }, local)
    expect(loadWorkoutReminderPreference('a', local)).toEqual({ enabled: true, time: '08:15' })
    expect(loadWorkoutReminderPreference('b', local)).toEqual({ enabled: false, time: '18:00' })
    local.setItem('fitai:workout-reminders:b', JSON.stringify({ enabled: true, time: '25:90' }))
    expect(loadWorkoutReminderPreference('b', local)).toEqual({ enabled: false, time: '18:00' })
  })
  it('reconciles changed days and language outside settings without requesting permission', async () => {
    const events: unknown[] = []
    const local = storage(); persistWorkoutReminderPreference('a', { enabled: true, time: '08:15' }, local)
    const lifecycle = createReminderReconciler({ readPreference: id => loadWorkoutReminderPreference(id, local), cancel: async () => { events.push('cancel') }, schedule: async (days, time, language, options) => { events.push({ days, time, language, prompt: options.requestPermission }); return true } })
    await lifecycle.update({ accountId: 'a', days: [3, 1, 1, 8], language: 'es' })
    await lifecycle.update({ accountId: 'a', days: [2, 5], language: 'en' })
    await lifecycle.update({ accountId: 'a', days: [2, 5], language: 'en' })
    expect(events).toEqual(['cancel', { days: [1, 3], time: { hour: 8, minute: 15 }, language: 'es', prompt: false }, { days: [2, 5], time: { hour: 8, minute: 15 }, language: 'en', prompt: false }])
    await lifecycle.update({ accountId: 'b', days: [1], language: 'en' })
    expect(events.at(-1)).toBe('cancel')
    expect(events).toHaveLength(4)
  })
  it('invalidates pending scheduling immediately on logout and clears days with no prompt', async () => {
    let valid: (() => boolean) | undefined
    let finish!: (value: boolean) => void
    let cancelled = 0
    const lifecycle = createReminderReconciler({ readPreference: () => ({ enabled: true, time: '18:00' }), cancel: async () => { cancelled++ }, schedule: async (_days, _time, _language, options) => { valid = options.isCurrent; return new Promise(resolve => { finish = resolve }) } })
    const pending = lifecycle.update({ accountId: 'a', days: [1], language: 'es' })
    await Promise.resolve()
    expect(valid?.()).toBe(true)
    const stopped = lifecycle.update(null)
    expect(valid?.()).toBe(false)
    finish(false)
    await Promise.all([pending, stopped])
    expect(cancelled).toBe(2)
    await lifecycle.update({ accountId: 'a', days: [], language: 'es' })
    expect(cancelled).toBe(3)
  })
})
