import { describe, expect, it, vi } from 'vitest'
import { createPersistentRequestId, runPersistentPlanRequest } from '../persistentRequestId'

describe('persistent plan request id', () => {
  it('reuses the same id after an ambiguous transport failure', () => {
    const createId = vi.fn()
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2')
    const request = createPersistentRequestId(createId)

    expect(request.current()).toBe('request-1')
    request.ambiguous()
    expect(request.current()).toBe('request-1')
    expect(createId).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'business failure'] as const)(
    'rotates the id after a confirmed %s',
    () => {
      const createId = vi.fn()
        .mockReturnValueOnce('request-1')
        .mockReturnValueOnce('request-2')
      const request = createPersistentRequestId(createId)

      expect(request.current()).toBe('request-1')
      request.confirmed()
      expect(request.current()).toBe('request-2')
    },
  )

  it('rotates the id after explicit cancellation', () => {
    const createId = vi.fn()
      .mockReturnValueOnce('request-1')
      .mockReturnValueOnce('request-2')
    const request = createPersistentRequestId(createId)

    expect(request.current()).toBe('request-1')
    request.cancel()
    expect(request.current()).toBe('request-2')
  })

  it('keeps the id when the operation rejects before a response is confirmed', async () => {
    const request = createPersistentRequestId(() => 'request-1')

    await expect(runPersistentPlanRequest(
      request,
      async requestId => { throw new Error(`lost:${requestId}`) },
    )).rejects.toThrow('lost:request-1')

    expect(request.current()).toBe('request-1')
  })

  it.each([
    { success: true as const, planId: 'plan-1' },
    { success: false as const, error: 'business failure' },
  ])('rotates after the server confirms $success', async result => {
    const ids = ['request-1', 'request-2']
    const request = createPersistentRequestId(() => ids.shift()!)

    await expect(runPersistentPlanRequest(request, async () => result)).resolves.toBe(result)
    expect(request.current()).toBe('request-2')
  })
})
