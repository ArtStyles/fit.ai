import Link from 'next/link'
import { ArrowLeft, Images } from 'lucide-react'
import { PostComposer } from '@/components/social/PostComposer'
import { requireAppUserContext } from '@/lib/auth/server'

export default async function NewPostPage() {
  const { profile } = await requireAppUserContext()
  const name = profile.full_name || profile.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-8">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md">
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
      </header>
      <PostComposer author={{
        name,
        username: profile.username,
        avatarUrl: profile.avatar_url,
      }} />
    </div>
  )
}
