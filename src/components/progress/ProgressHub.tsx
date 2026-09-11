'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, CalendarCheck, Ruler, Trophy } from 'lucide-react'
import { DisclosureSection } from '@/components/evidence/DisclosureSection'
import { EvidenceInsight } from '@/components/evidence/EvidenceInsight'
import { MetricStrip } from '@/components/evidence/MetricStrip'
import { useI18n } from '@/components/i18n/I18nProvider'
import { MuscleActivityMap } from '@/components/muscles/MuscleActivityMap'
import type { MuscleActivityInput } from '@/lib/muscles/activity'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { computeCalendarStats, type DayAggregate } from '@/lib/calendar/aggregate'
import { MetricTextSummary } from './MetricTextSummary'
import { PERSONAL_GOALS_ENABLED, PersonalGoalsSlot } from '@/components/progress/PersonalGoalsSlot'
import { ProgressPerformanceList } from './ProgressPerformanceList'
import type { ProgressLocale } from './progressSummary'
import { TrainingLoadChart } from './TrainingLoadChart'
import { buildProgressSnapshot, type ProgressExercisePoint, type ProgressMeasurement, type ProgressRangeWeeks, type ProgressRecord, type ProgressSession } from './progressViewModel'

type ProgressHubProps = {
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  measurements: ProgressMeasurement[]
  exercisePoints: ProgressExercisePoint[]
  muscleActivity?: MuscleActivityInput[]
  todayStr: string
  locale: ProgressLocale
}

const RANGE_OPTIONS: ProgressRangeWeeks[] = [1, 4, 12, 24]
const PANEL_CLASS = 'mt-5 space-y-5'
const CARD_CLASS = 'rounded-3xl border border-border/60 bg-muted/[0.04] p-4 sm:p-6'
const copy = (locale: ProgressLocale, es: string, en: string) => locale === 'en' ? en : es
const formatNumber = (value: number, locale: ProgressLocale, maximumFractionDigits = 1) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits }).format(value)
const formatKg = (value: number, locale: ProgressLocale) => `${formatNumber(Math.round(value), locale, 0)} kg`
const formatBodyValue = (value: number | null, suffix: string, locale: ProgressLocale) => value === null ? '—' : `${formatNumber(value, locale)}${suffix}`

function SectionHeading({ title, id }: { title: string; id: string }) {
  return <h2 id={id} className="font-display text-lg font-bold text-foreground sm:text-xl">{title}</h2>
}

function BodyTrend({ values, locale }: { values: number[]; locale: ProgressLocale }) {
  if (values.length < 2) return null
  const width = 560
  const height = 100
  const min = Math.min(...values)
  const spread = Math.max(1, Math.max(...values) - min)
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 12 - ((value - min) / spread) * (height - 24)}`).join(' ')
  return <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 h-24 w-full" role="img" aria-label={copy(locale, 'Tendencia de peso corporal', 'Body weight trend')}>
    <line x1="0" x2={width} y1={height - 12} y2={height - 12} className="stroke-border" strokeWidth="1" />
    <polyline points={points} fill="none" className="stroke-violet-300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function ExploreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <PendingLink href={href} className="group inline-flex min-h-11 items-center gap-2 py-2 text-sm font-semibold text-foreground transition-colors hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" spinnerClassName="h-3.5 w-3.5">
    {children}<ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
  </PendingLink>
}

export function ProgressHub({ sessions, days, records, measurements, exercisePoints, muscleActivity = [], todayStr, locale }: ProgressHubProps) {
  const { language } = useI18n()
  const resolvedLocale: ProgressLocale = language === 'en' ? 'en' : locale
  const [rangeWeeks, setRangeWeeks] = useState<ProgressRangeWeeks>(12)
  const [view, setView] = useState('overview')
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const performancePanel = useRef<HTMLDivElement>(null)
  const focusPerformance = useRef(false)
  const selectionHandled = useCallback(() => setSelectedExerciseId(null), [])
  const openExerciseGoal = useCallback((id: string) => {
    focusPerformance.current = true
    setSelectedExerciseId(id)
    setView('performance')
  }, [])
  useEffect(() => {
    if (view !== 'performance' || !focusPerformance.current) return
    focusPerformance.current = false
    performancePanel.current?.focus({ preventScroll: true })
    performancePanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [view, selectedExerciseId])

  const snapshot = useMemo(() => buildProgressSnapshot({ todayStr, weeks: rangeWeeks, sessions, days, records, exercisePoints }), [days, exercisePoints, rangeWeeks, records, sessions, todayStr])
  const selectedDays = useMemo(() => days.filter(day => day.date >= snapshot.startDate && day.date <= todayStr), [days, snapshot.startDate, todayStr])
  const stats = useMemo(() => computeCalendarStats(selectedDays, todayStr), [selectedDays, todayStr])
  const selectedMeasurements = useMemo(() => measurements.filter(item => item.recordedDate >= snapshot.startDate && item.recordedDate <= todayStr).sort((a, b) => a.recordedDate.localeCompare(b.recordedDate)), [measurements, snapshot.startDate, todayStr])
  const selectedExercisePoints = useMemo(() => exercisePoints.filter(point => point.date >= snapshot.startDate && point.date <= todayStr), [exercisePoints, snapshot.startDate, todayStr])
  const weightPoints = selectedMeasurements.filter(item => item.weightKg !== null)
  const firstWeight = weightPoints[0]?.weightKg ?? null
  const latestWeight = weightPoints.at(-1)?.weightKg ?? null
  const latestMeasurement = selectedMeasurements.at(-1) ?? null
  const weightDelta = weightPoints.length > 1 && firstWeight !== null && latestWeight !== null ? Number((latestWeight - firstWeight).toFixed(1)) : null
  const activeWeeks = snapshot.weeklyBuckets.filter(bucket => bucket.sessions > 0).length
  const periodLabel = copy(resolvedLocale, `${rangeWeeks} ${rangeWeeks === 1 ? 'semana' : 'semanas'}`, `${rangeWeeks} ${rangeWeeks === 1 ? 'week' : 'weeks'}`)
  const volumeSummary = snapshot.comparisonHasIncompleteEvidence
    ? copy(resolvedLocale, `Volumen registrado: ${formatKg(snapshot.volumeKg, resolvedLocale)}.`, `Recorded volume: ${formatKg(snapshot.volumeKg, resolvedLocale)}.`)
    : snapshot.volumeKg <= 0
      ? copy(resolvedLocale, 'Guarda cargas y repeticiones para medir volumen en este periodo.', 'Log weight and reps to measure volume in this period.')
      : snapshot.volumeDelta === null
        ? copy(resolvedLocale, `Volumen medido: ${formatKg(snapshot.volumeKg, resolvedLocale)}. Sin periodo anterior comparable.`, `Measured volume: ${formatKg(snapshot.volumeKg, resolvedLocale)}. No comparable prior period.`)
        : copy(resolvedLocale, `El volumen ${snapshot.volumeDelta >= 0 ? 'subió' : 'bajó'} ${Math.abs(snapshot.volumeDelta)}% frente al periodo anterior equivalente.`, `Volume is ${snapshot.volumeDelta >= 0 ? 'up' : 'down'} ${Math.abs(snapshot.volumeDelta)}% versus the equivalent prior period.`)

  return <main data-marketing-capture="progress" className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
    <Tabs value={view} onValueChange={setView}>
      <TabsList aria-label={copy(resolvedLocale, 'Vistas de progreso', 'Progress views')} className="grid h-auto w-full grid-cols-3 rounded-2xl border border-border/50 bg-muted/20 p-1">
        {[
          ['overview', copy(resolvedLocale, 'Resumen', 'Overview')],
          ['performance', copy(resolvedLocale, 'Rendimiento', 'Performance')],
          ['measurements', copy(resolvedLocale, 'Medidas', 'Measurements')],
        ].map(([value, label]) => <TabsTrigger key={value} value={value} className="min-h-11 min-w-0 rounded-xl px-1 text-xs font-semibold data-[state=active]:bg-violet-600 data-[state=active]:text-white sm:text-sm">{label}</TabsTrigger>)}
      </TabsList>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{copy(resolvedLocale, 'Periodo de estadísticas', 'Statistics period')}</p>
        <Select value={String(rangeWeeks)} onValueChange={value => { const weeks = Number(value) as ProgressRangeWeeks; if (RANGE_OPTIONS.includes(weeks)) setRangeWeeks(weeks) }}>
          <SelectTrigger aria-label={copy(resolvedLocale, 'Seleccionar periodo', 'Select period')} className="h-11 w-36 shrink-0 rounded-xl border-violet-500/30 bg-violet-500/10 font-semibold focus:ring-violet-400"><SelectValue>{periodLabel}</SelectValue></SelectTrigger>
          <SelectContent className="rounded-xl">
            {RANGE_OPTIONS.map(weeks => <SelectItem key={weeks} value={String(weeks)} className="min-h-11 rounded-lg focus:bg-violet-600 focus:text-white">{copy(resolvedLocale, `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`, `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <TabsContent value="overview" className={PANEL_CLASS}>
        <MetricStrip className="grid-cols-3 gap-3 [&_dd]:text-lg sm:[&_dd]:text-2xl" items={[
          { label: copy(resolvedLocale, 'Sesiones', 'Sessions'), value: snapshot.selected.length, detail: copy(resolvedLocale, `${formatNumber(snapshot.sessionsPerWeek, resolvedLocale)} por semana`, `${formatNumber(snapshot.sessionsPerWeek, resolvedLocale)} per week`) },
          { label: copy(resolvedLocale, 'Volumen registrado', 'Recorded volume'), value: formatKg(snapshot.volumeKg, resolvedLocale) },
          { label: copy(resolvedLocale, 'Marcas recientes', 'Recent records'), value: snapshot.recordCount },
        ]} />
        {snapshot.selected.length === 0 && <p className="text-sm text-muted-foreground">{copy(resolvedLocale, 'Completa una sesión para ver tu actividad en este periodo.', 'Complete a session to see your activity in this period.')}</p>}
        {snapshot.comparisonHasIncompleteEvidence && <p className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{copy(resolvedLocale, snapshot.incompleteSessionCount > 0 ? `${snapshot.incompleteSessionCount} entrenamientos de este periodo tienen datos parciales o solo constancia. El volumen y el mapa usan las series registradas; los cambios también pueden reflejar detalles pendientes del periodo anterior.` : 'Hay registros parciales en el periodo anterior. El volumen y el mapa usan las series registradas; las diferencias pueden reflejar detalles pendientes.', snapshot.incompleteSessionCount > 0 ? `${snapshot.incompleteSessionCount} workouts in this period have partial details or attendance only. Volume and the map use logged sets; changes may also reflect missing details in the prior period.` : 'The prior period has partial records. Volume and the map use logged sets; differences may reflect missing details.')}</p>}
        <section className={CARD_CLASS} aria-labelledby="muscle-activity-title">
          <SectionHeading id="muscle-activity-title" title={copy(resolvedLocale, 'Tu actividad muscular', 'Your muscle activity')} />
          <p className="mt-1 text-xs text-muted-foreground">{copy(resolvedLocale, 'Series registradas por grupo muscular.', 'Logged sets per muscle group.')}</p>
          <MuscleActivityMap compact rows={muscleActivity} mode="completed" language={resolvedLocale} range={{ from: snapshot.startDate, to: todayStr }} comparison={{ range: { from: snapshot.priorStart, to: snapshot.priorEnd }, hasRecords: sessions.some(session => session.date >= snapshot.priorStart && session.date <= snapshot.priorEnd) }} onExerciseSelect={PERSONAL_GOALS_ENABLED ? openExerciseGoal : undefined} />
        </section>
        <div className="rounded-3xl border border-border/60 px-4 sm:px-6">
          <DisclosureSection summary={copy(resolvedLocale, 'Carga de entrenamiento', 'Training load')} className="border-t-0">
            <TrainingLoadChart key={rangeWeeks} buckets={snapshot.weeklyBuckets} locale={resolvedLocale} />
            <EvidenceInsight title={snapshot.comparisonHasIncompleteEvidence ? copy(resolvedLocale, 'Cambio de volumen registrado', 'Recorded volume change') : copy(resolvedLocale, 'Lectura del periodo', 'Period insight')} tone="neutral" className="mt-4">{volumeSummary}</EvidenceInsight>
          </DisclosureSection>
          <DisclosureSection summary={copy(resolvedLocale, 'Consistencia semanal', 'Weekly consistency')}>
            <MetricStrip className="grid-cols-3 [&_dd]:text-xl" items={[
              { label: copy(resolvedLocale, 'Semanas activas', 'Active weeks'), value: `${activeWeeks}/${rangeWeeks}` },
              { label: copy(resolvedLocale, 'Días entrenados', 'Trained days'), value: stats.trainedDays },
              { label: copy(resolvedLocale, 'Racha actual', 'Current streak'), value: `${stats.currentStreak}d` },
            ]} />
            <MetricTextSummary className="mt-4">{copy(resolvedLocale, 'La constancia cuenta sesiones, aunque todavía no hayas registrado sus series.', 'Consistency counts sessions, including those with no logged sets yet.')}</MetricTextSummary>
          </DisclosureSection>
        </div>
        <nav aria-label={copy(resolvedLocale, 'Explorar actividad', 'Explore activity')} className="flex flex-wrap gap-x-6 border-t border-border/50">
          <ExploreLink href="/history"><Trophy className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Historial', 'History')}</ExploreLink>
          <ExploreLink href="/calendario"><CalendarCheck className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Calendario', 'Calendar')}</ExploreLink>
        </nav>
      </TabsContent>
      <TabsContent ref={performancePanel} value="performance" className={`${PANEL_CLASS} scroll-mt-24`}>
        <PersonalGoalsSlot language={resolvedLocale} selectedExerciseId={selectedExerciseId} onSelectionHandled={selectionHandled} />
        <section className={CARD_CLASS} aria-labelledby="performance-title">
          <SectionHeading id="performance-title" title={copy(resolvedLocale, 'Ejercicios del periodo', 'Exercises in this period')} />
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy(resolvedLocale, `Cargas y repeticiones registradas en ${periodLabel}.`, `Weight and reps recorded over ${periodLabel}.`)}</p>
          <ProgressPerformanceList points={selectedExercisePoints} records={snapshot.selectedRecords} locale={resolvedLocale} />
        </section>
      </TabsContent>
      <TabsContent value="measurements" className={PANEL_CLASS}>
        <section className={CARD_CLASS} aria-labelledby="body-progress-title">
          <SectionHeading id="body-progress-title" title={copy(resolvedLocale, 'Últimas medidas', 'Latest measurements')} />
          <p className="mt-1 text-xs text-muted-foreground">{copy(resolvedLocale, `Registros de ${periodLabel}.`, `Records within ${periodLabel}.`)}</p>
          <MetricStrip className="mt-4 grid-cols-3 [&_dd]:text-lg sm:[&_dd]:text-2xl" items={[
            { label: copy(resolvedLocale, 'Peso', 'Weight'), value: formatBodyValue(latestWeight, ' kg', resolvedLocale), detail: weightDelta === null ? copy(resolvedLocale, 'sin comparación', 'no comparison') : `${weightDelta > 0 ? '+' : ''}${formatNumber(weightDelta, resolvedLocale)} kg` },
            { label: copy(resolvedLocale, 'Grasa corporal', 'Body fat'), value: formatBodyValue(latestMeasurement?.bodyFatPercentage ?? null, '%', resolvedLocale) },
            { label: copy(resolvedLocale, 'Cintura', 'Waist'), value: formatBodyValue(latestMeasurement?.waistCm ?? null, ' cm', resolvedLocale) },
          ]} />
          <BodyTrend locale={resolvedLocale} values={weightPoints.flatMap(point => point.weightKg === null ? [] : [point.weightKg])} />
          {!selectedMeasurements.length && <p className="mt-4 text-sm text-muted-foreground">{copy(resolvedLocale, 'No hay medidas en este periodo.', 'No measurements in this period.')}</p>}
          <div className="mt-5 border-t border-border/50 pt-2"><ExploreLink href="/medidas"><Ruler className="h-4 w-4 text-violet-300" aria-hidden="true" />{copy(resolvedLocale, 'Registrar o consultar medidas', 'Log or view measurements')}</ExploreLink></div>
        </section>
      </TabsContent>
    </Tabs>
  </main>
}
