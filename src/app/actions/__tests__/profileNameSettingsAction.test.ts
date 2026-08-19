import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { updateProfileName } from '../settings'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const createClientMock = vi.mocked(createClient)

describe('updateProfileName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a fullName error for 101 characters before opening a profile query', async () => {
    const from = vi.fn()
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)
    const formData = new FormData()
    formData.set('fullName', 'a'.repeat(101))

    const result = await (updateProfileName as unknown as (
      previous: unknown,
      data: FormData,
    ) => Promise<unknown>)({ ok: false, message: null, fieldErrors: {} }, formData)

    expect(result).toEqual({
      ok: false,
      message: null,
      fieldErrors: { fullName: 'El nombre no puede superar 100 caracteres.' },
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('updates only full_name for the authenticated user at the 100-character boundary', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }))
    const from = vi.fn(() => ({ update }))
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from,
    } as never)
    const fullName = 'a'.repeat(100)
    const formData = new FormData()
    formData.set('fullName', fullName)

    const result = await updateProfileName({ ok: false, message: null, fieldErrors: {} }, formData)

    expect(result).toEqual({ ok: true, message: 'Nombre actualizado.', fieldErrors: {} })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ full_name: fullName })
    expect(update.mock.results[0]?.value.eq).toHaveBeenCalledWith('id', 'user-1')
  })
})
