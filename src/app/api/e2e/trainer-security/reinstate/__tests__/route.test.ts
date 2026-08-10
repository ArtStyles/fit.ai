import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/coaching/trainerSecurityAdmin', () => ({
  reinstateTrainerThroughAuthenticatedAdmin: vi.fn(),
}))

import { reinstateTrainerThroughAuthenticatedAdmin } from '@/lib/coaching/trainerSecurityAdmin'
import { POST } from '../route'

const reinstateMock = vi.mocked(reinstateTrainerThroughAuthenticatedAdmin)

function request(token = 'admin-token') {
  return new NextRequest('http://localhost/api/e2e/trainer-security/reinstate', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' }),
  })
}

describe('trainer marketplace E2E admin reinstatement route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('E2E_RUN_ID', 'route-gate-run')
    vi.stubEnv('E2E_TRAINER_RELATIONSHIPS_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_PROGRAMMING_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_PROGRAMMING_RETENTION_ACK', 'dedicated-project-reset')
    vi.stubEnv('E2E_TRAINER_INSIGHTS_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_SECURITY_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_MARKETPLACE_ENABLED', 'true')
    vi.stubEnv('COMMUNITY_ENABLED', 'false')
    vi.stubEnv('TRAINER_PAYMENTS_ENABLED', 'false')
    vi.stubEnv('TRAINER_MESSAGING_ENABLED', 'false')
    vi.stubEnv('TRAINER_REVIEWS_ENABLED', 'false')
    vi.stubEnv('STRIPE_SECRET_KEY', '')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('passes an authenticated admin token into the server-only boundary', async () => {
    reinstateMock.mockResolvedValue({ accountReactivated: true, profileReinstated: true })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accountReactivated: true, profileReinstated: true })
    expect(reinstateMock).toHaveBeenCalledWith({
      accessToken: 'admin-token',
      targetUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    })
  })

  it('is unavailable outside the explicit non-production marketplace run', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const response = await POST(request())
    expect(response.status).toBe(404)
    expect(reinstateMock).not.toHaveBeenCalled()
  })

  it.each([
    ['E2E_TRAINER_SECURITY_ENABLED', 'false'],
    ['COMMUNITY_ENABLED', 'true'],
    ['TRAINER_PAYMENTS_ENABLED', 'true'],
    ['TRAINER_MESSAGING_ENABLED', 'true'],
    ['TRAINER_REVIEWS_ENABLED', 'true'],
    ['STRIPE_SECRET_KEY', 'sk_test_forbidden'],
  ])('is unavailable when %s=%s violates the complete pilot gate', async (name, value) => {
    vi.stubEnv(name, value)
    const response = await POST(request())
    expect(response.status).toBe(404)
    expect(reinstateMock).not.toHaveBeenCalled()
  })
})
