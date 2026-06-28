import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { PlanRegenerateButton } from '@/components/plan/PlanRegenerateButton'
import { WorkoutAdjustButton } from '@/components/plan/WorkoutAdjustButton'
import { ShareRoutineButton } from '@/components/social/ShareRoutineButton'
import {
  WorkoutExerciseList,
  type PlanExerciseOption,
  type PlanWorkoutExerciseRow,
} from '@/components/plan/WorkoutExerciseList'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import {
  activatePlan,
  createManualPlan,
  deletePlan,
  updatePlanSummary,
  updateWorkoutSummary,
} from '@/app/actions/plan'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  Plus,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react'
import { getIsoWeekday, resolveUserTimeZone } from '@/lib/workouts/schedule'

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
  source_type: 'ai' | 'manual' | 'imported' | 'shared_post'
  created_at: string
}

type PlanListRow = Pick<PlanRow, 'id' | 'name' | 'goal' | 'days_per_week' | 'difficulty' | 'source_type' | 'created_at'> & {
  is_active: boolean
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

function formatSource(value: PlanRow['source_type']): string {
  if (value === 'manual') return 'Manual'
  if (value === 'shared_post') return 'Copiado'
  if (value === 'imported') return 'Importado'
  return 'IA'
}

function PlanLibrary({ plans, tier }: { plans: PlanListRow[]; tier: 'free' | 'pro' }) {
  const canCreate = tier === 'pro' || plans.length === 0

  return (
    <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 rounded-2xl border border-border/60 bg-muted/10 p-5 duration-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Mis planes</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Cambia el plan activo sin perder tu racha ni tu historial.
          </p>
        </div>
        <Badge variant="ghost" className="border border-border/50 uppercase">{tier}</Badge>
      </div>

      {plans.length > 0 && (
        <div className="mt-4 space-y-2">
          {plans.map(plan => (
            <div key={plan.id} className={`rounded-xl border px-3 py-3 ${plan.is_active ? 'border-violet-500/40 bg-violet-500/10' : 'border-border/50 bg-background/40'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{plan.name}</p>
                    {plan.is_active && (
                      <Badge variant="ghost" className="border border-violet-500/30 px-2 py-0 text-[11px] text-violet-100">
                        Activo
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatSource(plan.source_type)}
                    {plan.days_per_week ? ` · ${plan.days_per_week} dias/sem` : ''}
                    {plan.difficulty ? ` · ${formatDifficulty(plan.difficulty)}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!plan.is_active && (
                    <form action={activatePlan}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <button className="h-9 rounded-lg bg-violet-500 px-3 text-xs font-semibold text-white hover:bg-violet-600">
                        Activar
                      </button>
                    </form>
                  )}
                  <form action={deletePlan}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <button className="h-9 rounded-lg border border-border/60 px-3 text-xs font-medium text-muted-foreground hover:text-foreground">
                      Borrar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button asChild className="h-11 bg-violet-500 text-white hover:bg-violet-600">
          <PendingLink href={canCreate ? '/plans/generate' : '/plan?error=plan_limit'}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generar
          </PendingLink>
        </Button>
        <details>
          <summary className={`flex h-11 cursor-pointer list-none items-center justify-center rounded-md border text-sm font-semibold [&::-webkit-details-marker]:hidden ${canCreate ? 'border-border/60 bg-muted/10 text-foreground hover:bg-muted/20' : 'border-border/40 bg-muted/5 text-muted-foreground'}`}>
            <Plus className="mr-2 h-4 w-4" />
            Manual
          </summary>
          {canCreate ? (
            <form action={createManualPlan} className="mt-3 space-y-3 rounded-xl border border-border/50 bg-background/40 p-3">
              <input name="name" required placeholder="Nombre del plan" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
              <input name="goal" placeholder="Objetivo visible" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
              <div className="grid grid-cols-2 gap-2">
                <select name="daysPerWeek" defaultValue="3" className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                  {[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{day} dias</option>)}
                </select>
                <select name="difficulty" defaultValue="" className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="">Nivel</option>
                  <option value="beginner">Principiante</option>
                  <option value="intermediate">Intermedio</option>
                  <option value="advanced">Avanzado</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input name="makeActive" type="checkbox" defaultChecked className="h-4 w-4 accent-violet-500" />
                Activarlo ahora
              </label>
              <button className="h-10 w-full rounded-md bg-violet-500 text-sm font-semibold text-white hover:bg-violet-600">
                Crear plan manual
              </button>
            </form>
          ) : (
            <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Tu cuenta free solo permite guardar un plan.
            </p>
          )}
        </details>
      </div>
    </section>
  )
}

export default async function PlanPage() {
  const { supabase, user, profile } = await requireAppUserContext()

  const [{ data: planRaw }, { data: planRows }] = await Promise.all([
    supabase
    .from('workout_plans')
      .select('id, name, description, goal, duration_weeks, days_per_week, difficulty, source_type, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
      .maybeSingle() as unknown as Promise<{ data: PlanRow | null }>,
    supabase
      .from('workout_plans')
      .select('id, name, goal, days_per_week, difficulty, source_type, created_at, is_active')
      .eq('user_id', user.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: PlanListRow[] | null }>,
  ])

  const plans = planRows ?? []
  const tier = profile.subscription_tier ?? 'free'

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

          <PlanLibrary plans={plans} tier={tier} />

          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Sparkles className="h-6 w-6 text-violet-400" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-foreground">No encontramos un plan activo</h1>
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
  const todayIso = getIsoWeekday(new Date(), resolveUserTimeZone(profile.timezone))
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
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight text-foreground">
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
              className="h-11 border-border/60 bg-muted/10 text-sm text-foreground hover:bg-muted/20"
            >
              <PendingLink href="/history">
                <History className="mr-2 h-4 w-4" />
                Historial
              </PendingLink>
            </Button>
          </div>

          <div className="mt-2">
            <ShareRoutineButton planId={planRaw.id} />
          </div>
        </header>

        <PlanLibrary plans={plans} tier={tier} />

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
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Objetivo visible</span>
              <input
                name="goal"
                defaultValue={planRaw.goal ?? ''}
                placeholder="Ej. Hipertrofia, fuerza, recomposición"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
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
              className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
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
                className={`group animate-in fade-in slide-in-from-bottom-3 rounded-2xl border duration-500 ${
                  isToday
                    ? 'border-violet-500/50 bg-violet-500/[0.06] shadow-[0_0_0_1px_rgba(139,92,246,0.2)] open:bg-violet-500/[0.08]'
                    : 'border-border/60 bg-muted/10 open:bg-muted/15'
                }`}
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
                    <h2 className="mt-1 truncate font-display text-lg font-semibold leading-snug text-foreground">
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
                  <div className="flex flex-wrap items-center gap-2">
                    {isToday ? (
                      <PendingLink
                        href={`/session/${workout.id}`}
                        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-900/30 hover:bg-violet-600"
                        spinnerClassName="h-3.5 w-3.5"
                      >
                        Abrir rutina de hoy
                        <ChevronRight className="h-4 w-4" />
                      </PendingLink>
                    ) : (
                      <p className="text-xs font-medium text-muted-foreground">
                        Disponible el {dayLabel.toLowerCase()}.
                      </p>
                    )}
                    <WorkoutAdjustButton
                      workoutId={workout.id}
                      workoutName={workout.displayName}
                    />
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
                          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Foco muscular</span>
                        <input
                          name="focus"
                          defaultValue={workout.focus ?? ''}
                          placeholder="Pecho · Hombros · Tríceps"
                          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
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
                          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <SubmitButton
                        label="Guardar entrenamiento"
                        pendingLabel="Guardando entrenamiento"
                        className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
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
