import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext, revalidatePath } = vi.hoisted(() => ({
  requireActiveTrainerContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

function validProfileForm(): FormData {
  const formData = new FormData()
  formData.set('professionalName', 'Ada Entrenadora')
  formData.set('professionalPhotoUrl', 'https://cdn.example.test/ada-new.jpg')
  formData.set('bio', 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.')
  formData.set('specialties', 'Fuerza, Movilidad')
  formData.append('modalities', 'online')
  formData.append('modalities', 'hybrid')
  formData.set('experienceSummary', 'Ocho anos acompanando procesos sostenibles de fuerza y movilidad.')
  formData.set('generalLocation', 'La Habana')
  formData.set('languages', 'Espanol, Ingles')
  return formData
}

describe('updateTrainerProfile', () => {
  beforeEach(() => vi.clearAllMocks())

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
      supabase: { rpc },
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
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
        professionalPhotoUrl: 'https://cdn.example.test/ada-new.jpg',
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

  it('rejects malformed direct and reviewed fields before invoking the RPC', async () => {
    const rpc = vi.fn()
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'owner-user-1' },
      supabase: { rpc },
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
      supabase: { rpc },
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
      supabase: { rpc },
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
    })
    const { updateTrainerProfile } = await import('../trainerProfile')

    await expect(updateTrainerProfile(validProfileForm())).resolves.toEqual({
      ok: false,
      error: 'No se pudo guardar el perfil profesional.',
    })
  })
})
