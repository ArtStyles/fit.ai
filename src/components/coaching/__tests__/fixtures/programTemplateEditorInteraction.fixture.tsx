import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { NewProgramTemplateForm } from '../../NewProgramTemplateForm'
import { ProgramTemplateEditor } from '../../ProgramTemplateEditor'
import type { TemplateWorkoutView } from '../../program-editor/types'
import { PendingLink } from '@/components/navigation/PendingLink'

type RecordedFields = Record<string, string | string[]>
type AppendedExercise = { id: string; exerciseId: string; orderIndex: number }
type PersistedExerciseUpdate = {
  exerciseId: string
  sets: number
  reps: number
  weightKg: number | null
  targetRpe: number | null
  restSeconds: number
  notes: string | null
}
type ServerEvent =
  | { type: 'create-workout'; workoutId: string; fields: RecordedFields }
  | { type: 'delete-workout'; workoutId: string }
  | { type: 'reorder-workouts'; workoutIds: string[] }
  | { type: 'add-exercises'; workoutId: string; exercises: AppendedExercise[] }
  | { type: 'delete-exercise'; exerciseId: string }
  | { type: 'reorder-exercises'; workoutId: string; exerciseIds: string[] }
  | { type: 'update-exercise'; exerciseId: string; update: PersistedExerciseUpdate }

const query = new URLSearchParams(window.location.search)
const showNewTemplateForm = query.get('view') === 'new'

;(window as Window & { __NEXT_LINK_NAVIGATE__?: (href: string) => void; __PROGRAM_NAVIGATIONS__?: string[] }).__NEXT_LINK_NAVIGATE__ = href => {
  const state = window as Window & { __PROGRAM_NAVIGATIONS__?: string[] }
  state.__PROGRAM_NAVIGATIONS__ ??= []
  state.__PROGRAM_NAVIGATIONS__.push(href)
}

const options = [
  { id: '44444444-4444-4444-8444-444444444444', name: 'Sentadilla', muscle_groups: ['Piernas'], equipment: ['Barra'], difficulty: 'beginner', exercise_type: 'strength', is_compound: true },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Prensa', muscle_groups: ['Piernas'], equipment: ['Máquina'], difficulty: 'beginner', exercise_type: 'strength', is_compound: true },
  { id: '77777777-7777-4777-8777-777777777777', name: 'Gemelos', muscle_groups: ['Pantorrillas'], equipment: ['Máquina'], difficulty: 'beginner', exercise_type: 'strength', is_compound: false },
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `88000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `Auxiliar ${String(index + 1).padStart(2, '0')}`,
    muscle_groups: ['General'],
    equipment: ['Libre'],
    difficulty: 'beginner',
    exercise_type: 'strength',
    is_compound: false,
  })),
]

const initialWorkouts: TemplateWorkoutView[] = [
  {
    id: '22222222-2222-4222-8222-222222222222', name: 'Día A', day_of_week: 1, order_in_plan: 1,
    exercises: [
      { id: '33333333-3333-4333-8333-333333333333', exercise_id: options[0].id, order_index: 1, sets: 3, reps: 10, weight_kg: null, target_rpe: 7, rest_seconds: 60, notes: null, exercise: options[0] },
      { id: '55555555-5555-4555-8555-555555555555', exercise_id: options[0].id, order_index: 2, sets: 3, reps: 8, weight_kg: null, target_rpe: 8, rest_seconds: 90, notes: null, exercise: { ...options[0], name: 'Peso muerto' } },
    ],
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Día B', day_of_week: 4, order_in_plan: 2,
    exercises: [
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', exercise_id: options[1].id, order_index: 1, sets: 4, reps: 12, weight_kg: null, target_rpe: 7, rest_seconds: 60, notes: null, exercise: options[1] },
    ],
  },
]

function field(fields: RecordedFields, name: string) {
  const value = fields[name]
  return typeof value === 'string' ? value : ''
}

function applyEvent(workouts: TemplateWorkoutView[], event: ServerEvent): TemplateWorkoutView[] {
  if (event.type === 'create-workout') {
    return [...workouts, {
      id: event.workoutId,
      name: field(event.fields, 'name'),
      day_of_week: Number(field(event.fields, 'dayOfWeek')),
      order_in_plan: Number(field(event.fields, 'orderInPlan')),
      exercises: [],
    }]
  }
  if (event.type === 'delete-workout') return workouts.filter(workout => workout.id !== event.workoutId)
  if (event.type === 'reorder-workouts') {
    const byId = new Map(workouts.map(workout => [workout.id, workout]))
    return event.workoutIds.flatMap((id, index) => {
      const workout = byId.get(id)
      return workout ? [{ ...workout, order_in_plan: index + 1 }] : []
    })
  }
  if (event.type === 'delete-exercise') {
    return workouts.map(workout => ({ ...workout, exercises: workout.exercises.filter(exercise => exercise.id !== event.exerciseId) }))
  }
  if (event.type === 'reorder-exercises') {
    return workouts.map(workout => {
      if (workout.id !== event.workoutId) return workout
      const byId = new Map(workout.exercises.map(exercise => [exercise.id, exercise]))
      return {
        ...workout,
        exercises: event.exerciseIds.flatMap((id, index) => {
          const exercise = byId.get(id)
          return exercise ? [{ ...exercise, order_index: index + 1 }] : []
        }),
      }
    })
  }
  if (event.type === 'update-exercise') {
    return workouts.map(workout => ({
      ...workout,
      exercises: workout.exercises.map(exercise => exercise.id !== event.exerciseId ? exercise : {
        ...exercise,
        exercise_id: event.update.exerciseId,
        sets: event.update.sets,
        reps: event.update.reps,
        weight_kg: event.update.weightKg,
        target_rpe: event.update.targetRpe,
        rest_seconds: event.update.restSeconds,
        notes: event.update.notes,
      }),
    }))
  }
  return workouts.map(workout => workout.id !== event.workoutId ? workout : {
    ...workout,
    exercises: [...workout.exercises, ...event.exercises.map(item => {
      const option = options.find(candidate => candidate.id === item.exerciseId)
      return {
        id: item.id,
        exercise_id: item.exerciseId,
        order_index: item.orderIndex,
        sets: 3,
        reps: 10,
        weight_kg: null,
        target_rpe: 7,
        rest_seconds: 60,
        notes: null,
        exercise: option ? { name: option.name, muscle_groups: option.muscle_groups, equipment: option.equipment } : null,
      }
    })],
  })
}

function EditorFixture() {
  const [workouts, setWorkouts] = useState(initialWorkouts)
  const appliedEvents = useRef(0)

  useEffect(() => {
    const state = window as Window & {
      __PROGRAM_SERVER_EVENTS__?: ServerEvent[]
      __PROGRAM_APPLY_SERVER_STATE__?: () => void
    }
    state.__PROGRAM_APPLY_SERVER_STATE__ = () => {
      const events = (state.__PROGRAM_SERVER_EVENTS__ ?? []).slice(appliedEvents.current)
      appliedEvents.current += events.length
      setWorkouts(current => events.reduce(applyEvent, current))
    }
    return () => { delete state.__PROGRAM_APPLY_SERVER_STATE__ }
  }, [])

  return <ProgramTemplateEditor
    template={{ id: '11111111-1111-4111-8111-111111111111', name: 'Fuerza', goal: null, description: null, days_per_week: 3, status: 'draft' }}
    workouts={workouts}
    options={options}
    relationships={[
      { id: 'relationship-a', label: 'Entrenamiento personal · iniciado 24 ago 2026 · ref. relationship-a' },
      { id: 'relationship-b', label: 'Entrenamiento personal · iniciado 10 ago 2026 · ref. relationship-b' },
    ]}
    assignments={[
      { id: 'assignment-a', label: 'Entrenamiento personal · asignación assignment-a' },
      { id: 'assignment-b', label: 'Entrenamiento personal · asignación assignment-b' },
    ]}
  />
}

createRoot(document.getElementById('root')!).render(
  <main>
    {!showNewTemplateForm ? <PendingLink href="/coach/programs">Rutinas</PendingLink> : null}
    {showNewTemplateForm ? <NewProgramTemplateForm clientId={query.get('clientId') ?? undefined} /> : <EditorFixture />}
  </main>,
)

;(window as Window & { __PROGRAM_EDITOR_READY__?: boolean }).__PROGRAM_EDITOR_READY__ = true
