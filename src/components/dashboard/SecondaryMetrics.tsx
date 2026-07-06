'use client'

import { Activity, ChevronRight, Flame, Medal, TrendingUp, Weight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Sparkline } from './Sparkline'
import type { DashboardViewModel } from './dashboardViewModel'

export function SecondaryMetrics({ metrics }: { metrics: DashboardViewModel['secondaryMetrics'] }) {
  const { language, t } = useI18n()

  return (
    <section aria-labelledby="metrics-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="metrics-title" className="font-display text-xl font-bold text-foreground">{t('Tu progreso')}</h2>
        <PendingLink href="/history" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          {t('Historial')}<ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PendingLink>
      </div>

      {!metrics.hasCompletedSessions ? (
        <div className="mt-3 rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-base font-semibold text-foreground">{t('Empieza tu camino')}</p>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">{t('Tu primera sesión te espera. Cada serie cuenta.')}</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <Flame className="h-5 w-5 text-violet-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">{t('Racha activa')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-foreground">{metrics.streak} <span className="text-base font-medium text-muted-foreground">{t('días')}</span></p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <Weight className="h-5 w-5 text-violet-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">{t('Volumen semanal')}</p>
              <p className="mt-1 font-display text-2xl font-bold text-foreground">{metrics.volumeKg.toLocaleString(language === 'en' ? 'en-US' : 'es-ES')} <span className="text-base font-medium text-muted-foreground">kg</span></p>
              {metrics.volumeSeries.length >= 3 && (
                <div className="mt-3 h-8 text-violet-300" role="img" aria-label={t('Tendencia de volumen')}>
                  <Sparkline data={metrics.volumeSeries} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            {metrics.latestSession && (
              <PendingLink href={`/history/${metrics.latestSession.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-violet-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none">
                <Activity className="h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-foreground">{t('Última sesión')}</span><span className="block truncate text-sm text-muted-foreground">{metrics.latestSession.workoutName}</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </PendingLink>
            )}
            {metrics.topRecord && (
              <PendingLink href={`/exercises/${metrics.topRecord.exerciseId}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-violet-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none">
                <Medal className="h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-foreground">{t('Mejor marca personal')}</span><span className="block truncate text-sm text-muted-foreground">{metrics.topRecord.exerciseName} · {metrics.topRecord.maxWeightKg} kg</span></span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </PendingLink>
            )}
            {metrics.activeAdjustments > 0 && (
              <PendingLink href="/plan" className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-violet-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none">
                <TrendingUp className="h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-base font-semibold text-foreground">{metrics.activeAdjustments} {t(metrics.activeAdjustments === 1 ? 'peso actualizado' : 'pesos actualizados')}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </PendingLink>
            )}
          </div>
        </>
      )}
    </section>
  )
}
