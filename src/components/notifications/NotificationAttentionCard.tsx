'use client'

import { ArrowRight, Sparkles } from 'lucide-react'
import type { NotificationAttention } from '@/app/actions/notifications'
import { CheckInBanner } from '@/components/dashboard/CheckInBanner'
import { DashboardPromoBanner } from '@/components/dashboard/DashboardPromoBanner'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { SwipeDismissPlanNotice } from '@/components/notifications/SwipeDismissPlanNotice'

export {
  dismissPlanNoticeInteraction,
  shouldDismissPlanNotice,
} from '@/components/notifications/SwipeDismissPlanNotice'

export function NotificationAttentionCard({ attention }: { attention: NotificationAttention }) {
  const { t } = useI18n()

  if (attention.notice.kind === 'check-in') return <CheckInBanner />
  if (attention.notice.kind === 'promo' && attention.promo) {
    return <DashboardPromoBanner banner={attention.promo} />
  }

  if (attention.notice.kind === 'ai-notes' && attention.aiNotes) {
    return (
      <SwipeDismissPlanNotice
        aiNotes={attention.aiNotes}
        planName={attention.planName ?? t('Tu plan')}
        dismissalKey={attention.dismissalKey}
      />
    )
  }

  return (
    <article className="rounded-3xl border border-violet-500/30 bg-violet-500/[0.08] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-bold text-foreground">{t('Tu perfil está listo')}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('No encontramos un plan activo. Puedes iniciar la generación sin repetir el onboarding.')}
          </p>
          <PendingLink
            href="/plans/generate?autostart=1"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[hsl(var(--training-action))] px-4 text-sm font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--training-action))]"
          >
            {t('Generar mi plan')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PendingLink>
        </div>
      </div>
    </article>
  )
}
