import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PlanAdjustButton } from '@/components/plan/PlanAdjustButton'
import { PlanDistribution } from '@/components/plan/PlanDistribution'
import { PlanOverview } from '@/components/plan/PlanOverview'
import { PlanRetireButton } from '@/components/plan/PlanRetireButton'
import { PlanWorkoutWorkspace } from '@/components/plan/PlanWorkoutWorkspace'
import {
  appliedConstraintLabels,
  buildPlanDaySummaries,
  buildPlanDistribution,
  buildPlanWeekEntries,
} from '@/components/plan/planViewModel'
import { ShareRoutineButton } from '@/components/social/ShareRoutineButton'
import {
  type PlanExerciseOption,
  type PlanWorkoutExerciseRow,
} from '@/components/plan/WorkoutExerciseList'
import { requireAppUserContext } from '@/lib/auth/server'
import { isCommunityEnabled } from '@/lib/features/community'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import {
  activatePlan,
  createManualPlan,
  updatePlanSummary,
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
} from 'lucide-react'
import { getIsoWeekday, resolveUserTimeZone } from '@/lib/workouts/schedule'
import { exerciseLanguage, localizeExercise } from '@/lib/exercises/localization'
import { createTranslator } from '@/lib/i18n'
import type { PlanAdjustmentOptions } from '@/lib/plans/adjustmentIntent'
import { FREE_PLAN_LIMIT } from '@/lib/plans/entitlements'
import { requirePlanLibraryResults } from '@/lib/plans/library'
import type { CardioModality } from '@/lib/training-engine'

export const metadata = { title: 'Plan completo · Vekira' }

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
  source_type: 'ai' | 'engine' | 'manual' | 'imported' | 'shared_post' | 'trainer_assigned'
  prescription_locked: boolean
  trainer_assignment_id: string | null
  trainer_assignment_version_id: string | null
  trainer_relationship_id: string | null
  created_at: string
}

type PlanListRow = Pick<PlanRow, 'id' | 'name' | 'goal' | 'days_per_week' | 'difficulty' | 'source_type' | 'created_at'> & {
  is_active: boolean
  prescription_locked: boolean
}

type WorkoutRow = {
  id: string
  name: string
  focus: string | null
  day_of_week: number | null
  order_in_plan: number | null
  estimated_duration_minutes: number | null
}

type PlanConstraintProfile = {
  gym_type: 'home_no_equipment' | 'home_basic' | 'full_gym' | null
  available_equipment: string[] | null
  cardio_preferences: CardioModality[] | null
  session_duration_minutes: number | null
  readiness_status: string | null
  movement_limitations: unknown
}

function formatDifficulty(value: string | null, t: (source: string) => string): string | null {
  if (!value) return null
  return t(DIFFICULTY_LABELS[value] ?? value)
}

function formatSource(value: PlanRow['source_type'], t: (source: string) => string): string {
  if (value === 'engine') return t('Motor basado en evidencia')
  if (value === 'manual') return t('Manual')
  if (value === 'shared_post') return t('Copiado')
  if (value === 'imported') return t('Importado')
  if (value === 'trainer_assigned') return t('Asignada por entrenador')
  return 'AI'
}

function PlanSwitcher({ plans, tier, t, prescriptionLocked = false }: { plans: PlanListRow[]; tier: 'free' | 'pro'; t: (source: string) => string; prescriptionLocked?: boolean }) {
  const canCreate = !prescriptionLocked && (tier === 'pro' || plans.filter(plan => !plan.prescription_locked).length < FREE_PLAN_LIMIT)
  const activePlan = plans.find(plan => plan.is_active)
  const planCount = tier === 'free' ? `${plans.length}/${FREE_PLAN_LIMIT}` : String(plans.length)

  return (
    <details className="group overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
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
                  ) : prescriptionLocked ? (
                    <div className="min-w-0 flex-1 px-2 py-1.5 text-xs text-muted-foreground">{t('Biblioteca en solo lectura mientras tu entrenador gestione la rutina activa.')}</div>
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
                  {!prescriptionLocked && !plan.prescription_locked && <PlanRetireButton planId={plan.id} planName={plan.name} />}
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
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('Crear manualmente')}
              </summary>
              <form action={createManualPlan} className="mt-2 space-y-3 rounded-xl border border-border/50 bg-background/40 p-3">
                <input name="name" required placeholder={t('Nombre del plan')} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                <input name="goal" placeholder={t('Objetivo visible')} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                <div className="grid grid-cols-2 gap-2">
                  <select name="daysPerWeek" defaultValue="3" className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                    {[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{day} {t('días')}</option>)}
                  </select>
                  <select name="difficulty" defaultValue="" className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                    <option value="">{t('Nivel')}</option>
                    <option value="beginner">{t('Principiante')}</option>
                    <option value="intermediate">{t('Intermedio')}</option>
                    <option value="advanced">{t('Avanzado')}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input name="makeActive" type="checkbox" defaultChecked className="h-11 w-11 shrink-0 accent-violet-500" />
                  {t('Activarlo ahora')}
                </label>
                <button className="h-11 w-full rounded-md bg-violet-500 text-sm font-semibold text-white hover:bg-violet-600">
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
  const communityEnabled = isCommunityEnabled()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)

  const [activePlanResult, planLibraryResult] = await Promise.all([
    supabase
    .from('workout_plans')
      .select('id, name, description, goal, duration_weeks, days_per_week, difficulty, source_type, prescription_locked, trainer_assignment_id, trainer_assignment_version_id, trainer_relationship_id, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('superseded_at', null)
    .is('retired_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
      .maybeSingle() as unknown as Promise<{
        data: PlanRow | null
        error: { message?: string } | null
      }>,
    supabase
      .from('workout_plans')
      .select('id, name, goal, days_per_week, difficulty, source_type, prescription_locked, created_at, is_active')
      .eq('user_id', user.id)
      .is('superseded_at', null)
      .is('retired_at', null)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false }) as unknown as Promise<{
        data: PlanListRow[] | null
        error: { message?: string } | null
      }>,
  ])

  const { activePlan: planRaw, plans } = requirePlanLibraryResults(
    activePlanResult,
    planLibraryResult,
  )
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

  let professionalRelationshipActive = planRaw.prescription_locked
  let professionalTrainerName: string | null = null
  const professionalMetadataErrors: string[] = []
  if (planRaw.prescription_locked && planRaw.trainer_relationship_id) {
    const { data: relationship, error: relationshipError } = await supabase
      .from('coaching_relationships')
      .select('status, trainer_user_id')
      .eq('id', planRaw.trainer_relationship_id)
      .maybeSingle() as {
        data: { status: string; trainer_user_id: string } | null
        error: { message?: string } | null
      }
    if (relationshipError || !relationship) {
      professionalMetadataErrors.push(t('No pudimos verificar la relación con tu entrenador.'))
    } else {
      professionalRelationshipActive = relationship.status === 'active'
    }
    if (!relationshipError && relationship?.trainer_user_id) {
      const { data: trainerProfile, error: trainerProfileError } = await (supabase as any)
        .from('public_profiles')
        .select('full_name, username')
        .eq('id', relationship.trainer_user_id)
        .maybeSingle()
      if (trainerProfileError || !trainerProfile) {
        professionalMetadataErrors.push(t('No pudimos cargar el nombre de tu entrenador.'))
      } else {
        professionalTrainerName = trainerProfile.full_name?.trim() || trainerProfile.username?.trim() || 'Tu entrenador'
      }
    }
  }

  let professionalVersion: { version_number: number; change_summary: string | null } | null = null
  if (planRaw.prescription_locked && planRaw.trainer_assignment_id && planRaw.trainer_assignment_version_id) {
    const { data: version, error: versionError } = await supabase
      .from('trainer_assignment_versions')
      .select('version_number, change_summary, assignment_id')
      .eq('id', planRaw.trainer_assignment_version_id)
      .eq('assignment_id', planRaw.trainer_assignment_id)
      .maybeSingle() as {
        data: { version_number: number; change_summary: string | null; assignment_id: string } | null
        error: { message?: string } | null
      }
    if (versionError || !version || version.assignment_id !== planRaw.trainer_assignment_id) {
      professionalMetadataErrors.push(t('No pudimos cargar la versión de esta rutina.'))
    } else {
      professionalVersion = {
        version_number: version.version_number,
        change_summary: version.change_summary,
      }
    }
  }

  const [workoutRowsResult, exerciseOptionsResult, constraintProfileResult] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, name, focus, day_of_week, order_in_plan, estimated_duration_minutes')
      .eq('plan_id', planRaw.id)
      .order('order_in_plan') as unknown as Promise<{ data: WorkoutRow[] | null }>,
    supabase
      .from('exercises')
      .select('id, name, name_es, image_url, muscle_groups, muscle_groups_es, equipment, equipment_es, difficulty, exercise_type, is_compound')
      .eq('is_public', true)
      .order('name')
      .limit(24) as unknown as Promise<{ data: PlanExerciseOption[] | null }>,
    supabase
      .from('profiles')
      .select('gym_type, available_equipment, cardio_preferences, session_duration_minutes, readiness_status, movement_limitations')
      .eq('id', user.id)
      .single() as unknown as Promise<{ data: PlanConstraintProfile | null }>,
  ])

  const workouts = (workoutRowsResult.data ?? []).map(workout => ({
    ...workout,
    displayName: getWorkoutDisplayName(workout.name, workout.focus),
  }))
  const exerciseOptions = (exerciseOptionsResult.data ?? []).map(exercise =>
    localizeExercise(exercise, language)
  )
  const constraintProfile = constraintProfileResult.data

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
        exercise:exercises(id, name, name_es, image_url, muscle_groups, muscle_groups_es, equipment, equipment_es, difficulty, exercise_type, is_compound)
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
  const exerciseCounts = workouts.reduce<Record<string, number>>((acc, workout) => {
    acc[workout.id] = exercisesByWorkout[workout.id]?.length ?? 0
    return acc
  }, {})
  const planDaySummaries = buildPlanDaySummaries(
    workouts.map(workout => ({
      id: workout.id,
      name: workout.displayName,
      focus: workout.focus,
      dayOfWeek: workout.day_of_week,
      orderInPlan: workout.order_in_plan,
      duration: workout.estimated_duration_minutes,
    })),
    exerciseCounts,
  )
  const constraintLabels = appliedConstraintLabels({
    gymType: constraintProfile?.gym_type,
    availableEquipment: constraintProfile?.available_equipment,
    sessionDurationMinutes: constraintProfile?.session_duration_minutes,
    readinessStatus: constraintProfile?.readiness_status,
    movementLimitations: constraintProfile?.movement_limitations,
  }, language)
  const todayIso = getIsoWeekday(new Date(), resolveUserTimeZone(profile.timezone))
  const uniqueAdjustmentExercises = new Map<string, { id: string; name: string }>()
  exerciseRows.forEach(row => {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
    if (exercise) uniqueAdjustmentExercises.set(exercise.id, {
      id: exercise.id,
      name: exercise.name,
    })
  })
  const adjustmentOptions: PlanAdjustmentOptions = {
    currentDaysPerWeek: planRaw.days_per_week ?? workouts.length,
    currentSessionDurationMinutes: constraintProfile?.session_duration_minutes ?? 60,
    availableEquipment: constraintProfile?.available_equipment ?? [],
    cardioPreferences: constraintProfile?.cardio_preferences ?? ['walking'],
    exercises: Array.from(uniqueAdjustmentExercises.values()),
  }

  const weekEntries = buildPlanWeekEntries(planDaySummaries, todayIso)
  const distribution = buildPlanDistribution(exerciseRows.map(row => {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
    return {
      sets: row.sets,
      muscleGroups: exercise?.muscle_groups ?? null,
    }
  }))
  const workspaceWorkouts = planDaySummaries.map(summary => ({
    summary,
    exercises: exercisesByWorkout[summary.id] ?? [],
  }))
  const workoutDurations = planDaySummaries
    .map(summary => summary.durationMinutes)
    .filter((minutes): minutes is number => typeof minutes === 'number' && minutes > 0)
  const overviewDuration = constraintProfile?.session_duration_minutes
    ?? (workoutDurations.length > 0
      ? Math.round(workoutDurations.reduce((sum, minutes) => sum + minutes, 0) / workoutDurations.length)
      : null)
  const prescriptionLocked = planRaw.prescription_locked === true

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageTopBar
        title={t('Plan')}
        subtitle={planRaw.name}
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<Dumbbell className="h-5 w-5" />}
        right={prescriptionLocked ? undefined : (
          <details className="group relative">
            <summary
              aria-label={t('Acciones del plan')}
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-border/60 bg-muted/10 text-muted-foreground outline-none transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-2xl border border-border/70 bg-background p-3 shadow-2xl shadow-black/30">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('Acciones del plan')}
              </p>
              <PlanAdjustButton planId={planRaw.id} options={adjustmentOptions} />
              <Button asChild variant="outline" className="h-11 w-full border-border/60 bg-muted/10">
                <PendingLink href="/history">
                  <History className="mr-2 h-4 w-4" />
                  {t('Historial')}
                </PendingLink>
              </Button>
              {communityEnabled ? (
                <div className="[&>button]:w-full [&>button]:justify-center">
                  <ShareRoutineButton planId={planRaw.id} />
                </div>
              ) : null}
              <details className="group/summary border-t border-border/60 pt-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                  {t('Editar detalles')}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open/summary:rotate-180" />
                </summary>
                <form action={updatePlanSummary} className="mt-2 space-y-3 rounded-xl bg-muted/10 p-3">
                  <input type="hidden" name="planId" value={planRaw.id} />
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t('Nombre del plan')}</span>
                    <input name="name" defaultValue={planRaw.name} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t('Objetivo visible')}</span>
                    <input name="goal" defaultValue={planRaw.goal ?? ''} className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{t('Descripción')}</span>
                    <textarea name="description" defaultValue={planRaw.description ?? ''} rows={3} className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                  </label>
                  <SubmitButton label={t('Guardar resumen')} pendingLabel={t('Guardando resumen')} className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600" />
                </form>
              </details>
            </div>
          </details>
        )}
      />

      <main aria-label={t('Plan')} className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        {professionalMetadataErrors.length > 0 && (
          <div role="alert" className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
            {professionalMetadataErrors.map(message => <p key={message}>{message}</p>)}
          </div>
        )}

        <PlanOverview
          name={planRaw.name}
          sourceLabel={formatSource(planRaw.source_type, t)}
          daysPerWeek={planRaw.days_per_week ?? planDaySummaries.filter(day => day.isScheduled).length}
          durationMinutes={overviewDuration}
          difficultyLabel={formatDifficulty(planRaw.difficulty, t)}
          constraintLabels={constraintLabels}
          prescriptionLocked={prescriptionLocked}
          professionalVersionNumber={professionalVersion?.version_number ?? null}
          professionalChangeSummary={professionalVersion?.change_summary ?? null}
          professionalTrainerName={professionalTrainerName}
          switcher={<PlanSwitcher plans={plans} tier={tier} t={t} prescriptionLocked={professionalRelationshipActive} />}
        />

        {(planRaw.goal || planRaw.description) && (
          <section className="rounded-2xl border border-border/60 bg-[hsl(var(--surface-1))] px-5 py-4">
            {planRaw.goal && <p className="font-semibold text-foreground">{planRaw.goal}</p>}
            {planRaw.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{planRaw.description}</p>}
          </section>
        )}

        <PlanWorkoutWorkspace
          planId={planRaw.id}
          entries={weekEntries}
          workouts={workspaceWorkouts}
          exerciseOptions={exerciseOptions}
          todayIso={todayIso}
          prescriptionLocked={prescriptionLocked}
        />

        <PlanDistribution items={distribution} />
      </main>
    </div>
  )
}
