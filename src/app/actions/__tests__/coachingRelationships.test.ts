import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAppUserContext, revalidatePath } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

const relationshipId = '11111111-1111-4111-8111-111111111111'

function consentSupabase(responses: Record<string, { data: unknown; error: unknown }> = {}) {
  const rpc = vi.fn((name: string) => Promise.resolve(responses[name] ?? {
    data: [{ relationship_id: relationshipId, changed: true }], error: null,
  }))
  return { rpc }
}

function relationshipForm(idempotencyKey = '22222222-2222-4222-8222-222222222222') {
  const formData = new FormData()
  formData.set('relationshipId', relationshipId)
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

    await expect(grantBodyMeasurementsConsent(formData)).resolves.toEqual({ ok: true, relationshipId, changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('grant_body_measurements_consent', {
      p_relationship_id: '11111111-1111-4111-8111-111111111111',
      p_consent_version: 'body-measurements-v1',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
  })

  it('grants training-profile consent with the server-owned version and revalidates every coaching surface', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = relationshipForm()
    formData.set('trainerUserId', 'attacker-trainer')
    formData.set('consentVersion', 'attacker-version')
    const { grantTrainingProfileConsent } = await import('../coachingRelationships')

    await expect(grantTrainingProfileConsent(formData)).resolves.toEqual({ ok: true, relationshipId, changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('grant_training_profile_consent', {
      p_relationship_id: '11111111-1111-4111-8111-111111111111',
      p_consent_version: 'training-profile-v1',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
    expect(revalidatePath.mock.calls).toEqual([
      ['/dashboard'],
      ['/coaching'],
      ['/coach/clients'],
      ['/coach/programs'],
    ])
  })

  it('revokes body measurements without ending the relationship', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { revokeBodyMeasurementsConsent } = await import('../coachingRelationships')

    await expect(revokeBodyMeasurementsConsent(relationshipForm())).resolves.toEqual({ ok: true, relationshipId, changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('revoke_body_measurements_consent', {
      p_relationship_id: '11111111-1111-4111-8111-111111111111',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('revokes training data only through the atomic relationship-ending RPC', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { revokeTrainingProfileConsent } = await import('../coachingRelationships')

    await expect(revokeTrainingProfileConsent(relationshipForm())).resolves.toEqual({ ok: true, relationshipId, changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('revoke_training_profile_consent', {
      p_relationship_id: '11111111-1111-4111-8111-111111111111',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
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

  const consentActionCases = [
    { actionName: 'grantTrainingProfileConsent', rpcName: 'grant_training_profile_consent' },
    { actionName: 'grantBodyMeasurementsConsent', rpcName: 'grant_body_measurements_consent' },
    { actionName: 'revokeBodyMeasurementsConsent', rpcName: 'revoke_body_measurements_consent' },
    { actionName: 'revokeTrainingProfileConsent', rpcName: 'revoke_training_profile_consent' },
  ] as const
  const malformedConsentResponses = [
    { label: 'a bare object', data: { relationship_id: relationshipId, changed: true } },
    { label: 'zero rows', data: [] },
    { label: 'more than one row', data: [{ relationship_id: relationshipId, changed: true }, { relationship_id: relationshipId, changed: false }] },
    { label: 'a different relationship id', data: [{ relationship_id: '33333333-3333-4333-8333-333333333333', changed: true }] },
    { label: 'a non-string relationship id', data: [{ relationship_id: 42, changed: true }] },
    { label: 'a non-boolean changed value', data: [{ relationship_id: relationshipId, changed: 'true' }] },
  ] as const

  describe.each(consentActionCases)('$rpcName response boundary', ({ actionName, rpcName }) => {
    it.each(malformedConsentResponses)('rejects $label without revalidation', async ({ data }) => {
      const supabase = consentSupabase({ [rpcName]: { data, error: null } })
      requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
      const actions = await import('../coachingRelationships')
      const action = {
        grantTrainingProfileConsent: actions.grantTrainingProfileConsent,
        grantBodyMeasurementsConsent: actions.grantBodyMeasurementsConsent,
        revokeBodyMeasurementsConsent: actions.revokeBodyMeasurementsConsent,
        revokeTrainingProfileConsent: actions.revokeTrainingProfileConsent,
      }[actionName]

      await expect(action(relationshipForm())).resolves.toEqual({
        ok: false,
        error: 'No se pudo actualizar el consentimiento.',
      })
      expect(revalidatePath).not.toHaveBeenCalled()
    })
  })

  it('ends a relationship through the authenticated participant RPC with an optional normalized reason', async () => {
    const supabase = consentSupabase({
      end_coaching_relationship: { data: [{ relationship_id: 'relationship-1', changed: true }], error: null },
    })
    requireAppUserContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const formData = relationshipForm()
    formData.set('reason', '  Meta cumplida  ')
    formData.set('clientUserId', 'injected-client')
    const { endCoachingRelationship } = await import('../coachingRelationships')

    await expect(endCoachingRelationship(formData)).resolves.toEqual({ ok: true, relationshipId: 'relationship-1', changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('end_coaching_relationship', {
      p_relationship_id: '11111111-1111-4111-8111-111111111111',
      p_reason: 'Meta cumplida',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('injected-client')
  })

  it('refuses an overlong end reason before calling the RPC', async () => {
    const supabase = consentSupabase()
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = relationshipForm()
    formData.set('reason', 'a'.repeat(501))
    const { endCoachingRelationship } = await import('../coachingRelationships')

    await expect(endCoachingRelationship(formData)).resolves.toEqual({ ok: false, error: 'El motivo no puede superar 500 caracteres.' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('resumes a paused relationship only through its server-authorized client RPC', async () => {
    const supabase = consentSupabase({
      resume_paused_coaching_relationship: { data: [{ relationship_id: 'relationship-1', changed: true }], error: null },
    })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const formData = relationshipForm()
    formData.set('trainerUserId', 'injected-trainer')
    const { resumePausedCoachingRelationship } = await import('../coachingRelationships')

    await expect(resumePausedCoachingRelationship(formData)).resolves.toEqual({ ok: true, relationshipId: 'relationship-1', changed: true })
    expect(supabase.rpc).toHaveBeenCalledWith('resume_paused_coaching_relationship', {
      p_relationship_id: '11111111-1111-4111-8111-111111111111',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('injected-trainer')
  })

  it('keeps the action argument keys aligned with the deployed SQL signatures', () => {
    const relationshipsSql = readFileSync(
      new URL('../../../../supabase/migrations/042_trainer_relationships.sql', import.meta.url),
      'utf8',
    )
    const programmingSql = readFileSync(
      new URL('../../../../supabase/migrations/043_trainer_programming.sql', import.meta.url),
      'utf8',
    )
    const consentRecoverySql = readFileSync(
      new URL('../../../../supabase/migrations/058_training_profile_consent_regrant.sql', import.meta.url),
      'utf8',
    )
    const signatures = `${relationshipsSql}\n${programmingSql}\n${consentRecoverySql}`

    expect(signatures).toMatch(/grant_training_profile_consent\(\s*p_relationship_id UUID,\s*p_consent_version TEXT,\s*p_idempotency_key UUID\s*\)\s*RETURNS TABLE \(relationship_id UUID, changed BOOLEAN\)/i)
    expect(signatures).toMatch(/grant_body_measurements_consent\(\s*p_relationship_id UUID, p_consent_version TEXT, p_idempotency_key UUID\s*\)\s*RETURNS TABLE \(relationship_id UUID, changed BOOLEAN\)/i)
    expect(signatures).toMatch(/revoke_body_measurements_consent\(\s*p_relationship_id UUID, p_idempotency_key UUID\s*\)\s*RETURNS TABLE \(relationship_id UUID, changed BOOLEAN\)/i)
    expect(signatures).toMatch(/revoke_training_profile_consent\(\s*p_relationship_id UUID, p_idempotency_key UUID\s*\)\s*RETURNS TABLE \(relationship_id UUID, changed BOOLEAN\)/i)
    expect(signatures).toMatch(/end_coaching_relationship\(\s*p_relationship_id UUID, p_reason TEXT, p_idempotency_key UUID\s*\)/i)
    expect(signatures).toMatch(/resume_paused_coaching_relationship\(\s*p_relationship_id UUID, p_idempotency_key UUID\s*\)/i)
  })
})
