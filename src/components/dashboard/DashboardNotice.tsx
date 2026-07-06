'use client'

import { Sparkles } from 'lucide-react'
import { AINotesBanner, type BannerContext } from './AINotesBanner'
import { CheckInBanner } from './CheckInBanner'
import { DashboardPromoBanner } from './DashboardPromoBanner'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { DashboardNotice } from './dashboardViewModel'
import type { DashboardBannerData } from '@/lib/dashboard/banner'

type Props = {
  notice: DashboardNotice | null
  aiNotes: string | null
  planName: string | null
  bannerContext: BannerContext
  promo: DashboardBannerData | null
}

export function DashboardNotice({ notice, aiNotes, planName, bannerContext, promo }: Props) {
  const { t } = useI18n()
  if (!notice) return null

  if (notice.kind === 'needs-plan') {
    return (
      <div className="rounded-2xl border border-violet-400/35 bg-violet-500/10 p-5" role="status">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold text-foreground">{t('Tu perfil está listo')}</h2>
            <p className="mt-1 text-base leading-relaxed text-muted-foreground">
              {t('No encontramos un plan activo. Puedes reintentar la generación sin repetir el onboarding.')}
            </p>
            <PendingLink
              href="/plans/generate?autostart=1"
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-violet-600 px-4 text-base font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
            >
              {t('Reintentar generación')}
            </PendingLink>
          </div>
        </div>
      </div>
    )
  }

  if (notice.kind === 'check-in') return <CheckInBanner />
  if (notice.kind === 'ai-notes' && aiNotes && planName) {
    return <AINotesBanner aiNotes={aiNotes} planName={planName} bannerContext={bannerContext} />
  }
  if (notice.kind === 'promo' && promo) return <DashboardPromoBanner banner={promo} />
  return null
}
