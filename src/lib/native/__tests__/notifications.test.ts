import { beforeEach, describe, expect, it, vi } from 'vitest'

const nativeMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getPending: vi.fn(),
  cancel: vi.fn(),
  schedule: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: nativeMocks.isNativePlatform },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: nativeMocks.checkPermissions,
    requestPermissions: nativeMocks.requestPermissions,
    getPending: nativeMocks.getPending,
    cancel: nativeMocks.cancel,
    schedule: nativeMocks.schedule,
  },
}))

import {
  cancelWorkoutReminders,
  scheduleWorkoutReminders,
} from '../notifications'

describe('native workout reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nativeMocks.isNativePlatform.mockReturnValue(true)
    nativeMocks.checkPermissions.mockResolvedValue({ display: 'granted' })
    nativeMocks.getPending.mockResolvedValue({ notifications: [] })
    nativeMocks.cancel.mockResolvedValue(undefined)
    nativeMocks.schedule.mockResolvedValue({ notifications: [] })
  })

  it.each([
    ['es' as const, '\u00a1Hora de entrenar! \ud83d\udcaa', 'Tu sesi\u00f3n de hoy te espera. Vamos a por ella.'],
    ['en' as const, 'Time to work out! \ud83d\udcaa', "Today's session is waiting. Let's get moving."],
  ])('schedules localized operating-system copy in %s', async (language, title, body) => {
    await expect(scheduleWorkoutReminders(
      [1],
      { hour: 18, minute: 30 },
      language,
    )).resolves.toBe(true)

    expect(nativeMocks.schedule).toHaveBeenCalledWith({
      notifications: [{
        id: 7101,
        title,
        body,
        schedule: {
          on: { weekday: 2, hour: 18, minute: 30 },
          allowWhileIdle: true,
        },
      }],
    })
  })

  it('restores the exact pending reminder configuration when replacement scheduling fails', async () => {
    const previous = {
      id: 7103,
      title: 'Previous title',
      body: 'Previous body',
      schedule: { on: { weekday: 4, hour: 7, minute: 15 }, allowWhileIdle: true },
      extra: { source: 'existing' },
    }
    const schedulingError = new Error('native scheduling failed')
    nativeMocks.getPending.mockResolvedValue({
      notifications: [
        previous,
        { id: 99, title: 'Unrelated', body: 'Keep me', schedule: { at: new Date(0) } },
      ],
    })
    nativeMocks.schedule
      .mockRejectedValueOnce(schedulingError)
      .mockResolvedValueOnce({ notifications: [previous] })

    await expect(scheduleWorkoutReminders(
      [5],
      { hour: 20, minute: 0 },
      'en',
    )).rejects.toBe(schedulingError)

    expect(nativeMocks.schedule).toHaveBeenCalledTimes(2)
    expect(nativeMocks.schedule).toHaveBeenLastCalledWith({ notifications: [previous] })
  })

  it('propagates cancellation failures instead of reporting a successful state change', async () => {
    const cancellationError = new Error('native cancellation failed')
    nativeMocks.cancel.mockRejectedValue(cancellationError)

    await expect(cancelWorkoutReminders()).rejects.toBe(cancellationError)
  })
})
