'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import {
  ActiveTemplateWorkout,
  EMPTY_WORKOUT_STRUCTURAL_PENDING,
  type WorkoutStructuralPending,
} from './program-editor/ActiveTemplateWorkout'
import { moveItem, summarizeRoutine } from './program-editor/model'
import { ProgramTemplateActions } from './program-editor/ProgramTemplateActions'
import { ProgramTemplateSummary } from './program-editor/ProgramTemplateSummary'
import { TemplateDayTabs } from './program-editor/TemplateDayTabs'
import type { ProgramTemplateView, SaveState, TemplateWorkoutView } from './program-editor/types'

export type { ProgramTemplateView, TemplateExerciseView, TemplateWorkoutView } from './program-editor/types'

type Result = { ok: boolean; error?: string }
type DayMutationExpectation =
  | { kind: 'create-request' }
  | { kind: 'create'; workoutId: string }
  | { kind: 'reorder'; workoutIds: string[] }

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function ProgramTemplateEditor({
  template,
  workouts,
  options,
}: {
  template: ProgramTemplateView
  workouts: TemplateWorkoutView[]
  options: PlanExerciseOption[]
}) {
  const router = useRouter()
  const orderedWorkouts = useMemo(
    () => [...workouts].sort((left, right) => left.order_in_plan - right.order_in_plan),
    [workouts],
  )
  const [activeWorkoutId, setActiveWorkoutId] = useState(orderedWorkouts[0]?.id ?? '')
  const [templateSaveState, setTemplateSaveState] = useState<SaveState>('saved')
  const [addingWorkout, setAddingWorkout] = useState(false)
  const [dayMutation, setDayMutation] = useState<DayMutationExpectation | null>(null)
  const [workoutStructuralPending, setWorkoutStructuralPending] = useState<Record<string, WorkoutStructuralPending>>({})
  const [announcement, setAnnouncement] = useState('')
  const dayMutationPending = dayMutation !== null
  const canAddWorkout = orderedWorkouts.length < template.days_per_week

  useEffect(() => {
    if (!orderedWorkouts.some(workout => workout.id === activeWorkoutId)) {
      setActiveWorkoutId(orderedWorkouts[0]?.id ?? '')
    }
  }, [activeWorkoutId, orderedWorkouts])

  useEffect(() => {
    if (dayMutation?.kind === 'create' && orderedWorkouts.some(workout => workout.id === dayMutation.workoutId)) {
      setDayMutation(null)
    }
    if (dayMutation?.kind === 'reorder' && dayMutation.workoutIds.length === orderedWorkouts.length && dayMutation.workoutIds.every((id, index) => id === orderedWorkouts[index]?.id)) {
      setDayMutation(null)
    }
  }, [dayMutation, orderedWorkouts])

  const activeWorkout = orderedWorkouts.find(workout => workout.id === activeWorkoutId) ?? orderedWorkouts[0]
  const routineSummary = summarizeRoutine(orderedWorkouts)

  async function saveTemplate(formData: FormData): Promise<Result> {
    if (templateSaveState === 'saving') return { ok: false, error: 'El guardado ya está en curso.' }
    setTemplateSaveState('saving')
    try {
      const result = await (await import('@/app/actions/trainerPrograms')).updateTrainerProgram(formData)
      setTemplateSaveState(result.ok ? 'saved' : 'error')
      setAnnouncement(result.ok ? 'Rutina guardada.' : result.error ?? 'No se pudo guardar la rutina.')
      if (result.ok) router.refresh()
      return result
    } catch {
      setTemplateSaveState('error')
      setAnnouncement('No se pudo guardar la rutina.')
      return { ok: false, error: 'No se pudo guardar la rutina.' }
    }
  }

  async function addWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (dayMutationPending || !canAddWorkout) {
      setAnnouncement('La rutina ya tiene todos los días configurados.')
      return
    }
    const formData = new FormData(event.currentTarget)
    formData.set('templateId', template.id)
    formData.set('orderInPlan', String(Math.min(7, orderedWorkouts.length + 1)))
    setDayMutation({ kind: 'create-request' })
    try {
      const result = await (await import('@/app/actions/trainerPrograms')).createTrainerTemplateWorkout(formData)
      setAnnouncement(result.ok ? 'Entrenamiento agregado.' : result.error ?? 'No se pudo agregar el entrenamiento.')
      if (result.ok) {
        setDayMutation({ kind: 'create', workoutId: result.workoutId })
        setAddingWorkout(false)
        router.refresh()
      } else {
        setDayMutation(null)
      }
    } catch {
      setAnnouncement('No se pudo agregar el entrenamiento.')
      setDayMutation(null)
    }
  }

  async function moveWorkout(id: string, delta: number) {
    if (dayMutationPending) return
    const index = orderedWorkouts.findIndex(workout => workout.id === id)
    const moved = moveItem(orderedWorkouts, index, delta)
    if (moved.every((workout, current) => workout.id === orderedWorkouts[current]?.id)) return
    const formData = new FormData()
    formData.set('templateId', template.id)
    formData.set('workoutIds', moved.map(workout => workout.id).join(','))
    setDayMutation({ kind: 'reorder', workoutIds: moved.map(workout => workout.id) })
    try {
      const result = await (await import('@/app/actions/trainerPrograms')).reorderTrainerTemplateWorkouts(formData)
      setAnnouncement(result.ok ? 'Orden de días actualizado.' : result.error ?? 'No se pudo actualizar el orden.')
      if (result.ok) router.refresh()
      else setDayMutation(null)
    } catch {
      setAnnouncement('No se pudo actualizar el orden.')
      setDayMutation(null)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
        <strong>Plantilla editable.</strong> Las ediciones de esta plantilla no cambian asignaciones ya publicadas ni sus rutinas bloqueadas.
      </div>

      <ProgramTemplateSummary
        template={template}
        saveState={templateSaveState}
        onDirty={() => setTemplateSaveState(current => current === 'saving' ? current : 'dirty')}
        onSave={saveTemplate}
      />

      {orderedWorkouts.length ? (
        <>
          <TemplateDayTabs
            workouts={orderedWorkouts}
            activeWorkoutId={activeWorkout.id}
            pending={dayMutationPending}
            canAdd={canAddWorkout}
            onSelect={setActiveWorkoutId}
            onMove={(id, delta) => void moveWorkout(id, delta)}
            onAdd={() => { if (canAddWorkout) setAddingWorkout(true) }}
          />
          {activeWorkout ? (
            <ActiveTemplateWorkout
              key={activeWorkout.id}
              workout={activeWorkout}
              options={options}
              structuralPending={workoutStructuralPending[activeWorkout.id] ?? EMPTY_WORKOUT_STRUCTURAL_PENDING}
              onStructuralPendingChange={update => {
                setWorkoutStructuralPending(current => ({
                  ...current,
                  [activeWorkout.id]: update(current[activeWorkout.id] ?? EMPTY_WORKOUT_STRUCTURAL_PENDING),
                }))
              }}
              onChanged={() => undefined}
            />
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Comienza creando el primer día de esta rutina.</p>
          <button type="button" onClick={() => setAddingWorkout(true)} className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Agregar primer día</button>
        </div>
      )}

      {addingWorkout && canAddWorkout ? (
        <form aria-label="Agregar día" onSubmit={event => void addWorkout(event)} noValidate className="rounded-2xl border border-border/70 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-foreground">Agregar día</h2>
            <button type="button" onClick={() => setAddingWorkout(false)} className="min-h-11 rounded-xl border border-border px-3 text-sm">Cancelar</button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Nombre<input aria-label="Nombre del día" required name="name" maxLength={120} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3" /></label>
            <label className="text-sm">Día de la semana<select aria-label="Día de la semana" name="dayOfWeek" defaultValue={String(Math.min(7, orderedWorkouts.length + 1))} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3">{WEEKDAYS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label>
          </div>
          <button type="submit" disabled={dayMutationPending || !canAddWorkout} className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {dayMutationPending ? 'Agregando…' : 'Agregar día'}
          </button>
        </form>
      ) : null}

      <ProgramTemplateActions template={template} summary={routineSummary} />
      {announcement ? <p role="status" aria-live="polite" className="sr-only">{announcement}</p> : null}
    </section>
  )
}
