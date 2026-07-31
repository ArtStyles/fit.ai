'use client'

import { CalendarDays, Clock3, Dumbbell } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { TimelineNode, TimelineRail } from '@/components/training/TimelineRail'
import { cn } from '@/lib/utils'
import type { PlanWeekEntry } from './planViewModel'

const DAY_NAMES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
}

export function PlanDayTimeline({
  entries,
  selectedWorkoutId,
  onSelectWorkout,
}: {
  entries: PlanWeekEntry[]
  selectedWorkoutId: string | null
  onSelectWorkout: (workoutId: string) => void
}) {
  const { t } = useI18n()

  return (
    <section aria-labelledby="plan-week-title" className="rounded-3xl border border-border/70 bg-[hsl(var(--surface-1))] p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{t('Mapa semanal')}</p>
      <h2 id="plan-week-title" className="mt-1 font-display text-2xl font-bold text-foreground">{t('Tu semana')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('Selecciona una sesión para revisar su estructura.')}</p>

      <TimelineRail className="mt-5">
        {entries.map(entry => {
          const label = entry.isoDay ? t(DAY_NAMES[entry.isoDay]) : t('Sin día fijo')
          const tone = entry.isToday ? 'active' : entry.kind === 'rest' ? 'rest' : 'upcoming'

          return (
            <TimelineNode
              key={entry.key}
              tone={tone}
              label={entry.isToday ? t('Hoy') : entry.kind === 'rest' ? t('Descanso') : label}
            >
              <div className={cn(
                'rounded-2xl border p-3',
                entry.isToday
                  ? 'border-violet-400/35 bg-violet-500/10'
                  : 'border-border/60 bg-background/40',
              )}>
                <div className="flex items-center justify-between gap-3 px-1">
                  <p className="text-sm font-bold text-foreground">{label}</p>
                  {entry.isToday && <span className="rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">{t('Hoy')}</span>}
                </div>

                {entry.kind === 'rest' ? (
                  <div className="mt-2 flex min-h-11 items-center gap-3 rounded-xl bg-muted/20 px-3 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    {t('Día de descanso')}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {entry.workouts.map(workout => (
                      <button
                        key={workout.id}
                        type="button"
                        onClick={() => onSelectWorkout(workout.id)}
                        aria-pressed={selectedWorkoutId === workout.id}
                        className={cn(
                          'flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-[border-color,background-color,transform] duration-[var(--motion-press)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none',
                          selectedWorkoutId === workout.id
                            ? 'border-violet-400/50 bg-violet-500/12'
                            : 'border-border/50 bg-[hsl(var(--surface-2))] hover:border-violet-400/35',
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-300"><Dumbbell className="h-4 w-4" aria-hidden="true" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{workout.name}</span>
                          <span className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{workout.exerciseCount} {t('ejercicios')}</span>
                            {workout.durationMinutes && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden="true" />{t('{minutes} min', { minutes: workout.durationMinutes })}</span>}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TimelineNode>
          )
        })}
      </TimelineRail>
    </section>
  )
}
