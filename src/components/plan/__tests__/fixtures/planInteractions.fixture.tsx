import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { ExerciseCatalogDialog } from '../../ExercisePicker'
import { PlanWorkoutWorkspace } from '../../PlanWorkoutWorkspace'

const longName = `1. ${'NombreDeEjercicioExtremadamenteLargo'.repeat(8)}`
const initialCatalogOptions = Array.from({ length: 24 }, (_, index) => ({
  id: `exercise-${String(index + 1).padStart(2, '0')}`,
  name: `Ejercicio ${String(index + 1).padStart(2, '0')}`,
  muscleGroups: [index % 2 === 0 ? 'Pecho' : 'Espalda'],
  equipment: [index % 2 === 0 ? 'Barra' : 'Mancuernas'],
  imageUrl: null,
}))

function WorkspaceFixture() {
  const summary = {
    id: 'workout-1',
    name: 'Día A',
    focus: 'Fuerza',
    dayOfWeek: 1,
    orderInPlan: 1,
    durationMinutes: 45,
    exerciseCount: 1,
    isScheduled: true,
  }
  const exercise = {
    id: 'exercise-long',
    name: longName,
    image_url: null,
    muscle_groups: ['Pecho'],
    equipment: ['Barra'],
    difficulty: 'intermediate',
    exercise_type: 'strength',
    is_compound: true,
  }

  return <PlanWorkoutWorkspace
    planId="plan-1"
    entries={[{
      key: 'day-1', isoDay: 1, kind: 'workout', isToday: false, workouts: [summary],
    }]}
    workouts={[{
      summary,
      exercises: [{
        id: 'row-1', workout_id: 'workout-1', order_index: 1,
        sets: 3, reps: 10, rest_seconds: 60, weight_kg: null, notes: null,
        target_rpe: 8, weight_suggestion_basis: null, exercise,
      }],
    }]}
    exerciseOptions={[exercise]}
    todayIso={2}
  />
}

function CatalogFixture() {
  return <ExerciseCatalogDialog
    open
    onOpenChange={() => {}}
    options={initialCatalogOptions}
    selectionMode="multiple"
    paginated
    onConfirm={ids => {
      (window as Window & { __CATALOG_SELECTION__?: string[] }).__CATALOG_SELECTION__ = ids
    }}
  />
}

const surface = new URLSearchParams(window.location.search).get('surface')

createRoot(document.getElementById('root')!).render(
  <I18nProvider language="es">
    <ToastProvider>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {surface === 'catalog' ? <CatalogFixture /> : <WorkspaceFixture />}
      </main>
    </ToastProvider>
  </I18nProvider>,
)

requestAnimationFrame(() => {
  (window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__ = true
})
