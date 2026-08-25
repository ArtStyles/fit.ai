import { createRoot } from 'react-dom/client'
import { NewProgramTemplateForm } from '../../NewProgramTemplateForm'
import { ProgramTemplateEditor } from '../../ProgramTemplateEditor'

const showNewTemplateForm = new URLSearchParams(window.location.search).get('view') === 'new'

const options = [
  { id: '44444444-4444-4444-8444-444444444444', name: 'Sentadilla', muscle_groups: ['Piernas'], equipment: ['Barra'], difficulty: 'beginner', exercise_type: 'strength', is_compound: true },
  { id: '66666666-6666-4666-8666-666666666666', name: 'Prensa', muscle_groups: ['Piernas'], equipment: ['Máquina'], difficulty: 'beginner', exercise_type: 'strength', is_compound: true },
  { id: '77777777-7777-4777-8777-777777777777', name: 'Gemelos', muscle_groups: ['Pantorrillas'], equipment: ['Máquina'], difficulty: 'beginner', exercise_type: 'strength', is_compound: false },
]

const workouts = [
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

createRoot(document.getElementById('root')!).render(
  <main>
    {showNewTemplateForm
      ? <NewProgramTemplateForm />
      : <ProgramTemplateEditor
          template={{ id: '11111111-1111-4111-8111-111111111111', name: 'Fuerza', goal: null, description: null, days_per_week: 3, status: 'draft' }}
          workouts={workouts}
          options={options}
        />}
  </main>,
)

;(window as Window & { __PROGRAM_EDITOR_READY__?: boolean }).__PROGRAM_EDITOR_READY__ = true
