'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { CalendarDays, Clock3, Gauge, Sparkles } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'

type PlanOverviewProps = {
  name: string
  sourceLabel: string
  daysPerWeek: number
  durationMinutes: number | null
  difficultyLabel: string | null
  constraintLabels: string[]
  switcher: ReactNode
  prescriptionLocked?: boolean
  professionalVersionNumber?: number | null
  professionalChangeSummary?: string | null
  professionalTrainerName?: string | null
}

export function PlanOverview({
  name,
  sourceLabel,
  daysPerWeek,
  durationMinutes,
  difficultyLabel,
  constraintLabels,
  switcher,
  prescriptionLocked = false,
  professionalVersionNumber = null,
  professionalChangeSummary = null,
  professionalTrainerName = null,
}: PlanOverviewProps) {
  const { t } = useI18n()

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 via-[hsl(var(--surface-1))] to-background p-5 shadow-2xl shadow-black/15 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {sourceLabel}
          </div>
          {prescriptionLocked && (
            <p className="mt-3 inline-flex rounded-full border border-violet-400/40 bg-violet-500/15 px-3 py-1 text-xs font-bold text-violet-100">
              {t('Asignada por entrenador')} · {professionalVersionNumber === null
                ? t('Versión no disponible')
                : t('Versión {version}', { version: professionalVersionNumber })}
            </p>
          )}
          {prescriptionLocked && professionalChangeSummary && (
            <p className="mt-2 text-sm leading-relaxed text-violet-100/80">{professionalChangeSummary}</p>
          )}
          {prescriptionLocked && professionalTrainerName && (
            <p className="mt-2 text-sm text-violet-100/80">{t('Asignada por')} <Link href="/coaching" className="font-semibold text-violet-100 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{professionalTrainerName}</Link></p>
          )}
          <h1 className="mt-3 text-balance font-display text-3xl font-extrabold leading-tight text-foreground sm:text-4xl">{name}</h1>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <CalendarDays className="h-5 w-5 text-violet-300" aria-hidden="true" />
              <span><strong className="block text-base text-foreground">{daysPerWeek}</strong><span className="text-xs text-muted-foreground">{t('días/sem')}</span></span>
            </div>
            <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <Clock3 className="h-5 w-5 text-violet-300" aria-hidden="true" />
              <span><strong className="block text-base text-foreground">{durationMinutes ? t('{minutes} min', { minutes: durationMinutes }) : '—'}</strong><span className="text-xs text-muted-foreground">{t('por sesión')}</span></span>
            </div>
            <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/60 bg-background/45 px-4 py-3">
              <Gauge className="h-5 w-5 text-violet-300" aria-hidden="true" />
              <span><strong className="block text-base text-foreground">{difficultyLabel ?? '—'}</strong><span className="text-xs text-muted-foreground">{t('Nivel')}</span></span>
            </div>
          </div>
        </div>
        <div className="w-full lg:w-80">{switcher}</div>
      </div>

      {constraintLabels.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-5" aria-label={t('Restricciones aplicadas')}>
          {constraintLabels.map(label => (
            <span key={label} className="rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">{label}</span>
          ))}
        </div>
      )}
    </section>
  )
}
