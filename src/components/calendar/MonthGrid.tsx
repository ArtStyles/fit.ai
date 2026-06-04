'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import { buildMonthGrid, type DayAggregate, type IntensityThresholds } from '@/lib/calendar/aggregate'
import { intensityClass, levelFor } from './intensity'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

interface Props {
  year:       number
  month:      number // 1-12
  todayStr:   string
  byDate:     Map<string, DayAggregate>
  thresholds: IntensityThresholds
  onPrev:     () => void
  onNext:     () => void
  onToday:    () => void
}

function monthLabel(year: number, month: number): string {
  const label = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthGrid({ year, month, todayStr, byDate, thresholds, onPrev, onNext, onToday }: Props) {
  const cells = buildMonthGrid(year, month, todayStr)
  const isCurrentMonth = todayStr.startsWith(`${year}-${String(month).padStart(2, '0')}`)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button" onClick={onPrev} aria-label="Mes anterior"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="text-center">
          <p className="font-display text-lg font-bold text-foreground" aria-live="polite">
            {monthLabel(year, month)}
          </p>
          {!isCurrentMonth && (
            <button type="button" onClick={onToday} className="text-xs font-medium text-violet-400 hover:underline">
              Hoy
            </button>
          )}
        </div>

        <button
          type="button" onClick={onNext} aria-label="Mes siguiente"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={`wd-${i}`} className="pb-1 text-[10px] font-semibold uppercase text-muted-foreground/70">{d}</span>
        ))}

        {cells.map((cell, i) => {
          if (!cell.date) return <span key={`pad-${i}`} />

          const agg = byDate.get(cell.date)
          const level = cell.isFuture ? 0 : levelFor(agg ? agg.volumeKg : null, thresholds)
          const label = agg
            ? `${cell.date}: ${Math.round(agg.volumeKg)} kg · ${agg.durationMin} min`
            : `${cell.date}: sin registro`

          const inner = (
            <div className={cn(
              'flex aspect-square items-center justify-center rounded-lg text-xs font-semibold transition-colors',
              intensityClass(level),
              cell.isFuture && 'opacity-30',
              cell.isToday && 'ring-2 ring-violet-500',
              level >= 3 ? 'text-white' : 'text-foreground',
            )}>
              {cell.dayNum}
            </div>
          )

          if (agg && !cell.isFuture) {
            return (
              <PendingLink key={cell.date} href={`/history/${agg.logIds[0]}`} aria-label={label} title={label} showSpinner={false}>
                {inner}
              </PendingLink>
            )
          }

          return <div key={cell.date} aria-label={label} title={label}>{inner}</div>
        })}
      </div>
    </div>
  )
}
