import { beforeEach, describe, expect, it, vi } from 'vitest'
const actions = vi.hoisted(() => ({ saveTrainerApplicationDraft: vi.fn(), submitTrainerApplication: vi.fn(), withdrawTrainerApplication: vi.fn(), uploadTrainerCredential: vi.fn(), removeTrainerCredential: vi.fn(), prepareTrainerCredentialUpload: vi.fn(), finishTrainerCredentialUpload: vi.fn(), updateTrainerProfile: vi.fn(), updateAvatar: vi.fn() }))
vi.mock('@/app/actions/trainerApplications', () => actions)
vi.mock('@/app/actions/trainerProfile', () => actions)
vi.mock('@/app/actions/avatar', () => actions)
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: async () => ({ user: { id: 'verified' } }) }))
vi.mock('@/lib/mobile-api/http', () => ({ handleMobileApi: async (_request: Request, handler: () => Promise<unknown>) => { try { return Response.json({ ok: true, data: await handler() }) } catch (error) { return Response.json({ ok: false }, { status: (error as { status?: number }).status ?? 500 }) } }, readMobileForm: (request: Request) => request.formData(), readMobileJson: (request: Request) => request.json(), mobileApiOptions: () => new Response(null, { status: 204 }), MobileApiError: class extends Error { constructor(public status: number, public code: string) { super(code) } } }))
import { POST } from '@/app/api/mobile/coaching/route'
const request = (data: FormData) => new Request('https://vekira.test/api/mobile/coaching', { method: 'POST', body: data })
beforeEach(() => { Object.values(actions).forEach(action => action.mockReset().mockResolvedValue({ ok: true })) })
describe('mobile coaching operations', () => {
  it('preserves repeated form fields while selecting only an explicit server operation', async () => {
    const data = new FormData(); data.set('operation', 'saveDraft'); data.append('specialties', 'Fuerza'); data.append('specialties', 'Movilidad')
    const response = await POST(request(data))
    expect(response.status).toBe(200)
    const sent = actions.saveTrainerApplicationDraft.mock.calls[0][0] as FormData
    expect(sent.getAll('specialties')).toEqual(['Fuerza', 'Movilidad'])
    expect(sent.has('operation')).toBe(false)
  })
  it('rejects caller-selected arbitrary methods and multipart document bytes', async () => {
    for (const operation of ['deleteUser', 'constructor', 'uploadCredential']) {
      const data = new FormData(); data.set('operation', operation); data.set('credentialType', 'document'); data.set('file', new File(['private'], 'certificate.pdf', { type: 'application/pdf' }))
      expect((await POST(request(data))).status).toBe(400)
    }
    expect(actions.uploadTrainerCredential).not.toHaveBeenCalled()
  })
})
