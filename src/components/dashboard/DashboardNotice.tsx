'use client'

import { Sparkles } from 'lucide-react'
import { AINotesBanner, type BannerContext } from './AINotesBanner'
import { CheckInBanner } from './CheckInBanner'
import { DashboardPromoBanner } from './DashboardPromoBanner'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import type { DashboardNotice, DashboardNoticePlacement } from './dashboardViewModel'
import type { DashboardBannerData } from '@/lib/dashboard/banner'

export type DashboardNoticeProps = {
  notice: DashboardNotice | null
  aiNotes: string | null
  planName: string | null
  bannerContext: BannerContext
  promo: DashboardBannerData | null
  placement?: DashboardNoticePlacement
}

export function DashboardNotice({
  notice,
  aiNotes,
  planName,
  bannerContext,
  promo,
  placement = 'inline',
}: DashboardNoticeProps) {
  const { t } = useI18n()
  if (!notice) return null

  if (notice.kind === 'needs-plan') {
    return (
      <div data-notice-placement={placement} className={cn('rounded-2xl border border-violet-400/35 bg-violet-500/10 p-5', placement === 'hub' && 'shadow-xl shadow-black/15')} role="status">
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
              className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[hsl(var(--training-action))] px-4 text-base font-bold text-slate-950 transition-[filter,transform] duration-[var(--motion-press)] hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--training-action))] focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
            >
              {t('Reintentar generación')}
            </PendingLink>
          </div>
        </div>
      </div>
    )
  }

  if (notice.kind === 'check-in') return <div data-notice-placement={placement}><CheckInBanner /></div>
  if (notice.kind === 'ai-notes' && aiNotes && planName) {
    return <div data-notice-placement={placement}><AINotesBanner aiNotes={aiNotes} planName={planName} bannerContext={bannerContext} /></div>
  }
  if (notice.kind === 'promo' && promo) return <div data-notice-placement={placement}><DashboardPromoBanner banner={promo} /></div>
  return null
}

export const DashboardMainNotice = DashboardNotice
