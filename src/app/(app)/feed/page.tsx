import Link from 'next/link'
import { Bell, PlusCircle, Search } from 'lucide-react'
import { getDiscoverFeed, getFollowingFeed } from '@/app/actions/feed'
import { getPendingRequestCount } from '@/app/actions/follows'
import { FeedTabs } from '@/components/social/FeedTabs'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { isCommunityEnabled } from '@/lib/features/community'
import { redirect } from 'next/navigation'

export default async function FeedPage() {
  if (!isCommunityEnabled()) redirect('/trainers')
  const { profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  // Cargamos ambos feeds en paralelo (latencia = máx, no suma). getFollowingFeed es
  // barato si no sigues a nadie, y precargarlo hace que cambiar a la pestaña Siguiendo
  // sea instantáneo (sin flash de carga). Decisión deliberada para Fase 2.
  const [discover, following, pendingRequests] = await Promise.all([
    getDiscoverFeed(), getFollowingFeed(), getPendingRequestCount(),
  ])

  return (
    <div className="mx-auto max-w-lg pb-24">
      <FixedTopBar contentClassName="justify-between">
        <h1 className="text-lg font-bold">{t('Comunidad')}</h1>
        <div className="flex items-center gap-1">
          <Link href="/solicitudes" aria-label={t('Solicitudes de seguimiento')} className="relative flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <Bell className="h-5 w-5" />
            {pendingRequests > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {pendingRequests}
              </span>
            )}
          </Link>
          <Link href="/buscar" aria-label={t('Buscar usuarios')} className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <Search className="h-5 w-5" />
          </Link>
          <Link href="/feed/new" aria-label={t('Nueva publicación')} className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
            <PlusCircle className="h-5 w-5" /> {t('Publicar')}
          </Link>
        </div>
      </FixedTopBar>
      <FeedTabs discover={discover} following={following} />
    </div>
  )
}
