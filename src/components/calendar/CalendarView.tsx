'use client'

import { useMemo, useState } from 'react'
import { CalendarSummary } from './CalendarSummary'
import { ContributionHeatmap } from './ContributionHeatmap'
import { MonthGrid } from './MonthGrid'
import {
  computeCalendarStats,
  computeIntensityThresholds,
  shiftDateStr,
  type DayAggregate,
} from '@/lib/calendar/aggregate'

export function CalendarView({ days, todayStr }: { days: DayAggregate[]; todayStr: string }) {
  const byDate = useMemo(() => new Map(days.map(d => [d.date, d])), [days])
  const thresholds = useMemo(() => computeIntensityThresholds(days), [days])
  const stats = useMemo(() => computeCalendarStats(days, todayStr), [days, todayStr])

  const [todayY, todayM] = todayStr.split('-').map(Number)
  const [selected, setSelected] = useState({ year: todayY, month: todayM })

  const fromDate = days.length > 0 ? days[0].date : shiftDateStr(todayStr, -180)

  const goPrev = () =>
    setSelected(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }))
  const goNext = () =>
    setSelected(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }))
  const goToday = () => setSelected({ year: todayY, month: todayM })
  const selectDate = (dateStr: string) => {
    const [y, m] = dateStr.split('-').map(Number)
    setSelected({ year: y, month: m })
  }

  return (
    <div className="space-y-8">
      <CalendarSummary stats={stats} />

      <section>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Tu constancia</p>
        <ContributionHeatmap
          fromDate={fromDate}
          toDate={todayStr}
          byDate={byDate}
          thresholds={thresholds}
          onSelectDate={selectDate}
        />
      </section>

      <section>
        <MonthGrid
          year={selected.year}
          month={selected.month}
          todayStr={todayStr}
          byDate={byDate}
          thresholds={thresholds}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
        />
      </section>
    </div>
  )
}
