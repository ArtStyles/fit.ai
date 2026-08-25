'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { moveItem, summarizeWorkout } from './model'
import { SaveStateIndicator } from './SaveStateIndicator'
import { TemplateExerciseBatchPicker, type AppendedExercise } from './TemplateExerciseBatchPicker'
import { TemplateExerciseCard } from './TemplateExerciseCard'
import type { SaveState, TemplateWorkoutView } from './types'

type Result = { ok: boolean; error?: string }

export type WorkoutStructuralPending = {
  reorderExpectedIds: string[] | null
  deletePendingId: string | null
  dayDeletePending: boolean
  batchExpectedIds: string[] | null
}

export const EMPTY_WORKOUT_STRUCTURAL_PENDING: WorkoutStructuralPending = {
  reorderExpectedIds: null,
  deletePendingId: null,
  dayDeletePending: false,
  batchExpectedIds: null,
}

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

async function safeAction(loader: () => Promise<Result>, fallback: string): Promise<Result> {
  try { return await loader() } catch { return { ok: false, error: fallback } }
}

export function ActiveTemplateWorkout({
  workout,
  options,
  dayStructurePending,
  structuralPending,
  onStructuralPendingChange,
  onChanged,
}: {
  workout: TemplateWorkoutView
  options: PlanExerciseOption[]
  dayStructurePending: boolean
  structuralPending: WorkoutStructuralPending
  onStructuralPendingChange: (update: (current: WorkoutStructuralPending) => WorkoutStructuralPending) => void
  onChanged: () => void
}) {
  const router = useRouter()
  const summary = summarizeWorkout(workout)
  const [daySaveState, setDaySaveState] = useState<SaveState>('saved')
  const [announcement, setAnnouncement] = useState('')
  const exerciseIds = workout.exercises.map(exercise => exercise.id)
  const { reorderExpectedIds, deletePendingId, batchExpectedIds } = structuralPending
  const reorderPending = structuralPending.reorderExpectedIds !== null
  const batchPending = structuralPending.batchExpectedIds !== null
  const exerciseStructurePending = reorderPending || deletePendingId !== null || batchPending

  useEffect(() => {
    if (reorderExpectedIds && reorderExpectedIds.length === exerciseIds.length && reorderExpectedIds.every((id, index) => id === exerciseIds[index])) {
      onStructuralPendingChange(current => ({ ...current, reorderExpectedIds: null }))
    }
    if (deletePendingId && !exerciseIds.includes(deletePendingId)) {
      onStructuralPendingChange(current => ({ ...current, deletePendingId: null }))
    }
    if (batchExpectedIds && batchExpectedIds.every(id => exerciseIds.includes(id))) {
      onStructuralPendingChange(current => ({ ...current, batchExpectedIds: null }))
    }
  }, [batchExpectedIds, deletePendingId, exerciseIds, onStructuralPendingChange, reorderExpectedIds])

  async function updateDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (daySaveState === 'saving') return
    const formData = new FormData(event.currentTarget)
    setDaySaveState('saving')
    const result = await safeAction(
      async () => (await import('@/app/actions/trainerPrograms')).updateTrainerTemplateWorkout(formData),
      'No se pudo actualizar el entrenamiento.',
    )
    setDaySaveState(result.ok ? 'saved' : 'error')
    setAnnouncement(result.ok ? 'Entrenamiento actualizado.' : result.error ?? 'No se pudo actualizar el entrenamiento.')
    if (result.ok) {
      router.refresh()
      onChanged()
    }
  }

  async function reorderExercise(index: number, delta: number) {
    if (exerciseStructurePending) return
    const ordered = moveItem(workout.exercises, index, delta)
    if (ordered.every((exercise, current) => exercise.id === workout.exercises[current]?.id)) return
    const expectedIds = ordered.map(exercise => exercise.id)
    onStructuralPendingChange(current => ({ ...current, reorderExpectedIds: expectedIds }))
    const formData = new FormData()
    formData.set('templateWorkoutId', workout.id)
    formData.set('templateExerciseIds', ordered.map(exercise => exercise.id).join(','))
    const result = await safeAction(
      async () => (await import('@/app/actions/trainerPrograms')).reorderTrainerTemplateExercises(formData),
      'No se pudo actualizar el orden.',
    )
    setAnnouncement(result.ok ? 'Orden actualizado.' : result.error ?? 'No se pudo actualizar el orden.')
    if (result.ok) {
      router.refresh()
      onChanged()
    } else {
      onStructuralPendingChange(current => ({ ...current, reorderExpectedIds: null }))
    }
  }

  async function deleteExercise(id: string, name: string) {
    if (exerciseStructurePending || !window.confirm(`¿Eliminar ${name}?`)) return
    onStructuralPendingChange(current => ({ ...current, deletePendingId: id }))
    const formData = new FormData()
    formData.set('templateExerciseId', id)
    const result = await safeAction(
      async () => (await import('@/app/actions/trainerPrograms')).deleteTrainerTemplateExercise(formData),
      'No se pudo eliminar el ejercicio.',
    )
    setAnnouncement(result.ok ? 'Ejercicio eliminado.' : result.error ?? 'No se pudo eliminar el ejercicio.')
    if (result.ok) {
      router.refresh()
      onChanged()
    } else {
      onStructuralPendingChange(current => ({ ...current, deletePendingId: null }))
    }
  }

  async function saveExercise(formData: FormData): Promise<Result> {
    const result = await safeAction(
      async () => (await import('@/app/actions/trainerPrograms')).updateTrainerTemplateExercise(formData),
      'No se pudo guardar el ejercicio.',
    )
    setAnnouncement(result.ok ? 'Ejercicio actualizado.' : result.error ?? 'No se pudo guardar el ejercicio.')
    if (result.ok) {
      router.refresh()
      onChanged()
    }
    return result
  }

  async function deleteDay() {
    if (dayStructurePending || !window.confirm(`¿Eliminar ${workout.name}?`)) return
    onStructuralPendingChange(current => ({ ...current, dayDeletePending: true }))
    const formData = new FormData()
    formData.set('templateWorkoutId', workout.id)
    const result = await safeAction(
      async () => (await import('@/app/actions/trainerPrograms')).deleteTrainerTemplateWorkout(formData),
      'No se pudo eliminar el entrenamiento.',
    )
    setAnnouncement(result.ok ? 'Entrenamiento eliminado.' : result.error ?? 'No se pudo eliminar el entrenamiento.')
    if (result.ok) {
      router.refresh()
      onChanged()
    } else {
      onStructuralPendingChange(current => ({ ...current, dayDeletePending: false }))
    }
  }

  return (
    <section
      id={`template-day-panel-${workout.id}`}
      role="tabpanel"
      aria-labelledby={`template-day-tab-${workout.id}`}
      aria-label={workout.name}
      className="min-w-0 rounded-2xl border border-border/70 bg-muted/10 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{WEEKDAYS[workout.day_of_week - 1] ?? `Día ${workout.day_of_week}`}</p>
          <h2 className="text-lg font-bold text-foreground">{workout.name}</h2>
          <p className="text-sm text-muted-foreground">{summary.sets} series · {summary.estimatedMinutes} min estimados</p>
        </div>
        <button type="button" disabled={dayStructurePending} onClick={() => void deleteDay()} className="min-h-11 rounded-xl border border-destructive/40 px-3 text-sm font-semibold text-destructive disabled:opacity-50">Eliminar día</button>
      </div>

      <details className="mt-3 rounded-xl border border-border/60 p-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Editar día</summary>
        <form onSubmit={event => void updateDay(event)} onChangeCapture={() => setDaySaveState('dirty')} className="mt-2">
          <fieldset aria-label={`Editar día ${workout.name}`} disabled={daySaveState === 'saving'} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="templateWorkoutId" value={workout.id} />
            <label className="text-sm">Nombre<input name="name" required maxLength={120} defaultValue={workout.name} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3" /></label>
            <label className="text-sm">Día<select name="dayOfWeek" defaultValue={String(workout.day_of_week)} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3">{WEEKDAYS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Guardar día</button>
              <SaveStateIndicator state={daySaveState} />
            </div>
          </fieldset>
        </form>
      </details>

      {workout.exercises.length ? (
        <ol className="mt-4 space-y-3" aria-label={`Ejercicios de ${workout.name}`}>
          {workout.exercises.map((exercise, index) => (
            <TemplateExerciseCard
              key={exercise.id}
              exercise={exercise}
              index={index}
              count={workout.exercises.length}
              options={options}
              reorderPending={exerciseStructurePending}
              deletePending={exerciseStructurePending}
              onMove={delta => void reorderExercise(index, delta)}
              onDelete={() => void deleteExercise(exercise.id, exercise.exercise?.name ?? 'este ejercicio')}
              onSave={saveExercise}
            />
          ))}
        </ol>
      ) : <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Este día todavía no tiene ejercicios.</p>}

      <TemplateExerciseBatchPicker
        workoutId={workout.id}
        options={options}
        remainingCapacity={Math.max(0, 30 - workout.exercises.length)}
        pending={exerciseStructurePending}
        onAdded={(exercises: AppendedExercise[]) => {
          onStructuralPendingChange(current => ({ ...current, batchExpectedIds: exercises.map(exercise => exercise.id) }))
          setAnnouncement('Ejercicios agregados.')
          router.refresh()
          onChanged()
        }}
      />
      {announcement ? <p role="status" aria-live="polite" className="sr-only">{announcement}</p> : null}
    </section>
  )
}
