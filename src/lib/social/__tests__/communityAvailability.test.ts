import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

class RouteBoundary extends Error {
  constructor(
    readonly kind: 'redirect' | 'notFound',
    readonly destination?: string,
  ) {
    super(kind)
  }
}

const originalCommunityEnabled = process.env.COMMUNITY_ENABLED

function unavailableDependency(): never {
  throw new Error('A disabled community route or action invoked a social dependency.')
}

beforeEach(() => {
  process.env.COMMUNITY_ENABLED = 'false'
  vi.resetModules()

  vi.doMock('@/lib/supabase/server', () => ({ createClient: unavailableDependency }))
  vi.doMock('@/lib/supabase/service', () => ({ createServiceClient: unavailableDependency }))
  vi.doMock('@/lib/notifications/socialPush', () => ({
    notifyFollowAccepted: unavailableDependency,
    notifyFollowCreated: unavailableDependency,
  }))
  vi.doMock('@/lib/auth/server', () => ({ requireAppUserContext: unavailableDependency }))
  vi.doMock('next/navigation', () => ({
    redirect: (destination: string): never => { throw new RouteBoundary('redirect', destination) },
    notFound: (): never => { throw new RouteBoundary('notFound') },
  }))
})

afterAll(() => {
  if (originalCommunityEnabled === undefined) delete process.env.COMMUNITY_ENABLED
  else process.env.COMMUNITY_ENABLED = originalCommunityEnabled
})

describe('community availability', () => {
  it('returns unavailable action results and empty read contracts without social dependencies when disabled', async () => {
    const feed = await import('@/app/actions/feed')
    const follows = await import('@/app/actions/follows')
    const posts = await import('@/app/actions/posts')
    const moderation = await import('@/app/actions/moderation')

    await expect(posts.createPost(new FormData())).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(posts.createPostFromSession('log-1')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(posts.createPostFromPlan('plan-1')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(posts.deletePost('post-1')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(posts.clonePlanFromPost('post-1')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })

    await expect(follows.followUser('user-2')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(follows.unfollowUser('user-2')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(follows.acceptFollowRequest('user-2')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(follows.rejectFollowRequest('user-2')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(follows.getPendingRequestCount()).resolves.toBe(0)
    await expect(follows.getFollowRequests()).resolves.toEqual([])

    await expect(moderation.reportContent({ postId: 'post-1', reason: 'reason' })).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(moderation.blockUser('user-2')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })
    await expect(moderation.unblockUser('user-2')).resolves.toEqual({ ok: false, error: 'Comunidad no esta disponible.' })

    await expect(feed.getDiscoverFeed()).resolves.toEqual({ posts: [], nextCursor: null })
    await expect(feed.getFollowingFeed()).resolves.toEqual({ posts: [], nextCursor: null })
    await expect(feed.getProfile('athlete')).resolves.toEqual({
      author: null,
      posts: [],
      postCount: 0,
      followerCount: 0,
      followingCount: 0,
      followState: 'follow',
      isPrivate: false,
      canViewPosts: false,
      isMe: false,
    })
    await expect(feed.getPostDetail('post-1')).resolves.toBeNull()
  })

  it('terminates disabled community route entry points before auth or feed loading', async () => {
    const FeedPage = (await import('@/app/(app)/feed/page')).default
    const NewPostPage = (await import('@/app/(app)/feed/new/page')).default
    const PostDetailPage = (await import('@/app/(app)/post/[id]/page')).default

    await expect(FeedPage()).rejects.toMatchObject({ kind: 'redirect', destination: '/trainers' })
    await expect(NewPostPage()).rejects.toMatchObject({ kind: 'notFound' })
    await expect(PostDetailPage({ params: { id: 'post-1' } })).rejects.toMatchObject({ kind: 'notFound' })
  })
})
