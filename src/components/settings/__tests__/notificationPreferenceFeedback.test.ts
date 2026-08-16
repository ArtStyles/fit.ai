import { describe, expect, it, vi } from 'vitest'
import { translate } from '@/lib/i18n'
import {
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

  it.each([
    ['returns false', async () => false],
    ['throws', async () => { throw new Error('native unavailable') }],
  ])('restores the previous reminder time when rescheduling %s', async (_scenario, schedule) => {
    const rollback = vi.fn()

    await expect(rescheduleWorkoutReminder({
      schedule,
      onRollback: rollback,
    })).resolves.toBe(false)

    expect(rollback).toHaveBeenCalledTimes(1)
  })
})
