import { beforeEach, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
vi.mock('@/lib/ai/chatGenerator', () => ({ generateCoachReply: vi.fn() }))
vi.mock('@/lib/ai/coachContextLoader', () => ({ loadCoachContextText: vi.fn() }))
vi.mock('@/lib/ai/rate-limits', () => ({ checkUserRateLimit: vi.fn(), checkGlobalDailyBudget: vi.fn() }))
import { deleteConversation } from '../chat'
beforeEach(() => vi.clearAllMocks())
it('reports a failed deletion and keeps both conversation and verified owner filters', async () => {
  const filters: Array<[string, string]> = []
  const query = { delete: () => query, eq: (key: string, value: string) => { filters.push([key, value]); return query }, then: (resolve: (value: unknown) => void) => Promise.resolve({ error: { message: 'Unavailable' } }).then(resolve) }
  vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => query } as never)
  await expect(deleteConversation('conversation')).resolves.toEqual({ success: false })
  expect(filters).toEqual([['id', 'conversation'], ['user_id', 'owner']])
})
