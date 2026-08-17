import { describe, expect, it, vi } from 'vitest'
import { translate } from '@/lib/i18n'
import {
  applyWorkoutReminderToggle,
  createSingleFlight,
  persistOptimisticPreference,
  rescheduleWorkoutReminder,
} from '../notificationPreferenceFeedback'

describe('notification preference feedback', () => {
  it('runs only one preference persistence while the first save is unresolved', async () => {
    let resolveSave!: (value: { ok: true }) => void
    const save = vi.fn(() => new Promise<{ ok: true }>(resolve => { resolveSave = resolve }))
    const flight = createSingleFlight()

    const first = flight.run(save)
    const second = flight.run(save)

    expect(flight.isPending).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    await expect(second).resolves.toEqual({ started: false })

    resolveSave({ ok: true })
    await expect(first).resolves.toEqual({ started: true, value: { ok: true } })
    expect(flight.isPending).toBe(false)
  })

  it('rolls back an optimistic preference when its save action throws and announces the English fallback', async () => {
    const previous = { professionalEnabled: true, pushEnabled: false }
    const rollback = vi.fn()
    const success = vi.fn()

    await expect(persistOptimisticPreference({
      previous,
      next: { professionalEnabled: false, pushEnabled: false },
      save: async () => { throw new Error('network unavailable') },
      fallbackError: translate('en', 'No se pudieron guardar las preferencias.'),
      onRollback: rollback,
      onSuccess: success,
    })).resolves.toBe(false)

    expect(rollback).toHaveBeenCalledWith(previous, 'Could not save notification preferences.')
    expect(success).not.toHaveBeenCalled()
  })

  it('restores the previous reminder time when rescheduling returns false', async () => {
    const rollback = vi.fn()

    await expect(rescheduleWorkoutReminder({
      schedule: async () => false,
      onRollback: rollback,
    })).resolves.toBe(false)

    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('restores the previous reminder time and propagates a native rescheduling failure', async () => {
    const rollback = vi.fn()
    const schedulingError = new Error('native unavailable')

    await expect(rescheduleWorkoutReminder({
      schedule: async () => { throw schedulingError },
      onRollback: rollback,
    })).rejects.toBe(schedulingError)

    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('propagates a native cancellation failure without reporting reminders as disabled', async () => {
    const cancellationError = new Error('native cancellation failed')

    await expect(applyWorkoutReminderToggle({
      enable: false,
      schedule: vi.fn(),
      cancel: async () => { throw cancellationError },
    })).rejects.toBe(cancellationError)
  })
})
