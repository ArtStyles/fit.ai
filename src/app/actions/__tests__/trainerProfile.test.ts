import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServiceClient, requireActiveTrainerContext, revalidatePath } = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  requireActiveTrainerContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }))
vi.mock('next/cache', () => ({ revalidatePath }))

const OWNED_PHOTO_URL = 'https://project-ref.supabase.co/storage/v1/object/public/avatars/owner-user-1/avatar.webp?v=123'

function photoStorageService() {
  return {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({
          data: {
            publicUrl: 'https://project-ref.supabase.co/storage/v1/object/public/avatars/owner-user-1/avatar.webp',
          },
        })),
        list: vi.fn().mockResolvedValue({ data: [{ name: 'avatar.webp' }], error: null }),
      })),
    },
  }
}

function validProfileForm(): FormData {
  const formData = new FormData()
  formData.set('professionalName', 'Ada Entrenadora')
  formData.set('professionalPhotoUrl', OWNED_PHOTO_URL)
  formData.set('bio', 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.')
  formData.set('specialties', 'Fuerza, Movilidad')
  formData.append('modalities', 'online')
  formData.append('modalities', 'hybrid')
  formData.set('experienceSummary', 'Ocho anos acompanando procesos sostenibles de fuerza y movilidad.')
  formData.set('generalLocation', 'La Habana')
  formData.set('languages', 'Espanol, Ingles')
  return formData
}

function profileSupabase(rpc: ReturnType<typeof vi.fn>) {
  return {
    rpc,
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          }),
        }),
      }),
    })),
  }
}

describe('updateTrainerProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createServiceClient.mockReturnValue(photoStorageService())
  })

  it('uses the active trainer context and sends no client-supplied owner identity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        profile_updated: true,
        review_application_id: 'application-review-1',
        review_status: 'submitted',
      },
      error: null,
    })
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: profileSupabase(rpc),
      trainerProfile: {
        id: 'trainer-profile-1',
        status: 'active',
        professional_photo_url: 'https://legacy.example.test/ada.jpg',
      },
    })
    const formData = validProfileForm()
    formData.set('userId', 'attacker-user')
    formData.set('trainerProfileId', 'attacker-profile')
    const { updateTrainerProfile } = await import('../trainerProfile')

    await expect(updateTrainerProfile(formData)).resolves.toEqual({
      ok: true,
      directUpdated: true,
      reviewApplicationId: 'application-review-1',
      reviewStatus: 'submitted',
    })
    expect(requireActiveTrainerContext).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('save_trainer_profile_changes', {
      p_payload: {
        professionalName: 'Ada Entrenadora',
        professionalPhotoUrl: OWNED_PHOTO_URL,
        bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
        specialties: ['Fuerza', 'Movilidad'],
        modalities: ['online', 'hybrid'],
        experienceSummary: 'Ocho anos acompanando procesos sostenibles de fuerza y movilidad.',
        generalLocation: 'La Habana',
        languages: ['Espanol', 'Ingles'],
      },
    })
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('attacker')
    expect(revalidatePath).toHaveBeenCalledWith('/coach/profile')
  })

  it('rejects a changed external HTTPS photo before invoking the profile RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        profile_updated: true,
        review_application_id: null,
        review_status: null,
      },
      error: null,
    })
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: profileSupabase(rpc),
      trainerProfile: {
        id: 'trainer-profile-1',
        status: 'active',
        professional_photo_url: 'https://legacy.example.test/ada.jpg',
      },
    })
    const formData = validProfileForm()
    formData.set('professionalPhotoUrl', 'https://attacker.example.test/ada.jpg')
    const { updateTrainerProfile } = await import('../trainerProfile')

    const result = await updateTrainerProfile(formData)

    expect(result).toEqual({
      ok: false,
      error: 'Revisa los campos del perfil profesional.',
      fieldErrors: {
        professionalPhotoUrl: 'Selecciona una foto subida por tu cuenta.',
      },
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects malformed direct and reviewed fields before invoking the RPC', async () => {
    const rpc = vi.fn()
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: profileSupabase(rpc),
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
    })
    const formData = validProfileForm()
    formData.set('professionalName', 'A')
    formData.set('professionalPhotoUrl', 'javascript:alert(1)')
    formData.set('bio', 'Corta')
    formData.set('specialties', '')
    formData.delete('modalities')
    formData.set('experienceSummary', 'Corta')
    formData.set('languages', '')
    const { updateTrainerProfile } = await import('../trainerProfile')

    const result = await updateTrainerProfile(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.fieldErrors).toMatchObject({
        professionalName: expect.any(String),
        professionalPhotoUrl: expect.any(String),
        bio: expect.any(String),
        specialties: expect.any(String),
        modalities: expect.any(String),
        experienceSummary: expect.any(String),
        languages: expect.any(String),
      })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('keeps an already-open administrative review observable', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        profile_updated: true,
        review_application_id: 'application-review-1',
        review_status: 'under_review',
      },
      error: null,
    })
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: profileSupabase(rpc),
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
    })
    const { updateTrainerProfile } = await import('../trainerProfile')

    await expect(updateTrainerProfile(validProfileForm())).resolves.toMatchObject({
      ok: true,
      reviewApplicationId: 'application-review-1',
      reviewStatus: 'under_review',
    })
  })

  it('returns an actionable error when the transactional save fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'conflict' } })
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: profileSupabase(rpc),
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
    })
    const { updateTrainerProfile } = await import('../trainerProfile')

    await expect(updateTrainerProfile(validProfileForm())).resolves.toEqual({
      ok: false,
      error: 'No se pudo guardar el perfil profesional.',
    })
  })

  it('rejects clearing location while a locked pending review would make the profile hybrid', async () => {
    const rpc = vi.fn()
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { status: 'under_review', modalities: ['hybrid'] },
      error: null,
    })
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: {
        rpc,
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({ limit: () => ({ maybeSingle }) }),
                }),
              }),
            }),
          }),
        })),
      },
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
    })
    const formData = validProfileForm()
    formData.delete('modalities')
    formData.append('modalities', 'online')
    formData.set('generalLocation', '')
    const { updateTrainerProfile } = await import('../trainerProfile')

    await expect(updateTrainerProfile(formData)).resolves.toEqual({
      ok: false,
      error: 'Añade una ubicación general antes de guardar: tu perfil aprobado o revisión pendiente incluye atención presencial o híbrida.',
      fieldErrors: {
        generalLocation: 'La ubicación es obligatoria mientras el perfil aprobado o pendiente incluya atención presencial o híbrida.',
      },
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects clearing location while currently approved modalities remain hybrid', async () => {
    const rpc = vi.fn()
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { status: 'submitted', modalities: ['online'] },
      error: null,
    })
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: {
        rpc,
        from: vi.fn(() => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({ limit: () => ({ maybeSingle }) }),
                }),
              }),
            }),
          }),
        })),
      },
      trainerProfile: { id: 'trainer-profile-1', status: 'active', modalities: ['hybrid'] },
    })
    const formData = validProfileForm()
    formData.delete('modalities')
    formData.append('modalities', 'online')
    formData.set('generalLocation', '')
    const { updateTrainerProfile } = await import('../trainerProfile')

    await expect(updateTrainerProfile(formData)).resolves.toEqual({
      ok: false,
      error: 'Añade una ubicación general antes de guardar: tu perfil aprobado o revisión pendiente incluye atención presencial o híbrida.',
      fieldErrors: {
        generalLocation: 'La ubicación es obligatoria mientras el perfil aprobado o pendiente incluya atención presencial o híbrida.',
      },
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
