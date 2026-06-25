// src/components/social/FeedTabs.tsx
'use client'

import { useState } from 'react'
import type { FeedPage } from '@/lib/social/types'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { PostFeed } from './PostFeed'
import { cn } from '@/lib/utils'

type Tab = 'descubrir' | 'siguiendo'

export function FeedTabs({ discover, following }: { discover: FeedPage; following: FeedPage }) {
  const [tab, setTab] = useState<Tab>('descubrir')

  return (
    <div>
      <div className="flex border-b border-border/40">
        <button
          onClick={() => setTab('descubrir')}
          className={cn('h-11 flex-1 text-sm font-medium transition-colors',
            tab === 'descubrir' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground')}
        >
          Descubrir
        </button>
        <button
          onClick={() => setTab('siguiendo')}
          className={cn('h-11 flex-1 text-sm font-medium transition-colors',
            tab === 'siguiendo' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground')}
        >
          Siguiendo
        </button>
      </div>

      {tab === 'descubrir' ? (
        <PostFeed key="descubrir" initialPosts={discover.posts} initialCursor={discover.nextCursor} fetchPage={getDiscoverFeed} />
      ) : (
        <PostFeed
          key="siguiendo"
          initialPosts={following.posts}
          initialCursor={following.nextCursor}
          fetchPage={getFollowingFeed}
          emptyMessage={
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              <p>Sigue a gente para ver sus rutinas aquí.</p>
              <button onClick={() => setTab('descubrir')} className="mt-3 font-medium text-primary">
                Explorar Descubrir
              </button>
            </div>
          }
        />
      )}
    </div>
  )
}
