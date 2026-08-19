// src/components/social/PostCard.tsx
'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import type { FeedPost } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PostMedia } from './PostMedia'
import { SessionCard } from './SessionCard'
import { RoutineCard } from './RoutineCard'
import { LikeButton } from './LikeButton'
import { PostMenu } from './PostMenu'
import { formatPostDate, formatPostDateTime } from '@/lib/social/date'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale } from '@/lib/i18n'

export function PostCard({ post }: { post: FeedPost }) {
  const { language, timeZone } = useI18n()
  const name = post.author.full_name || post.author.username || 'Usuario'
  const handle = post.author.username
  const locale = dateLocale(language)
  const postDate = formatPostDate(post.created_at, locale, timeZone)
  const postDateTime = formatPostDateTime(post.created_at, locale, timeZone)

  return (
    <article className="border-b border-border/40 px-4 py-4">
      <header className="mb-3 flex items-center gap-3">
        <Link href={handle ? `/u/${handle}` : '#'} className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {post.author.avatar_url && <AvatarImage src={post.author.avatar_url} alt={name} />}
            <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{name}</p>
            {handle && <p className="text-xs text-muted-foreground">@{handle}</p>}
          </div>
        </Link>
        <div className="ml-auto">
          <PostMenu postId={post.id} authorId={post.author.id} isMine={post.is_mine} />
        </div>
      </header>

      {post.body && <p className="mb-3 whitespace-pre-wrap text-sm">{post.body}</p>}
      {post.photo_urls.length > 0 && <div className="mb-3"><PostMedia urls={post.photo_urls} /></div>}
      {post.session_snapshot && <div className="mb-3"><SessionCard snap={post.session_snapshot} /></div>}
      {post.routine_snapshot && <div className="mb-3"><RoutineCard snap={post.routine_snapshot} postId={post.id} /></div>}

      <footer className="flex items-center gap-4">
        <LikeButton postId={post.id} initialLiked={post.liked_by_me} initialCount={post.like_count} />
        <Link href={`/post/${post.id}`} className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle className="h-5 w-5" />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </Link>
        {postDate && (
          <time
            dateTime={post.created_at}
            title={postDateTime}
            className="ml-auto text-[11px] font-medium uppercase tracking-wide text-muted-foreground/75"
          >
            {postDate}
          </time>
        )}
      </footer>
    </article>
  )
}
