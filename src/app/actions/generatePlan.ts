'use server'

import { createClient }            from '@/lib/supabase/server'
import { generateInitialPlan }     from '@/lib/ai/planGenerator'
import { filterExercisesForUser }  from '@/lib/ai/filter'
import { checkUserRateLimit, checkGlobalDailyBudget } from '@/lib/ai/rate-limits'
import { buildWeeklySummary, getCyclePhase } from '@/lib/plans/periodization'
import { getPlanCreatePolicy, removeOtherPlansForFreeUser } from '@/lib/plans/entitlements'
import type { WeekContext, WeeklySummary, WeeklyExerciseRow } from '@/lib/plans/periodization'
import type { UserContext }        from '@/lib/ai/types'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface GeneratePlanResult {
  success:           boolean
  planId?:           string
  planName?:         string
  daysCount?:        number
  weekNumber?:       number
  isMock?:           boolean
  error?:            string
  rateLimitedUntil?: string   // ISO string
}

export interface GeneratePlanOptions {
  mode?: 'initial' | 'weekly_regeneration'
  replaceExisting?: boolean
}

// ─── Helper: asignar días de la semana ───────────────────────────────────────
//
// Convierte los "day_number" secuenciales del plan (1, 2, 3…) a números
// de día ISO (1=lun … 7=dom), respetando preferred_workout_days si los hay.

function assignIsoDays(
  dayCount:      number,
  preferredDays: number[] | null,
): number[] {
  if (preferredDays && preferredDays.length >= dayCount) {
    return [...preferredDays].sort((a, b) => a - b).slice(0, dayCount)
  }
  // Por defecto: lun, mar, mié… hasta completar dayCount
  return Array.from({ length: dayCount }, (_, i) => i + 1)
}

// ─── Helper: resumen de la semana anterior ────────────────────────────────────
//
// Rendimiento de los últimos 7 días respecto al plan activo: adherencia,
// RPE promedio y ejercicios saltados con motivo. Alimenta la regeneración.

async function buildPreviousWeekSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  planId: string,
): Promise<WeeklySummary | null> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [{ data: planWorkouts }, { data: weekLogs }] = await Promise.all([
    (supabase.from('workouts') as any)
      .select('id')
      .eq('plan_id', planId) as Promise<{ data: { id: string }[] | null }>,
    (supabase.from('progress_logs') as any)
      .select('id')
      .eq('user_id', userId)
      .not('workout_id', 'is', null)
      .gte('completed_at', since.toISOString()) as Promise<{ data: { id: string }[] | null }>,
  ])

  const scheduledSessions = planWorkouts?.length ?? 0
  const logIds = (weekLogs ?? []).map(log => log.id)

  if (scheduledSessions === 0 && logIds.length === 0) return null

  type ExerciseLogRow = {
    rpe_values: (number | null)[] | null
    notes: string | null
    exercise: { name: string } | { name: string }[] | null
  }

  let exerciseRows: WeeklyExerciseRow[] = []
  if (logIds.length > 0) {
    const { data: exLogs } = await (supabase.from('exercise_logs') as any)
      .select('rpe_values, notes, exercise:exercises(name)')
      .in('progress_log_id', logIds) as { data: ExerciseLogRow[] | null }

    exerciseRows = (exLogs ?? []).map(row => ({
      exerciseName: Array.isArray(row.exercise)
        ? row.exercise[0]?.name ?? null
        : row.exercise?.name ?? null,
      rpeValues: row.rpe_values,
      note: row.notes,
    }))
  }

  return buildWeeklySummary({
    scheduledSessions,
    completedSessions: logIds.length,
    exerciseRows,
  })
}

// ─── Server Action principal ──────────────────────────────────────────────────

export async function generatePlan(options: GeneratePlanOptions = {}): Promise<GeneratePlanResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const mode = options.mode ?? 'initial'
  const replaceExisting = options.replaceExisting ?? mode === 'weekly_regeneration'
  const operation = mode === 'weekly_regeneration'
    ? 'weekly_plan_regeneration'
    : 'initial_plan_generation'

  const createPolicy = await getPlanCreatePolicy(supabase, user.id, {
    replaceExistingForFree: replaceExisting,
  })
  if (!createPolicy.allowed) {
    return { success: false, error: createPolicy.reason }
  }

  const { data: activePlan } = await (supabase
    .from('workout_plans') as any)
    .select('id, week_number')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: { id: string; week_number: number | null } | null
      error: { message: string } | null
    }

  const nextWeekNumber = mode === 'weekly_regeneration'
    ? Math.max(2, (activePlan?.week_number ?? 1) + 1)
    : 1

  // ── 1. Rate limits ─────────────────────────────────────────────────────────
  const [userLimit, globalBudget] = await Promise.all([
    checkUserRateLimit(user.id, operation),
    checkGlobalDailyBudget(),
  ])

  if (!userLimit.allowed) {
    return {
      success:           false,
      error:             userLimit.reason,
      rateLimitedUntil:  userLimit.retryAfter?.toISOString(),
    }
  }
  if (!globalBudget.allowed) {
    return { success: false, error: globalBudget.reason }
  }

  // ── 2. Perfil del usuario ──────────────────────────────────────────────────
  type ProfileRow = {
    fitness_level:            'beginner' | 'intermediate' | 'advanced' | null
    primary_goal:             string | null
    days_per_week:            number | null
    session_duration_minutes: number | null
    gym_type:                 'home_no_equipment' | 'home_basic' | 'full_gym' | null
    available_equipment:      string[]
    injuries:                 string | null
    gender:                   string | null
    weight_kg:                number | null
    date_of_birth:            string | null
    preferred_workout_days:   number[] | null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      fitness_level, primary_goal, days_per_week, session_duration_minutes,
      gym_type, available_equipment, injuries, gender, weight_kg,
      date_of_birth, preferred_workout_days
    `)
    .eq('id', user.id)
    .single() as unknown as { data: ProfileRow | null }

  if (!profile) {
    return { success: false, error: 'Perfil no encontrado. Completa el onboarding primero.' }
  }

  if (!profile.fitness_level || !profile.primary_goal || !profile.days_per_week) {
    return { success: false, error: 'Completa tu perfil antes de generar un plan.' }
  }

  // ── 3. Construir UserContext ───────────────────────────────────────────────
  let age: number | null = null
  if (profile.date_of_birth) {
    const born = new Date(profile.date_of_birth)
    age = Math.floor(
      (Date.now() - born.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
    )
  }

  const userCtx: UserContext = {
    fitness_level:            profile.fitness_level,
    primary_goal:             profile.primary_goal as UserContext['primary_goal'],
    days_per_week:            profile.days_per_week,
    session_duration_minutes: profile.session_duration_minutes ?? 60,
    gym_type:                 profile.gym_type ?? 'full_gym',
    available_equipment:      profile.available_equipment ?? [],
    injuries:                 profile.injuries ?? '',
    gender:                   profile.gender ?? 'other',
    weight_kg:                profile.weight_kg,
    age,
  }

  // ── 4. Filtrar ejercicios ──────────────────────────────────────────────────
  let exercises
  try {
    exercises = await filterExercisesForUser(userCtx)
  } catch (err) {
    console.error('[generatePlan] filterExercisesForUser falló:', err)
    return { success: false, error: 'Error al cargar el pool de ejercicios.' }
  }

  if (exercises.length === 0) {
    return {
      success: false,
      error:   'No se encontraron ejercicios compatibles con tu equipamiento y perfil.',
    }
  }

  // ── 5. Generar plan (mock o real) ──────────────────────────────────────────

  // Contexto de periodización: fase del ciclo + rendimiento de la semana
  // anterior. Solo aplica en regeneraciones semanales.
  let weekContext: WeekContext | undefined
  if (mode === 'weekly_regeneration') {
    const previousWeek = activePlan
      ? await buildPreviousWeekSummary(supabase, user.id, activePlan.id)
      : null

    weekContext = {
      weekNumber: nextWeekNumber,
      cyclePhase: getCyclePhase(nextWeekNumber),
      previousWeek,
    }
  }

  let result
  try {
    result = await generateInitialPlan({
      userId:    user.id,
      operation,
      user:      userCtx,
      exercises,
      weekContext,
    })
  } catch (err) {
    console.error('[generatePlan] generateInitialPlan falló:', err)
    return { success: false, error: 'Error al generar el plan. Inténtalo de nuevo.' }
  }

  const plan = result.plan.plan

  // ── 6. Guardar en Supabase ─────────────────────────────────────────────────

  // a) Desactivar planes activos anteriores
  await (supabase.from('workout_plans') as any)
    .update({ is_active: false })
    .eq('user_id', user.id)
    .eq('is_active', true)

  // b) Crear nuevo plan
  const { data: newPlan, error: planError } = await (supabase
    .from('workout_plans') as any)
    .insert({
      user_id:         user.id,
      name:            plan.display_name,
      ai_notes:        plan.ai_notes,
      is_active:       true,
      generated_by_ai: true,
      days_per_week:   profile.days_per_week,
      difficulty:      profile.fitness_level,
      week_number:     nextWeekNumber,
      plan_context:    mode === 'weekly_regeneration' ? 'weekly_regeneration' : 'first_plan',
      parent_plan_id:  mode === 'weekly_regeneration' ? activePlan?.id ?? null : null,
      source_type:     'ai',
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (planError || !newPlan) {
    console.error('[generatePlan] Error creando workout_plans:', planError)
    return { success: false, error: 'Error al guardar el plan.' }
  }

  // c) Asignar días de la semana
  const isoDays = assignIsoDays(plan.days.length, profile.preferred_workout_days)

  // d) Crear workouts + workout_exercises para cada día
  for (let i = 0; i < plan.days.length; i++) {
    const day    = plan.days[i]
    const isoDay = isoDays[i] ?? (i + 1)

    // Duración estimada: suma de (sets × 3.5 min) por ejercicio del día
    const estimatedMin = Math.round(
      day.exercises.reduce((acc, ex) => acc + ex.sets * 3.5, 0),
    )

    const { data: newWorkout, error: wErr } = await (supabase
      .from('workouts') as any)
      .insert({
        user_id:                    user.id,
        plan_id:                    newPlan.id,
        name:                       day.display_name,
        focus:                      day.focus,
        day_of_week:                isoDay,
        order_in_plan:              day.day_number,
        estimated_duration_minutes: estimatedMin > 0 ? estimatedMin : (profile.session_duration_minutes ?? 60),
      })
      .select('id')
      .single() as { data: { id: string } | null; error: { message: string } | null }

    if (wErr || !newWorkout) {
      console.error(`[generatePlan] Error creando workout día ${day.day_number}:`, wErr)
      continue   // seguir con el siguiente día en lugar de abortar todo
    }

    // Ejercicios del día
    if (day.exercises.length > 0) {
      const weRows = day.exercises.map((ex, idx) => ({
        workout_id:              newWorkout.id,
        exercise_id:             ex.exercise_id,
        order_index:             idx + 1,
        sets:                    ex.sets,
        reps:                    ex.reps,
        duration_seconds:        ex.duration_seconds,
        rest_seconds:            ex.rest_seconds,
        target_rpe:              ex.target_rpe,
        weight_kg:               ex.weight_kg,
        notes:                   ex.notes,
        weight_suggestion_basis: ex.weight_suggestion_basis,
      }))

      const { error: weErr } = await (supabase
        .from('workout_exercises') as any)
        .insert(weRows) as { error: { message: string } | null }

      if (weErr) {
        console.error(`[generatePlan] Error creando workout_exercises día ${day.day_number}:`, weErr)
      }
    }
  }

  if (createPolicy.replacingExisting) {
    await removeOtherPlansForFreeUser(supabase, user.id, newPlan.id)
  }

  return {
    success:   true,
    planId:    newPlan.id,
    planName:  plan.display_name,
    daysCount: plan.days.length,
    weekNumber: nextWeekNumber,
    isMock:    result.isMock,
  }
}
