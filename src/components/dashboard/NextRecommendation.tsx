'use client'

import { ArrowRight, RotateCcw, Sparkles, TrendingUp } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { TranslationValues } from '@/lib/i18n'
import type { DashboardRecommendation } from './dashboardViewModel'
import { DASHBOARD_DAY_KEYS } from './dashboardI18n'

function getRecommendationContent(
  recommendation: DashboardRecommendation,
  t: (source: string, values?: TranslationValues) => string,
) {
  if (recommendation.kind === 'recover-session') {
    return {
      icon: RotateCcw,
      title: t('Recupera tu sesión pendiente'),
      description: recommendation.isoDay
        ? t('{workout} · {day}', { workout: recommendation.workout.name, day: t(DASHBOARD_DAY_KEYS[recommendation.isoDay]) })
        : recommendation.workout.name,
      action: t('Entrenar ahora'),
    }
  }
  if (recommendation.kind === 'plan-adjustment') {
    return {
      icon: TrendingUp,
      title: t('Revisa los ajustes de tu plan'),
      description: t(
        recommendation.adjustmentCount === 1 ? '{count} progresión sugerida' : '{count} progresiones sugeridas',
        { count: recommendation.adjustmentCount },
      ),
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
    description: recommendation.isoDay
      ? t('{workout} · {day}', { workout: recommendation.workout.name, day: t(DASHBOARD_DAY_KEYS[recommendation.isoDay]) })
      : recommendation.workout.name,
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

      {recommendation.href && content.action ? (
        <div className="mt-4">
          <PendingLink href={recommendation.href} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-base font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 motion-reduce:transition-none">
            {content.action}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PendingLink>
        </div>
      ) : null}
    </section>
  )
}
