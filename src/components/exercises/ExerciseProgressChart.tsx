'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { PeriodSelector } from '@/components/evidence/PeriodSelector'
import { PendingLink } from '@/components/navigation/PendingLink'
import { dateLocale } from '@/lib/i18n'
import { filterExercisePoints, type ExerciseProgressPoint } from './exerciseDetailViewModel'

type RangeWeeks = 4 | 12 | 24

function number(value: number, locale: 'es' | 'en'): string {
  return new Intl.NumberFormat(dateLocale(locale), { maximumFractionDigits: 1 }).format(value)
}

export function ExerciseProgressChart({
  points,
  todayStr,
  locale,
}: {
  points: ExerciseProgressPoint[]
  todayStr: string
  locale: 'es' | 'en'
}) {
  const [rangeWeeks, setRangeWeeks] = useState<RangeWeeks>(12)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const visiblePoints = useMemo(
    () => filterExercisePoints(points, todayStr, rangeWeeks),
    [points, rangeWeeks, todayStr],
  )
  const selected = visiblePoints.find(point => point.logId === selectedLogId) ?? visiblePoints.at(-1)
  const maxWeight = Math.max(1, ...visiblePoints.map(point => point.maxWeightKg))

  return (
    <section className="rounded-3xl border border-border/60 bg-muted/[0.05] p-4 sm:p-6" aria-labelledby="exercise-progress-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{locale === 'en' ? 'Performance evidence' : 'Evidencia de rendimiento'}</p>
          <h2 id="exercise-progress-title" className="mt-1 font-display text-2xl font-bold text-foreground">{locale === 'en' ? 'Strength evolution' : 'Evolución de fuerza'}</h2>
        </div>
        <PeriodSelector
          value={rangeWeeks}
          options={[
            { value: 4, label: locale === 'en' ? '4 weeks' : '4 semanas' },
            { value: 12, label: locale === 'en' ? '12 weeks' : '12 semanas' },
            { value: 24, label: locale === 'en' ? '24 weeks' : '24 semanas' },
          ]}
          onChange={setRangeWeeks}
          label={locale === 'en' ? 'Select chart period' : 'Seleccionar periodo del gráfico'}
          className="w-full sm:w-[19rem]"
        />
      </div>

      {visiblePoints.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border/60 px-5 py-10 text-center text-sm text-muted-foreground">
          {locale === 'en' ? 'No recorded appearances in this period.' : 'No hay apariciones registradas en este periodo.'}
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-x-auto pb-2">
            <div
              className="flex h-52 items-end gap-2"
              style={{ minWidth: `${Math.max(544, visiblePoints.length * 44 + Math.max(0, visiblePoints.length - 1) * 8)}px` }}
              role="group"
              aria-label={locale === 'en' ? 'Maximum weight by appearance' : 'Peso máximo por aparición'}
            >
              {visiblePoints.map(point => {
                const height = point.maxWeightKg > 0 ? Math.max(8, Math.round((point.maxWeightKg / maxWeight) * 100)) : 3
                const label = `${point.dateLabel ?? point.date}: ${number(point.maxWeightKg, locale)} kg · ${point.repsAtMaxWeight} reps`
                return (
                  <button
                    key={point.logId}
                    type="button"
                    aria-pressed={selected?.logId === point.logId}
                    aria-label={label}
                    onClick={() => setSelectedLogId(point.logId)}
                    className="group flex min-h-44 min-w-0 flex-1 flex-col justify-end rounded-xl px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <span className="flex h-36 w-full items-end overflow-hidden rounded-t-lg bg-muted/10" aria-hidden="true">
                      <span
                        className="w-full rounded-t-lg bg-violet-500/35 transition-[height,background-color] duration-300 group-hover:bg-violet-400/60 group-aria-pressed:bg-violet-400 motion-reduce:transition-none"
                        style={{ height: `${height}%` }}
                      />
                    </span>
                    <span className="mt-2 max-w-full truncate text-[10px] text-muted-foreground">{point.dateLabel ?? point.date}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {selected ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                <span className="font-semibold capitalize text-foreground">{selected.dateLabel ?? selected.date}</span>
                {' · '}{number(selected.maxWeightKg, locale)} kg × {selected.repsAtMaxWeight}
                {' · '}{number(selected.volumeKg, locale)} kg {locale === 'en' ? 'volume' : 'de volumen'}
                {selected.averageRpe !== null ? ` · RPE ${selected.averageRpe}` : ''}
              </p>
              <PendingLink href={`/history/${selected.logId}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" spinnerClassName="h-3.5 w-3.5">
                {locale === 'en' ? 'Open session' : 'Abrir sesión'}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </PendingLink>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
