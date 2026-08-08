import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createProductNotification } from '@/lib/notifications/product'
import { trainerCredentialPath } from '@/lib/coaching/trainerCredentialPath'
import {
  removeTrainerCredential,
  saveTrainerApplicationDraft,
  submitTrainerApplication,
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
const cleanupId = '55555555-5555-4555-8555-555555555555'

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
    const applicationFilters: Array<[string, unknown]> = []
    const rpc = vi.fn().mockResolvedValue({
      data: { application_id: applicationId, status: 'draft' },
      error: null,
    })
    const client = authClient({
      rpc,
      from: vi.fn((table: string) => {
        if (table === 'profiles') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { avatar_url: 'https://cdn.example/avatar.jpg', onboarding_done: true }, error: null }) }) }),
        }
        if (table === 'trainer_profiles') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }
        if (table === 'trainer_applications') return {
          select: () => {
            const query = {
              eq: (column: string, value: unknown) => {
                applicationFilters.push([column, value])
                return query
              },
              in: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }
            return query
          },
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
    expect(rpc).toHaveBeenCalledWith('save_trainer_application_draft', {
      p_payload: expect.objectContaining({ professional_name: 'Alex Entrenador' }),
    })
    expect(applicationFilters).toContainEqual(['application_kind', 'initial'])
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('attacker')
    expect(inserted).toBeUndefined()
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

  it('blocks a new initial draft when any trainer profile already exists', async () => {
    const insert = vi.fn()
    const client = authClient({
      from: vi.fn((table: string) => {
        if (table === 'profiles') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { avatar_url: 'https://cdn.example/avatar.jpg', onboarding_done: true }, error: null }) }) }),
        }
        if (table === 'trainer_profiles') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'existing-profile', status: 'suspended' }, error: null }) }) }),
        }
        if (table === 'trainer_applications') return {
          select: () => {
            const query = {
              eq: () => query,
              in: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }
            return query
          },
          insert,
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })
    createClientMock.mockResolvedValue(client)

    await expect(saveTrainerApplicationDraft(validDraft())).resolves.toEqual({
      ok: false,
      error: 'Ya tienes un perfil profesional. Usa la edición de perfil para solicitar cambios.',
    })
    expect(insert).not.toHaveBeenCalled()
  })

  it('uploads an owned credential and registers metadata through the credential RPC', async () => {
    const uploaded: Array<{ path: string; options: unknown }> = []
    const operationOrder: string[] = []
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'list_trainer_credential_cleanup') return { data: [], error: null }
      if (name === 'queue_trainer_credential_cleanup') {
        operationOrder.push('queue')
        return { data: { id: cleanupId, storage_path: `${userId}/${applicationId}/${credentialId}.pdf` }, error: null }
      }
      if (name === 'create_trainer_application_credential') {
        return { data: { id: credentialId, ...args }, error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const client = authClient({
      rpc,
      from: vi.fn((table: string) => {
        if (table === 'trainer_applications') return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: applicationId, user_id: userId, status: 'draft', application_kind: 'initial' }, error: null }) }) }) }),
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })
    const bucket = {
      upload: vi.fn(async (path: string, _file: File, options: unknown) => {
        operationOrder.push('upload')
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
    expect(rpc).toHaveBeenCalledWith('queue_trainer_credential_cleanup', {
      p_application_id: applicationId,
      p_credential_id: credentialId,
      p_storage_path: `${userId}/${applicationId}/${credentialId}.pdf`,
    })
    expect(rpc).toHaveBeenCalledWith('create_trainer_application_credential', expect.objectContaining({
      p_credential_id: credentialId,
      p_application_id: applicationId,
      p_credential_type: 'document',
      p_mime_type: 'application/pdf',
      p_size_bytes: 3,
    }))
    expect(service.storage.from).toHaveBeenCalledWith('trainer-credentials')
    expect(bucket).not.toHaveProperty('getPublicUrl')
    expect(operationOrder).toEqual(['queue', 'upload'])
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

  it('does not upload without a durable cleanup job and recovers when queueing succeeds on retry', async () => {
    let queueAttempts = 0
    const storagePath = `${userId}/${applicationId}/${credentialId}.pdf`
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_trainer_credential_cleanup') return { data: [], error: null }
      if (name === 'queue_trainer_credential_cleanup') {
        queueAttempts += 1
        return queueAttempts === 1
          ? { data: null, error: { message: 'database unavailable' } }
          : { data: { id: cleanupId, storage_path: storagePath }, error: null }
      }
      if (name === 'create_trainer_application_credential') {
        return { data: { id: credentialId }, error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const client = authClient({
      rpc,
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: applicationId, user_id: userId, status: 'draft', application_kind: 'initial' }, error: null }) }) }) }),
      })),
    })
    const bucket = {
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => ({ error: null })),
    }
    createClientMock.mockResolvedValue(client)
    createServiceClientMock.mockReturnValue({ storage: { from: () => bucket } })
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialType', 'document')
    formData.set('title', 'Certificacion')
    formData.set('file', new File(['pdf'], 'certificate.pdf', { type: 'application/pdf' }))

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({
      ok: false,
      error: 'No se pudo preparar la carga privada; intenta nuevamente.',
    })
    expect(bucket.upload).not.toHaveBeenCalled()
    expect(bucket.remove).not.toHaveBeenCalled()

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({ ok: true, credentialId })
    expect(bucket.upload).toHaveBeenCalledTimes(1)
  })

  it('keeps an upload failure observable in the outbox and cleans it before a successful retry', async () => {
    const storagePath = `${userId}/${applicationId}/${credentialId}.pdf`
    let cleanupQueued = false
    let uploadAttempts = 0
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_trainer_credential_cleanup') {
        return { data: cleanupQueued ? [{ id: cleanupId, storage_path: storagePath }] : [], error: null }
      }
      if (name === 'queue_trainer_credential_cleanup') {
        cleanupQueued = true
        return { data: { id: cleanupId, storage_path: storagePath }, error: null }
      }
      if (name === 'record_trainer_credential_cleanup_failure') return { data: true, error: null }
      if (name === 'finalize_trainer_credential_cleanup') {
        cleanupQueued = false
        return { data: true, error: null }
      }
      if (name === 'create_trainer_application_credential') {
        cleanupQueued = false
        return { data: { id: credentialId }, error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const client = authClient({
      rpc,
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: applicationId, user_id: userId, status: 'draft', application_kind: 'initial' }, error: null }) }) }) }),
      })),
    })
    const bucket = {
      upload: vi.fn(async () => {
        uploadAttempts += 1
        return uploadAttempts === 1
          ? { error: { message: 'storage unavailable' } }
          : { error: null }
      }),
      remove: vi.fn(async () => ({ error: null })),
    }
    createClientMock.mockResolvedValue(client)
    createServiceClientMock.mockReturnValue({ storage: { from: () => bucket } })
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialType', 'document')
    formData.set('title', 'Certificacion')
    formData.set('file', new File(['pdf'], 'certificate.pdf', { type: 'application/pdf' }))

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({
      ok: false,
      error: 'No se pudo cargar la credencial; la limpieza quedo pendiente.',
    })
    expect(cleanupQueued).toBe(true)
    expect(rpc).toHaveBeenCalledWith('record_trainer_credential_cleanup_failure', {
      p_cleanup_id: cleanupId,
      p_error: 'storage unavailable',
    })

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({ ok: true, credentialId })
    expect(bucket.remove).toHaveBeenCalledWith([storagePath])
    expect(bucket.upload).toHaveBeenCalledTimes(2)
    expect(cleanupQueued).toBe(false)
  })

  it('keeps a durable cleanup reference when storage removal fails and completes it on retry', async () => {
    let removalFails = true
    let cleanupPending = false
    let credentialExists = true
    const storagePath = `${userId}/${applicationId}/${credentialId}.pdf`
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_trainer_credential_cleanup') {
        return { data: cleanupPending ? [{ id: cleanupId, storage_path: storagePath }] : [], error: null }
      }
      if (name === 'prepare_trainer_credential_removal') {
        cleanupPending = credentialExists
        return { data: credentialExists ? { cleanup_id: cleanupId, storage_path: storagePath } : null, error: null }
      }
      if (name === 'record_trainer_credential_cleanup_failure') return { data: true, error: null }
      if (name === 'finalize_trainer_credential_cleanup') {
        cleanupPending = false
        credentialExists = false
        return { data: true, error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const bucket = {
      remove: vi.fn(async () => removalFails
        ? { error: { message: 'storage unavailable' } }
        : { error: null }),
    }
    createServiceClientMock.mockReturnValue({ storage: { from: () => bucket } })
    createClientMock.mockResolvedValue(authClient({ rpc }))
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialId', credentialId)

    await expect(removeTrainerCredential(formData)).resolves.toEqual({
      ok: false,
      error: 'No se pudo limpiar el archivo privado; la limpieza quedo pendiente.',
    })
    expect(cleanupPending).toBe(true)
    expect(credentialExists).toBe(true)
    expect(rpc).toHaveBeenCalledWith('record_trainer_credential_cleanup_failure', {
      p_cleanup_id: cleanupId,
      p_error: 'storage unavailable',
    })

    removalFails = false
    await expect(removeTrainerCredential(formData)).resolves.toEqual({ ok: true })
    expect(cleanupPending).toBe(false)
    expect(credentialExists).toBe(false)
  })

  it('persists a cleanup job before credential metadata and keeps failures observable', async () => {
    const storagePath = `${userId}/${applicationId}/${credentialId}.pdf`
    let cleanupQueued = false
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_trainer_credential_cleanup') return { data: cleanupQueued ? [{ id: cleanupId, storage_path: storagePath }] : [], error: null }
      if (name === 'queue_trainer_credential_cleanup') {
        cleanupQueued = true
        return { data: { id: cleanupId, storage_path: storagePath }, error: null }
      }
      if (name === 'create_trainer_application_credential') return { data: null, error: { message: 'metadata rejected' } }
      if (name === 'record_trainer_credential_cleanup_failure') return { data: true, error: null }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const client = authClient({
      rpc,
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: applicationId, user_id: userId, status: 'draft', application_kind: 'initial' }, error: null }) }) }) }),
      })),
    })
    const bucket = {
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => ({ error: { message: 'storage unavailable' } })),
    }
    createClientMock.mockResolvedValue(client)
    createServiceClientMock.mockReturnValue({ storage: { from: () => bucket } })
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialType', 'document')
    formData.set('title', 'Certificacion')
    formData.set('file', new File(['pdf'], 'certificate.pdf', { type: 'application/pdf' }))

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({
      ok: false,
      error: 'No se pudo guardar la credencial; la limpieza del archivo quedo pendiente.',
    })
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'list_trainer_credential_cleanup',
      'queue_trainer_credential_cleanup',
      'create_trainer_application_credential',
      'create_trainer_application_credential',
      'list_trainer_credential_cleanup',
      'record_trainer_credential_cleanup_failure',
    ])
  })

  it('retries an ambiguous metadata RPC response before deleting the uploaded object', async () => {
    const storagePath = `${userId}/${applicationId}/${credentialId}.pdf`
    let createAttempts = 0
    const rpc = vi.fn(async (name: string) => {
      if (name === 'list_trainer_credential_cleanup') return { data: [], error: null }
      if (name === 'queue_trainer_credential_cleanup') return { data: { id: cleanupId, storage_path: storagePath }, error: null }
      if (name === 'create_trainer_application_credential') {
        createAttempts += 1
        return createAttempts === 1
          ? { data: null, error: { message: 'connection reset after commit' } }
          : { data: { id: credentialId }, error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const client = authClient({
      rpc,
      from: vi.fn(() => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: applicationId, user_id: userId, status: 'draft', application_kind: 'initial' }, error: null }) }) }) }),
      })),
    })
    const bucket = {
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => ({ error: null })),
    }
    createClientMock.mockResolvedValue(client)
    createServiceClientMock.mockReturnValue({ storage: { from: () => bucket } })
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialType', 'document')
    formData.set('title', 'Certificacion')
    formData.set('file', new File(['pdf'], 'certificate.pdf', { type: 'application/pdf' }))

    await expect(uploadTrainerCredential(formData)).resolves.toEqual({ ok: true, credentialId })
    expect(createAttempts).toBe(2)
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('submits through the applicant RPC without a fallible post-commit notification dependency', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { application_id: applicationId, user_id: userId, status: 'submitted', transitioned: true, event_id: 'event-1' },
      error: null,
    })
    createClientMock.mockResolvedValue(authClient({ rpc }))
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
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(createProductNotificationMock).not.toHaveBeenCalled()
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
  const applyPage = readFileSync(
    new URL('../../(app)/coach/apply/page.tsx', import.meta.url),
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

  it('keeps the initial-application workflow isolated from profile updates', () => {
    expect(applyPage).toMatch(/from\('trainer_applications'\)[\s\S]+\.eq\('application_kind', 'initial'\)/)
    expect(migration).toMatch(/create_trainer_application_credential[\s\S]+application_kind <> 'initial'/i)
    expect(migration).toMatch(/queue_trainer_credential_cleanup[\s\S]+application_kind <> 'initial'/i)
    expect(migration).toMatch(/prepare_trainer_credential_removal[\s\S]+application_kind <> 'initial'/i)
  })
})

describe('trainerCredentialPath', () => {
  it('builds the exact owner/application/credential path', () => {
    expect(trainerCredentialPath(userId, applicationId, credentialId, 'pdf')).toBe(
      `${userId}/${applicationId}/${credentialId}.pdf`,
    )
  })
})
