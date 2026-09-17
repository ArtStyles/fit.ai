import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => { throw Object.assign(new Error(href), { digest: `NEXT_REDIRECT;replace;${href};307;` }) },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { POST } from '@/app/api/mobile/admin/route'

const actor = '10000000-0000-4000-8000-000000000001'
const target = '10000000-0000-4000-8000-000000000002'
const spoofedActor = '10000000-0000-4000-8000-000000000003'
let from: ReturnType<typeof vi.fn>
let rpc: ReturnType<typeof vi.fn>
let audit: ReturnType<typeof vi.fn>

function verifiedUser(email: string) {
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: actor, email, user_metadata: { is_admin: true } } }, error: null }) },
  } as never)
}

function request(operation: string, multipart = false, authenticated = true) {
  const fields = { operation, targetUserId: target, applicationId: target, userId: spoofedActor, adminUserId: spoofedActor, tier: 'pro' }
  const form = new FormData(); Object.entries(fields).forEach(([key, value]) => form.set(key, value))
  return new Request('https://vekira.test/api/mobile/admin', {
    method: 'POST',
    headers: {
      ...(authenticated ? { authorization: 'Bearer verified-session' } : {}),
      ...(!multipart ? { 'content-type': 'application/json' } : {}),
      'x-fitai-user-id': spoofedActor, 'x-fitai-user-email': 'fejames07@gmail.com',
    },
    body: multipart ? form : JSON.stringify(fields),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://supabase.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'publishable-test-key')
  audit = vi.fn().mockResolvedValue({ error: null })
  rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  from = vi.fn(() => ({
    update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    insert: audit,
  }))
  vi.mocked(createServiceClient).mockReturnValue({
    from, rpc,
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id: target, email: 'member@example.test' } }, error: null }) } },
  } as never)
  verifiedUser('member@example.test')
})
afterEach(() => vi.unstubAllEnvs())

describe('mobile admin uses the real bearer scope and administrator guard', () => {
  it('rejects caller-supplied admin headers without a bearer before creating a service client', async () => {
    const response = await POST(request('users', false, false))
    expect(response.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it.each([
    ['shell', false], ['users', false], ['banner', false], ['overview', false],
    ['trainers', false], ['trainer-detail', false],
    ['setUserSubscription', true], ['suspendUser', true], ['reactivateUser', true],
    ['saveDashboardBanner', true], ['startTrainerReview', true],
    ['requestTrainerChanges', true], ['approveTrainerApplication', true],
    ['rejectTrainerApplication', true], ['reinstateTrainerProfile', true],
    ['scheduleTrainerInterview', true], ['recordTrainerInterviewOutcome', true],
  ] as const)('forbids verified non-admin %s despite forged identity headers and metadata', async (operation, multipart) => {
    const response = await POST(request(operation, multipart))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })

  it('records the authenticated administrator as actor even when a form supplies another ID', async () => {
    verifiedUser('fejames07@gmail.com')
    const response = await POST(request('setUserSubscription', true))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, redirect: '/admin/users?notice=admin_pro_granted' })
    expect(rpc).toHaveBeenCalledWith('set_subscription_tier_atomic', { p_user_id: target, p_subscription_tier: 'pro' })
    expect(audit).toHaveBeenCalledWith({
      admin_user_id: actor, target_user_id: target, action: 'subscription_granted', reason: null, metadata: { tier: 'pro' },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
