// src/components/social/UserRow.tsx
import Link from 'next/link'
import type { SuggestedUser } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from './FollowButton'

export function UserRow({ user }: { user: SuggestedUser }) {
  const name = user.full_name || user.username || 'Usuario'
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link
        href={user.username ? `/u/${user.username}` : '#'}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar className="h-11 w-11">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          {user.username && <p className="truncate text-xs text-muted-foreground">@{user.username}</p>}
        </div>
      </Link>
      <FollowButton targetId={user.id} initialFollowing={user.isFollowing} />
    </div>
  )
}
