import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAppUserContext, revalidatePath } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

function consentSupabase(responses: Record<string, { data: unknown; error: unknown }> = {}) {
  const rpc = vi.fn((name: string) => Promise.resolve(responses[name] ?? {
    data: { relationship_id: 'relationship-1', changed: true }, error: null,
  }))
  return { rpc }
}

function relationshipForm(idempotencyKey = '22222222-2222-4222-8222-222222222222') {
  const formData = new FormData()
  formData.set('relationshipId', '11111111-1111-4111-8111-111111111111')
  formData.set('idempotencyKey', idempotencyKey)
  return formData
}

describe('coaching relationship consent actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('grants body measurements only through the authenticated client RPC and ignores injected trainer authority', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = relationshipForm()
    formData.set('trainerUserId', 'attacker-trainer')
    const { grantBodyMeasurementsConsent } = await import('../coachingRelationships')

    await expect(grantBodyMeasurementsConsent(formData)).resolves.toEqual({ ok: true, relationshipId: 'relationship-1', changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('grant_body_measurements_consent', {
      relationship_id: '11111111-1111-4111-8111-111111111111',
      consent_version: 'body-measurements-v1',
      idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
  })

  it('revokes body measurements without ending the relationship', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { revokeBodyMeasurementsConsent } = await import('../coachingRelationships')

    await expect(revokeBodyMeasurementsConsent(relationshipForm())).resolves.toEqual({ ok: true, relationshipId: 'relationship-1', changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('revoke_body_measurements_consent', {
      relationship_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('revokes training data only through the atomic relationship-ending RPC', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { revokeTrainingProfileConsent } = await import('../coachingRelationships')

    await expect(revokeTrainingProfileConsent(relationshipForm())).resolves.toEqual({ ok: true, relationshipId: 'relationship-1', changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('revoke_training_profile_consent', {
      relationship_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('returns a safe failure and still restores request state when the RPC fails', async () => {
    const supabase = consentSupabase({
      grant_body_measurements_consent: { data: null, error: { message: 'COACHING_RELATIONSHIP_NOT_ACTIVE' } },
    })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { grantBodyMeasurementsConsent } = await import('../coachingRelationships')

    await expect(grantBodyMeasurementsConsent(relationshipForm())).resolves.toEqual({
      ok: false, error: 'No se pudo actualizar el consentimiento.',
    })
  })
})
