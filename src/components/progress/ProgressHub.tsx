'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, CalendarCheck, Dumbbell, Ruler, Trophy } from 'lucide-react'
import { EvidenceHero } from '@/components/evidence/EvidenceHero'
import { EvidenceInsight } from '@/components/evidence/EvidenceInsight'
import { MetricStrip } from '@/components/evidence/MetricStrip'
import { PeriodSelector } from '@/components/evidence/PeriodSelector'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { computeCalendarStats, type DayAggregate } from '@/lib/calendar/aggregate'
import { MetricTextSummary } from './MetricTextSummary'
import { summarizeProgress, type ProgressLocale } from './progressSummary'
import { TrainingLoadChart } from './TrainingLoadChart'
import {
  buildProgressSnapshot,
  type ProgressExercisePoint,
  type ProgressMeasurement,
  type ProgressRangeWeeks,
  type ProgressRecord,
  type ProgressSession,
} from './progressViewModel'

type ProgressHubProps = {
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  measurements: ProgressMeasurement[]
  exercisePoints: ProgressExercisePoint[]
  todayStr: string
  locale: ProgressLocale
}

const RANGE_OPTIONS: { value: ProgressRangeWeeks; es: string; en: string }[] = [
  { value: 4, es: '4 semanas', en: '4 weeks' },
  { value: 12, es: '12 semanas', en: '12 weeks' },
  { value: 24, es: '24 semanas', en: '24 weeks' },
]

function copy(locale: ProgressLocale, es: string, en: string): string {
  return locale === 'en' ? en : es
}

function formatNumber(value: number, locale: ProgressLocale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits }).format(value)
}

function formatKg(value: number, locale: ProgressLocale): string {
  return `${formatNumber(Math.round(value), locale, 0)} kg`
}

function formatBodyValue(value: number | null, suffix: string, locale: ProgressLocale): string {
  return value === null ? '—' : `${formatNumber(value, locale)}${suffix}`
}

function formatDate(dateStr: string, locale: ProgressLocale): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{eyebrow}</p>
      <h2 id={id} className="mt-1 font-display text-2xl font-bold text-foreground">{title}</h2>
    </div>
  )
}

function BodyTrend({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const width = 560
  const height = 100
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(1, max - min)
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
    const y = height - 12 - ((value - min) / spread) * (height - 24)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 h-24 w-full" role="img" aria-label="Tendencia de peso corporal">
      <line x1="0" x2={width} y1={height - 12} y2={height - 12} className="stroke-border" strokeWidth="1" />
      <polyline points={points} fill="none" className="stroke-violet-300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ExploreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <PendingLink
      href={href}
      className="group inline-flex min-h-11 items-center gap-2 border-b border-border/60 py-2 text-sm font-semibold text-foreground transition-colors hover:border-violet-400 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      spinnerClassName="h-3.5 w-3.5"
    >
      {children}
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
    </PendingLink>
  )
}

export function ProgressHub({
  sessions,
  days,
  records,
  measurements,
  exercisePoints,
  todayStr,
  locale,
}: ProgressHubProps) {
  const { language, t } = useI18n()
  const resolvedLocale: ProgressLocale = language === 'en' ? 'en' : locale
  const [rangeWeeks, setRangeWeeks] = useState<ProgressRangeWeeks>(12)
  const snapshot = useMemo(() => buildProgressSnapshot({
    todayStr,
    weeks: rangeWeeks,
    sessions,
    days,
    records,
    exercisePoints,
  }), [days, exercisePoints, rangeWeeks, records, sessions, todayStr])

  const selectedDays = useMemo(
    () => days.filter(day => day.date >= snapshot.startDate && day.date <= todayStr),
    [days, snapshot.startDate, todayStr],
  )
  const stats = useMemo(() => computeCalendarStats(selectedDays, todayStr), [selectedDays, todayStr])
  const selectedMeasurements = useMemo(
    () => measurements
      .filter(item => item.recordedDate >= snapshot.startDate && item.recordedDate <= todayStr)
      .sort((a, b) => a.recordedDate.localeCompare(b.recordedDate)),
    [measurements, snapshot.startDate, todayStr],
  )
  const weightPoints = selectedMeasurements.filter(item => item.weightKg !== null)
  const firstWeight = weightPoints[0]?.weightKg ?? null
  const latestWeight = weightPoints.at(-1)?.weightKg ?? null
  const latestMeasurement = selectedMeasurements.at(-1) ?? null
  const weightDelta = firstWeight !== null && latestWeight !== null
    ? Number((latestWeight - firstWeight).toFixed(1))
    : null
  const activeWeeks = snapshot.weeklyBuckets.filter(bucket => bucket.sessions > 0).length

  const heroSummary = summarizeProgress({
    sessions: snapshot.selected.length,
    volumeNow: snapshot.volumeKg,
    volumeBefore: snapshot.priorVolumeKg,
    records: snapshot.recordCount,
  }, resolvedLocale)
  const volumeSummary = snapshot.volumeKg <= 0
    ? copy(resolvedLocale, 'Todavía no hay volumen medido en este rango. Guarda cargas y repeticiones para activar esta lectura.', 'There is no measured volume in this range yet. Log weight and reps to activate this insight.')
    : snapshot.volumeDelta === null
      ? copy(resolvedLocale, `Volumen medido: ${formatKg(snapshot.volumeKg, resolvedLocale)}. Falta un periodo anterior comparable.`, `Measured volume: ${formatKg(snapshot.volumeKg, resolvedLocale)}. A comparable prior period is still needed.`)
      : copy(resolvedLocale, `El volumen ${snapshot.volumeDelta >= 0 ? 'subió' : 'bajó'} ${Math.abs(snapshot.volumeDelta)}% frente al periodo anterior equivalente.`, `Volume is ${snapshot.volumeDelta >= 0 ? 'up' : 'down'} ${Math.abs(snapshot.volumeDelta)}% versus the equivalent prior period.`)
  const consistencySummary = selectedDays.length === 0
    ? copy(resolvedLocale, 'Completa una sesión para empezar a medir constancia semanal.', 'Complete a session to start measuring weekly consistency.')
    : copy(resolvedLocale, `${activeWeeks} de ${rangeWeeks} semanas tuvieron actividad; la racha actual es de ${stats.currentStreak} días.`, `${activeWeeks} of ${rangeWeeks} weeks had activity; the current streak is ${stats.currentStreak} days.`)

  return (
    <main data-marketing-capture="progress" className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <EvidenceHero
        eyebrow={t('Evidencia acumulada')}
        title={t('Tu progreso tiene dirección')}
        description={heroSummary}
        action={(
          <PeriodSelector
            value={rangeWeeks}
            options={RANGE_OPTIONS.map(option => ({ value: option.value, label: resolvedLocale === 'en' ? option.en : option.es }))}
            onChange={setRangeWeeks}
            label={copy(resolvedLocale, 'Seleccionar periodo', 'Select period')}
            className="w-full sm:w-[19rem]"
          />
        )}
      >
        <MetricStrip
          items={[
            {
              label: copy(resolvedLocale, 'Cambio de volumen', 'Volume change'),
              value: snapshot.volumeDelta === null ? t('Sin comparación') : `${snapshot.volumeDelta > 0 ? '+' : ''}${snapshot.volumeDelta}%`,
              detail: formatKg(snapshot.volumeKg, resolvedLocale),
            },
            {
              label: copy(resolvedLocale, 'Sesiones por semana', 'Sessions per week'),
              value: formatNumber(snapshot.sessionsPerWeek, resolvedLocale),
              detail: copy(resolvedLocale, `${snapshot.selected.length} sesiones`, `${snapshot.selected.length} sessions`),
            },
            {
              label: copy(resolvedLocale, 'Marcas personales', 'Personal records'),
              value: snapshot.recordCount,
              detail: copy(resolvedLocale, 'en el periodo', 'in this period'),
            },
          ]}
        />
      </EvidenceHero>

      <section className="rounded-3xl border border-border/60 bg-muted/[0.05] p-4 sm:p-6" aria-labelledby="training-load-title">
        <SectionHeading id="training-load-title" eyebrow={copy(resolvedLocale, 'Tendencia principal', 'Primary trend')} title={copy(resolvedLocale, 'Carga de entrenamiento', 'Training load')} />
        <div className="mt-5">
          <TrainingLoadChart key={rangeWeeks} buckets={snapshot.weeklyBuckets} locale={resolvedLocale} />
        </div>
        <EvidenceInsight
          title={copy(resolvedLocale, 'Lectura del periodo', 'Period insight')}
          tone={snapshot.volumeDelta === null ? 'neutral' : snapshot.volumeDelta >= 0 ? 'success' : 'warning'}
          className="mt-5"
        >
          {volumeSummary}
        </EvidenceInsight>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)] lg:items-start">
        <section className="rounded-3xl border border-border/60 bg-muted/[0.04] p-5 sm:p-6" aria-labelledby="consistency-title">
          <SectionHeading id="consistency-title" eyebrow={copy(resolvedLocale, 'Ritmo', 'Rhythm')} title={copy(resolvedLocale, 'Consistencia semanal', 'Weekly consistency')} />
          <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-border/50 py-5">
            {[
              [copy(resolvedLocale, 'Semanas activas', 'Active weeks'), `${activeWeeks}/${rangeWeeks}`],
              [copy(resolvedLocale, 'Días entrenados', 'Trained days'), String(stats.trainedDays)],
              [copy(resolvedLocale, 'Racha actual', 'Current streak'), `${stats.currentStreak}d`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          <MetricTextSummary className="mt-5">{consistencySummary}</MetricTextSummary>
        </section>

        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.05] p-5" aria-labelledby="exercise-highlights-title">
          <SectionHeading id="exercise-highlights-title" eyebrow={copy(resolvedLocale, 'Movimientos', 'Movements')} title={t('Ejercicios destacados')} />
          {snapshot.exerciseHighlights.length === 0 ? (
            <div className="mt-5 border-t border-border/50 pt-5 text-sm leading-relaxed text-muted-foreground">
              {copy(resolvedLocale, 'Se necesitan al menos dos registros válidos del mismo ejercicio en este periodo.', 'At least two valid logs for the same exercise are needed in this period.')}
            </div>
          ) : (
            <div className="mt-4">
              {snapshot.exerciseHighlights.map(highlight => (
                <PendingLink
                  key={highlight.exerciseId}
                  href={`/exercises/${highlight.exerciseId}`}
                  className="group flex min-h-16 items-center justify-between gap-4 border-t border-border/50 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  spinnerClassName="h-3.5 w-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-violet-200">{highlight.exerciseName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatKg(highlight.latestWeightKg, resolvedLocale)}</p>
                  </div>
                  <span className={highlight.changePercent >= 0 ? 'font-display text-xl font-bold text-emerald-300' : 'font-display text-xl font-bold text-orange-300'}>
                    {highlight.changePercent > 0 ? '+' : ''}{highlight.changePercent}%
                  </span>
                </PendingLink>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-3xl border border-border/60 bg-muted/[0.03] p-5 sm:p-6" aria-labelledby="recent-records-title">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading id="recent-records-title" eyebrow={copy(resolvedLocale, 'Resultados', 'Results')} title={copy(resolvedLocale, 'Marcas recientes', 'Recent records')} />
          <Trophy className="h-5 w-5 text-amber-300" aria-hidden="true" />
        </div>
        {snapshot.selectedRecords.length === 0 ? (
          <p className="mt-5 border-t border-border/50 pt-5 text-sm text-muted-foreground">
            {copy(resolvedLocale, 'No hay marcas personales detectadas en este periodo.', 'No personal records were detected in this period.')}
          </p>
        ) : (
          <div className="mt-4 grid gap-x-8 md:grid-cols-2">
            {snapshot.selectedRecords.slice(0, 6).map(record => (
              <PendingLink
                key={record.exerciseId}
                href={`/exercises/${record.exerciseId}`}
                className="flex min-h-16 items-center justify-between gap-4 border-t border-border/50 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                spinnerClassName="h-3.5 w-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{record.exerciseName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(record.bestDate, resolvedLocale)}</p>
                </div>
                <p className="shrink-0 text-right text-sm font-bold tabular-nums text-violet-200">
                  {record.maxWeightKg > 0 ? formatKg(record.maxWeightKg, resolvedLocale) : `${record.maxReps} reps`}
                </p>
              </PendingLink>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border/40 bg-muted/[0.02] p-5 sm:p-6" aria-labelledby="body-progress-title">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading id="body-progress-title" eyebrow={copy(resolvedLocale, 'Contexto corporal', 'Body context')} title={copy(resolvedLocale, 'Últimas medidas', 'Latest measurements')} />
          <Ruler className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <MetricStrip
          className="mt-5"
          items={[
            { label: copy(resolvedLocale, 'Peso', 'Weight'), value: formatBodyValue(latestWeight, ' kg', resolvedLocale), detail: weightDelta === null ? copy(resolvedLocale, 'sin comparación', 'no comparison') : `${weightDelta > 0 ? '+' : ''}${formatNumber(weightDelta, resolvedLocale)} kg` },
            { label: copy(resolvedLocale, 'Grasa corporal', 'Body fat'), value: formatBodyValue(latestMeasurement?.bodyFatPercentage ?? null, '%', resolvedLocale) },
            { label: copy(resolvedLocale, 'Cintura', 'Waist'), value: formatBodyValue(latestMeasurement?.waistCm ?? null, ' cm', resolvedLocale) },
          ]}
        />
        <BodyTrend values={weightPoints.flatMap(point => point.weightKg === null ? [] : [point.weightKg])} />
      </section>

      <nav aria-label={copy(resolvedLocale, 'Explorar evidencia', 'Explore evidence')} className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-2">
        <ExploreLink href="/history"><Trophy className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Historial', 'History')}</ExploreLink>
        <ExploreLink href="/calendario"><CalendarCheck className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Calendario', 'Calendar')}</ExploreLink>
        <ExploreLink href="/medidas"><Ruler className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Medidas', 'Measurements')}</ExploreLink>
        {snapshot.exerciseHighlights[0] ? (
          <ExploreLink href={`/exercises/${snapshot.exerciseHighlights[0].exerciseId}`}><Dumbbell className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Movimiento principal', 'Top movement')}</ExploreLink>
        ) : null}
      </nav>
    </main>
  )
}
