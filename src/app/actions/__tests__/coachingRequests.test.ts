import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAppUserContext, requireActiveTrainerContext, revalidatePath } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  requireActiveTrainerContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
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

function requestSupabase(options: {
  create?: { data: unknown; error: unknown }
  cancel?: { data: unknown; error: unknown }
  accept?: { data: unknown; error: unknown }
  decline?: { data: unknown; error: unknown }
} = {}) {
  const responses = {
    create_coaching_request: options.create ?? { data: { request_id: 'request-1', created: true }, error: null },
    cancel_coaching_request: options.cancel ?? { data: { request_id: 'request-1' }, error: null },
    accept_coaching_request: options.accept ?? { data: { relationship_id: 'relationship-1', accepted_request_id: 'request-1', cancelled_request_ids: [] }, error: null },
    decline_coaching_request: options.decline ?? { data: { declined_request_id: 'request-1' }, error: null },
  }
  const rpc = vi.fn((name: keyof typeof responses) => Promise.resolve(responses[name]))
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

  it('accepts only through the trainer-owned RPC and returns the refreshed relationship state', async () => {
    const supabase = requestSupabase({ accept: { data: {
      relationship_id: 'relationship-9', accepted_request_id: 'request-9', cancelled_request_ids: ['request-10'],
    }, error: null } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const formData = new FormData()
    formData.set('requestId', '33333333-3333-4333-8333-333333333333')
    formData.set('idempotencyKey', '44444444-4444-4444-8444-444444444444')
    formData.set('trainerUserId', 'attacker')
    const { acceptCoachingRequest } = await import('../coachingRequests')

    await expect(acceptCoachingRequest(formData)).resolves.toEqual({
      ok: true, relationshipId: 'relationship-9', acceptedRequestId: 'request-9', cancelledRequestIds: ['request-10'],
    })
    expect(supabase.rpc).toHaveBeenCalledWith('accept_coaching_request', {
      request_id: '33333333-3333-4333-8333-333333333333',
      idempotency_key: '44444444-4444-4444-8444-444444444444',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
  })

  it('maps an acceptance race conflict to a refreshed state instead of a generic failure', async () => {
    const supabase = requestSupabase({ accept: { data: null, error: { message: 'COACHING_ACTIVE_RELATIONSHIP_EXISTS' } } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const formData = new FormData()
    formData.set('requestId', '33333333-3333-4333-8333-333333333333')
    formData.set('idempotencyKey', '44444444-4444-4444-8444-444444444444')
    const { acceptCoachingRequest } = await import('../coachingRequests')

    await expect(acceptCoachingRequest(formData)).resolves.toEqual({ ok: false, error: 'La solicitud se actualizó. Recarga la bandeja.', refreshed: true })
  })

  it('declines only a pending request owned by the authenticated trainer', async () => {
    const supabase = requestSupabase()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const formData = new FormData()
    formData.set('requestId', '33333333-3333-4333-8333-333333333333')
    formData.set('reason', 'No tengo disponibilidad esta semana.')
    const { declineCoachingRequest } = await import('../coachingRequests')

    await expect(declineCoachingRequest(formData)).resolves.toEqual({ ok: true, requestId: 'request-1' })
    expect(supabase.rpc).toHaveBeenCalledWith('decline_coaching_request', {
      request_id: '33333333-3333-4333-8333-333333333333', reason: 'No tengo disponibilidad esta semana.',
    })
  })

  it('maps a decline race conflict to a refreshed terminal state', async () => {
    const supabase = requestSupabase({ decline: { data: null, error: { message: 'COACHING_REQUEST_NOT_PENDING' } } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const formData = new FormData()
    formData.set('requestId', '33333333-3333-4333-8333-333333333333')
    const { declineCoachingRequest } = await import('../coachingRequests')

    await expect(declineCoachingRequest(formData)).resolves.toEqual({
      ok: false,
      error: 'La solicitud se actualizó. Recarga la bandeja.',
      refreshed: true,
    })
  })
})
