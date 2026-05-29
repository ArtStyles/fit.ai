import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { PlanRegenerateButton } from '@/components/plan/PlanRegenerateButton'
import {
  WorkoutExerciseList,
  type PlanExerciseOption,
  type PlanWorkoutExerciseRow,
} from '@/components/plan/WorkoutExerciseList'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import { updatePlanSummary, updateWorkoutSummary } from '@/app/actions/plan'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react'
import { getIsoWeekday } from '@/lib/workouts/schedule'

export const metadata = { title: 'Plan completo · FitAI' }

const DAY_NAMES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

type PlanRow = {
  id: string
  name: string
  description: string | null
  goal: string | null
  duration_weeks: number | null
  days_per_week: number | null
  difficulty: string | null
  created_at: string
}

type WorkoutRow = {
  id: string
  name: string
  focus: string | null
  day_of_week: number | null
  order_in_plan: number | null
  estimated_duration_minutes: number | null
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDifficulty(value: string | null): string | null {
  if (!value) return null
  return DIFFICULTY_LABELS[value] ?? value
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return 'Duración pendiente'
  return `${minutes} min`
}

export default async function PlanPage() {
  const { supabase, user } = await requireAppUserContext()

  const { data: planRaw } = await supabase
    .from('workout_plans')
    .select('id, name, description, goal, duration_weeks, days_per_week, difficulty, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as { data: PlanRow | null }

  if (!planRaw) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <main className="mx-auto max-w-lg">
          <PendingLink
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
            showSpinner={false}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </PendingLink>

          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Sparkles className="h-6 w-6 text-violet-400" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-foreground">No encontramos un plan activo</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Tu perfil ya está guardado. Reintenta la generación para crear tu estructura semanal.
            </p>
            <Button className="mt-5 h-11 w-full bg-violet-500 text-white hover:bg-violet-600" asChild>
              <PendingLink href="/plans/generate?autostart=1">
                Reintentar generación
                <ChevronRight className="ml-1 h-4 w-4" />
              </PendingLink>
            </Button>
          </section>
        </main>
      </div>
    )
  }

  const [workoutRowsResult, exerciseOptionsResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, name, focus, day_of_week, order_in_plan, estimated_duration_minutes')
      .eq('plan_id', planRaw.id)
      .order('order_in_plan') as unknown as Promise<{ data: WorkoutRow[] | null }>,
    supabase
      .from('exercises')
      .select('id, name, muscle_groups, equipment, difficulty, exercise_type, is_compound')
      .eq('is_public', true)
      .order('name') as unknown as Promise<{ data: PlanExerciseOption[] | null }>,
  ])

  const workouts = (workoutRowsResult.data ?? []).map(workout => ({
    ...workout,
    displayName: getWorkoutDisplayName(workout.name, workout.focus),
  }))
  const exerciseOptions = exerciseOptionsResult.data ?? []

  const workoutIds = workouts.map(workout => workout.id)
  let exerciseRows: PlanWorkoutExerciseRow[] = []

  if (workoutIds.length > 0) {
    const { data } = await supabase
      .from('workout_exercises')
      .select(`
        id,
        workout_id,
        order_index,
        sets,
        reps,
        rest_seconds,
        weight_kg,
        notes,
        target_rpe,
        weight_suggestion_basis,
        exercise:exercises(id, name, muscle_groups, equipment, difficulty, exercise_type, is_compound)
      `)
      .in('workout_id', workoutIds)
      .order('order_index') as unknown as { data: PlanWorkoutExerciseRow[] | null }

    exerciseRows = data ?? []
  }

  const exercisesByWorkout = exerciseRows.reduce<Record<string, PlanWorkoutExerciseRow[]>>((acc, row) => {
    acc[row.workout_id] = acc[row.workout_id] ?? []
    acc[row.workout_id].push(row)
    return acc
  }, {})
  const todayIso = getIsoWeekday()
  const hasTodayWorkout = workouts.some(workout => workout.day_of_week === todayIso)

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-lg px-4 py-8">
        <PendingLink
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </PendingLink>

        <header className="animate-in fade-in slide-in-from-bottom-3 mt-6 duration-500">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
            Plan completo
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-foreground">
            {planRaw.name}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {planRaw.description || 'Estructura semanal, entrenamientos y ejercicios del plan activo.'}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {planRaw.goal && (
              <Badge variant="ghost" className="border border-violet-500/20 text-violet-100">
                <Target className="mr-1 h-3 w-3 text-violet-300" />
                {planRaw.goal}
              </Badge>
            )}
            {formatDifficulty(planRaw.difficulty) && (
              <Badge variant="ghost" className="border border-border/50">
                <Dumbbell className="mr-1 h-3 w-3 text-muted-foreground" />
                {formatDifficulty(planRaw.difficulty)}
              </Badge>
            )}
            <Badge variant="ghost" className="border border-border/50">
              <CalendarDays className="mr-1 h-3 w-3 text-muted-foreground" />
              {planRaw.days_per_week ?? workouts.length} días/sem
            </Badge>
            {planRaw.duration_weeks && (
              <Badge variant="ghost" className="border border-border/50">
                {planRaw.duration_weeks} semanas
              </Badge>
            )}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Creado el {formatDate(planRaw.created_at)}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <PlanRegenerateButton />
            <Button
              asChild
              variant="outline"
              className="h-10 border-border/60 bg-muted/10 text-sm text-foreground hover:bg-muted/20"
            >
              <PendingLink href="/history">
                <History className="mr-2 h-4 w-4" />
                Historial
              </PendingLink>
            </Button>
          </div>
        </header>

        <section
          className="animate-in fade-in slide-in-from-bottom-3 mt-6 rounded-2xl border border-border/60 bg-muted/10 p-5 duration-500"
          style={{ animationDelay: '90ms' }}
        >
          <p className="text-sm font-semibold text-foreground">Editar resumen</p>
          <form action={updatePlanSummary} className="mt-4 space-y-3">
            <input type="hidden" name="planId" value={planRaw.id} />

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Nombre del plan</span>
              <input
                name="name"
                defaultValue={planRaw.name}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Objetivo visible</span>
              <input
                name="goal"
                defaultValue={planRaw.goal ?? ''}
                placeholder="Ej. Hipertrofia, fuerza, recomposición"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Descripción</span>
              <textarea
                name="description"
                defaultValue={planRaw.description ?? ''}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <SubmitButton
              label="Guardar resumen"
              pendingLabel="Guardando resumen"
              className="h-10 w-full bg-violet-500 text-white hover:bg-violet-600"
            />
          </form>
        </section>

        <div className="mt-8 space-y-4">
          {workouts.map((workout, index) => {
            const exercises = exercisesByWorkout[workout.id] ?? []
            const isToday = workout.day_of_week === todayIso
            const dayLabel = workout.day_of_week ? DAY_NAMES[workout.day_of_week] : `Sesión ${index + 1}`
            const defaultOpen = isToday || (!hasTodayWorkout && index === 0)

            return (
              <details
                key={workout.id}
                open={defaultOpen}
                className="group animate-in fade-in slide-in-from-bottom-3 rounded-2xl border border-border/60 bg-muted/10 duration-500 open:bg-muted/15"
                style={{ animationDelay: `${Math.min(index * 70 + 140, 420)}ms` }}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-5 outline-none transition-colors hover:bg-muted/10 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {dayLabel}
                      </p>
                      {isToday && (
                        <Badge variant="ghost" className="border border-violet-500/30 bg-violet-500/10 px-2 py-0 text-[11px] text-violet-100">
                          Hoy
                        </Badge>
                      )}
                    </div>
                    <h2 className="mt-1 truncate text-base font-semibold leading-snug text-foreground">
                      {workout.displayName}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {workout.focus && <span className="truncate">{workout.focus}</span>}
                      <span className="inline-flex items-center">
                        <Dumbbell className="mr-1 h-3.5 w-3.5" />
                        {exercises.length}
                      </span>
                      <span className="inline-flex items-center">
                        <Timer className="mr-1 h-3.5 w-3.5" />
                        {formatDuration(workout.estimated_duration_minutes)}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>

                <div className="border-t border-border/50 p-5">
                  <div className="flex items-center justify-between gap-3">
                    {isToday ? (
                      <PendingLink
                        href={`/session/${workout.id}`}
                        className="inline-flex h-9 shrink-0 items-center rounded-md border border-violet-500/30 px-3 text-xs font-semibold text-violet-300 hover:bg-violet-500/10"
                        spinnerClassName="h-3 w-3"
                      >
                        Abrir rutina de hoy
                      </PendingLink>
                    ) : (
                      <p className="text-xs font-medium text-muted-foreground">
                        Disponible el {dayLabel.toLowerCase()}.
                      </p>
                    )}
                  </div>

                  <WorkoutExerciseList
                    planId={planRaw.id}
                    workoutId={workout.id}
                    exercises={exercises}
                    exerciseOptions={exerciseOptions}
                  />

                  <details className="mt-4 rounded-xl border border-border/50 bg-background/40 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-violet-300">
                      Editar entrenamiento
                    </summary>
                    <form action={updateWorkoutSummary} className="mt-4 space-y-3">
                      <input type="hidden" name="planId" value={planRaw.id} />
                      <input type="hidden" name="workoutId" value={workout.id} />

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Nombre</span>
                        <input
                          name="name"
                          defaultValue={workout.displayName}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Foco muscular</span>
                        <input
                          name="focus"
                          defaultValue={workout.focus ?? ''}
                          placeholder="Pecho · Hombros · Tríceps"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Duración estimada</span>
                        <input
                          name="estimatedDurationMinutes"
                          type="number"
                          min={10}
                          max={180}
                          defaultValue={workout.estimated_duration_minutes ?? ''}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <SubmitButton
                        label="Guardar entrenamiento"
                        pendingLabel="Guardando entrenamiento"
                        className="h-10 w-full bg-violet-500 text-white hover:bg-violet-600"
                      />
                    </form>
                  </details>
                </div>
              </details>
            )
          })}
        </div>
      </main>
    </div>
  )
}
