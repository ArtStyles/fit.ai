import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createProductNotification } from '@/lib/notifications/product'
import {
  removeTrainerCredential,
  saveTrainerApplicationDraft,
  submitTrainerApplication,
  trainerCredentialPath,
  uploadTrainerCredential,
  withdrawTrainerApplication,
} from '../trainerApplications'

vi.mock('@/lib/notifications/product', () => ({ createProductNotification: vi.fn() }))

const createClientMock = createClient as unknown as Mock
const createServiceClientMock = createServiceClient as unknown as Mock
const createProductNotificationMock = createProductNotification as unknown as Mock
const userId = '11111111-1111-4111-8111-111111111111'
const adminId = '22222222-2222-4222-8222-222222222222'
const applicationId = '33333333-3333-4333-8333-333333333333'
const credentialId = '44444444-4444-4444-8444-444444444444'

function validDraft(): FormData {
  const formData = new FormData()
  formData.set('professionalName', 'Alex Entrenador')
  formData.set('professionalPhotoUrl', 'https://cdn.example/avatar.jpg')
  formData.set('bio', 'Entrenador certificado con experiencia en fuerza, movilidad y trabajo progresivo.')
  formData.append('specialties', 'Fuerza')
  formData.append('modalities', 'online')
  formData.set('experienceSummary', 'Cinco anos acompanando procesos de entrenamiento individual.')
  formData.set('generalLocation', 'La Habana, Cuba')
  formData.append('languages', 'es')
  formData.set('contactEmail', 'alex@example.test')
  formData.set('contactPhone', '+53 5555 0101')
  formData.set('preferredContact', 'whatsapp')
  formData.set('timezone', 'America/Havana')
  formData.set('interviewAvailability', 'Lunes y miercoles de 14:00 a 18:00.')
  return formData
}

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
    ...overrides,
  }
}

describe('trainer application actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    createServiceClientMock.mockReset()
    createProductNotificationMock.mockReset().mockResolvedValue({ id: 'notification-1' })
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(credentialId)
  })

  it('derives draft ownership from the authenticated user and ignores a forged userId', async () => {
    let inserted: Record<string, unknown> | undefined
    const client = authClient({
      from: vi.fn((table: string) => {
        if (table === 'profiles') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { avatar_url: 'https://cdn.example/avatar.jpg', onboarding_done: true }, error: null }) }) }),
        }
        if (table === 'trainer_applications') return {
          select: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          insert: (value: Record<string, unknown>) => {
            inserted = value
            return { select: () => ({ single: async () => ({ data: { id: applicationId, status: 'draft' }, error: null }) }) }
          },
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })
    createClientMock.mockResolvedValue(client)
    const formData = validDraft()
    formData.set('userId', adminId)

    await expect(saveTrainerApplicationDraft(formData)).resolves.toEqual({
      ok: true,
      applicationId,
      status: 'draft',
    })
    expect(inserted).toMatchObject({ user_id: userId, professional_name: 'Alex Entrenador' })
    expect(inserted).not.toHaveProperty('userId')
    expect(inserted).not.toHaveProperty('government_id')
  })

  it('never opens a server dependency when forbidden identity data is supplied', async () => {
    const formData = validDraft()
    formData.set('government_id', 'secret')
    await expect(saveTrainerApplicationDraft(formData)).resolves.toEqual({
      ok: false,
      error: 'La solicitud contiene campos de identidad no permitidos.',
    })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('uploads an owned credential to the private normalized path without a public URL', async () => {
    const uploaded: Array<{ path: string; options: unknown }> = []
    let inserted: Record<string, unknown> | undefined
    const client = authClient({
      from: vi.fn((table: string) => {
        if (table === 'trainer_applications') return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: applicationId, user_id: userId, status: 'draft' }, error: null }) }) }) }),
        }
        if (table === 'trainer_application_credentials') return {
          insert: (value: Record<string, unknown>) => {
            inserted = value
            return { select: () => ({ single: async () => ({ data: { id: credentialId }, error: null }) }) }
          },
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })
    const bucket = {
      upload: vi.fn(async (path: string, _file: File, options: unknown) => {
        uploaded.push({ path, options })
        return { error: null }
      }),
      remove: vi.fn(async () => ({ error: null })),
    }
    const service = { storage: { from: vi.fn(() => bucket) } }
    createClientMock.mockResolvedValue(client)
    createServiceClientMock.mockReturnValue(service)

    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialType', 'document')
    formData.set('title', 'Certificacion')
    formData.set('file', new File(['pdf'], 'certificate.exe', { type: 'application/pdf' }))
    formData.set('userId', adminId)

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({ ok: true, credentialId })
    expect(uploaded).toEqual([{
      path: `${userId}/${applicationId}/${credentialId}.pdf`,
      options: { contentType: 'application/pdf', upsert: false },
    }])
    expect(inserted).toMatchObject({
      id: credentialId,
      application_id: applicationId,
      storage_path: `${userId}/${applicationId}/${credentialId}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 3,
    })
    expect(service.storage.from).toHaveBeenCalledWith('trainer-credentials')
    expect(bucket).not.toHaveProperty('getPublicUrl')
  })

  it('does not initialize private storage for unsupported MIME or an unowned application', async () => {
    const invalidFile = new FormData()
    invalidFile.set('applicationId', applicationId)
    invalidFile.set('credentialType', 'document')
    invalidFile.set('title', 'Certificacion')
    invalidFile.set('file', new File(['bad'], 'bad.txt', { type: 'text/plain' }))
    await expect(uploadTrainerCredential(invalidFile)).resolves.toMatchObject({ ok: false })
    expect(createClientMock).not.toHaveBeenCalled()

    const client = authClient({
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      })),
    })
    createClientMock.mockResolvedValue(client)
    const validFile = new FormData()
    validFile.set('applicationId', applicationId)
    validFile.set('credentialType', 'document')
    validFile.set('title', 'Certificacion')
    validFile.set('file', new File(['pdf'], 'credential.pdf', { type: 'application/pdf' }))
    await expect(uploadTrainerCredential(validFile)).resolves.toEqual({ ok: false, error: 'Solicitud no disponible.' })
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('removes storage only when the stored path belongs to the authenticated owner', async () => {
    const removed: string[][] = []
    const credentialQuery = (storagePath: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: credentialId, application_id: applicationId, storage_path: storagePath }, error: null }) }),
        }),
      }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    })
    const bucket = { remove: vi.fn(async (paths: string[]) => { removed.push(paths); return { error: null } }) }
    createServiceClientMock.mockReturnValue({ storage: { from: () => bucket } })

    createClientMock.mockResolvedValue(authClient({
      from: vi.fn(() => credentialQuery(`${userId}/${applicationId}/${credentialId}.pdf`)),
    }))
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialId', credentialId)
    await expect(removeTrainerCredential(formData)).resolves.toEqual({ ok: true })
    expect(removed).toEqual([[`${userId}/${applicationId}/${credentialId}.pdf`]])

    removed.length = 0
    createClientMock.mockResolvedValue(authClient({
      from: vi.fn(() => credentialQuery(`${adminId}/${applicationId}/${credentialId}.pdf`)),
    }))
    await expect(removeTrainerCredential(formData)).resolves.toEqual({ ok: false, error: 'Ruta de credencial no valida.' })
    expect(removed).toEqual([])
  })

  it('submits through the applicant RPC and creates deduplicated admin notifications', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { application_id: applicationId, user_id: userId, status: 'submitted', transitioned: true, event_id: 'event-1' },
      error: null,
    })
    createClientMock.mockResolvedValue(authClient({ rpc }))
    createServiceClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: adminId }], error: null }) }) }),
      })),
    })
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('userId', adminId)

    await expect(submitTrainerApplication(formData)).resolves.toEqual({
      ok: true,
      applicationId,
      status: 'submitted',
      transitioned: true,
    })
    expect(rpc).toHaveBeenCalledWith('submit_trainer_application', { p_application_id: applicationId })
    expect(createProductNotificationMock).toHaveBeenCalledWith({
      recipientUserId: adminId,
      type: 'trainer_application_status',
      title: 'Nueva solicitud de entrenador',
      body: 'Una solicitud de entrenador esta lista para revision.',
      url: `/admin/trainers/${applicationId}`,
      dedupeKey: `trainer-application:${applicationId}:submitted:event-1`,
      payload: { applicationId, status: 'submitted' },
    })
  })

  it('withdraws through the applicant RPC without trusting form ownership', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { application_id: applicationId, user_id: userId, status: 'withdrawn', transitioned: true, event_id: 'event-2' },
      error: null,
    })
    createClientMock.mockResolvedValue(authClient({ rpc }))
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('userId', adminId)

    await expect(withdrawTrainerApplication(formData)).resolves.toEqual({
      ok: true,
      applicationId,
      status: 'withdrawn',
      transitioned: true,
    })
    expect(rpc).toHaveBeenCalledWith('withdraw_trainer_application', { p_application_id: applicationId })
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })
})

describe('trainer application database boundary', () => {
  const migration = readFileSync(
    new URL('../../../../supabase/migrations/041_trainer_verification.sql', import.meta.url),
    'utf8',
  )

  it('exposes applicant-only transactional submit and withdraw RPCs', () => {
    for (const fn of ['submit_trainer_application', 'withdraw_trainer_application']) {
      expect(migration).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(p_application_id UUID\\)[\\s\\S]+SECURITY DEFINER[\\s\\S]+SET search_path = public, pg_temp`, 'i'))
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(UUID\\) FROM PUBLIC, anon, service_role`, 'i'))
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(UUID\\) TO authenticated`, 'i'))
    }
    expect(migration).toMatch(/submit_trainer_application[\s\S]+auth\.uid\(\)[\s\S]+FOR UPDATE[\s\S]+trainer_application_events/i)
    expect(migration).toMatch(/withdraw_trainer_application[\s\S]+auth\.uid\(\)[\s\S]+FOR UPDATE[\s\S]+trainer_application_events/i)
  })
})

describe('trainerCredentialPath', () => {
  it('builds the exact owner/application/credential path', () => {
    expect(trainerCredentialPath(userId, applicationId, credentialId, 'pdf')).toBe(
      `${userId}/${applicationId}/${credentialId}.pdf`,
    )
  })
})
