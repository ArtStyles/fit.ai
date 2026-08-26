'use client'

import { useState, type FormEvent } from 'react'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { SaveStateIndicator } from './SaveStateIndicator'
import type { SaveState, TemplateExerciseDraft, TemplateExerciseView } from './types'

type Result = { ok: boolean; error?: string }

export function TemplateExerciseCard({
  exercise,
  index,
  count,
  options,
  reorderPending,
  deletePending,
  draft,
  saveState,
  onDraftChange,
  onSaveStateChange,
  onMove,
  onDelete,
  onSave,
}: {
  exercise: TemplateExerciseView
  index: number
  count: number
  options: PlanExerciseOption[]
  reorderPending: boolean
  deletePending: boolean
  draft: TemplateExerciseDraft
  saveState: SaveState
  onDraftChange: (draft: TemplateExerciseDraft) => void
  onSaveStateChange: (state: SaveState) => void
  onMove: (delta: number) => void
  onDelete: () => void
  onSave: (formData: FormData) => Promise<Result>
}) {
  const name = exercise.exercise?.name ?? 'Ejercicio'
  const [editing, setEditing] = useState(saveState !== 'saved')

  function captureDraft(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget)
    const field = (name: string) => {
      const value = formData.get(name)
      return typeof value === 'string' ? value : ''
    }
    onDraftChange({
      exerciseId: field('exerciseId'),
      sets: field('sets'),
      reps: field('reps'),
      weightKg: field('weightKg'),
      targetRpe: field('targetRpe'),
      restSeconds: field('restSeconds'),
      notes: field('notes'),
    })
    if (saveState !== 'saving') onSaveStateChange('dirty')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveState === 'saving') return
    const formData = new FormData(event.currentTarget)
    onSaveStateChange('saving')
    const result = await onSave(formData)
    onSaveStateChange(result.ok ? 'saved' : 'error')
    if (result.ok) setEditing(false)
  }

  return (
    <li data-template-exercise-id={exercise.id} className="min-w-0 rounded-2xl border border-border/70 bg-background/60 p-3">
      <div className="grid min-w-0 gap-3 sm:flex sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{index + 1}. {name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[...(exercise.exercise?.muscle_groups ?? []), ...(exercise.exercise?.equipment ?? [])].slice(0, 3).join(' · ') || 'Prescripción del día'}
          </p>
        </div>
        <div className="grid min-w-0 grid-cols-4 gap-1 sm:flex sm:shrink-0">
          <button type="button" aria-label={`Subir ${name}`} disabled={reorderPending || index === 0} onClick={() => onMove(-1)} className="min-h-11 min-w-0 rounded-lg border border-border text-xs disabled:opacity-30 sm:min-w-11">↑</button>
          <button type="button" aria-label={`Bajar ${name}`} disabled={reorderPending || index === count - 1} onClick={() => onMove(1)} className="min-h-11 min-w-0 rounded-lg border border-border text-xs disabled:opacity-30 sm:min-w-11">↓</button>
          <button type="button" aria-label={`Editar ${name}`} onClick={() => setEditing(value => !value)} className="min-h-11 min-w-0 overflow-hidden rounded-lg border border-border px-1 text-[10px] sm:min-w-11 sm:px-2 sm:text-xs">Editar</button>
          <button type="button" aria-label={`Eliminar ${name}`} disabled={deletePending} onClick={onDelete} className="min-h-11 min-w-0 overflow-hidden rounded-lg border border-destructive/60 px-1 text-[10px] text-foreground disabled:opacity-50 sm:min-w-11 sm:px-2 sm:text-xs">Eliminar</button>
        </div>
      </div>

      <dl data-exercise-metrics className="mt-3 grid min-w-0 grid-cols-3 gap-2 text-center">
        <div className="min-w-0 rounded-lg bg-muted/40 px-1.5 py-2"><dt className="text-[10px] leading-tight text-muted-foreground sm:text-[11px]">Series × reps</dt><dd className="truncate text-sm font-semibold">{exercise.sets} × {exercise.reps}</dd></div>
        <div className="min-w-0 rounded-lg bg-muted/40 px-1.5 py-2"><dt className="text-[10px] leading-tight text-muted-foreground sm:text-[11px]">Intensidad</dt><dd className="truncate text-sm font-semibold">{exercise.target_rpe ? `RPE ${exercise.target_rpe}` : 'Libre'}</dd></div>
        <div className="min-w-0 rounded-lg bg-muted/40 px-1.5 py-2"><dt className="text-[10px] leading-tight text-muted-foreground sm:text-[11px]">Descanso</dt><dd className="truncate text-sm font-semibold">{exercise.rest_seconds} s</dd></div>
      </dl>

      {editing ? (
        <form onSubmit={event => void submit(event)} onInput={captureDraft} className="mt-3 rounded-xl border border-border/60 p-3">
          <fieldset aria-label={`Editar ejercicio ${name}`} disabled={saveState === 'saving'} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="templateExerciseId" value={exercise.id} />
            <label className="text-xs sm:col-span-2">Ejercicio<select name="exerciseId" value={draft.exerciseId} onChange={() => undefined} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2">{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
            <label className="text-xs">Series<input name="sets" type="number" min="1" max="20" value={draft.sets} onChange={() => undefined} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2" /></label>
            <label className="text-xs">Repeticiones<input name="reps" type="number" min="1" max="100" value={draft.reps} onChange={() => undefined} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2" /></label>
            <label className="text-xs">Peso (kg)<input name="weightKg" type="number" min="0" max="1000" step="0.25" value={draft.weightKg} onChange={() => undefined} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2" /></label>
            <label className="text-xs">RPE<input name="targetRpe" type="number" min="1" max="10" step="0.5" value={draft.targetRpe} onChange={() => undefined} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2" /></label>
            <label className="text-xs">Descanso (seg.)<input name="restSeconds" type="number" min="0" max="3600" value={draft.restSeconds} onChange={() => undefined} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-2" /></label>
            <label className="text-xs sm:col-span-3">Notas<textarea name="notes" maxLength={1000} value={draft.notes} onChange={() => undefined} rows={2} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-2 py-2" /></label>
            <div className="flex items-center gap-3 sm:col-span-4">
              <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Guardar ejercicio</button>
              <SaveStateIndicator state={saveState} />
            </div>
          </fieldset>
        </form>
      ) : null}
    </li>
  )
}
