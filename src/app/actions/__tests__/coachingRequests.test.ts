import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAppUserContext, revalidatePath } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

function validRequestForm(): FormData {
  const formData = new FormData()
  formData.set('serviceId', '11111111-1111-4111-8111-111111111111')
  formData.set('message', 'Quiero solicitar este acompañamiento.')
  formData.set('consentAccepted', 'true')
  formData.set('consentVersion', 'training-profile-v1')
  formData.set('idempotencyKey', '22222222-2222-4222-8222-222222222222')
  return formData
}

function requestSupabase(options: { create?: { data: unknown; error: unknown }; cancel?: { data: unknown; error: unknown } } = {}) {
  const rpc = vi.fn((name: string) => Promise.resolve(name === 'cancel_coaching_request'
    ? options.cancel ?? { data: { request_id: 'request-1' }, error: null }
    : options.create ?? { data: { request_id: 'request-1', created: true }, error: null }))
  return { rpc }
}

describe('coaching request actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the authenticated client and calls the owner-safe request RPC without client or trainer authority from the form', async () => {
    const supabase = requestSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = validRequestForm()
    formData.set('clientUserId', 'attacker-client')
    formData.set('trainerUserId', 'attacker-trainer')
    const { createCoachingRequest } = await import('../coachingRequests')

    await expect(createCoachingRequest(formData)).resolves.toEqual({ ok: true, requestId: 'request-1', created: true })
    expect(requireAppUserContext).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('create_coaching_request', {
      service_id: '11111111-1111-4111-8111-111111111111',
      message: 'Quiero solicitar este acompañamiento.',
      consent_version: 'training-profile-v1',
      idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
  })

  it('does not call the RPC when consent is missing or stale', async () => {
    const supabase = requestSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = validRequestForm()
    formData.delete('consentAccepted')
    const { createCoachingRequest } = await import('../coachingRequests')

    await expect(createCoachingRequest(formData)).resolves.toMatchObject({ ok: false, fieldErrors: { consentAccepted: expect.any(String) } })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['COACHING_SERVICE_NOT_AVAILABLE', 'Este servicio ya no está disponible.'],
    ['COACHING_TRAINER_NOT_ACTIVE', 'Este perfil profesional ya no está activo.'],
    ['COACHING_PENDING_REQUEST_EXISTS', 'Ya tienes una solicitud pendiente para este servicio.'],
    ['COACHING_ACTIVE_RELATIONSHIP_EXISTS', 'Ya tienes una relación profesional activa.'],
    ['COACHING_SELF_REQUEST_FORBIDDEN', 'No puedes solicitar tu propio servicio.'],
  ])('returns a specific safe error for %s', async (code, error) => {
    const supabase = requestSupabase({ create: { data: null, error: { message: code } } })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { createCoachingRequest } = await import('../coachingRequests')

    await expect(createCoachingRequest(validRequestForm())).resolves.toEqual({ ok: false, error })
  })

  it('preserves idempotent retries and permits independent pending requests through the RPC result', async () => {
    const supabase = requestSupabase({ create: { data: { request_id: 'request-1', created: false }, error: null } })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { createCoachingRequest } = await import('../coachingRequests')

    await expect(createCoachingRequest(validRequestForm())).resolves.toEqual({ ok: true, requestId: 'request-1', created: false })
  })

  it('cancels only through the owner-safe cancellation RPC and ignores injected ownership fields', async () => {
    const supabase = requestSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = new FormData()
    formData.set('requestId', '33333333-3333-4333-8333-333333333333')
    formData.set('clientUserId', 'attacker-client')
    const { cancelCoachingRequest } = await import('../coachingRequests')

    await expect(cancelCoachingRequest(formData)).resolves.toEqual({ ok: true, requestId: 'request-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('cancel_coaching_request', {
      p_request_id: '33333333-3333-4333-8333-333333333333',
    })
  })

  it('does not report an ownership failure as a cancelled request', async () => {
    const supabase = requestSupabase({ cancel: { data: null, error: { message: 'COACHING_REQUEST_NOT_CANCELLABLE' } } })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = new FormData()
    formData.set('requestId', '33333333-3333-4333-8333-333333333333')
    const { cancelCoachingRequest } = await import('../coachingRequests')

    await expect(cancelCoachingRequest(formData)).resolves.toEqual({ ok: false, error: 'La solicitud ya no se puede cancelar.' })
  })
})
