'use client'

import { useEffect, useState } from 'react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import type { DayData } from '@/app/(app)/dashboard/page'
import { useI18n } from '@/components/i18n/I18nProvider'

const DAY_INITIALS = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
} as const

interface Props {
  days:     DayData[]
  todayIso: number
}

type DayState = 'completed' | 'today' | 'scheduled' | 'rest' | 'skipped' | 'recoverable'

export function WeekCalendar({ days, todayIso }: Props) {
  const { language, t } = useI18n()
  const [activeMessageDay, setActiveMessageDay] = useState<number | null>(null)
  const activeDay = activeMessageDay === null
    ? null
    : days.find(day => day.isoDay === activeMessageDay) ?? null
  const activeMessage = activeDay
    ? getUnavailableMessage(activeDay, getDayState(activeDay, todayIso), t)
    : null

  useEffect(() => {
    if (activeMessageDay === null) return
    const id = window.setTimeout(() => setActiveMessageDay(null), 2200)
    return () => window.clearTimeout(id)
  }, [activeMessageDay])

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">{t('Esta semana')}</span>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const dayNum  = parseInt(day.dateStr.split('-')[2], 10)
          const state   = getDayState(day, todayIso)

          return (
            <DayCell
              key={day.isoDay}
              day={day}
              dayInitial={DAY_INITIALS[language][day.isoDay - 1]}
              dayNum={dayNum}
              state={state}
              showMessage={activeMessageDay === day.isoDay}
              onUnavailableTap={() => setActiveMessageDay(day.isoDay)}
            />
          )
        })}
      </div>
      <p
        aria-live="polite"
        className={cn(
          'mt-3 min-h-5 px-0.5 text-xs font-medium text-muted-foreground transition-opacity sm:hidden',
          activeMessage ? 'opacity-100' : 'opacity-0',
        )}
      >
        {activeMessage ?? ' '}
      </p>
    </div>
  )
}

function getDayState(day: DayData, todayIso: number): DayState {
  if (day.isCompleted) return 'completed'
  if (!day.workout) return 'rest'
  if (day.isoDay === todayIso || day.isToday) return 'today'
  if (day.isRecoverable) return 'recoverable'
  if (day.isoDay < todayIso) return 'skipped'
  return 'scheduled'
}

function getTooltip(day: DayData, state: DayState, t: (source: string) => string): string {
  if (!day.workout) return t('Descanso')
  if (state === 'completed') {
    const duration = day.completedDurationMinutes
      ? ` · ${day.completedDurationMinutes} min`
      : ''
    return `✓ ${t('Completado')}${duration}`
  }
  if (state === 'recoverable') return `${t('Recuperable')} · ${day.workout.name}`
  return day.workout.name
}

function getUnavailableMessage(day: DayData, state: DayState, t: (source: string) => string): string {
  if (!day.workout) return t('Día de descanso, aprovecha para recuperar')
  if (state === 'completed') return t('Ver detalle de rutina completada')
  if (state === 'skipped') return t('Esta rutina quedó fuera de la ventana de recuperación.')
  if (state === 'scheduled') return t('Esta rutina aún no está disponible. Solo puedes iniciar la rutina de hoy.')
  return day.workout.name
}

function DayCell({
  day,
  dayInitial,
  dayNum,
  state,
  showMessage,
  onUnavailableTap,
}: {
  day:             DayData
  dayInitial:      string
  dayNum:          number
  state:           DayState
  showMessage:     boolean
  onUnavailableTap: () => void
}) {
  const { t } = useI18n()
  const workout = day.workout
  const canStart = (state === 'today' || state === 'recoverable') && workout !== null
  const canViewHistory = state === 'completed' && day.completedLogId !== null && workout !== null
  const tooltip = showMessage
    ? getUnavailableMessage(day, state, t)
    : getTooltip(day, state, t)

  const inner = (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-1 rounded-xl border py-3 px-1 transition-all duration-150 select-none',
        day.isToday && 'border-violet-500/80 bg-violet-500/10 text-violet-200 shadow-[0_0_14px_rgba(139,92,246,0.15)]',
        state === 'completed' && 'border-green-500/30 bg-green-500/5',
        state === 'scheduled' && 'border-border/60 bg-muted/10',
        state === 'rest' && 'border-border/30 bg-transparent opacity-50 hover:opacity-70',
        state === 'skipped' && 'border-border/40 bg-muted/5 opacity-60',
        state === 'recoverable' && 'border-amber-500/40 bg-amber-500/5',
        canStart || canViewHistory ? 'cursor-pointer' : 'cursor-not-allowed',
        state === 'rest' && 'cursor-default',
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
          showMessage && 'block',
        )}
      >
        {tooltip}
      </span>
    </div>
  )

  if (canStart) {
    return (
      <PendingLink
        href={`/session/${workout.id}`}
        className="focus-visible:outline-none"
        aria-label={
          state === 'recoverable'
            ? t('Recuperar {workout}', { workout: workout.name })
            : day.isToday ? t('Continuar {workout}', { workout: workout.name }) : workout.name
        }
        title={getTooltip(day, state, t)}
        showSpinner={false}
      >
        {inner}
      </PendingLink>
    )
  }

  if (canViewHistory) {
    return (
      <PendingLink
        href={`/history/${day.completedLogId}`}
        className="focus-visible:outline-none"
        aria-label={t('Ver historial de {workout}', { workout: workout.name })}
        title={t('Ver detalle de {workout} completada', { workout: workout.name })}
        showSpinner={false}
      >
        {inner}
      </PendingLink>
    )
  }

  return (
    <button
      type="button"
      onClick={onUnavailableTap}
      className="focus-visible:outline-none"
      aria-disabled={day.workout ? true : undefined}
      aria-label={day.workout ? getUnavailableMessage(day, state, t) : t('Día de descanso')}
      title={getUnavailableMessage(day, state, t)}
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
    return <span className="h-2 w-2 rounded-full border border-border/70" />
  }

  if (state === 'skipped') {
    return <span className="text-xs font-semibold leading-none text-muted-foreground/40">✕</span>
  }

  if (state === 'recoverable') {
    return <span className="text-xs font-bold leading-none text-amber-400">↻</span>
  }

  return <span className="text-xs font-medium leading-none text-muted-foreground/30">—</span>
}
