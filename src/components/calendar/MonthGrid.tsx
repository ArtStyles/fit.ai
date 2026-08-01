'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import { buildMonthGrid, type DayAggregate, type IntensityThresholds } from '@/lib/calendar/aggregate'
import { intensityClass, levelFor } from './intensity'

const WEEKDAYS = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
}

interface Props {
  year: number
  month: number
  todayStr: string
  selectedDate: string
  byDate: Map<string, DayAggregate>
  thresholds: IntensityThresholds
  onSelectDate: (date: string) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

function monthLabel(year: number, month: number, language: 'es' | 'en'): string {
  const label = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthGrid({
  year,
  month,
  todayStr,
  selectedDate,
  byDate,
  thresholds,
  onSelectDate,
  onPrev,
  onNext,
  onToday,
}: Props) {
  const { language, t } = useI18n()
  const cells = buildMonthGrid(year, month, todayStr)
  const isCurrentMonth = todayStr.startsWith(`${year}-${String(month).padStart(2, '0')}`)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrev}
          aria-label={t('Mes anterior')}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="text-center">
          <p className="font-display text-xl font-bold text-foreground" aria-live="polite">
            {monthLabel(year, month, language)}
          </p>
          {!isCurrentMonth ? (
            <button type="button" onClick={onToday} className="min-h-8 text-xs font-semibold text-violet-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              {t('Hoy')}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">{t('Actividad del mes')}</p>
          )}
        </div>

        <button
          type="button"
          onClick={onNext}
          aria-label={t('Mes siguiente')}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {WEEKDAYS[language].map((day, index) => (
          <span key={`weekday-${index}`} className="pb-1 text-[11px] font-semibold uppercase text-muted-foreground">
            {day}
          </span>
        ))}

        {cells.map((cell, index) => {
          if (!cell.date) return <span key={`pad-${index}`} />

          const aggregate = byDate.get(cell.date)
          const level = cell.isFuture ? 0 : levelFor(aggregate ? aggregate.volumeKg : null, thresholds)
          const isSelected = cell.date === selectedDate
          const label = aggregate
            ? `${cell.date}: ${aggregate.sessions} ${t('Sesiones').toLowerCase()}, ${Math.round(aggregate.volumeKg)} kg, ${aggregate.durationMin} min${cell.isToday ? `, ${t('Hoy').toLowerCase()}` : ''}`
            : `${cell.date}: ${t('Sin sesiones todavía').toLowerCase()}${cell.isToday ? `, ${t('Hoy').toLowerCase()}` : ''}`
          const classes = cn(
            'relative flex aspect-square min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-[background-color,color,box-shadow,transform] duration-200 motion-reduce:transition-none',
            intensityClass(level),
            cell.isFuture && 'cursor-default opacity-25',
            cell.isToday && 'ring-2 ring-violet-400 ring-offset-2 ring-offset-background',
            isSelected && 'bg-violet-500 text-white shadow-lg shadow-violet-950/30 ring-2 ring-violet-300 ring-offset-2 ring-offset-background',
            !cell.isFuture && 'hover:-translate-y-0.5 hover:border-violet-400/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 motion-reduce:hover:translate-y-0',
            isSelected || level >= 3 ? 'text-white' : 'text-foreground',
          )

          if (!cell.isFuture) {
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => onSelectDate(cell.date!)}
                aria-label={label}
                aria-selected={isSelected}
                title={label}
                className={classes}
              >
                {cell.dayNum}
                {aggregate && aggregate.sessions > 1 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-background/80 px-1 text-[9px] font-bold text-foreground">
                    {aggregate.sessions}
                  </span>
                ) : null}
              </button>
            )
          }

          return <div key={cell.date} aria-label={label} title={label} className={classes}>{cell.dayNum}</div>
        })}
      </div>
    </div>
  )
}
