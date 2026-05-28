'use client'

import { useEffect, useState } from 'react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import type { DayData } from '@/app/(app)/dashboard/page'

const DAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

interface Props {
  days:     DayData[]
  todayIso: number
}

type DayState = 'completed' | 'today' | 'scheduled' | 'rest' | 'skipped'

export function WeekCalendar({ days }: Props) {
  const [activeRestDay, setActiveRestDay] = useState<number | null>(null)

  useEffect(() => {
    if (activeRestDay === null) return
    const id = window.setTimeout(() => setActiveRestDay(null), 2200)
    return () => window.clearTimeout(id)
  }, [activeRestDay])

  return (
    <div>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
        Esta semana
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const dayNum  = parseInt(day.dateStr.split('-')[2], 10)
          const state   = getDayState(day)

          return (
            <DayCell
              key={day.isoDay}
              day={day}
              dayInitial={DAY_INITIALS[day.isoDay - 1]}
              dayNum={dayNum}
              state={state}
              showRestMessage={activeRestDay === day.isoDay}
              onRestTap={() => setActiveRestDay(day.isoDay)}
            />
          )
        })}
      </div>
    </div>
  )
}

function getDayState(day: DayData): DayState {
  const today = new Date().toISOString().split('T')[0]

  if (day.isCompleted) return 'completed'
  if (!day.workout) return 'rest'
  if (day.isToday) return 'today'
  if (day.dateStr < today) return 'skipped'
  return 'scheduled'
}

function getTooltip(day: DayData, state: DayState): string {
  if (!day.workout) return 'Descanso'
  if (state === 'completed') {
    const duration = day.completedDurationMinutes
      ? ` · ${day.completedDurationMinutes} min`
      : ''
    return `✓ Completado${duration}`
  }
  return day.workout.name
}

function DayCell({
  day,
  dayInitial,
  dayNum,
  state,
  showRestMessage,
  onRestTap,
}: {
  day:             DayData
  dayInitial:      string
  dayNum:          number
  state:           DayState
  showRestMessage: boolean
  onRestTap:       () => void
}) {
  const tooltip = showRestMessage
    ? 'Día de descanso, aprovecha para recuperar'
    : getTooltip(day, state)

  const inner = (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-1 rounded-xl border py-2.5 px-1 transition-colors select-none',
        day.isToday && 'border-violet-500/80 bg-violet-500/10 text-violet-200',
        state === 'completed' && 'border-green-500/30 bg-green-500/5',
        state === 'scheduled' && 'border-border/60 bg-muted/10 hover:bg-muted/20',
        state === 'rest' && 'border-border/30 bg-transparent opacity-60 hover:opacity-80',
        state === 'skipped' && 'border-border/40 bg-muted/5 opacity-70',
      )}
    >
      <span className={cn(
        'text-[10px] font-semibold uppercase',
        day.isToday ? 'text-violet-300' : 'text-muted-foreground',
      )}>
        {dayInitial}
      </span>

      <span className={cn(
        'text-sm font-bold',
        state === 'completed' ? 'text-green-400' :
        day.isToday ? 'text-violet-100' :
        day.workout ? 'text-foreground' : 'text-muted-foreground',
      )}>
        {dayNum}
      </span>

      <div className="flex h-3.5 w-3.5 items-center justify-center">
        <StatusIndicator state={state} />
      </div>

      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 top-[calc(100%+0.45rem)] z-30 hidden w-max max-w-48 -translate-x-1/2 rounded-md border border-border/70 bg-popover px-2 py-1 text-center text-[11px] font-medium leading-snug text-popover-foreground shadow-lg group-hover:block group-focus-within:block',
          showRestMessage && 'block',
        )}
      >
        {tooltip}
      </span>
    </div>
  )

  if (day.workout) {
    return (
      <PendingLink
        href={`/session/${day.workout.id}`}
        className="focus-visible:outline-none"
        aria-label={day.isToday ? `Continuar ${day.workout.name}` : day.workout.name}
        title={getTooltip(day, state)}
        showSpinner={false}
      >
        {inner}
      </PendingLink>
    )
  }

  return (
    <button
      type="button"
      onClick={onRestTap}
      className="focus-visible:outline-none"
      aria-label="Día de descanso"
      title="Descanso"
    >
      {inner}
    </button>
  )
}

function StatusIndicator({ state }: { state: DayState }) {
  if (state === 'completed') {
    return <span className="text-xs font-bold leading-none text-green-400">✓</span>
  }

  if (state === 'today') {
    return (
      <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_0_3px_rgba(139,92,246,0.18),0_0_10px_rgba(139,92,246,0.75)]" />
    )
  }

  if (state === 'scheduled') {
    return <span className="h-2 w-2 rounded-full border border-gray-600" />
  }

  if (state === 'skipped') {
    return <span className="text-xs font-semibold leading-none text-gray-600 opacity-50">✕</span>
  }

  return <span className="text-xs font-medium leading-none text-gray-700">—</span>
}
