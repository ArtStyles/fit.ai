import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { getProfile } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from '@/components/social/FollowButton'
import { ProfilePostGrid } from '@/components/social/ProfilePostGrid'
import { PrivateProfileNotice } from '@/components/social/PrivateProfileNotice'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts, postCount, followerCount, followingCount, followState, isPrivate, canViewPosts, isMe } = await getProfile(username)
  if (!author) notFound()

  const name = author.full_name || author.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="border-b border-border/40 px-4 py-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20">
            {author.avatar_url && <AvatarImage src={author.avatar_url} alt={name} />}
            <AvatarFallback className="text-2xl">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 justify-around text-center">
            <div><div className="text-lg font-bold">{postCount}</div><div className="text-xs text-muted-foreground">publicaciones</div></div>
            <div><div className="text-lg font-bold">{followerCount}</div><div className="text-xs text-muted-foreground">seguidores</div></div>
            <div><div className="text-lg font-bold">{followingCount}</div><div className="text-xs text-muted-foreground">siguiendo</div></div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <p className="text-sm font-semibold">{name}</p>
          {isPrivate && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Cuenta privada" />}
        </div>
        {author.username && <p className="text-sm text-muted-foreground">@{author.username}</p>}

        <div className="mt-4">
          {isMe ? (
            <Link href="/settings/perfil" className="flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium">
              Editar perfil
            </Link>
          ) : (
            <FollowButton targetId={author.id} isPrivate={isPrivate} initialState={followState} />
          )}
        </div>
      </header>

      {canViewPosts ? <ProfilePostGrid posts={posts} /> : <PrivateProfileNotice />}
    </div>
  )
}
