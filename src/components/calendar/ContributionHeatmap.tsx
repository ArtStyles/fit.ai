'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { buildHeatmapWeeks, type DayAggregate, type IntensityThresholds } from '@/lib/calendar/aggregate'
import { intensityClass, levelFor, type CellLevel } from './intensity'

interface Props {
  fromDate:     string
  toDate:       string
  byDate:       Map<string, DayAggregate>
  thresholds:   IntensityThresholds
  onSelectDate: (dateStr: string) => void
}

function monthShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export function ContributionHeatmap({ fromDate, toDate, byDate, thresholds, onSelectDate }: Props) {
  const weeks = buildHeatmapWeeks(fromDate, toDate)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  // Etiqueta de mes: en la primera semana en la que aparece un mes nuevo.
  let lastMonth = ''
  const labels = weeks.map(week => {
    const firstDate = week.find((c): c is string => c !== null)
    if (!firstDate) return ''
    const month = firstDate.slice(0, 7)
    if (month !== lastMonth) { lastMonth = month; return monthShort(firstDate) }
    return ''
  })

  return (
    <div ref={scrollRef} className="overflow-x-auto pb-1" role="img" aria-label="Mapa de constancia de entrenamientos">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-1">
          {labels.map((label, i) => (
            <span key={`lbl-${i}`} className="w-3.5 shrink-0 text-[9px] text-muted-foreground/70">{label}</span>
          ))}
        </div>

        <div className="flex gap-1">
          {weeks.map((week, wi) => (
            <div key={`wk-${wi}`} className="flex flex-col gap-1">
              {week.map((date, di) => {
                if (!date) return <span key={`e-${di}`} className="h-3.5 w-3.5" />
                const agg = byDate.get(date)
                const level = levelFor(agg ? agg.volumeKg : null, thresholds)
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelectDate(date)}
                    title={agg ? `${date}: ${Math.round(agg.volumeKg)} kg` : date}
                    aria-label={agg ? `${date}, ${Math.round(agg.volumeKg)} kilos` : `${date}, sin registro`}
                    className={cn('h-3.5 w-3.5 shrink-0 rounded-sm transition-transform hover:scale-125', intensityClass(level))}
                  />
                )
              })}
            </div>
          ))}
        </div>

        <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground/70">
          <span>menos</span>
          {([1, 2, 3, 4] as CellLevel[]).map(l => (
            <span key={l} className={cn('h-2.5 w-2.5 rounded-sm', intensityClass(l))} />
          ))}
          <span>más</span>
        </div>
      </div>
    </div>
  )
}
