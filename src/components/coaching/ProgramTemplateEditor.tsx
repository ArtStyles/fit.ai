'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import {
  ActiveTemplateWorkout,
  EMPTY_WORKOUT_STRUCTURAL_PENDING,
  type WorkoutStructuralPending,
} from './program-editor/ActiveTemplateWorkout'
import { moveItem, summarizeRoutine, templateExerciseDraftMatches } from './program-editor/model'
import { ProgramTemplateActions } from './program-editor/ProgramTemplateActions'
import { ProgramTemplateSummary } from './program-editor/ProgramTemplateSummary'
import { TemplateDayTabs } from './program-editor/TemplateDayTabs'
import type { ProgramTemplateView, SaveState, TemplateExerciseDraft, TemplateWorkoutView } from './program-editor/types'

export type { ProgramTemplateView, TemplateExerciseView, TemplateWorkoutView } from './program-editor/types'

type Result = { ok: boolean; error?: string }
type DayMutationExpectation =
  | { kind: 'create-request' }
  | { kind: 'create'; workoutId: string }
  | { kind: 'reorder'; workoutIds: string[] }

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const PENDING_DESCRIPTION_MESSAGE = 'Guarda los cambios pendientes antes de asignar o publicar.'

export function ProgramTemplateEditor({
  template,
  workouts,
  options,
  relationships = [],
  assignments = [],
}: {
  template: ProgramTemplateView
  workouts: TemplateWorkoutView[]
  options: PlanExerciseOption[]
  relationships?: Array<{ id: string; label: string }>
  assignments?: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
  const orderedWorkouts = useMemo(
    () => [...workouts].sort((left, right) => left.order_in_plan - right.order_in_plan),
    [workouts],
  )
  const templateExercises = useMemo(() => orderedWorkouts.flatMap(workout => workout.exercises), [orderedWorkouts])
  const [activeWorkoutId, setActiveWorkoutId] = useState(orderedWorkouts[0]?.id ?? '')
  const [templateSaveState, setTemplateSaveState] = useState<SaveState>('saved')
  const [workoutSaveStates, setWorkoutSaveStates] = useState<Record<string, SaveState>>({})
  const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, TemplateExerciseDraft>>({})
  const [exerciseSaveStates, setExerciseSaveStates] = useState<Record<string, SaveState>>({})
  const [addingWorkout, setAddingWorkout] = useState(false)
  const [dayMutation, setDayMutation] = useState<DayMutationExpectation | null>(null)
  const [workoutStructuralPending, setWorkoutStructuralPending] = useState<Record<string, WorkoutStructuralPending>>({})
  const [announcement, setAnnouncement] = useState('')
  const dayMutationPending = dayMutation !== null
  const dayDeletePending = Object.values(workoutStructuralPending).some(pending => pending.dayDeletePending)
  const dayStructurePending = dayMutationPending || dayDeletePending
  const canAddWorkout = orderedWorkouts.length < template.days_per_week
  const guardedSaveStates = [templateSaveState, ...Object.values(workoutSaveStates), ...Object.values(exerciseSaveStates)]
  const hasPendingDescriptions = guardedSaveStates.some(state => state !== 'saved')
  const hasUnloadPendingDescriptions = guardedSaveStates.some(state => state === 'dirty' || state === 'error')

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

  useEffect(() => {
    const workoutIds = new Set(orderedWorkouts.map(workout => workout.id))
    setWorkoutStructuralPending(current => {
      const removedIds = Object.entries(current)
        .filter(([id, pending]) => pending.dayDeletePending && !workoutIds.has(id))
        .map(([id]) => id)
      if (!removedIds.length) return current
      const next = { ...current }
      removedIds.forEach(id => { delete next[id] })
      return next
    })
    setWorkoutSaveStates(current => {
      const removedIds = Object.keys(current).filter(id => !workoutIds.has(id))
      if (!removedIds.length) return current
      const next = { ...current }
      removedIds.forEach(id => { delete next[id] })
      return next
    })
  }, [orderedWorkouts])

  useEffect(() => {
    const exercisesById = new Map(templateExercises.map(exercise => [exercise.id, exercise]))
    setExerciseDrafts(current => {
      const removedIds = Object.entries(current)
        .filter(([id, draft]) => {
          const exercise = exercisesById.get(id)
          return !exercise || (exerciseSaveStates[id] === 'saved' && templateExerciseDraftMatches(exercise, draft))
        })
        .map(([id]) => id)
      if (!removedIds.length) return current
      const next = { ...current }
      removedIds.forEach(id => { delete next[id] })
      return next
    })
    setExerciseSaveStates(current => {
      const removedIds = Object.entries(current)
        .filter(([id, state]) => {
          const exercise = exercisesById.get(id)
          const draft = exerciseDrafts[id]
          return !exercise || (state === 'saved' && draft && templateExerciseDraftMatches(exercise, draft))
        })
        .map(([id]) => id)
      if (!removedIds.length) return current
      const next = { ...current }
      removedIds.forEach(id => { delete next[id] })
      return next
    })
  }, [exerciseDrafts, exerciseSaveStates, templateExercises])

  useEffect(() => {
    if (!hasUnloadPendingDescriptions) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [hasUnloadPendingDescriptions])

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
    if (dayStructurePending || !canAddWorkout) {
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
    if (dayStructurePending) return
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

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-4">
      {orderedWorkouts.length ? (
        <>
          <TemplateDayTabs
            workouts={orderedWorkouts}
            activeWorkoutId={activeWorkout.id}
            pending={dayStructurePending}
            canAdd={canAddWorkout}
            onSelect={setActiveWorkoutId}
            onMove={(id, delta) => void moveWorkout(id, delta)}
            onAdd={() => { if (canAddWorkout && !dayStructurePending) setAddingWorkout(true) }}
          />
          {activeWorkout ? (
            <ActiveTemplateWorkout
              key={activeWorkout.id}
              workout={activeWorkout}
              options={options}
              dayStructurePending={dayStructurePending}
              structuralPending={workoutStructuralPending[activeWorkout.id] ?? EMPTY_WORKOUT_STRUCTURAL_PENDING}
              saveState={workoutSaveStates[activeWorkout.id] ?? 'saved'}
              onSaveStateChange={state => {
                setWorkoutSaveStates(current => ({ ...current, [activeWorkout.id]: state }))
              }}
              exerciseDrafts={exerciseDrafts}
              exerciseSaveStates={exerciseSaveStates}
              onExerciseDraftChange={(exerciseId, draft) => {
                setExerciseDrafts(current => ({ ...current, [exerciseId]: draft }))
              }}
              onExerciseSaveStateChange={(exerciseId, state) => {
                setExerciseSaveStates(current => ({ ...current, [exerciseId]: state }))
              }}
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
          <button type="submit" disabled={dayStructurePending || !canAddWorkout} className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {dayMutationPending ? 'Agregando…' : 'Agregar día'}
          </button>
        </form>
      ) : null}
        </div>
        <ProgramTemplateActions
          template={template}
          summary={routineSummary}
          relationships={relationships}
          assignments={assignments}
          blocked={hasPendingDescriptions}
          blockedMessage={PENDING_DESCRIPTION_MESSAGE}
        />
      </div>
      {announcement ? <p role="status" aria-live="polite" className="sr-only">{announcement}</p> : null}
    </section>
  )
}
