'use client'

import { useState } from 'react'
import { CheckCircle2, Clock3, SkipForward } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  useSessionStore,
  type ExerciseSession,
  type SessionExerciseDraft,
  type SetData,
} from '@/store/sessionStore'
import { ActiveSetFocus } from './ActiveSetFocus'
import { CompactSetSummary } from './CompactSetSummary'
import { CompleteSetDock } from './CompleteSetDock'
import { RPESelector } from './RPESelector'
import { SessionExerciseHeader } from './SessionExerciseHeader'
import { currentSetIndex, type SessionFocusWindow } from './sessionViewModel'

interface Props {
  exercise: ExerciseSession
  exerciseOptions: SessionExerciseDraft[]
  focusWindow?: SessionFocusWindow
}

type EditDraft = {
  weightKg: string
  reps: string
  durationSeconds: number
  rpe: number | null
}

function CompactExercise({ exercise }: { exercise: ExerciseSession }) {
  const { t } = useI18n()
  const completedSets = exercise.sets.filter(set => set.completed).length
  const isCompleted = exercise.status === 'completed'
  const isSkipped = exercise.status === 'skipped'

  return (
    <article className={cn(
      'flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3',
      isCompleted && 'border-[hsl(var(--training-complete)/0.25)] bg-[hsl(var(--training-complete)/0.06)]',
      isSkipped && 'border-border/40 bg-muted/5 opacity-65',
      !isCompleted && !isSkipped && 'border-border/50 bg-[hsl(var(--surface-1))]',
    )}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', isCompleted ? 'bg-[hsl(var(--training-complete)/0.12)] text-[hsl(var(--training-complete))]' : 'bg-muted/30 text-muted-foreground')}>
        {isCompleted ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : isSkipped ? <SkipForward className="h-4 w-4" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-semibold', isSkipped ? 'text-muted-foreground line-through' : 'text-foreground')}>{exercise.name}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {isSkipped
            ? `${t('Saltado')}${exercise.skipReason ? ` · ${exercise.skipReason}` : ''}`
            : t('{completed} de {total} series', { completed: completedSets, total: exercise.sets.length })}
        </span>
      </span>
    </article>
  )
}

export function ExerciseCard({ exercise, exerciseOptions, focusWindow }: Props) {
  const { t } = useI18n()
  const updateSetField = useSessionStore(state => state.updateSetField)
  const updateSetDuration = useSessionStore(state => state.updateSetDuration)
  const selectRpe = useSessionStore(state => state.selectRpe)
  const completeSet = useSessionStore(state => state.completeSet)
  const [editSetIndex, setEditSetIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)

  if (exercise.status !== 'active') return <CompactExercise exercise={exercise} />

  const fallbackIndex = currentSetIndex(exercise.sets)
  const currentIndex = focusWindow?.currentSetIndex ?? (fallbackIndex >= 0 ? fallbackIndex : null)
  const previousIndex = focusWindow?.previousSetIndex
    ?? (currentIndex !== null && currentIndex > 0 ? currentIndex - 1 : null)
  const nextIndex = focusWindow?.nextSetIndex
    ?? (currentIndex !== null && currentIndex + 1 < exercise.sets.length ? currentIndex + 1 : null)
  const currentSet = currentIndex !== null ? exercise.sets[currentIndex] : null

  function openEdit(index: number, data: SetData) {
    setEditSetIndex(index)
    setEditDraft({
      weightKg: data.weightKg,
      reps: data.reps,
      durationSeconds: data.durationSeconds ?? 0,
      rpe: data.rpe,
    })
  }

  function saveCorrection() {
    if (editSetIndex === null || !editDraft) return
    updateSetField(exercise.workoutExerciseId, editSetIndex, 'weightKg', editDraft.weightKg)
    updateSetField(exercise.workoutExerciseId, editSetIndex, 'reps', editDraft.reps)
    updateSetDuration(exercise.workoutExerciseId, editSetIndex, editDraft.durationSeconds)
    if (editDraft.rpe !== null) selectRpe(exercise.workoutExerciseId, editSetIndex, editDraft.rpe)
    setEditSetIndex(null)
    setEditDraft(null)
  }

  return (
    <article className="space-y-3" aria-label={exercise.name}>
      <SessionExerciseHeader exercise={exercise} exerciseOptions={exerciseOptions} />

      {previousIndex !== null && exercise.sets[previousIndex] && (
        <CompactSetSummary
          setNumber={previousIndex + 1}
          data={exercise.sets[previousIndex]}
          relation="previous"
          onEdit={() => openEdit(previousIndex, exercise.sets[previousIndex])}
        />
      )}

      {currentSet && currentIndex !== null && (
        <ActiveSetFocus
          exerciseId={exercise.workoutExerciseId}
          setIndex={currentIndex}
          data={currentSet}
          targetDuration={exercise.targetDuration}
        />
      )}

      {nextIndex !== null && exercise.sets[nextIndex] && (
        <CompactSetSummary setNumber={nextIndex + 1} data={exercise.sets[nextIndex]} relation="next" />
      )}

      {currentSet && currentIndex !== null && (
        <CompleteSetDock
          exerciseId={exercise.workoutExerciseId}
          setIndex={currentIndex}
          onComplete={() => completeSet(exercise.workoutExerciseId, currentIndex)}
        />
      )}

      <Dialog
        open={editSetIndex !== null}
        onOpenChange={open => {
          if (!open) {
            setEditSetIndex(null)
            setEditDraft(null)
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl border-border/70">
          <DialogHeader><DialogTitle>{t('Corregir serie {number}', { number: (editSetIndex ?? 0) + 1 })}</DialogTitle></DialogHeader>
          {editDraft && (
            <div className="space-y-4">
              {exercise.targetDuration ? (
                <label className="block space-y-2"><span className="text-sm font-semibold text-muted-foreground">{t('Tiempo en segundos')}</span><input type="number" min={0} value={editDraft.durationSeconds} onChange={event => setEditDraft(draft => draft ? { ...draft, durationSeconds: Number(event.target.value) || 0 } : draft)} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-lg text-foreground outline-none focus:ring-2 focus:ring-violet-400" /></label>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-2"><span className="text-sm font-semibold text-muted-foreground">{t('Peso kg')}</span><input type="number" min={0} step={0.5} value={editDraft.weightKg} onChange={event => setEditDraft(draft => draft ? { ...draft, weightKg: event.target.value } : draft)} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-lg text-foreground outline-none focus:ring-2 focus:ring-violet-400" /></label>
                  <label className="block space-y-2"><span className="text-sm font-semibold text-muted-foreground">{t('Repeticiones')}</span><input type="number" min={0} value={editDraft.reps} onChange={event => setEditDraft(draft => draft ? { ...draft, reps: event.target.value } : draft)} className="h-12 w-full rounded-xl border border-input bg-background px-3 text-lg text-foreground outline-none focus:ring-2 focus:ring-violet-400" /></label>
                </div>
              )}
              <div><p className="mb-2 text-sm font-semibold text-muted-foreground">RPE</p><RPESelector value={editDraft.rpe} onChange={rpe => setEditDraft(draft => draft ? { ...draft, rpe } : draft)} /></div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:space-x-0">
            <button type="button" onClick={() => setEditSetIndex(null)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground">{t('Cancelar')}</button>
            <button type="button" onClick={saveCorrection} className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-bold text-white">{t('Guardar corrección')}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  )
}
