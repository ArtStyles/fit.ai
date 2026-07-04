import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PlanRegenerateButton } from '@/components/plan/PlanRegenerateButton'
import { PlanViewTabs } from '@/components/plan/PlanViewTabs'
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
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  History,
  MoreHorizontal,
  Plus,
  Sparkles,
  Target,
  Timer,
  Trash2,
} from 'lucide-react'
import { getIsoWeekday, resolveUserTimeZone } from '@/lib/workouts/schedule'
import { exerciseLanguage, localizeExercise } from '@/lib/exercises/localization'
import { createTranslator, dateLocale, type AppLanguage } from '@/lib/i18n'
import { FREE_PLAN_LIMIT } from '@/lib/plans/entitlements'

export const metadata = { title: 'Plan completo · Vekira' }

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
  source_type: 'ai' | 'engine' | 'manual' | 'imported' | 'shared_post'
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

function formatDate(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDifficulty(value: string | null, t: (source: string) => string): string | null {
  if (!value) return null
  return t(DIFFICULTY_LABELS[value] ?? value)
}

function formatDuration(minutes: number | null, t: (source: string) => string): string {
  if (!minutes) return t('Duración pendiente')
  return `${minutes} min`
}

function formatSource(value: PlanRow['source_type'], t: (source: string) => string): string {
  if (value === 'engine') return t('Motor basado en evidencia')
  if (value === 'manual') return t('Manual')
  if (value === 'shared_post') return t('Copiado')
  if (value === 'imported') return t('Importado')
  return 'AI'
}

function PlanSwitcher({ plans, tier, t }: { plans: PlanListRow[]; tier: 'free' | 'pro'; t: (source: string) => string }) {
  const canCreate = tier === 'pro' || plans.length < FREE_PLAN_LIMIT
  const activePlan = plans.find(plan => plan.is_active)
  const planCount = tier === 'free' ? `${plans.length}/${FREE_PLAN_LIMIT}` : String(plans.length)

  return (
    <details className="group mt-5 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {activePlan?.name ?? t('Crear o activar un plan')}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activePlan ? t('Activo') : t('Elige un plan')} · {planCount} {t('planes')}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border/50 bg-background/30 p-3">
        {plans.length > 0 && (
          <div className="space-y-2">
            {plans.map(plan => {
              const metadata = [
                formatSource(plan.source_type, t),
                plan.days_per_week ? `${plan.days_per_week} ${t('días/sem')}` : null,
                formatDifficulty(plan.difficulty, t),
              ].filter(Boolean).join(' · ')

              return (
                <div
                  key={plan.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 ${
                    plan.is_active
                      ? 'border-violet-500/45 bg-violet-500/10'
                      : 'border-border/50 bg-background/30'
                  }`}
                >
                  {plan.is_active ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{plan.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{metadata}</p>
                      </div>
                    </div>
                  ) : (
                    <form action={activatePlan} className="min-w-0 flex-1">
                      <input type="hidden" name="planId" value={plan.id} />
                      <SubmitButton
                        label={t('Usar')}
                        pendingLabel={t('Cambiando plan')}
                        variant="ghost"
                        className="h-auto w-full justify-start gap-3 rounded-lg px-2 py-1.5 text-left font-normal hover:bg-muted/20 hover:text-foreground focus-visible:ring-violet-500"
                      >
                        <span className="h-8 w-8 shrink-0 rounded-full border-2 border-border/70" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{plan.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{metadata}</span>
                        </span>
                        <span className="text-xs font-semibold text-violet-300">{t('Usar')}</span>
                      </SubmitButton>
                    </form>
                  )}
                  <form action={deletePlan}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <button
                      type="submit"
                      aria-label={`${t('Borrar')} ${plan.name}`}
                      title={`${t('Borrar')} ${plan.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-red-500/10 hover:text-red-300 focus-visible:ring-2 focus-visible:ring-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              )
            })}
          </div>
        )}

        {canCreate ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <Button asChild className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600">
              <PendingLink href="/plans/generate">
                <Sparkles className="mr-2 h-4 w-4" />
                {t('Nuevo plan basado en evidencia')}
              </PendingLink>
            </Button>
            <details className="mt-1">
              <summary className="flex h-10 cursor-pointer list-none items-center justify-center text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('Crear manualmente')}
              </summary>
              <form action={createManualPlan} className="mt-2 space-y-3 rounded-xl border border-border/50 bg-background/40 p-3">
                <input name="name" required placeholder={t('Nombre del plan')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                <input name="goal" placeholder={t('Objetivo visible')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                <div className="grid grid-cols-2 gap-2">
                  <select name="daysPerWeek" defaultValue="3" className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                    {[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{day} {t('días')}</option>)}
                  </select>
                  <select name="difficulty" defaultValue="" className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                    <option value="">{t('Nivel')}</option>
                    <option value="beginner">{t('Principiante')}</option>
                    <option value="intermediate">{t('Intermedio')}</option>
                    <option value="advanced">{t('Avanzado')}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input name="makeActive" type="checkbox" defaultChecked className="h-4 w-4 accent-violet-500" />
                  {t('Activarlo ahora')}
                </label>
                <button className="h-10 w-full rounded-md bg-violet-500 text-sm font-semibold text-white hover:bg-violet-600">
                  {t('Crear plan manual')}
                </button>
              </form>
            </details>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="shrink-0 rounded-full border border-border/60 bg-background/50 px-2 py-1 font-semibold">{planCount}</span>
            <span>{t('Elimina un plan para crear otro.')}</span>
          </div>
        )}
      </div>
    </details>
  )
}

export default async function PlanPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)

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
      <div className="min-h-screen bg-background pb-16">
        <PageTopBar
          title={t('Plan')}
          subtitle={t('Sin plan activo')}
          backHref="/dashboard"
          backLabel="Dashboard"
          icon={<Dumbbell className="h-5 w-5" />}
        />
        <main className="mx-auto max-w-lg px-4 py-8">

          <PlanSwitcher plans={plans} tier={tier} t={t} />

          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Sparkles className="h-6 w-6 text-violet-400" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-foreground">{t('No encontramos un plan activo')}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t('Tu perfil ya está guardado. Reintenta la generación para crear tu estructura semanal.')}
            </p>
            <Button className="mt-5 h-11 w-full bg-violet-500 text-white hover:bg-violet-600" asChild>
              <PendingLink href="/plans/generate?autostart=1">
                {t('Reintentar generación')}
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
      .select('id, name, name_es, muscle_groups, muscle_groups_es, equipment, equipment_es, difficulty, exercise_type, is_compound')
      .eq('is_public', true)
      .order('name') as unknown as Promise<{ data: PlanExerciseOption[] | null }>,
  ])

  const workouts = (workoutRowsResult.data ?? []).map(workout => ({
    ...workout,
    displayName: getWorkoutDisplayName(workout.name, workout.focus),
  }))
  const exerciseOptions = (exerciseOptionsResult.data ?? []).map(exercise =>
    localizeExercise(exercise, language)
  )

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
        exercise:exercises(id, name, name_es, muscle_groups, muscle_groups_es, equipment, equipment_es, difficulty, exercise_type, is_compound)
      `)
      .in('workout_id', workoutIds)
      .order('order_index') as unknown as { data: PlanWorkoutExerciseRow[] | null }

    exerciseRows = (data ?? []).map(row => ({
      ...row,
      exercise: Array.isArray(row.exercise)
        ? row.exercise.map(exercise => localizeExercise(exercise, language))
        : row.exercise
          ? localizeExercise(row.exercise, language)
          : null,
    }))
  }

  const exercisesByWorkout = exerciseRows.reduce<Record<string, PlanWorkoutExerciseRow[]>>((acc, row) => {
    acc[row.workout_id] = acc[row.workout_id] ?? []
    acc[row.workout_id].push(row)
    return acc
  }, {})
  const todayIso = getIsoWeekday(new Date(), resolveUserTimeZone(profile.timezone))
  const todayWorkout = workouts.find(workout => workout.day_of_week === todayIso)
  const todayExercises = todayWorkout ? exercisesByWorkout[todayWorkout.id] ?? [] : []

  return (
    <div className="min-h-screen bg-background pb-16">
      <PageTopBar
        title={t('Plan')}
        subtitle={planRaw.name}
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<Dumbbell className="h-5 w-5" />}
        right={(
          <details className="group relative">
            <summary
              aria-label={t('Acciones del plan')}
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-border/60 bg-muted/10 text-muted-foreground outline-none hover:bg-muted/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-64 space-y-2 rounded-2xl border border-border/70 bg-background p-3 shadow-2xl shadow-black/30">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('Acciones del plan')}
              </p>
              <PlanRegenerateButton />
              <Button asChild variant="outline" className="h-11 w-full border-border/60 bg-muted/10">
                <PendingLink href="/history">
                  <History className="mr-2 h-4 w-4" />
                  {t('Historial')}
                </PendingLink>
              </Button>
              <div className="[&>button]:w-full [&>button]:justify-center">
                <ShareRoutineButton planId={planRaw.id} />
              </div>
            </div>
          </details>
        )}
      />

      <main className="mx-auto max-w-lg px-4 py-8">
        <PlanSwitcher plans={plans} tier={tier} t={t} />

        <div className="mt-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
          <p className="text-sm text-muted-foreground">
            {planRaw.goal || t('Estructura semanal de entrenamiento')}
          </p>
        </div>

        {todayWorkout ? (
          <section className="relative mt-6 overflow-hidden rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-500/20 via-violet-500/10 to-transparent p-5 shadow-lg shadow-violet-950/20">
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-200">{t('Entrenamiento de hoy')}</p>
              <h2 className="mt-2 font-display text-xl font-bold text-foreground">{todayWorkout.displayName}</h2>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center">
                  <Dumbbell className="mr-1.5 h-3.5 w-3.5" />
                  {todayExercises.length} {t('ejercicios')}
                </span>
                <span className="inline-flex items-center">
                  <Timer className="mr-1.5 h-3.5 w-3.5" />
                  {formatDuration(todayWorkout.estimated_duration_minutes, t)}
                </span>
              </div>
              <PendingLink
                href={`/session/${todayWorkout.id}`}
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-violet-500 px-4 text-sm font-bold text-white shadow-md shadow-violet-950/30 transition-colors hover:bg-violet-600"
              >
                {t('Empezar entrenamiento')}
                <ChevronRight className="ml-1 h-4 w-4" />
              </PendingLink>
            </div>
          </section>
        ) : (
          <section className="mt-6 flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/30 text-muted-foreground">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{t('Hoy es día de descanso')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('Consulta la semana para ver tu próximo entrenamiento.')}</p>
            </div>
          </section>
        )}

        <PlanViewTabs
          weekLabel={t('Semana')}
          infoLabel={t('Información')}
          infoContent={(
            <div className="mt-4 space-y-3">
              <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('Detalles del plan')}</p>
                <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                  {planRaw.description || t('Estructura semanal, entrenamientos y ejercicios del plan activo.')}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {planRaw.goal && (
                    <Badge variant="ghost" className="border border-violet-500/20 text-violet-100">
                      <Target className="mr-1 h-3 w-3 text-violet-300" />
                      {planRaw.goal}
                    </Badge>
                  )}
                  {formatDifficulty(planRaw.difficulty, t) && (
                    <Badge variant="ghost" className="border border-border/50">
                      <Dumbbell className="mr-1 h-3 w-3 text-muted-foreground" />
                      {formatDifficulty(planRaw.difficulty, t)}
                    </Badge>
                  )}
                  <Badge variant="ghost" className="border border-border/50">
                    <CalendarDays className="mr-1 h-3 w-3 text-muted-foreground" />
                    {planRaw.days_per_week ?? workouts.length} {t('días/sem')}
                  </Badge>
                  {planRaw.duration_weeks && (
                    <Badge variant="ghost" className="border border-border/50">
                      {planRaw.duration_weeks} {t('semanas')}
                    </Badge>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4 text-xs text-muted-foreground">
                  <span>{formatSource(planRaw.source_type, t)}</span>
                  <span>{t('Creado el')} {formatDate(planRaw.created_at, language)}</span>
                </div>
              </section>

              <details className="group overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
                <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-foreground outline-none hover:bg-muted/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                  {t('Editar información')}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border/50 p-4">
          <form action={updatePlanSummary} className="mt-4 space-y-3">
            <input type="hidden" name="planId" value={planRaw.id} />

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('Nombre del plan')}</span>
              <input
                name="name"
                defaultValue={planRaw.name}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('Objetivo visible')}</span>
              <input
                name="goal"
                defaultValue={planRaw.goal ?? ''}
                placeholder={t('Ej. Hipertrofia, fuerza, recomposición')}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('Descripción')}</span>
              <textarea
                name="description"
                defaultValue={planRaw.description ?? ''}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <SubmitButton
              label={t('Guardar resumen')}
              pendingLabel={t('Guardando resumen')}
              className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
            />
          </form>
                </div>
              </details>
            </div>
          )}
          weekContent={(
            <div className="mt-4 space-y-3">

          {workouts.map((workout, index) => {
            const exercises = exercisesByWorkout[workout.id] ?? []
            const isToday = workout.day_of_week === todayIso
            const dayLabel = workout.day_of_week ? t(DAY_NAMES[workout.day_of_week]) : `${t('Sesión')} ${index + 1}`

            return (
              <details
                key={workout.id}
                className={`group overflow-hidden rounded-2xl border transition-colors ${
                  isToday
                    ? 'border-violet-500/50 bg-violet-500/[0.06] open:bg-violet-500/[0.08]'
                    : 'border-border/60 bg-muted/10 open:bg-muted/15'
                }`}
              >
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                  <div className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border text-center ${
                    isToday
                      ? 'border-violet-500/30 bg-violet-500/15 text-violet-200'
                      : 'border-border/50 bg-background/40 text-muted-foreground'
                  }`}>
                    <span className="text-[10px] font-semibold uppercase leading-none">{dayLabel.slice(0, 3)}</span>
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-foreground">{workout.displayName}</h2>
                      {isToday && (
                        <Badge variant="ghost" className="border border-violet-500/30 bg-violet-500/10 px-2 py-0 text-[10px] text-violet-100">
                          {t('Hoy')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{exercises.length} {t('ejercicios')}</span>
                      <span className="inline-flex items-center">
                        <Timer className="mr-1 h-3.5 w-3.5" />
                        {formatDuration(workout.estimated_duration_minutes, t)}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>

                <div className="border-t border-border/50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {isToday ? (
                      <PendingLink
                        href={`/session/${workout.id}`}
                        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white shadow-sm shadow-violet-900/30 hover:bg-violet-600"
                        spinnerClassName="h-3.5 w-3.5"
                      >
                        {t('Abrir rutina de hoy')}
                        <ChevronRight className="h-4 w-4" />
                      </PendingLink>
                    ) : (
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('Disponible el {day}.', { day: dayLabel.toLowerCase() })}
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
                      {t('Editar entrenamiento')}
                    </summary>
                    <form action={updateWorkoutSummary} className="mt-4 space-y-3">
                      <input type="hidden" name="planId" value={planRaw.id} />
                      <input type="hidden" name="workoutId" value={workout.id} />

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t('Nombre')}</span>
                        <input
                          name="name"
                          defaultValue={workout.displayName}
                          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t('Foco muscular')}</span>
                        <input
                          name="focus"
                          defaultValue={workout.focus ?? ''}
                          placeholder={t('Pecho · Hombros · Tríceps')}
                          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </label>

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">{t('Duración estimada')}</span>
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
                        label={t('Guardar entrenamiento')}
                        pendingLabel={t('Guardando entrenamiento')}
                        className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
                      />
                    </form>
                  </details>
                </div>
              </details>
            )
          })}
            </div>
          )}
        />
      </main>
    </div>
  )
}
