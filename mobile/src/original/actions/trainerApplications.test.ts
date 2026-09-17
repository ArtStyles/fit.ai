import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ api: vi.fn(), upload: vi.fn(), version: 1, owner: '11111111-1111-4111-8111-111111111111' }))
vi.mock('../mobile-api', () => ({ mobileApi: fixture.api }))
vi.mock('../bridge-client', () => ({ createConnectedClient: async () => ({ storage: { from: () => ({ uploadToSignedUrl: fixture.upload }) } }) }))
vi.mock('../storage', () => ({ getAppStore: async () => ({ sessionVersion: () => fixture.version, read: async () => ({ accountId: fixture.owner, remoteUserId: fixture.owner }) }) }))
import { uploadTrainerCredential } from './trainerApplications'
const app = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333'
function form() { const data = new FormData(); data.set('applicationId', app); data.set('credentialType', 'document'); data.set('title', 'Diploma'); data.set('file', new File(['private-document'], 'certificate.pdf', { type: 'application/pdf' })); return data }
beforeEach(() => {
  fixture.version = 1; fixture.owner = '11111111-1111-4111-8111-111111111111'
  fixture.api.mockReset().mockImplementation(async (_path, data: FormData) => data.get('operation') === 'prepareCredential' ? { ok: true, credentialId: id, path: `${fixture.owner}/${app}/${id}.pdf`, token: 'upload-token' } : { ok: true, credentialId: id })
  fixture.upload.mockReset().mockResolvedValue({ error: null })
})
describe('Android private credential protocol', () => {
  it('sends bytes only to signed Storage and confirms the same credential through the API', async () => {
    const operations: string[] = []
    const api = fixture.api.getMockImplementation()!
    fixture.api.mockImplementation(async (path, data: FormData) => { expect(data.has('file')).toBe(false); operations.push(String(data.get('operation'))); return api(path, data) })
    await expect(uploadTrainerCredential(form())).resolves.toEqual({ ok: true, credentialId: id })
    expect(operations).toEqual(['prepareCredential', 'finishCredential'])
    const uploaded = fixture.upload.mock.calls[0][2] as File
    expect(await uploaded.text()).toBe('private-document')
  })
  it('never confirms a document after the account changes during direct upload', async () => {
    fixture.upload.mockImplementation(async () => { fixture.version++; return { error: null } })
    await expect(uploadTrainerCredential(form())).rejects.toThrow(/cuenta activa cambió/)
    expect(fixture.api).toHaveBeenCalledTimes(1)
  })
  it('rejects a mismatched upload path without uploading private bytes', async () => {
    fixture.api.mockResolvedValue({ ok: true, credentialId: id, path: `someone-else/${app}/${id}.pdf`, token: 'upload-token' })
    await expect(uploadTrainerCredential(form())).rejects.toThrow(/no corresponde/)
    expect(fixture.upload).not.toHaveBeenCalled()
  })
  it('keeps a failed Storage upload unconfirmed', async () => {
    fixture.upload.mockResolvedValue({ error: { message: 'offline' } })
    expect((await uploadTrainerCredential(form())).ok).toBe(false)
    expect(fixture.api).toHaveBeenCalledTimes(1)
  })
})
