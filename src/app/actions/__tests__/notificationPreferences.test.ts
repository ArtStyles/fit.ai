import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))

import { updateProductNotificationPreferences } from '../notifications'

function mockCreateClient({
  user,
  upsert,
}: {
  user: { id: string } | null
  upsert: ReturnType<typeof vi.fn>
}) {
  createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(() => ({ upsert })),
  })
}

describe('updateProductNotificationPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts product preferences for an authenticated user', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mockCreateClient({ user: { id: 'user-1' }, upsert })

    await expect(updateProductNotificationPreferences({
      professionalEnabled: false,
      pushEnabled: true,
    })).resolves.toEqual({ ok: true })

    expect(upsert).toHaveBeenCalledWith({
      professional_enabled: false,
      push_enabled: true,
    }, { onConflict: 'user_id' })
  })
})
