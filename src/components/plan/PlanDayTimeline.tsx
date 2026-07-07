'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, Dumbbell, Timer } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import type { PlanDaySummary } from './planViewModel'

const DAY_NAMES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
}

const DAY_SHORT_NAMES: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
}

type TimelineDay = {
  key: string
  dayOfWeek: number | null
  label: string
  shortLabel: string
  workouts: PlanDaySummary[]
  isToday: boolean
}

function buildTimelineDays(days: PlanDaySummary[], todayIso: number): TimelineDay[] {
  const byDay = new Map<number, PlanDaySummary[]>()
  const unscheduled: PlanDaySummary[] = []

  for (const day of days) {
    if (day.dayOfWeek) {
      byDay.set(day.dayOfWeek, [...(byDay.get(day.dayOfWeek) ?? []), day])
    } else {
      unscheduled.push(day)
    }
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = index + 1

    return {
      key: String(dayOfWeek),
      dayOfWeek,
      label: DAY_NAMES[dayOfWeek],
      shortLabel: DAY_SHORT_NAMES[dayOfWeek],
      workouts: byDay.get(dayOfWeek) ?? [],
      isToday: dayOfWeek === todayIso,
    }
  })

  if (unscheduled.length === 0) return weekDays

  return [
    ...weekDays,
    {
      key: 'unscheduled',
      dayOfWeek: null,
      label: 'Entrenamientos sin día fijo',
      shortLabel: 'Sin día',
      workouts: unscheduled,
      isToday: false,
    },
  ]
}

function formatDuration(minutes: number | null, t: (source: string, values?: Record<string, string | number>) => string) {
  if (!minutes) return t('Duración pendiente')
  return t('{minutes} min', { minutes })
}

function sessionCountLabel(count: number, t: (source: string) => string): string {
  return `${count} ${count === 1 ? t('sesión') : t('sesiones')}`
}

function WorkoutCard({
  workout,
  isToday,
}: {
  workout: PlanDaySummary
  isToday: boolean
}) {
  const { t } = useI18n()

  return (
    <article className="rounded-2xl border border-border/50 bg-background/45 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{workout.name}</h3>
          {workout.focus ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{workout.focus}</p>
          ) : null}
        </div>
        {isToday ? (
          <span className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-100">
            {t('Hoy')}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center">
          <Dumbbell className="mr-1.5 h-3.5 w-3.5" />
          {workout.exerciseCount} {t('ejercicios')}
        </span>
        <span className="inline-flex items-center">
          <Timer className="mr-1.5 h-3.5 w-3.5" />
          {formatDuration(workout.durationMinutes, t)}
        </span>
      </div>

      {isToday ? (
        <PendingLink
          href={`/session/${workout.id}`}
          className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          spinnerClassName="h-3.5 w-3.5"
        >
          {t('Abrir rutina')}
          <ChevronRight className="ml-1 h-4 w-4" />
        </PendingLink>
      ) : null}
    </article>
  )
}

function DayContent({ day }: { day: TimelineDay }) {
  const { t } = useI18n()

  if (day.workouts.length === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-background/35 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/30">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-foreground">{t('Día de descanso')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('Sin sesiones programadas.')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {day.workouts.map(workout => (
        <WorkoutCard key={workout.id} workout={workout} isToday={day.isToday} />
      ))}
    </div>
  )
}

export function PlanDayTimeline({
  days,
  todayIso,
}: {
  days: PlanDaySummary[]
  todayIso: number
}) {
  const { t } = useI18n()
  const timelineDays = useMemo(() => buildTimelineDays(days, todayIso), [days, todayIso])
  const initialKey = timelineDays.find(day => day.isToday)?.key
    ?? timelineDays.find(day => day.workouts.length > 0)?.key
    ?? timelineDays[0]?.key
    ?? '1'
  const [activeKey, setActiveKey] = useState(initialKey)
  const activeDay = timelineDays.find(day => day.key === activeKey) ?? timelineDays[0]!

  return (
    <section className="rounded-3xl border border-border/60 bg-muted/10 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Semana visual')}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-foreground">{t('Días de la semana')}</h2>
        </div>
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 md:hidden">
        <div role="tablist" aria-label={t('Días de la semana')} className="flex min-w-max gap-2">
          {timelineDays.map(day => {
            const selected = day.key === activeDay.key

            return (
              <button
                key={day.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveKey(day.key)}
                className={cn(
                  'min-h-[58px] w-24 rounded-2xl border px-3 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500',
                  selected
                    ? 'border-violet-500/60 bg-violet-500/15 text-violet-100'
                    : 'border-border/60 bg-background/45 text-muted-foreground hover:bg-muted/20 hover:text-foreground',
                )}
              >
                <span className="block font-semibold">{t(day.shortLabel)}</span>
                <span className="mt-1 block text-[11px]">
                  {day.workouts.length > 0
                    ? sessionCountLabel(day.workouts.length, t)
                    : t('Descanso')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 md:hidden">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">{t(activeDay.label)}</p>
          {activeDay.isToday ? (
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-100">
              {t('Hoy')}
            </span>
          ) : null}
        </div>
        <DayContent day={activeDay} />
      </div>

      <ol className="mt-5 hidden space-y-4 md:block">
        {timelineDays.map((day, index) => (
          <li key={day.key} className="relative grid grid-cols-[8rem_minmax(0,1fr)] gap-5">
            {index < timelineDays.length - 1 ? (
              <span className="absolute left-[8.4rem] top-11 h-[calc(100%+1rem)] w-px bg-border/60" />
            ) : null}
            <div className="pt-2 text-right">
              <p className="text-sm font-semibold text-foreground">{t(day.label)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {day.isToday ? t('Hoy') : day.workouts.length > 0 ? sessionCountLabel(day.workouts.length, t) : t('Descanso')}
              </p>
            </div>
            <div className="relative min-w-0">
              <span
                className={cn(
                  'absolute -left-[1.15rem] top-5 h-3 w-3 rounded-full border-2',
                  day.isToday
                    ? 'border-violet-300 bg-violet-500'
                    : day.workouts.length > 0
                      ? 'border-violet-500/50 bg-background'
                      : 'border-border bg-background',
                )}
              />
              <DayContent day={day} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
