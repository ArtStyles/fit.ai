import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { FeedTabs } from '@/components/social/FeedTabs'

export default async function FeedPage() {
  // Cargamos ambos feeds en paralelo (latencia = máx, no suma). getFollowingFeed es
  // barato si no sigues a nadie, y precargarlo hace que cambiar a la pestaña Siguiendo
  // sea instantáneo (sin flash de carga). Decisión deliberada para Fase 2.
  const [discover, following] = await Promise.all([getDiscoverFeed(), getFollowingFeed()])

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold">Comunidad</h1>
        <Link href="/feed/new" aria-label="Nueva publicación" className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
          <PlusCircle className="h-5 w-5" /> Publicar
        </Link>
      </header>
      <FeedTabs discover={discover} following={following} />
    </div>
  )
}
