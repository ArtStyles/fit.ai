import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import * as actions from '../trainerApplications'

const owner = '11111111-1111-4111-8111-111111111111'
const app = '22222222-2222-4222-8222-222222222222'
const credential = '33333333-3333-4333-8333-333333333333'
const cleanup = '44444444-4444-4444-8444-444444444444'
const path = `${owner}/${app}/${credential}.pdf`
function form() {
  const data = new FormData()
  Object.entries({ applicationId: app, credentialId: credential, credentialType: 'document', title: 'Certificado', mimeType: 'application/pdf', sizeBytes: String(10 * 1024 * 1024) }).forEach(([key, value]) => data.set(key, value))
  return data
}
function fixture(available = true) {
  const filters: Array<[string, unknown]> = []
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query }, maybeSingle: async () => ({ data: available ? { id: app, user_id: owner, status: 'draft', application_kind: 'initial' } : null, error: null }) }
  const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'list_trainer_credential_cleanup' ? [] : name === 'queue_trainer_credential_cleanup' ? { id: cleanup, storage_path: path } : { id: credential, application_id: app } }))
  const client = { auth: { getUser: async () => ({ data: { user: { id: owner } } }) }, from: () => query, rpc }
  const sign = vi.fn(async () => ({ data: { path, token: 'short-lived-upload-token' }, error: null }))
  vi.mocked(createClient).mockResolvedValue(client as never)
  vi.mocked(createServiceClient).mockReturnValue({ storage: { from: () => ({ createSignedUploadUrl: sign }) } } as never)
  return { filters, rpc, sign }
}
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(crypto, 'randomUUID').mockReturnValue(credential) })
describe('mobile private credential upload', () => {
  it('reserves only the verified owner path and accepts a 10 MiB document without receiving its bytes', async () => {
    const { filters } = fixture()
    const input = form(); input.set('userId', 'forged-owner'); input.set('storagePath', 'another/path')
    await expect(actions.prepareTrainerCredentialUpload(input)).resolves.toEqual({ ok: true, credentialId: credential, path, token: 'short-lived-upload-token' })
    expect(filters).toContainEqual(['user_id', owner])
  })
  it('does not issue upload authorization for an unavailable application or oversized document', async () => {
    const state = fixture(false)
    expect((await actions.prepareTrainerCredentialUpload(form())).ok).toBe(false)
    const input = form(); input.set('sizeBytes', String(10 * 1024 * 1024 + 1))
    expect((await actions.prepareTrainerCredentialUpload(input)).ok).toBe(false)
    expect(state.sign).not.toHaveBeenCalled()
  })
  it('confirms through the ownership and actual Storage metadata RPC and fails closed on rejection', async () => {
    const { rpc, sign } = fixture()
    await expect(actions.finishTrainerCredentialUpload(form())).resolves.toEqual({ ok: true, credentialId: credential })
    expect(rpc).toHaveBeenCalledWith('create_trainer_application_credential', expect.objectContaining({ p_application_id: app, p_credential_id: credential, p_mime_type: 'application/pdf', p_size_bytes: 10 * 1024 * 1024 }))
    expect(sign).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: null as never, error: { message: 'Document ownership or metadata invalid' } as never })
    expect((await actions.finishTrainerCredentialUpload(form())).ok).toBe(false)
  })
})
