import Link from 'next/link'
import { Dumbbell, ClipboardList, AlignLeft } from 'lucide-react'
import type { FeedPost } from '@/lib/social/types'
import { postTileKind } from '@/lib/social/profile'

export function ProfilePostGrid({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Sin publicaciones todavía.</p>
  }
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {posts.map(post => {
        const kind = postTileKind(post)
        return (
          <Link key={post.id} href={`/post/${post.id}`} className="relative aspect-square overflow-hidden bg-muted/20">
            {kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.photo_urls[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-muted-foreground">
                {kind === 'session' && <Dumbbell className="h-6 w-6" />}
                {kind === 'routine' && <ClipboardList className="h-6 w-6" />}
                {kind === 'text' && <AlignLeft className="h-6 w-6" />}
                <span className="text-[10px]">
                  {kind === 'session' ? 'Sesión' : kind === 'routine' ? 'Rutina' : 'Texto'}
                </span>
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}
