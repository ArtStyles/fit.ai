// src/components/social/DiscoverFeed.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeedPost } from '@/lib/social/types'
import { getDiscoverFeed } from '@/app/actions/feed'
import { PostCard } from './PostCard'

export function DiscoverFeed({ initialPosts, initialCursor }: {
  initialPosts: FeedPost[]; initialCursor: string | null
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    const page = await getDiscoverFeed(cursor)
    setPosts(prev => [...prev, ...page.posts])
    setCursor(page.nextCursor)
    setLoading(false)
  }, [cursor, loading])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  if (posts.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Aún no hay publicaciones. ¡Sé el primero!</p>
  }

  return (
    <div>
      {posts.map(p => <PostCard key={p.id} post={p} />)}
      <div ref={sentinel} className="flex h-12 items-center justify-center">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  )
}
