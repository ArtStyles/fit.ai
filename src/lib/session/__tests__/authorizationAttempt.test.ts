import { describe, expect, it } from 'vitest'
import { runSessionAuthorizationAttempt } from '../authorization'

describe('session authorization request', () => {
  it('preserves confirmed absence of a lease only for the current failed attempt', async () => {
    const request = async () => ({ success: false as const, error: 'Already completed', authorizationAbsent: true as const })
    await expect(runSessionAuthorizationAttempt(request, () => true, 'transport failure')).resolves.toEqual({ status: 'failed', error: 'Already completed', authorizationAbsent: true })
    await expect(runSessionAuthorizationAttempt(request, () => false, 'transport failure')).resolves.toEqual({ status: 'stale' })
  })
  it.each(['pending', 'professional_clearance_required'] as const)('preserves %s readiness recovery without marking the session ready', async readinessStatus => {
    await expect(runSessionAuthorizationAttempt(
      async () => ({ success: false as const, error: 'Readiness needs attention', readinessStatus }),
      () => true,
      'transport failure',
    )).resolves.toEqual({ status: 'failed', error: 'Readiness needs attention', readinessStatus })
  })

  it('discards readiness metadata from an obsolete attempt', async () => {
    await expect(runSessionAuthorizationAttempt(
      async () => ({ success: false as const, error: 'Old profile', readinessStatus: 'pending' as const }),
      () => false,
      'transport failure',
    )).resolves.toEqual({ status: 'stale' })
  })

  it('turns a transport rejection into a retryable localized failure', async () => {
    await expect(runSessionAuthorizationAttempt(
      async () => { throw new Error('network down') },
      () => true,
      'No se pudo preparar la sesiÃ³n. IntÃ©ntalo nuevamente.',
    )).resolves.toEqual({
      status: 'failed',
      error: 'No se pudo preparar la sesiÃ³n. IntÃ©ntalo nuevamente.',
    })
  })

  it('ignores a success from an obsolete attempt', async () => {
    await expect(runSessionAuthorizationAttempt(
      async () => ({ success: true as const, contextSnapshot: {} }),
      () => false,
      'transport failure',
    )).resolves.toEqual({ status: 'stale' })
  })

  it('reports a current confirmed success', async () => {
    await expect(runSessionAuthorizationAttempt(
      async () => ({ success: true as const, contextSnapshot: {} }),
      () => true,
      'transport failure',
    )).resolves.toEqual({ status: 'succeeded' })
  })

  it('ignores a transport rejection from an obsolete attempt', async () => {
    await expect(runSessionAuthorizationAttempt(
      async () => { throw new Error('late network failure') },
      () => false,
      'transport failure',
    )).resolves.toEqual({ status: 'stale' })
  })

  it('preserves a confirmed business failure for translation at the client boundary', async () => {
    await expect(runSessionAuthorizationAttempt(
      async () => ({ success: false as const, error: 'SESSION_DAILY_LIMIT_REACHED' }),
      () => true,
      'transport failure',
    )).resolves.toEqual({ status: 'failed', error: 'SESSION_DAILY_LIMIT_REACHED' })
  })
})
