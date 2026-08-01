'use client'

import { useMemo, useState } from 'react'
import { EvidenceHero } from '@/components/evidence/EvidenceHero'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  computeCalendarStats,
  computeIntensityThresholds,
  shiftDateStr,
  type CalendarSessionSummary,
  type DayAggregate,
} from '@/lib/calendar/aggregate'
import { buildCalendarMonthView } from './calendarViewModel'
import { CalendarDayPanel } from './CalendarDayPanel'
import { CalendarSummary } from './CalendarSummary'
import { ContributionHeatmap } from './ContributionHeatmap'
import { MonthGrid } from './MonthGrid'

function monthLabel(year: number, month: number, language: 'es' | 'en'): string {
  const label = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function CalendarView({
  days,
  sessions,
  todayStr,
}: {
  days: DayAggregate[]
  sessions: CalendarSessionSummary[]
  todayStr: string
}) {
  const { language, t } = useI18n()
  const byDate = useMemo(() => new Map(days.map(day => [day.date, day])), [days])
  const thresholds = useMemo(() => computeIntensityThresholds(days), [days])
  const stats = useMemo(() => computeCalendarStats(days, todayStr), [days, todayStr])

  const [todayY, todayM] = todayStr.split('-').map(Number)
  const [visibleMonth, setVisibleMonth] = useState({ year: todayY, month: todayM })
  const [selectedDate, setSelectedDate] = useState(todayStr)

  const monthView = useMemo(
    () => buildCalendarMonthView(sessions, visibleMonth.year, visibleMonth.month, selectedDate),
    [selectedDate, sessions, visibleMonth.month, visibleMonth.year],
  )
  const fromDate = days.length > 0 ? days[0].date : shiftDateStr(todayStr, -180)

  const selectMonth = (year: number, month: number) => {
    setVisibleMonth({ year, month })
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const fallback = sessions.find(session => session.date.startsWith(prefix))?.date ?? `${prefix}-01`
    setSelectedDate(fallback)
  }
  const goPrev = () => selectMonth(
    visibleMonth.month === 1 ? visibleMonth.year - 1 : visibleMonth.year,
    visibleMonth.month === 1 ? 12 : visibleMonth.month - 1,
  )
  const goNext = () => selectMonth(
    visibleMonth.month === 12 ? visibleMonth.year + 1 : visibleMonth.year,
    visibleMonth.month === 12 ? 1 : visibleMonth.month + 1,
  )
  const goToday = () => {
    setVisibleMonth({ year: todayY, month: todayM })
    setSelectedDate(todayStr)
  }

  return (
    <div className="space-y-8">
      <EvidenceHero
        eyebrow={t('Ritmo de entrenamiento')}
        title={monthLabel(visibleMonth.year, visibleMonth.month, language)}
        description={t('Tu historial de entrenamiento mes a mes')}
        action={(
          <PendingLink
            href="/progress"
            className="inline-flex min-h-11 items-center rounded-xl border border-violet-400/25 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {t('Ver progreso completo')}
          </PendingLink>
        )}
      >
        <CalendarSummary
          trainedDays={monthView.trainedDays}
          currentStreak={stats.currentStreak}
          frequency={monthView.frequency}
        />
      </EvidenceHero>

      <section aria-label={t('Actividad del mes')} className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.8fr)] lg:items-start">
        <div className="rounded-3xl border border-border/60 bg-muted/[0.06] p-1 sm:p-6">
          <MonthGrid
            year={visibleMonth.year}
            month={visibleMonth.month}
            todayStr={todayStr}
            selectedDate={selectedDate}
            byDate={byDate}
            thresholds={thresholds}
            onSelectDate={setSelectedDate}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />
        </div>

        <CalendarDayPanel date={selectedDate} sessions={monthView.selectedSessions} />
      </section>

      <section aria-labelledby="calendar-year-overview" className="rounded-3xl border border-border/60 bg-muted/[0.04] p-4 sm:p-6">
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{t('Evidencia acumulada')}</p>
          <h2 id="calendar-year-overview" className="mt-1 font-display text-2xl font-bold text-foreground">{t('Resumen anual')}</h2>
        </div>
        <ContributionHeatmap fromDate={fromDate} toDate={todayStr} byDate={byDate} thresholds={thresholds} />
      </section>
    </div>
  )
}
