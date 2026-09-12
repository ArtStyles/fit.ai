import { describe, expect, it, vi } from 'vitest'
import { notifyFitnessDataChanged, watchFitnessDataChanged } from './events'

describe('fitness data change event', () => {
  it('notifies each active subscriber once and stops after cleanup', () => {
    const listener = vi.fn()
    const target = new EventTarget()
    const stop = watchFitnessDataChanged(listener, target)
    notifyFitnessDataChanged(target)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    notifyFitnessDataChanged(target)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
