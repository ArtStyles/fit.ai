import Link from 'next/link'
import { ArrowLeft, Images } from 'lucide-react'
import { PostComposer } from '@/components/social/PostComposer'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { requireAppUserContext } from '@/lib/auth/server'
import { isCommunityEnabled } from '@/lib/features/community'
import { notFound } from 'next/navigation'

export default async function NewPostPage() {
  if (!isCommunityEnabled()) notFound()
  const { profile } = await requireAppUserContext()
  const name = profile.full_name || profile.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-8">
      <FixedTopBar accountSlot="hidden">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Images className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-base font-bold leading-tight">Crear publicación</h1>
          <p className="text-xs text-muted-foreground">Comparte tu progreso</p>
        </div>
      </FixedTopBar>
      <PostComposer author={{
        name,
        username: profile.username,
        avatarUrl: profile.avatar_url,
      }} />
    </div>
  )
}
