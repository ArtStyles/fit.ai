'use client'

import { CheckCircle2, ChevronRight, Clock3, Dumbbell, Moon } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { DashboardToday } from './dashboardViewModel'

const DAY_NAMES: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
}

export function TodayActionCard({ today }: { today: DashboardToday }) {
  const { t } = useI18n()

  if (today.state === 'needs-plan') return null

  if (today.state === 'rest') {
    return (
      <section aria-labelledby="today-title" className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 to-card p-5 sm:p-6">
        <div className="flex items-center gap-3 text-violet-300">
          <Moon className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-bold uppercase tracking-[0.12em]">{t('Hoy')}</p>
        </div>
        <h2 id="today-title" className="mt-4 font-display text-2xl font-bold text-foreground">{t('Día de descanso')}</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {t('Recupera energía hoy para llegar preparado a tu próxima sesión.')}
        </p>
        {today.nextWorkout && today.nextWorkoutIsoDay ? (
          <div className="mt-5 rounded-2xl border border-border/70 bg-background/60 p-4">
            <p className="text-sm font-semibold text-muted-foreground">{t('Próxima sesión')}</p>
            <p className="mt-1 text-base font-semibold text-foreground">{today.nextWorkout.name}</p>
            <p className="mt-1 text-base text-violet-300">{t(DAY_NAMES[today.nextWorkoutIsoDay])}</p>
          </div>
        ) : (
          <p className="mt-5 text-base font-medium text-foreground">{t('No hay otra sesión programada esta semana.')}</p>
        )}
      </section>
    )
  }

  const workout = today.workout
  if (!workout) return null

  if (today.state === 'completed') {
    return (
      <section aria-labelledby="today-title" className="rounded-3xl border border-violet-400/30 bg-violet-500/10 p-5 sm:p-6">
        <div className="flex items-center gap-2 text-violet-300">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-bold uppercase tracking-[0.12em]">{t('Completado hoy')}</p>
        </div>
        <h2 id="today-title" className="mt-4 font-display text-2xl font-bold text-foreground">{workout.name}</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{t('La sesión de hoy ya está hecha. Prioriza tu recuperación.')}</p>
        {today.nextWorkout && today.nextWorkoutIsoDay && (
          <p className="mt-4 text-base text-foreground">
            {t('Próxima:')} <span className="font-semibold">{today.nextWorkout.name}</span>{' '}
            <span className="text-violet-300">{t(DAY_NAMES[today.nextWorkoutIsoDay])}</span>
          </p>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="today-title" className="relative overflow-hidden rounded-3xl border border-violet-300/25 bg-gradient-to-br from-violet-950 via-violet-800 to-indigo-950 p-5 text-white shadow-[0_24px_64px_-28px_rgba(124,58,237,0.85)] sm:p-7">
      <div className="relative">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-violet-200">{t('Entrenamiento de hoy')}</p>
        <h2 id="today-title" className="mt-3 text-balance font-display text-3xl font-extrabold leading-tight">{workout.name}</h2>
        {workout.focus && <p className="mt-2 text-base text-violet-100/85">{workout.focus}</p>}
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-base text-violet-50">
          {workout.exercise_count > 0 && (
            <span className="inline-flex items-center gap-2"><Dumbbell className="h-5 w-5 text-violet-200" aria-hidden="true" />{workout.exercise_count} {t('ejercicios')}</span>
          )}
          {workout.estimated_duration_minutes && (
            <span className="inline-flex items-center gap-2"><Clock3 className="h-5 w-5 text-violet-200" aria-hidden="true" />{workout.estimated_duration_minutes} min</span>
          )}
        </div>
        {today.href && (
          <PendingLink
            href={today.href}
            className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-base font-bold text-violet-800 transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-violet-900 motion-reduce:transition-none"
          >
            {t('Empezar entrenamiento')}
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </PendingLink>
        )}
      </div>
    </section>
  )
}
