import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Lock, UserRound } from 'lucide-react'
import { getProfile } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from '@/components/social/FollowButton'
import { ProfilePostGrid } from '@/components/social/ProfilePostGrid'
import { PrivateProfileNotice } from '@/components/social/PrivateProfileNotice'
import { ProfileConnectionsStats } from '@/components/social/ProfileConnectionsStats'
import { PageTopBar } from '@/components/navigation/PageTopBar'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts, postCount, followerCount, followingCount, followState, isPrivate, canViewPosts, isMe } = await getProfile(username)
  if (!author) notFound()

  const name = author.full_name || author.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-24">
      <PageTopBar
        title={name}
        subtitle={author.username ? `@${author.username}` : 'Perfil'}
        backHref="/feed"
        backLabel="Comunidad"
        icon={<UserRound className="h-5 w-5" />}
      />

      <header className="border-b border-border/40 px-4 py-6">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20">
            {author.avatar_url && <AvatarImage src={author.avatar_url} alt={name} />}
            <AvatarFallback className="text-2xl">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <ProfileConnectionsStats
            username={username}
            postCount={postCount}
            followerCount={followerCount}
            followingCount={followingCount}
            canViewConnections={canViewPosts}
          />
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
