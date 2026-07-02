// src/app/(app)/buscar/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSuggestedUsers } from '@/app/actions/users'
import { UserSearch } from '@/components/social/UserSearch'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export default async function BuscarPage() {
  const { profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const suggested = await getSuggestedUsers()

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label={t('Volver')} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">{t('Buscar usuarios')}</h1>
      </header>
      <UserSearch suggested={suggested} />
    </div>
  )
}
