// src/components/social/PostFeed.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeedPost, FeedPage } from '@/lib/social/types'
import { PostCard } from './PostCard'

export function PostFeed({ initialPosts, initialCursor, fetchPage, emptyMessage }: {
  initialPosts: FeedPost[]
  initialCursor: string | null
  fetchPage: (cursor: string) => Promise<FeedPage>
  emptyMessage?: React.ReactNode
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    const page = await fetchPage(cursor)
    setPosts(prev => [...prev, ...page.posts])
    setCursor(page.nextCursor)
    setLoading(false)
  }, [cursor, loading, fetchPage])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  if (posts.length === 0) {
    return (
      <>{emptyMessage ?? <p className="px-4 py-16 text-center text-sm text-muted-foreground">Aún no hay publicaciones.</p>}</>
    )
  }

  return (
    <div>
      {posts.map(p => <PostCard key={p.id} post={p} />)}
      <div ref={sentinel} aria-live="polite" className="flex h-12 items-center justify-center">
        {loading && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="sr-only">Cargando más publicaciones</span>
          </>
        )}
      </div>
    </div>
  )
}
