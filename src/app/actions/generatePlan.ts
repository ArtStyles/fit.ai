'use server'

import { createClient }            from '@/lib/supabase/server'
import { generateInitialPlan }     from '@/lib/ai/planGenerator'
import { filterExercisesForUser }  from '@/lib/ai/filter'
import { checkUserRateLimit, checkGlobalDailyBudget } from '@/lib/ai/rate-limits'
import { buildWeeklySummary, getCyclePhase } from '@/lib/plans/periodization'
import { getPlanCreatePolicy, pruneExcessPlansForFreeUser } from '@/lib/plans/entitlements'
import {
  estimateDayMinutes,
  findStalledExerciseIds,
  generateEvidencePlan,
  regenerateEvidencePlan,
  type CardioModality,
  type EngineExercise,
  type EvidencePlan,
  type ExerciseProgressHistoryEntry,
  type MovementLimitation,
  type MovementPattern,
  type PlanAdjustmentIntent,
  type PlanDiff,
  type ReadinessProfile,
  type RegenerationHistory,
  previewPlanAdjustment,
} from '@/lib/training-engine'
import type { WeekContext, WeeklySummary, WeeklyExerciseRow } from '@/lib/plans/periodization'
import type { UserContext }        from '@/lib/ai/types'
import type { Json } from '@/types/database'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface GeneratePlanResult {
  success:           boolean
  planId?:           string
  planName?:         string
  daysCount?:        number
  weekNumber?:       number
  isMock?:           boolean
  generator?:        'evidence_engine' | 'legacy_ai'
  engineVersion?:    string
  evidenceVersion?:  string
  requiresReadinessReview?: boolean
  previewDiff?: PlanDiff
  warnings?: string[]
  error?:            string
  rateLimitedUntil?: string   // ISO string
}

export interface GeneratePlanOptions {
  mode?: 'initial' | 'weekly_regeneration' | 'plan_adjustment'
  replaceExisting?: boolean
  adjustmentIntent?: PlanAdjustmentIntent
  previewOnly?: boolean
}

function usesEvidenceEngine(userId: string): boolean {
  if ((process.env.PLAN_GENERATION_MODE ?? 'evidence_engine') === 'legacy_ai') return false
  const allowlist = (process.env.EVIDENCE_ENGINE_BETA_USER_IDS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return allowlist.length === 0 || allowlist.includes(userId)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseReadiness(
  status: ReadinessProfile['status'],
  answers: Json,
  limitationsValue: Json,
): ReadinessProfile {
  const data = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers as Record<string, unknown> : {}
  const limitations: MovementLimitation[] = Array.isArray(limitationsValue)
    ? limitationsValue.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const record = item as { [key: string]: Json | undefined }
      return [{
        region: typeof record.region === 'string' ? record.region : '',
        side: record.side === 'left' || record.side === 'right' || record.side === 'both' ? record.side : null,
        status: record.status === 'acute' || record.status === 'recovering' ? record.status : 'stable',
        movementsToAvoid: asStringArray(record.movementsToAvoid ?? record.movements_to_avoid),
        clinicianCleared: record.clinicianCleared === true || record.clinician_cleared === true,
      } satisfies MovementLimitation]
    })
    : []

  return {
    status,
    currentlyActive: data.currentlyActive === true || data.currently_active === true,
    warningSymptoms: asStringArray(data.warningSymptoms ?? data.warning_symptoms),
    knownCardiovascularMetabolicOrRenalDisease:
      data.knownCardiovascularMetabolicOrRenalDisease === true || data.known_disease === true,
    medicallyCleared: data.medicallyCleared === true || data.medically_cleared === true,
    recentSurgery: data.recentSurgery === true || data.recent_surgery === true,
    limitations,
  }
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

interface RegenerationContext {
  previousWeek: WeeklySummary | null
  stalledExerciseIds: string[]
}

async function recordEvidenceGenerationFailure(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mode: NonNullable<GeneratePlanOptions['mode']>,
  engineVersion: string | undefined,
  errorCode: string,
  metadata: Record<string, Json> = {},
): Promise<void> {
  const { error } = await (supabase.rpc as any)('record_plan_generation_failure', {
    p_mode: mode,
    p_engine_version: engineVersion ?? null,
    p_error_code: errorCode,
    p_metadata: metadata,
  })
  if (error) console.error('[generatePlan] No se pudo registrar el fallo:', error)
}

async function recordEvidenceGenerationSuccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string,
): Promise<void> {
  const { error } = await (supabase.rpc as any)('record_plan_generation_success', {
    p_plan_id: planId,
  })
  if (error) console.error('[generatePlan] No se pudo registrar el éxito:', error)
}

async function buildRegenerationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  planId: string,
): Promise<RegenerationContext> {
  const weekSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const historySince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const { data: planWorkouts } = await (supabase.from('workouts') as any)
    .select('id')
    .eq('plan_id', planId) as { data: { id: string }[] | null }

  const workoutIds = (planWorkouts ?? []).map(workout => workout.id)
  if (workoutIds.length === 0) return { previousWeek: null, stalledExerciseIds: [] }

  const [{ data: weekLogs }, { data: historyLogs }, { data: planExercises }] = await Promise.all([
    (supabase.from('progress_logs') as any)
      .select('id, completed_at, workout_id')
      .eq('user_id', userId)
      .in('workout_id', workoutIds)
      .gte('completed_at', weekSince.toISOString()) as Promise<{ data: { id: string; completed_at: string; workout_id: string | null }[] | null }>,
    (supabase.from('progress_logs') as any)
      .select('id, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', historySince.toISOString())
      .order('completed_at', { ascending: false })
      .limit(200) as Promise<{ data: { id: string; completed_at: string }[] | null }>,
    (supabase.from('workout_exercises') as any)
      .select('exercise_id')
      .in('workout_id', workoutIds) as Promise<{ data: { exercise_id: string }[] | null }>,
  ])

  const weekLogIds = new Set((weekLogs ?? []).map(log => log.id))
  const completedWorkoutIds = new Set((weekLogs ?? []).flatMap(log => log.workout_id ? [log.workout_id] : []))
  const historyLogIds = (historyLogs ?? []).map(log => log.id)
  const exerciseIds = Array.from(new Set((planExercises ?? []).map(row => row.exercise_id)))
  const completedAtByLog = new Map((historyLogs ?? []).map(log => [log.id, log.completed_at]))

  type ExerciseLogRow = {
    exercise_id: string
    progress_log_id: string
    weights_kg: number[] | null
    reps_completed: number[] | null
    rpe_values: (number | null)[] | null
    notes: string | null
    exercise: { name: string } | { name: string }[] | null
  }

  let exerciseLogs: ExerciseLogRow[] = []
  if (historyLogIds.length > 0 && exerciseIds.length > 0) {
    const { data: exLogs } = await (supabase.from('exercise_logs') as any)
      .select('exercise_id, progress_log_id, weights_kg, reps_completed, rpe_values, notes, exercise:exercises(name)')
      .in('progress_log_id', historyLogIds)
      .in('exercise_id', exerciseIds) as { data: ExerciseLogRow[] | null }
    exerciseLogs = exLogs ?? []
  }

  const exerciseRows: WeeklyExerciseRow[] = exerciseLogs
    .filter(row => weekLogIds.has(row.progress_log_id))
    .map(row => ({
      exerciseName: Array.isArray(row.exercise)
        ? row.exercise[0]?.name ?? null
        : row.exercise?.name ?? null,
      rpeValues: row.rpe_values,
      note: row.notes,
    }))

  const historyEntries: ExerciseProgressHistoryEntry[] = exerciseLogs.flatMap(row => {
    const completedAt = completedAtByLog.get(row.progress_log_id)
    return completedAt ? [{
      exerciseId: row.exercise_id,
      completedAt,
      weightsKg: row.weights_kg,
      repsCompleted: row.reps_completed,
    }] : []
  })

  return {
    previousWeek: buildWeeklySummary({
      scheduledSessions: workoutIds.length,
      completedSessions: completedWorkoutIds.size,
      exerciseRows,
    }),
    stalledExerciseIds: findStalledExerciseIds(historyEntries),
  }
}

async function loadPlanForEngine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plan: { id: string; name: string; ai_notes: string | null },
): Promise<EvidencePlan | null> {
  type WorkoutRow = {
    id: string
    name: string
    focus: string | null
    order_in_plan: number | null
  }
  type WorkoutExerciseRow = {
    workout_id: string
    exercise_id: string
    order_index: number
    sets: number
    reps: number | null
    duration_seconds: number | null
    rest_seconds: number
    target_rpe: number | null
    weight_kg: number | null
    weight_suggestion_basis: 'user_baseline_pending' | 'estimated_from_profile' | 'based_on_previous_logs' | null
    notes: string | null
  }

  const { data: workouts } = await (supabase.from('workouts') as any)
    .select('id, name, focus, order_in_plan')
    .eq('plan_id', plan.id)
    .order('order_in_plan') as { data: WorkoutRow[] | null }
  if (!workouts?.length) return null

  const { data: rows } = await (supabase.from('workout_exercises') as any)
    .select('workout_id, exercise_id, order_index, sets, reps, duration_seconds, rest_seconds, target_rpe, weight_kg, weight_suggestion_basis, notes')
    .in('workout_id', workouts.map(workout => workout.id))
    .order('order_index') as { data: WorkoutExerciseRow[] | null }

  return {
    display_name: plan.name,
    ai_notes: plan.ai_notes ?? '',
    days: workouts.map((workout, index) => ({
      day_number: index + 1,
      display_name: workout.name,
      focus: workout.focus ?? '',
      exercises: (rows ?? [])
        .filter(row => row.workout_id === workout.id)
        .map(row => ({
          exercise_id: row.exercise_id,
          sets: row.sets,
          reps: row.reps,
          duration_seconds: row.duration_seconds,
          rest_seconds: row.rest_seconds,
          target_rpe: row.target_rpe ?? 7,
          weight_kg: row.weight_kg,
          weight_suggestion_basis: row.weight_suggestion_basis ?? 'user_baseline_pending',
          notes: row.notes,
        })),
    })),
  }
}

// ─── Server Action principal ──────────────────────────────────────────────────

export async function generatePlan(options: GeneratePlanOptions = {}): Promise<GeneratePlanResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }
  const useEvidenceEngine = options.mode === 'plan_adjustment' || usesEvidenceEngine(user.id)

  const mode = options.mode ?? 'initial'
  const replaceExisting = options.replaceExisting ?? mode !== 'initial'
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
    .select('id, name, ai_notes, week_number')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: { id: string; name: string; ai_notes: string | null; week_number: number | null } | null
      error: { message: string } | null
    }

  const nextWeekNumber = mode === 'weekly_regeneration'
    ? Math.max(2, (activePlan?.week_number ?? 1) + 1)
    : mode === 'plan_adjustment' ? activePlan?.week_number ?? 1 : 1

  if (mode === 'plan_adjustment' && (!activePlan || !options.adjustmentIntent)) {
    return { success: false, error: 'No hay un plan activo o una intención válida para ajustar.' }
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
    language:                  'es' | 'en'
    cardio_preferences:       CardioModality[]
    readiness_status:         ReadinessProfile['status']
    readiness_answers:        Json
    movement_limitations:     Json
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      fitness_level, primary_goal, days_per_week, session_duration_minutes,
      gym_type, available_equipment, injuries, gender, weight_kg,
      date_of_birth, preferred_workout_days, language, cardio_preferences,
      readiness_status, readiness_answers, movement_limitations
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
    injuries:                 useEvidenceEngine ? '' : profile.injuries ?? '',
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

  if (useEvidenceEngine) {
    const [regenerationContext, previousPlan] = await Promise.all([
      mode === 'weekly_regeneration' && activePlan
        ? buildRegenerationContext(supabase, user.id, activePlan.id)
        : Promise.resolve(null),
      mode !== 'initial' && activePlan
        ? loadPlanForEngine(supabase, activePlan)
        : Promise.resolve(null),
    ])

    const engineExercises: EngineExercise[] = exercises.map(exercise => ({
      id: exercise.id,
      name: exercise.name,
      muscleGroups: exercise.muscle_groups,
      equipment: exercise.equipment,
      exerciseType: (['strength', 'cardio', 'flexibility', 'balance', 'hiit'].includes(exercise.exercise_type)
        ? exercise.exercise_type
        : 'strength') as EngineExercise['exerciseType'],
      difficulty: exercise.difficulty === 'beginner' || exercise.difficulty === 'intermediate' || exercise.difficulty === 'advanced'
        ? exercise.difficulty
        : null,
      isCompound: exercise.is_compound,
      movementPatterns: (exercise.movement_patterns ?? []) as MovementPattern[],
      cardioModality: (exercise.cardio_modality ?? null) as CardioModality | null,
      impactLevel: exercise.impact_level === 'low' || exercise.impact_level === 'moderate' || exercise.impact_level === 'high'
        ? exercise.impact_level
        : null,
      jointStressTags: exercise.joint_stress_tags ?? [],
    }))

    const previousWeek = regenerationContext?.previousWeek ?? null
    const regenerationHistory: RegenerationHistory | null = previousWeek ? {
      scheduledSessions: previousWeek.scheduledSessions,
      completedSessions: previousWeek.completedSessions,
      adherenceRatio: previousWeek.adherenceRatio,
      avgRpe: previousWeek.avgRpe,
      painReported: previousWeek.skippedExercises.some(item => /dolor|pain/i.test(item.lastReason ?? '')),
      stalledExerciseIds: regenerationContext?.stalledExerciseIds ?? [],
    } : null

    const engineInput = {
      seed: `${user.id}:week:${nextWeekNumber}`,
      weekNumber: nextWeekNumber,
      exercises: engineExercises,
      previousPlan: previousPlan ? { plan: previousPlan } : null,
      history: regenerationHistory,
      profile: {
        language: profile.language ?? 'es',
        fitnessLevel: profile.fitness_level,
        primaryGoal: profile.primary_goal as UserContext['primary_goal'],
        daysPerWeek: profile.days_per_week,
        sessionDurationMinutes: profile.session_duration_minutes ?? 60,
        gymType: profile.gym_type ?? 'full_gym',
        availableEquipment: profile.available_equipment ?? [],
        preferredWorkoutDays: profile.preferred_workout_days,
        cardioPreferences: profile.cardio_preferences ?? [],
        age,
        readiness: parseReadiness(
          profile.readiness_status ?? 'pending',
          profile.readiness_answers ?? {},
          profile.movement_limitations ?? [],
        ),
      },
    }

    const adjustmentPreview = mode === 'plan_adjustment' && options.adjustmentIntent && previousPlan
      ? previewPlanAdjustment(engineInput, previousPlan, options.adjustmentIntent)
      : null
    const engineResult = adjustmentPreview
      ? adjustmentPreview.result
      : mode === 'weekly_regeneration'
        ? regenerateEvidencePlan(engineInput)
        : generateEvidencePlan(engineInput)

    if (!engineResult.success || !engineResult.plan) {
      await recordEvidenceGenerationFailure(
        supabase,
        mode,
        engineResult.metadata.engineVersion,
        engineResult.issues[0]?.code ?? 'engine_validation',
        { issues: engineResult.issues as unknown as Json },
      )
      return {
        success: false,
        error: engineResult.issues[0]?.message ?? 'No se pudo crear un plan válido.',
        generator: 'evidence_engine',
        engineVersion: engineResult.metadata.engineVersion,
        evidenceVersion: engineResult.metadata.evidenceVersion,
        requiresReadinessReview: engineResult.requiresReadinessReview,
      }
    }

    if (options.previewOnly) {
      return {
        success: true,
        planName: engineResult.plan.display_name,
        daysCount: engineResult.plan.days.length,
        weekNumber: nextWeekNumber,
        generator: 'evidence_engine',
        engineVersion: engineResult.metadata.engineVersion,
        evidenceVersion: engineResult.metadata.evidenceVersion,
        previewDiff: adjustmentPreview?.diff ?? undefined,
        warnings: adjustmentPreview?.warnings ?? engineResult.metadata.warnings,
      }
    }

    const isoDays = assignIsoDays(engineResult.plan.days.length, profile.preferred_workout_days)
    const transactionalPlan = {
      ...engineResult.plan,
      goal: profile.primary_goal,
      difficulty: profile.fitness_level,
      days: engineResult.plan.days.map((day, dayIndex) => ({
        ...day,
        day_of_week: isoDays[dayIndex] ?? dayIndex + 1,
        estimated_duration_minutes: estimateDayMinutes(day),
        exercises: day.exercises.map((exercise, exerciseIndex) => ({
          ...exercise,
          order_index: exerciseIndex + 1,
        })),
      })),
    }

    const profileUpdates: Record<string, Json> = {}
    const intent = options.adjustmentIntent
    if (mode === 'plan_adjustment' && intent) {
      if (intent.type === 'change_days') {
        profileUpdates.days_per_week = intent.daysPerWeek
        profileUpdates.preferred_workout_days = intent.preferredWorkoutDays ?? []
      } else if (intent.type === 'change_duration') {
        profileUpdates.session_duration_minutes = intent.sessionDurationMinutes
      } else if (intent.type === 'equipment_unavailable') {
        const unavailable = new Set(intent.equipment)
        profileUpdates.available_equipment = (profile.available_equipment ?? []).filter(item => !unavailable.has(item))
      } else if (intent.type === 'change_cardio_preferences') {
        profileUpdates.cardio_preferences = intent.cardioPreferences
      }
    }

    const { data: newPlanId, error: rpcError } = await (supabase.rpc as any)('create_engine_plan', {
      p_plan: transactionalPlan as unknown as Json,
      p_metadata: engineResult.metadata as unknown as Json,
      p_week_number: nextWeekNumber,
      p_plan_context: mode === 'weekly_regeneration'
        ? 'weekly_regeneration'
        : mode === 'plan_adjustment' ? 'manual_update' : 'first_plan',
      p_parent_plan_id: mode === 'initial' ? null : activePlan?.id ?? null,
      p_profile_updates: profileUpdates,
    })

    if (rpcError || !newPlanId) {
      await recordEvidenceGenerationFailure(
        supabase,
        mode,
        engineResult.metadata.engineVersion,
        rpcError?.message?.includes('PLAN_RATE_LIMIT') ? 'rate_limit' : 'persistence',
      )
      console.error('[generatePlan] create_engine_plan falló:', rpcError)
      if (rpcError?.message?.includes('PLAN_RATE_LIMIT')) {
        return {
          success: false,
          error: mode === 'weekly_regeneration'
            ? 'Alcanzaste el limite de 2 regeneraciones en 7 dias.'
            : 'Alcanzaste el limite de 3 generaciones en 24 horas.',
        }
      }
      return { success: false, error: 'Error al guardar el plan. El plan anterior no fue modificado.' }
    }

    if (createPolicy.replacingExisting) {
      await pruneExcessPlansForFreeUser(supabase, user.id, newPlanId, activePlan?.id)
    }

    await recordEvidenceGenerationSuccess(supabase, newPlanId)

    return {
      success: true,
      planId: newPlanId,
      planName: engineResult.plan.display_name,
      daysCount: engineResult.plan.days.length,
      weekNumber: nextWeekNumber,
      isMock: false,
      generator: 'evidence_engine',
      engineVersion: engineResult.metadata.engineVersion,
      evidenceVersion: engineResult.metadata.evidenceVersion,
    }
  }

  const [userLimit, globalBudget] = await Promise.all([
    checkUserRateLimit(user.id, operation),
    checkGlobalDailyBudget(),
  ])
  if (!userLimit.allowed) {
    return {
      success: false,
      error: userLimit.reason,
      rateLimitedUntil: userLimit.retryAfter?.toISOString(),
      generator: 'legacy_ai',
    }
  }
  if (!globalBudget.allowed) {
    return { success: false, error: globalBudget.reason, generator: 'legacy_ai' }
  }

  // Contexto de periodización: fase del ciclo + rendimiento de la semana
  // anterior. Solo aplica en regeneraciones semanales.
  let weekContext: WeekContext | undefined
  if (mode === 'weekly_regeneration') {
    const previousWeek = activePlan
      ? (await buildRegenerationContext(supabase, user.id, activePlan.id)).previousWeek
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
    await pruneExcessPlansForFreeUser(supabase, user.id, newPlan.id, activePlan?.id)
  }

  return {
    success:   true,
    planId:    newPlan.id,
    planName:  plan.display_name,
    daysCount: plan.days.length,
    weekNumber: nextWeekNumber,
    isMock:    result.isMock,
    generator: 'legacy_ai',
  }
}
