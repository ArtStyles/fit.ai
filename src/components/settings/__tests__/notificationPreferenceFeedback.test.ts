import { describe, expect, it, vi } from 'vitest'
import { translate } from '@/lib/i18n'
import {
  persistOptimisticPreference,
  rescheduleWorkoutReminder,
} from '../notificationPreferenceFeedback'

describe('notification preference feedback', () => {
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
