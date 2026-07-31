'use client'

import { MoreVertical, Repeat2, SkipForward, Trash2, TrendingUp } from 'lucide-react'

import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SessionExercisePicker } from '@/components/session/SessionExercisePicker'
import { useSessionStore, type ExerciseSession, type SessionExerciseDraft } from '@/store/sessionStore'
import { PreviousPerformance } from './PreviousPerformance'

const SKIP_REASONS = ['Sin equipo', 'Fatiga', 'Dolor', 'Tiempo']

export function SessionExerciseHeader({
  exercise,
  exerciseOptions,
}: {
  exercise: ExerciseSession
  exerciseOptions: SessionExerciseDraft[]
}) {
  const { t } = useI18n()
  const skipExercise = useSessionStore(state => state.skipExercise)
  const replaceExercise = useSessionStore(state => state.replaceSessionExercise)
  const removeExercise = useSessionStore(state => state.removeSessionExercise)
  const completedSets = exercise.sets.filter(set => set.completed).length
  const canReplace = completedSets === 0
  const canRemove = exercise.source === 'ad_hoc' && completedSets === 0
  const target = exercise.targetDuration
    ? t('{seconds} s · RPE {rpe}', { seconds: exercise.targetDuration, rpe: exercise.targetRpe })
    : t('{reps} reps · RPE {rpe}', { reps: exercise.targetReps ?? '—', rpe: exercise.targetRpe })

  return (
    <header className="rounded-3xl border border-border/70 bg-[hsl(var(--surface-1))] p-5">
      <div className="flex items-start gap-4">
        <ExerciseImage src={exercise.imageUrl} alt={exercise.name} variant="thumb" zoomable className="h-20 w-20 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{t('Ejercicio activo')}</p>
          <h2 className="mt-1 text-balance font-display text-2xl font-bold leading-tight text-foreground">{exercise.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{target}</p>
          {exercise.muscleGroups.length > 0 && <p className="mt-2 text-xs capitalize text-violet-300">{exercise.muscleGroups.slice(0, 3).join(' · ')}</p>}
        </div>

        <details className="group relative shrink-0">
          <summary aria-label={t('Menú del ejercicio')} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-border/70 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 [&::-webkit-details-marker]:hidden">
            <MoreVertical className="h-5 w-5" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-2xl border border-border/70 bg-background p-3 shadow-2xl shadow-black/30">
            {canReplace && (
              <details className="rounded-xl border border-border/60 bg-muted/10 p-3">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-violet-200"><Repeat2 className="h-4 w-4" aria-hidden="true" />{t('Cambiar ejercicio solo por hoy')}</summary>
                <div className="mt-3"><SessionExercisePicker options={exerciseOptions.filter(option => option.exerciseId !== exercise.exerciseId)} placeholder={t('Buscar reemplazo')} onSelect={nextExercise => replaceExercise(exercise.workoutExerciseId, nextExercise)} /></div>
              </details>
            )}
            <div>
              <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t('Saltar por')}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {SKIP_REASONS.map(reason => (
                  <button key={reason} type="button" onClick={() => skipExercise(exercise.workoutExerciseId, reason)} className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border/60 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><SkipForward className="h-3.5 w-3.5" aria-hidden="true" />{t(reason)}</button>
                ))}
              </div>
            </div>
            {canRemove && (
              <button type="button" onClick={() => removeExercise(exercise.workoutExerciseId)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/5 text-sm font-semibold text-red-300"><Trash2 className="h-4 w-4" aria-hidden="true" />{t('Quitar ejercicio agregado')}</button>
            )}
          </div>
        </details>
      </div>

      {exercise.originalName && <p className="mt-4 rounded-xl bg-violet-500/10 px-3 py-2 text-xs text-violet-200">{t('Reemplaza solo por hoy a {name}.', { name: exercise.originalName })}</p>}
      {exercise.notes && <p className="mt-3 rounded-xl bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{exercise.notes}</p>}
      {exercise.weightSuggestionBasis === 'based_on_previous_logs' && exercise.suggestedWeight !== null && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200"><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />{t('Ajustado por tu progreso')}</p>
      )}
      <PreviousPerformance performance={exercise.previousPerformance} />
    </header>
  )
}
