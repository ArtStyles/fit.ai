// src/components/social/FeedTabs.tsx
'use client'

import { useState } from 'react'
import type { FeedPage } from '@/lib/social/types'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { PostFeed } from './PostFeed'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

type Tab = 'descubrir' | 'siguiendo'

export function FeedTabs({ discover, following }: { discover: FeedPage; following: FeedPage }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('descubrir')

  return (
    <div>
      <div className="flex border-b border-border/40" role="tablist" aria-label="Feeds">
        <button
          onClick={() => setTab('descubrir')}
          role="tab"
          aria-selected={tab === 'descubrir'}
          id="tab-descubrir"
          aria-controls="panel-descubrir"
          tabIndex={tab === 'descubrir' ? 0 : -1}
          className={cn('h-11 flex-1 text-sm font-medium transition-colors',
            tab === 'descubrir' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground')}
        >
          {t('Descubrir')}
        </button>
        <button
          onClick={() => setTab('siguiendo')}
          role="tab"
          aria-selected={tab === 'siguiendo'}
          id="tab-siguiendo"
          aria-controls="panel-siguiendo"
          tabIndex={tab === 'siguiendo' ? 0 : -1}
          className={cn('h-11 flex-1 text-sm font-medium transition-colors',
            tab === 'siguiendo' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground')}
        >
          {t('Siguiendo')}
        </button>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
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
                <p>{t('Sigue a gente para ver sus rutinas aquí.')}</p>
                <button onClick={() => setTab('descubrir')} className="mt-3 font-medium text-primary">
                  {t('Explorar Descubrir')}
                </button>
              </div>
            }
          />
        )}
      </div>
    </div>
  )
}
