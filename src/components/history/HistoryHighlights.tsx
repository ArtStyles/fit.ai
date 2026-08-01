'use client'

import { Medal, Trophy } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { dateLocale } from '@/lib/i18n'

export type HistoryHighlight = {
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  bestDate: string
  maxWeightKg: number
  repsAtMaxWeight: number
  maxReps: number
}

function formatWeight(value: number, language: 'es' | 'en'): string {
  if (value <= 0) return '—'
  return `${new Intl.NumberFormat(dateLocale(language), { maximumFractionDigits: 1 }).format(value)} kg`
}

export function HistoryHighlights({ records }: { records: HistoryHighlight[] }) {
  const { language, t } = useI18n()

  return (
    <aside className="rounded-3xl border border-amber-500/15 bg-amber-500/[0.035] p-5 lg:sticky lg:top-24" aria-labelledby="history-highlights-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300/80">{t('Evidencia acumulada')}</p>
          <h2 id="history-highlights-title" className="mt-1 font-display text-2xl font-bold text-foreground">{t('Hitos recientes')}</h2>
        </div>
        <Trophy className="h-5 w-5 text-amber-300" aria-hidden="true" />
      </div>

      {records.length === 0 ? (
        <p className="mt-5 border-t border-border/50 pt-5 text-sm leading-relaxed text-muted-foreground">
          {language === 'en'
            ? 'Personal records will appear after comparable exercise logs are saved.'
            : 'Las marcas aparecerán cuando existan registros comparables del mismo ejercicio.'}
        </p>
      ) : (
        <div className="mt-4">
          {records.slice(0, 5).map((record, index) => (
            <PendingLink
              key={record.exerciseId}
              href={`/exercises/${record.exerciseId}`}
              className="group flex min-h-16 items-center justify-between gap-3 border-t border-amber-500/15 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              spinnerClassName="h-3.5 w-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-xs font-bold text-amber-300">
                  {index === 0 ? <Medal className="h-4 w-4" aria-hidden="true" /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground group-hover:text-amber-100">{record.exerciseName}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {record.muscleGroups.slice(0, 2).join(' · ') || new Intl.DateTimeFormat(dateLocale(language), { day: 'numeric', month: 'short' }).format(new Date(`${record.bestDate}T00:00:00`))}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold tabular-nums text-amber-200">
                  {record.maxWeightKg > 0 ? formatWeight(record.maxWeightKg, language) : `${record.maxReps} reps`}
                </p>
                {record.repsAtMaxWeight > 0 ? <p className="text-[11px] text-muted-foreground">{record.repsAtMaxWeight} reps</p> : null}
              </div>
            </PendingLink>
          ))}
        </div>
      )}
    </aside>
  )
}
