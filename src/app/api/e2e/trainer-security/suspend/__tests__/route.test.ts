import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/coaching/trainerSecurityAdmin', () => ({
  suspendTrainerThroughAuthenticatedAdmin: vi.fn(),
}))

import { suspendTrainerThroughAuthenticatedAdmin } from '@/lib/coaching/trainerSecurityAdmin'
import { POST } from '../route'

const suspendMock = vi.mocked(suspendTrainerThroughAuthenticatedAdmin)

function request(token = 'admin-token') {
  return new NextRequest('http://localhost/api/e2e/trainer-security/suspend', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' }),
  })
}

describe('trainer security E2E admin suspension route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('E2E_TRAINER_SECURITY_ENABLED', 'true')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('passes the authenticated admin token into the server-only boundary', async () => {
    suspendMock.mockResolvedValue({ accountSuspended: true })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accountSuspended: true })
    expect(suspendMock).toHaveBeenCalledWith({
      accessToken: 'admin-token',
      targetUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      reason: 'Trainer security concurrency test',
    })
  })

  it('does not expose the service boundary outside the explicit security run', async () => {
    delete process.env.E2E_TRAINER_SECURITY_ENABLED

    const response = await POST(request())

    expect(response.status).toBe(404)
    expect(suspendMock).not.toHaveBeenCalled()
  })

  it('stays unavailable in production even if the E2E flag is misconfigured', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const response = await POST(request())

    expect(response.status).toBe(404)
    expect(suspendMock).not.toHaveBeenCalled()
  })
})
