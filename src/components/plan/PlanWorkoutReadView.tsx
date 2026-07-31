'use client'

import { Clock3, Dumbbell, Pencil, Play } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { PlanDaySummary } from './planViewModel'
import type { PlanWorkoutExerciseRow } from './WorkoutExerciseList'

function firstExercise(row: PlanWorkoutExerciseRow) {
  return Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
}

function prescription(row: PlanWorkoutExerciseRow, t: (source: string, values?: Record<string, string | number>) => string) {
  const parts = [
    row.sets && row.reps ? `${row.sets} × ${row.reps}` : row.sets ? t('{count} series', { count: row.sets }) : null,
    row.weight_kg ? t('{weight} kg', { weight: row.weight_kg }) : null,
    row.rest_seconds ? t('{seconds} s descanso', { seconds: row.rest_seconds }) : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

export function PlanWorkoutReadView({
  summary,
  exercises,
  isToday,
  onEdit,
}: {
  summary: PlanDaySummary
  exercises: PlanWorkoutExerciseRow[]
  isToday: boolean
  onEdit: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{isToday ? t('Entrenamiento de hoy') : t('Detalle de sesión')}</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-foreground">{summary.name}</h2>
        {summary.focus && <p className="mt-1 text-sm text-muted-foreground">{summary.focus}</p>}
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2"><Dumbbell className="h-4 w-4" aria-hidden="true" />{summary.exerciseCount} {t('ejercicios')}</span>
          {summary.durationMinutes && <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" aria-hidden="true" />{t('{minutes} min', { minutes: summary.durationMinutes })}</span>}
        </div>
      </header>

      {isToday && (
        <PendingLink href={`/session/${summary.id}`} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--training-action))] px-5 text-base font-extrabold text-slate-950 transition-[filter,transform] duration-[var(--motion-press)] hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--training-action))] motion-reduce:transition-none">
          <Play className="h-5 w-5 fill-current" aria-hidden="true" />
          {t('Empezar entrenamiento')}
        </PendingLink>
      )}

      <ol className="space-y-2" aria-label={t('Ejercicios')}>
        {exercises.map((row, index) => {
          const exercise = firstExercise(row)
          return (
            <li key={row.id} className="rounded-2xl border border-border/60 bg-background/45 p-4">
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/12 text-xs font-bold text-violet-200">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{exercise?.name ?? t('Ejercicio')}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{prescription(row, t) || t('Prescripción pendiente')}</p>
                  {(exercise?.muscle_groups?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-violet-300">{exercise?.muscle_groups?.join(' · ')}</p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <button type="button" onClick={onEdit} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-400/40 px-4 text-sm font-bold text-violet-200 transition-colors hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none">
        <Pencil className="h-4 w-4" aria-hidden="true" />
        {t('Editar estructura')}
      </button>
    </div>
  )
}
