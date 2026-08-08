import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { requireAppUserContext, redirect } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  }),
}))

vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('next/navigation', () => ({ redirect }))

type ProfileStatus = 'active' | 'suspended' | 'inactive'

function trainerProfile(status: ProfileStatus) {
  return {
    id: 'trainer-profile-1',
    user_id: 'user-1',
    source_application_id: 'application-approved',
    slug: 'ada-entrenadora',
    status,
    professional_name: 'Ada Entrenadora',
    professional_photo_url: null,
    bio: 'Entrenadora profesional.',
    specialties: ['Fuerza'],
    modalities: ['online'],
    experience_summary: 'Ocho anos de experiencia.',
    general_location: 'La Habana',
    languages: ['Espanol'],
    verified_at: '2026-08-01T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }
}

function accessClient(profile: ReturnType<typeof trainerProfile> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn((table: string) => {
    if (table !== 'trainer_profiles') throw new Error(`Unexpected table: ${table}`)
    return { select }
  })

  return { client: { from }, from, select, eq, maybeSingle }
}

describe('getTrainerAccess', () => {
  beforeEach(() => vi.clearAllMocks())

  it('denies a user without an approved trainer profile', async () => {
    const { getTrainerAccess } = await import('../access')
    const query = accessClient(null)

    await expect(getTrainerAccess('user-1', query.client as never)).resolves.toEqual({
      granted: false,
      reason: 'missing_profile',
    })
  })

  it('does not grant a pending applicant professional access', async () => {
    const { getTrainerAccess } = await import('../access')
    const query = accessClient(null)

    const access = await getTrainerAccess('user-with-pending-application', query.client as never)

    expect(access.granted).toBe(false)
    expect(query.from).toHaveBeenCalledTimes(1)
    expect(query.from).toHaveBeenCalledWith('trainer_profiles')
  })

  it.each(['inactive', 'suspended'] as const)('denies a %s trainer profile', async status => {
    const { getTrainerAccess } = await import('../access')
    const query = accessClient(trainerProfile(status))

    await expect(getTrainerAccess('user-1', query.client as never)).resolves.toEqual({
      granted: false,
      reason: status,
    })
  })

  it('grants access only from an active trainer_profiles row', async () => {
    const { getTrainerAccess } = await import('../access')
    const profile = trainerProfile('active')
    const query = accessClient(profile)

    await expect(getTrainerAccess('user-1', query.client as never)).resolves.toEqual({
      granted: true,
      profile,
    })
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1')
  })
})

describe('requireActiveTrainerContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stops at the global suspension guard before querying trainer data', async () => {
    requireAppUserContext.mockRejectedValueOnce(new Error('REDIRECT:/suspended'))
    const { requireActiveTrainerContext } = await import('../access')

    await expect(requireActiveTrainerContext()).rejects.toThrow('REDIRECT:/suspended')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('returns authenticated context plus the active professional profile', async () => {
    const query = accessClient(trainerProfile('active'))
    requireAppUserContext.mockResolvedValueOnce({
      user: { id: 'user-1', email: 'ada@example.test' },
      profile: { onboarding_done: true, account_status: 'active' },
      supabase: query.client,
    })
    const { requireActiveTrainerContext } = await import('../access')

    const context = await requireActiveTrainerContext()

    expect(context.user.id).toBe('user-1')
    expect(context.trainerProfile.status).toBe('active')
  })
})
