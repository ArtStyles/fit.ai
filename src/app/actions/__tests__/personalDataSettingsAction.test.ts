import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { INITIAL_PERSONAL_DATA_STATE } from '@/lib/profile/personalData'
import { updatePersonalData } from '../settings'

function formData(overrides: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    heightCm: '175.5',
    dateOfBirth: '1996-01-01',
    gender: 'other',
    ...overrides,
  })) form.set(key, value)
  return form
}

function mockClient({
  user = { id: 'user-1' } as { id: string } | null,
  from = vi.fn(),
}: {
  user?: { id: string } | null
  from?: ReturnType<typeof vi.fn>
} = {}) {
  const getUser = vi.fn().mockResolvedValue({ data: { user } })
  createClient.mockResolvedValue({ auth: { getUser }, from } as never)
  return { getUser, from }
}

describe('updatePersonalData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('authenticates before rejecting invalid data and never opens a query', async () => {
    const { getUser, from } = mockClient()

    const result = await updatePersonalData(
      INITIAL_PERSONAL_DATA_STATE,
      formData({ heightCm: '99' }),
    )

    expect(getUser).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      ok: false,
      message: null,
      formError: 'Revisa los campos indicados.',
      fieldErrors: { heightCm: expect.any(String) },
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('updates only personal-data columns for the authenticated profile', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null })
    const select = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }))
    const from = vi.fn((table: string) => {
      expect(table).toBe('profiles')
      return { update }
    })
    mockClient({ from })

    const result = await updatePersonalData(INITIAL_PERSONAL_DATA_STATE, formData())

    expect(result).toEqual({
      ok: true,
      message: 'Datos personales guardados.',
      formError: null,
      fieldErrors: {},
    })
    expect(update).toHaveBeenCalledWith({
      height_cm: 175.5,
      date_of_birth: '1996-01-01',
      gender: 'other',
      last_check_in_at: expect.any(String),
    })
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('weight_kg')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(select).toHaveBeenCalledWith('id')
    expect(single).toHaveBeenCalledOnce()
  })

  it('persists optional empty fields as null', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null })
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) }))
    mockClient({ from: vi.fn(() => ({ update })) })

    await updatePersonalData(INITIAL_PERSONAL_DATA_STATE, formData({
      heightCm: '',
      dateOfBirth: '',
      gender: '',
    }))

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      height_cm: null,
      date_of_birth: null,
      gender: null,
    }))
  })

  it('returns a stable authentication error without opening a query', async () => {
    const { from } = mockClient({ user: null })

    await expect(updatePersonalData(INITIAL_PERSONAL_DATA_STATE, formData())).resolves.toEqual({
      ok: false,
      message: null,
      formError: 'Sesión no válida.',
      fieldErrors: {},
    })
    expect(from).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns a stable persistence error and does not revalidate on failure', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'write failed' } })
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
    }))
    mockClient({ from: vi.fn(() => ({ update })) })

    await expect(updatePersonalData(INITIAL_PERSONAL_DATA_STATE, formData())).resolves.toEqual({
      ok: false,
      message: null,
      formError: 'No se pudieron guardar los datos personales.',
      fieldErrors: {},
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates settings and progress consumers only after confirmed success', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null })
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ select: vi.fn(() => ({ single })) })),
    }))
    mockClient({ from: vi.fn(() => ({ update })) })

    await updatePersonalData(INITIAL_PERSONAL_DATA_STATE, formData())

    expect(revalidatePath.mock.calls).toEqual([
      ['/settings/datos'],
      ['/dashboard'],
      ['/progress'],
    ])
  })
})
