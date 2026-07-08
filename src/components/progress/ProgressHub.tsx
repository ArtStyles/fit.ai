'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  Dumbbell,
  History,
  LineChart,
  Ruler,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { TrackedExercise } from '@/app/actions/progression'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { DayAggregate } from '@/lib/calendar/aggregate'
import { computeCalendarStats, shiftDateStr } from '@/lib/calendar/aggregate'
import { cn } from '@/lib/utils'
import { ExerciseProgressionSection } from '@/components/history/ExerciseProgressionSection'
import { MetricTextSummary } from './MetricTextSummary'
import { summarizeProgress, type ProgressLocale } from './progressSummary'

export type ProgressRangeWeeks = 4 | 12 | 24

export type ProgressSession = {
  id: string
  completedAt: string
  date: string
  durationMinutes: number
  volumeKg: number
}

export type ProgressRecord = {
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  bestCompletedAt: string
  bestDate: string
  maxWeightKg: number
  repsAtMaxWeight: number
  maxReps: number
  totalVolumeKg: number
  sessionCount: number
}

export type ProgressMeasurement = {
  id: string
  recordedAt: string
  recordedDate: string
  weightKg: number | null
  bodyFatPercentage: number | null
  waistCm: number | null
}

type ProgressHubProps = {
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  measurements: ProgressMeasurement[]
  trackedExercises: TrackedExercise[]
  todayStr: string
  locale: ProgressLocale
}

type WeekBucket = {
  startDate: string
  endDate: string
  sessions: number
  trainedDays: number
  volumeKg: number
}

const RANGE_OPTIONS: { weeks: ProgressRangeWeeks; labelEs: string; labelEn: string }[] = [
  { weeks: 4, labelEs: '4 semanas', labelEn: '4 weeks' },
  { weeks: 12, labelEs: '12 semanas', labelEn: '12 weeks' },
  { weeks: 24, labelEs: '24 semanas', labelEn: '24 weeks' },
]

function copy(locale: ProgressLocale, es: string, en: string): string {
  return locale === 'en' ? en : es
}

function formatNumber(value: number, locale: ProgressLocale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value)
}

function formatKg(value: number, locale: ProgressLocale): string {
  return `${formatNumber(Math.round(value), locale)} kg`
}

function formatShortDate(dateStr: string, locale: ProgressLocale): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-ES', {
    day: 'numeric',
    month: 'short',
  })
}

function formatBodyValue(value: number | null, suffix: string, locale: ProgressLocale): string {
  if (value === null) return '—'
  return `${formatNumber(value, locale)}${suffix}`
}

function startDateForRange(todayStr: string, weeks: ProgressRangeWeeks): string {
  return shiftDateStr(todayStr, -(weeks * 7 - 1))
}

function filterSessionsByRange(sessions: ProgressSession[], startDate: string, endDate: string): ProgressSession[] {
  return sessions.filter(session => session.date >= startDate && session.date <= endDate)
}

function buildWeekBuckets(days: DayAggregate[], startDate: string, todayStr: string, weeks: ProgressRangeWeeks): WeekBucket[] {
  const byDate = new Map(days.map(day => [day.date, day]))

  return Array.from({ length: weeks }, (_, weekIndex) => {
    const weekStart = shiftDateStr(startDate, weekIndex * 7)
    const weekEnd = shiftDateStr(weekStart, 6)
    let sessions = 0
    let trainedDays = 0
    let volumeKg = 0

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const date = shiftDateStr(weekStart, dayIndex)
      if (date > todayStr) break
      const day = byDate.get(date)
      if (!day) continue
      sessions += day.sessions
      trainedDays += 1
      volumeKg += day.volumeKg
    }

    return {
      startDate: weekStart,
      endDate: weekEnd > todayStr ? todayStr : weekEnd,
      sessions,
      trainedDays,
      volumeKg: Math.round(volumeKg),
    }
  })
}

function sumVolume(sessions: ProgressSession[]): number {
  return Math.round(sessions.reduce((total, session) => total + session.volumeKg, 0))
}

function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null
  return Math.round(((now - before) / before) * 100)
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/10 p-3">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-display text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function ProgressSection({
  title,
  eyebrow,
  icon: Icon,
  children,
}: {
  title: string
  eyebrow: string
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card/60 p-4 shadow-sm shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300/80">{eyebrow}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-foreground">{title}</h2>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {children}
    </section>
  )
}

function EmptyMetricState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="mt-4 flex min-h-[152px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/10 p-5 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function WeeklyBars({
  buckets,
  metric,
  locale,
  tone = 'violet',
}: {
  buckets: WeekBucket[]
  metric: 'sessions' | 'volumeKg'
  locale: ProgressLocale
  tone?: 'violet' | 'emerald'
}) {
  const values = buckets.map(bucket => bucket[metric])
  const max = Math.max(...values, 1)
  const positiveClass = tone === 'emerald'
    ? 'bg-emerald-400/80'
    : 'bg-violet-400/80'

  return (
    <div className="mt-4 rounded-2xl border border-border/40 bg-background/40 p-3">
      <div className="flex h-32 items-end gap-1" aria-hidden="true">
        {buckets.map((bucket, index) => {
          const value = bucket[metric]
          const height = value > 0 ? Math.max(10, (value / max) * 100) : 3
          return (
            <div key={`${bucket.startDate}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-colors',
                  value > 0 ? positiveClass : 'bg-muted/40',
                )}
                style={{ height: `${height}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{formatShortDate(buckets[0]?.startDate ?? '', locale)}</span>
        <span>{formatShortDate(buckets[buckets.length - 1]?.endDate ?? '', locale)}</span>
      </div>
    </div>
  )
}

function BodyTrendChart({
  measurements,
  locale,
}: {
  measurements: ProgressMeasurement[]
  locale: ProgressLocale
}) {
  const points = measurements
    .filter(measurement => measurement.weightKg !== null)
    .sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))

  if (points.length < 2) return null

  const width = 320
  const height = 132
  const pad = { top: 12, right: 12, bottom: 24, left: 36 }
  const weights = points.map(point => point.weightKg as number)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const range = maxWeight - minWeight || 1
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const toX = (index: number) => pad.left + (index / (points.length - 1)) * innerWidth
  const toY = (weight: number) => pad.top + innerHeight - ((weight - minWeight) / range) * innerHeight
  const coords = points.map((point, index) => ({
    x: toX(index),
    y: toY(point.weightKg as number),
    point,
  }))
  const polyline = coords.map(coord => `${coord.x},${coord.y}`).join(' ')
  const yTicks = [minWeight, minWeight + range / 2, maxWeight]

  return (
    <div className="mt-4 rounded-2xl border border-border/40 bg-background/40 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="progress-body-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(139, 92, 246)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="rgb(139, 92, 246)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, index) => (
          <g key={index}>
            <line
              x1={pad.left}
              x2={pad.left + innerWidth}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
            <text x={pad.left - 5} y={toY(tick) + 4} textAnchor="end" fill="rgb(148,163,184)" fontSize={10}>
              {formatNumber(tick, locale)}
            </text>
          </g>
        ))}
        <path
          d={`M${coords[0]!.x},${toY(minWeight)} ${coords.map(coord => `L${coord.x},${coord.y}`).join(' ')} L${coords[coords.length - 1]!.x},${toY(minWeight)} Z`}
          fill="url(#progress-body-trend)"
        />
        <polyline points={polyline} fill="none" stroke="rgb(167,139,250)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map(coord => (
          <circle key={coord.point.id} cx={coord.x} cy={coord.y} r={3.5} fill="rgb(17,24,39)" stroke="rgb(196,181,253)" strokeWidth={2} />
        ))}
        <text x={coords[0]!.x} y={height - 5} textAnchor="middle" fill="rgb(148,163,184)" fontSize={10}>
          {formatShortDate(points[0]!.recordedDate, locale)}
        </text>
        <text x={coords[coords.length - 1]!.x} y={height - 5} textAnchor="middle" fill="rgb(148,163,184)" fontSize={10}>
          {formatShortDate(points[points.length - 1]!.recordedDate, locale)}
        </text>
      </svg>
    </div>
  )
}

export function ProgressHub({
  sessions,
  days,
  records,
  measurements,
  trackedExercises,
  todayStr,
  locale,
}: ProgressHubProps) {
  const { language } = useI18n()
  const resolvedLocale = language === 'en' ? 'en' : locale
  const [rangeWeeks, setRangeWeeks] = useState<ProgressRangeWeeks>(12)

  const rangeStart = useMemo(() => startDateForRange(todayStr, rangeWeeks), [rangeWeeks, todayStr])
  const priorRangeStart = useMemo(() => shiftDateStr(rangeStart, -(rangeWeeks * 7)), [rangeStart, rangeWeeks])
  const priorRangeEnd = useMemo(() => shiftDateStr(rangeStart, -1), [rangeStart])

  const selectedSessions = useMemo(
    () => filterSessionsByRange(sessions, rangeStart, todayStr),
    [rangeStart, sessions, todayStr],
  )
  const priorSessions = useMemo(
    () => filterSessionsByRange(sessions, priorRangeStart, priorRangeEnd),
    [priorRangeEnd, priorRangeStart, sessions],
  )
  const selectedDays = useMemo(
    () => days.filter(day => day.date >= rangeStart && day.date <= todayStr),
    [days, rangeStart, todayStr],
  )
  const selectedRecords = useMemo(
    () => records.filter(record => record.bestDate >= rangeStart && record.bestDate <= todayStr),
    [rangeStart, records, todayStr],
  )
  const selectedMeasurements = useMemo(
    () => measurements.filter(measurement => measurement.recordedDate >= rangeStart && measurement.recordedDate <= todayStr),
    [measurements, rangeStart, todayStr],
  )
  const sortedSelectedMeasurements = useMemo(
    () => [...selectedMeasurements].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate)),
    [selectedMeasurements],
  )
  const buckets = useMemo(
    () => buildWeekBuckets(days, rangeStart, todayStr, rangeWeeks),
    [days, rangeStart, rangeWeeks, todayStr],
  )

  const stats = useMemo(() => computeCalendarStats(selectedDays, todayStr), [selectedDays, todayStr])
  const selectedVolume = sumVolume(selectedSessions)
  const priorVolume = sumVolume(priorSessions)
  const volumeDelta = percentChange(selectedVolume, priorVolume)
  const selectedDuration = selectedSessions.reduce((total, session) => total + session.durationMinutes, 0)
  const weightPoints = sortedSelectedMeasurements
    .filter(measurement => measurement.weightKg !== null)
  const latestMeasurement = sortedSelectedMeasurements[sortedSelectedMeasurements.length - 1] ?? null
  const firstWeight = weightPoints[0]?.weightKg ?? null
  const latestWeight = weightPoints[weightPoints.length - 1]?.weightKg ?? null
  const weightDelta = latestWeight !== null && firstWeight !== null
    ? Number((latestWeight - firstWeight).toFixed(1))
    : null

  const heroSummary = summarizeProgress({
    sessions: selectedSessions.length,
    volumeNow: selectedVolume,
    volumeBefore: priorVolume,
    records: selectedRecords.length,
  }, resolvedLocale)

  const consistencySummary = selectedDays.length === 0
    ? copy(
      resolvedLocale,
      'Completa una sesión para empezar a ver tu constancia por semana.',
      'Complete a session to start seeing weekly consistency.',
    )
    : copy(
      resolvedLocale,
      `${stats.trainedDays} días con entrenamiento en las últimas ${rangeWeeks} semanas; racha actual: ${stats.currentStreak} días.`,
      `${stats.trainedDays} trained days in the last ${rangeWeeks} weeks; current streak: ${stats.currentStreak} days.`,
    )

  const volumeSummary = selectedVolume <= 0
    ? copy(
      resolvedLocale,
      'Todavía no hay volumen medido en este rango. Guarda cargas y repeticiones para activar esta lectura.',
      'There is no measured volume in this range yet. Log weight and reps to activate this insight.',
    )
    : volumeDelta === null
      ? copy(
        resolvedLocale,
        `Volumen total medido: ${formatKg(selectedVolume, resolvedLocale)}. Falta un rango previo comparable para calcular tendencia.`,
        `Measured total volume: ${formatKg(selectedVolume, resolvedLocale)}. A comparable previous range is needed for a trend.`,
      )
      : copy(
        resolvedLocale,
        `Volumen total medido: ${formatKg(selectedVolume, resolvedLocale)}; ${volumeDelta >= 0 ? 'subió' : 'bajó'} ${Math.abs(volumeDelta)}% frente al rango anterior.`,
        `Measured total volume: ${formatKg(selectedVolume, resolvedLocale)}; it is ${volumeDelta >= 0 ? 'up' : 'down'} ${Math.abs(volumeDelta)}% versus the previous range.`,
      )

  const recordSummary = selectedRecords.length === 0
    ? copy(
      resolvedLocale,
      'No hay marcas personales detectadas en este rango. Se mostrarán cuando haya cargas o repeticiones suficientes.',
      'No personal records were detected in this range. They will appear when there are enough weights or reps.',
    )
    : copy(
      resolvedLocale,
      `${selectedRecords.length} marcas personales detectadas con datos guardados en este rango.`,
      `${selectedRecords.length} personal records detected from saved data in this range.`,
    )

  const bodySummary = weightPoints.length < 2 || weightDelta === null
    ? copy(
      resolvedLocale,
      'Registra al menos dos medidas de peso para ver evolución corporal sin inventar cambios.',
      'Log at least two body-weight measurements to see body evolution without invented changes.',
    )
    : copy(
      resolvedLocale,
      `Peso medido: ${formatBodyValue(firstWeight, ' kg', resolvedLocale)} a ${formatBodyValue(latestWeight, ' kg', resolvedLocale)} (${weightDelta > 0 ? '+' : ''}${formatNumber(weightDelta, resolvedLocale)} kg).`,
      `Measured weight: ${formatBodyValue(firstWeight, ' kg', resolvedLocale)} to ${formatBodyValue(latestWeight, ' kg', resolvedLocale)} (${weightDelta > 0 ? '+' : ''}${formatNumber(weightDelta, resolvedLocale)} kg).`,
    )

  return (
    <main data-marketing-capture="progress" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-violet-500/25 bg-violet-500/[0.08] p-5 shadow-lg shadow-violet-950/20">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">
              {copy(resolvedLocale, 'Destino unificado', 'Unified destination')}
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold leading-tight text-foreground">
              {copy(resolvedLocale, 'Progreso real, en un solo lugar', 'Real progress, in one place')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{heroSummary}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label={copy(resolvedLocale, 'Sesiones', 'Sessions')}
              value={formatNumber(selectedSessions.length, resolvedLocale)}
              detail={copy(resolvedLocale, `${rangeWeeks} sem.`, `${rangeWeeks} wk`)}
            />
            <MetricCard
              label={copy(resolvedLocale, 'Volumen', 'Volume')}
              value={formatKg(selectedVolume, resolvedLocale)}
              detail={priorVolume > 0 && volumeDelta !== null ? `${volumeDelta > 0 ? '+' : ''}${volumeDelta}%` : copy(resolvedLocale, 'sin base', 'no base')}
            />
            <MetricCard
              label={copy(resolvedLocale, 'Marcas', 'Records')}
              value={formatNumber(selectedRecords.length, resolvedLocale)}
              detail={copy(resolvedLocale, 'detectadas', 'detected')}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/40 bg-background/40 p-1">
            {RANGE_OPTIONS.map(option => (
              <button
                key={option.weeks}
                type="button"
                onClick={() => setRangeWeeks(option.weeks)}
                className={cn(
                  'min-h-11 rounded-xl px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  rangeWeeks === option.weeks
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-950/30'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                )}
              >
                {resolvedLocale === 'en' ? option.labelEn : option.labelEs}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2">
        <PendingLink
          href="/history"
          className="flex min-h-11 flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/10 px-2 py-3 text-center text-xs font-semibold text-foreground transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          spinnerClassName="h-3 w-3"
        >
          <History className="mb-1 h-4 w-4 text-violet-300" />
          {copy(resolvedLocale, 'Historial', 'History')}
        </PendingLink>
        <PendingLink
          href="/calendario"
          className="flex min-h-11 flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/10 px-2 py-3 text-center text-xs font-semibold text-foreground transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          spinnerClassName="h-3 w-3"
        >
          <CalendarRange className="mb-1 h-4 w-4 text-violet-300" />
          {copy(resolvedLocale, 'Calendario', 'Calendar')}
        </PendingLink>
        <PendingLink
          href="/medidas"
          className="flex min-h-11 flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/10 px-2 py-3 text-center text-xs font-semibold text-foreground transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          spinnerClassName="h-3 w-3"
        >
          <Ruler className="mb-1 h-4 w-4 text-violet-300" />
          {copy(resolvedLocale, 'Medidas', 'Measures')}
        </PendingLink>
      </section>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <ProgressSection
          eyebrow={copy(resolvedLocale, 'Constancia', 'Consistency')}
          title={copy(resolvedLocale, 'Semanas entrenadas', 'Trained weeks')}
          icon={CalendarCheck}
        >
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricCard
              label={copy(resolvedLocale, 'Días', 'Days')}
              value={formatNumber(stats.trainedDays, resolvedLocale)}
              detail={copy(resolvedLocale, 'con sesión', 'with sessions')}
            />
            <MetricCard
              label={copy(resolvedLocale, 'Racha', 'Streak')}
              value={`${formatNumber(stats.currentStreak, resolvedLocale)}d`}
              detail={copy(resolvedLocale, `máx. ${stats.maxStreak}d`, `max ${stats.maxStreak}d`)}
            />
          </div>
          {selectedDays.length === 0 ? (
            <EmptyMetricState
              icon={CalendarCheck}
              title={copy(resolvedLocale, 'Aún no hay constancia que mostrar', 'No consistency data yet')}
              description={copy(
                resolvedLocale,
                'Completa una sesión para convertir el historial en una lectura semanal.',
                'Complete a session to turn your history into a weekly insight.',
              )}
            />
          ) : (
            <WeeklyBars buckets={buckets} metric="sessions" locale={resolvedLocale} />
          )}
          <MetricTextSummary>{consistencySummary}</MetricTextSummary>
        </ProgressSection>

        <ProgressSection
          eyebrow={copy(resolvedLocale, 'Volumen', 'Volume')}
          title={copy(resolvedLocale, 'Carga total por semana', 'Weekly total load')}
          icon={BarChart3}
        >
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MetricCard
              label={copy(resolvedLocale, 'Volumen total', 'Total volume')}
              value={formatKg(selectedVolume, resolvedLocale)}
              detail={copy(resolvedLocale, `${selectedSessions.length} sesiones`, `${selectedSessions.length} sessions`)}
            />
            <MetricCard
              label={copy(resolvedLocale, 'Tiempo', 'Time')}
              value={`${formatNumber(selectedDuration, resolvedLocale)}m`}
              detail={copy(resolvedLocale, 'registrado', 'logged')}
            />
          </div>
          {selectedVolume <= 0 ? (
            <EmptyMetricState
              icon={BarChart3}
              title={copy(resolvedLocale, 'Sin volumen suficiente', 'Not enough volume yet')}
              description={copy(
                resolvedLocale,
                'Guarda pesos y repeticiones para ver una tendencia real de carga.',
                'Save weights and reps to see a real load trend.',
              )}
            />
          ) : (
            <WeeklyBars buckets={buckets} metric="volumeKg" locale={resolvedLocale} tone={volumeDelta !== null && volumeDelta > 0 ? 'emerald' : 'violet'} />
          )}
          <MetricTextSummary>{volumeSummary}</MetricTextSummary>
        </ProgressSection>

        <ProgressSection
          eyebrow={copy(resolvedLocale, 'Marcas', 'Records')}
          title={copy(resolvedLocale, 'Mejores registros detectados', 'Detected best results')}
          icon={Trophy}
        >
          {selectedRecords.length === 0 ? (
            <EmptyMetricState
              icon={Trophy}
              title={copy(resolvedLocale, 'Sin marcas en este rango', 'No records in this range')}
              description={copy(
                resolvedLocale,
                'Las marcas aparecen cuando hay cargas o repeticiones comparables, sin crear logros falsos.',
                'Records appear when comparable weights or reps exist, without creating false achievements.',
              )}
            />
          ) : (
            <div className="mt-4 space-y-2">
              {selectedRecords.slice(0, 4).map(record => (
                <PendingLink
                  key={record.exerciseId}
                  href={`/exercises/${record.exerciseId}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/40 px-3 py-3 transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  spinnerClassName="h-3 w-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{record.exerciseName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {record.muscleGroups.slice(0, 2).join(' · ') || copy(resolvedLocale, `${record.sessionCount} sesiones`, `${record.sessionCount} sessions`)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-violet-200">{formatKg(record.maxWeightKg, resolvedLocale)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {record.repsAtMaxWeight > 0
                        ? copy(resolvedLocale, `${record.repsAtMaxWeight} reps`, `${record.repsAtMaxWeight} reps`)
                        : copy(resolvedLocale, `${record.maxReps} reps`, `${record.maxReps} reps`)}
                    </p>
                  </div>
                </PendingLink>
              ))}
            </div>
          )}
          <MetricTextSummary>{recordSummary}</MetricTextSummary>
        </ProgressSection>

        <ProgressSection
          eyebrow={copy(resolvedLocale, 'Cuerpo', 'Body')}
          title={copy(resolvedLocale, 'Evolución corporal', 'Body evolution')}
          icon={Ruler}
        >
          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricCard
              label={copy(resolvedLocale, 'Peso', 'Weight')}
              value={formatBodyValue(latestWeight, ' kg', resolvedLocale)}
              detail={weightDelta !== null ? `${weightDelta > 0 ? '+' : ''}${formatNumber(weightDelta, resolvedLocale)} kg` : copy(resolvedLocale, 'sin base', 'no base')}
            />
            <MetricCard
              label={copy(resolvedLocale, 'Grasa', 'Fat')}
              value={formatBodyValue(latestMeasurement?.bodyFatPercentage ?? null, '%', resolvedLocale)}
              detail={copy(resolvedLocale, 'última', 'latest')}
            />
            <MetricCard
              label={copy(resolvedLocale, 'Cintura', 'Waist')}
              value={formatBodyValue(latestMeasurement?.waistCm ?? null, ' cm', resolvedLocale)}
              detail={copy(resolvedLocale, 'última', 'latest')}
            />
          </div>
          {weightPoints.length < 2 ? (
            <EmptyMetricState
              icon={Ruler}
              title={copy(resolvedLocale, 'Faltan medidas comparables', 'Comparable measurements needed')}
              description={copy(
                resolvedLocale,
                'Agrega otra medida para ver una línea real de evolución corporal.',
                'Add another measurement to see a real body-evolution line.',
              )}
            />
          ) : (
            <BodyTrendChart measurements={selectedMeasurements} locale={resolvedLocale} />
          )}
          <MetricTextSummary>{bodySummary}</MetricTextSummary>
        </ProgressSection>

        {trackedExercises.length > 0 ? (
          <ExerciseProgressionSection exercises={trackedExercises} rangeWeeks={rangeWeeks} />
        ) : (
          <ProgressSection
            eyebrow={copy(resolvedLocale, 'Ejercicios', 'Exercises')}
            title={copy(resolvedLocale, 'Progresión por ejercicio', 'Exercise progression')}
            icon={LineChart}
          >
            <EmptyMetricState
              icon={Dumbbell}
              title={copy(resolvedLocale, 'Sin ejercicios suficientes', 'Not enough exercise data')}
              description={copy(
                resolvedLocale,
                'Completa el mismo ejercicio en más sesiones para comparar carga y repeticiones.',
                'Complete the same exercise in more sessions to compare weight and reps.',
              )}
            />
            <MetricTextSummary>
              {copy(
                resolvedLocale,
                'La progresión por ejercicio aparece cuando hay registros repetidos del mismo movimiento.',
                'Exercise progression appears when the same movement has repeated logs.',
              )}
            </MetricTextSummary>
          </ProgressSection>
        )}
      </div>
    </main>
  )
}
