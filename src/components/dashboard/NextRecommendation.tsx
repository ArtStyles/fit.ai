'use client'

import { ArrowRight, MessageCircle, RotateCcw, Sparkles, TrendingUp } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { DashboardRecommendation } from './dashboardViewModel'

const DAY_NAMES: Record<number, string> = {
  1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo',
}

function getRecommendationContent(recommendation: DashboardRecommendation, t: (source: string) => string) {
  if (recommendation.kind === 'recover-session') {
    return {
      icon: RotateCcw,
      title: t('Recupera tu sesión pendiente'),
      description: `${recommendation.workout.name}${recommendation.isoDay ? ` · ${t(DAY_NAMES[recommendation.isoDay])}` : ''}`,
      action: t('Entrenar ahora'),
    }
  }
  if (recommendation.kind === 'plan-adjustment') {
    return {
      icon: TrendingUp,
      title: t('Revisa los ajustes de tu plan'),
      description: `${recommendation.adjustmentCount} ${t(recommendation.adjustmentCount === 1 ? 'progresión sugerida' : 'progresiones sugeridas')}`,
      action: t('Ver ajustes'),
    }
  }
  if (recommendation.kind === 'daily-brief') {
    return {
      icon: Sparkles,
      title: t('Siguiente recomendación'),
      description: recommendation.message,
      action: null,
    }
  }
  return {
    icon: Sparkles,
    title: t('Prepara tu próxima sesión'),
    description: `${recommendation.workout.name}${recommendation.isoDay ? ` · ${t(DAY_NAMES[recommendation.isoDay])}` : ''}`,
    action: t('Ver plan'),
  }
}

export function NextRecommendation({ recommendation }: { recommendation: DashboardRecommendation | null }) {
  const { t } = useI18n()
  if (!recommendation) return null
  const content = getRecommendationContent(recommendation, t)
  const Icon = content.icon

  return (
    <section aria-labelledby="recommendation-title" className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.07] p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-violet-300">{t('A continuación')}</p>
          <h2 id="recommendation-title" className="mt-1 font-display text-xl font-bold text-foreground">{content.title}</h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{content.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {recommendation.href && content.action && (
          <PendingLink href={recommendation.href} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-base font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 motion-reduce:transition-none">
            {content.action}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PendingLink>
        )}
        <PendingLink href={recommendation.chatHref} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-violet-400/35 px-4 text-base font-semibold text-violet-200 transition-colors hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 motion-reduce:transition-none">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />{t('Preguntar al coach')}
        </PendingLink>
      </div>
    </section>
  )
}
