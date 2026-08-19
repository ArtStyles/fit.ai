import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { DashboardMainNotice, DashboardNotice } from '@/components/dashboard/DashboardNotice'
import { DashboardWeekJourney } from '@/components/dashboard/DashboardWeekJourney'
import { buildDashboardViewModel } from '@/components/dashboard/dashboardViewModel'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import {
  addDays as addCalendarDays,
  getIsoWeekday,
  getLocalDateString,
  getWeekMonday as getCurrentWeekMonday,
  resolveUserTimeZone,
  WORKOUT_ACCESS_POLICY,
} from '@/lib/workouts/schedule'
import { generateDailyBrief } from '@/lib/ai/mock-briefGenerator'
import { isCheckInDue } from '@/lib/profile/checkin'
import type { BannerContext } from '@/components/dashboard/AINotesBanner'
import type { Database } from '@/types/database'
import { exerciseLanguage, type ExerciseLanguage } from '@/lib/exercises/localization'
import { resolveHistoricalExercisePresentation } from '@/lib/exercises/historyPresentation'
import { createTranslator } from '@/lib/i18n'
import { buildDashboardFallbackHistory } from '@/lib/dashboard/historyEvidence'
import { resolveDashboardProfileHref } from '@/lib/dashboard/profileNavigation'
import { buildWeekContinuity } from '@/lib/dashboard/weekContinuity'
import { isCommunityEnabled } from '@/lib/features/community'
import { toCompletedSessionPresentation, type CompletedSessionWorkoutRelation } from '@/lib/session/historyRows'
import {
  DASHBOARD_BANNER_SLOT,
  isDashboardBannerVisible,
  type DashboardBannerData,
} from '@/lib/dashboard/banner'
import { getDashboardGreeting } from '@/components/dashboard/dashboardFormatters'

export const metadata = { title: 'Dashboard · Vekira' }

function getBannerContext(
  plan: PlanRow | null,
  hasCompletedSessions: boolean,
): BannerContext {
  const weekNumber = plan?.week_number ?? null

  if (plan?.plan_context === 'manual_update') return 'manual_update'
  if (plan?.plan_context === 'weekly_regeneration') return 'weekly_regeneration'
  if (weekNumber === 1 && !hasCompletedSessions) return 'first_plan'
  if (weekNumber !== null && weekNumber > 1) return 'weekly_regeneration'
  if (weekNumber === null && !hasCompletedSessions) return 'first_plan'
  return 'manual_update'
}

// ─── Tipos de datos del dashboard ─────────────────────────────────────────────

export interface WorkoutSummary {
  id:                          string
  name:                        string
  focus:                       string | null
  day_of_week:                 number | null
  order_in_plan:               number | null
  estimated_duration_minutes:  number | null
  exercise_count:              number
  progression_suggestion_count: number
}

/**
 * Legacy calendar contract retained while the dashboard journey uses the
 * continuity projection in `weekContinuity.ts`.
 */
export interface DayData {
  isoDay: number
  dateStr: string
  workout: WorkoutSummary | null
  isCompleted: boolean
  isToday: boolean
  isRecoverable: boolean
  completedDurationMinutes: number | null
  completedLogId: string | null
}

type WorkoutPayloadSummary = Omit<WorkoutSummary, 'progression_suggestion_count'> & {
  progression_suggestion_count?: number | null
}

type SupabaseServerClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type PlanRow = {
  id: string
  name: string
  ai_notes: string | null
  created_at: string
  week_number: number | null
  plan_context: BannerContext | null
}

type WeekLogRow = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  session_context_snapshot?: unknown
  workout?: CompletedSessionWorkoutRelation | CompletedSessionWorkoutRelation[] | null
}

type ExerciseProgressRow = {
  progress_log_id: string
  exercise_id: string | null
  weights_kg: number[] | null
  reps_completed: number[] | null
  exercise: { name: string; name_es: string | null } | { name: string; name_es: string | null }[] | null
}

type TopRecordHighlight = {
  logId: string
  exerciseId: string
  exerciseName: string
  maxWeightKg: number
  repsAtMaxWeight: number
} | null

type DashboardPayload = {
  planRaw: PlanRow | null
  workouts: WorkoutSummary[]
  allRecentLogs: WeekLogRow[]
  weekLogs: WeekLogRow[]
  weekVolumeKg: number
  hasCompletedSessions: boolean
}

type DashboardRpc = Database['public']['Functions']['get_dashboard_payload']

type DashboardRpcClient = {
  rpc: (
    functionName: 'get_dashboard_payload',
    args: DashboardRpc['Args'],
  ) => Promise<{ data: DashboardRpc['Returns'] | null; error: { message?: string } | null }>
}

function normalizeWorkouts(workouts: WorkoutPayloadSummary[]): WorkoutSummary[] {
  return workouts.map(workout => ({
    ...workout,
    name: getWorkoutDisplayName(workout.name, workout.focus),
    exercise_count: Number(workout.exercise_count ?? 0),
    progression_suggestion_count: Number(workout.progression_suggestion_count ?? 0),
  }))
}

async function attachProgressionCounts(
  supabase: SupabaseServerClient,
  workouts: WorkoutSummary[],
): Promise<WorkoutSummary[]> {
  const workoutIds = workouts.map(workout => workout.id)
  if (workoutIds.length === 0) return workouts

  const { data } = await supabase
    .from('workout_exercises')
    .select('workout_id')
    .in('workout_id', workoutIds)
    .eq('weight_suggestion_basis', 'based_on_previous_logs') as unknown as {
      data: { workout_id: string }[] | null
    }

  const counts = (data ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.workout_id] = (acc[row.workout_id] ?? 0) + 1
    return acc
  }, {})

  return workouts.map(workout => ({
    ...workout,
    progression_suggestion_count: counts[workout.id] ?? 0,
  }))
}

async function loadDashboardFallback(
  supabase: SupabaseServerClient,
  userId: string,
  weekStart: Date,
  recentStart: Date,
): Promise<DashboardPayload> {
  const [
    { data: legacyPlanRaw },
    { data: recentLogs },
    { data: completedHistoryRows },
  ] = await Promise.all([
    supabase
      .from('workout_plans')
      .select('id, name, ai_notes, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle() as unknown as Promise<{
        data: Omit<PlanRow, 'week_number' | 'plan_context'> | null
      }>,
    supabase
      .from('progress_logs')
      .select('id, workout_id, completed_at, duration_minutes, session_context_snapshot, workout:workouts(name, focus)')
      .eq('user_id', userId)
      .gte('completed_at', recentStart.toISOString())
      .order('completed_at', { ascending: false })
      .order('id', { ascending: false }) as unknown as Promise<{ data: WeekLogRow[] | null }>,
    supabase
      .from('progress_logs')
      .select('id')
      .eq('user_id', userId)
      .limit(1) as unknown as Promise<{ data: { id: string }[] | null }>,
  ])

  const planRaw: PlanRow | null = legacyPlanRaw
    ? { ...legacyPlanRaw, week_number: null, plan_context: null }
    : null

  let workouts: WorkoutSummary[] = []

  if (planRaw) {
    const { data: wRows } = await supabase
      .from('workouts')
      .select('id, name, focus, day_of_week, order_in_plan, estimated_duration_minutes')
      .eq('plan_id', planRaw.id)
      .order('order_in_plan') as unknown as {
        data: Omit<WorkoutSummary, 'exercise_count' | 'progression_suggestion_count'>[] | null
      }

    const wids = (wRows ?? []).map(w => w.id)
    const exCounts: Record<string, number> = {}

    if (wids.length > 0) {
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('workout_id')
        .in('workout_id', wids) as unknown as { data: { workout_id: string }[] | null }

      for (const row of exRows ?? []) {
        exCounts[row.workout_id] = (exCounts[row.workout_id] ?? 0) + 1
      }
    }

    workouts = normalizeWorkouts((wRows ?? []).map(workout => ({
      ...workout,
      exercise_count: exCounts[workout.id] ?? 0,
      progression_suggestion_count: 0,
    })))
  }

  const history = buildDashboardFallbackHistory(recentLogs ?? [], weekStart)
  const { allRecentLogs, weekLogs } = history
  const logIds = weekLogs.map(log => log.id)
  let weekVolumeKg = 0

  if (logIds.length > 0) {
    const { data: exLogs } = await supabase
      .from('exercise_logs')
      .select('weights_kg, reps_completed')
      .in('progress_log_id', logIds) as unknown as {
        data: { weights_kg: number[] | null; reps_completed: number[] | null }[] | null
      }

    for (const exerciseLog of exLogs ?? []) {
      const weights = exerciseLog.weights_kg ?? []
      const reps = exerciseLog.reps_completed ?? []
      for (let i = 0; i < weights.length; i++) {
        weekVolumeKg += (weights[i] ?? 0) * (reps[i] ?? 0)
      }
    }
  }

  return {
    planRaw,
    workouts,
    allRecentLogs,
    weekLogs,
    weekVolumeKg,
    hasCompletedSessions: history.hasCompletedSessions || (completedHistoryRows?.length ?? 0) > 0,
  }
}

async function loadDashboardPayload(
  supabase: SupabaseServerClient,
  userId: string,
  weekStart: Date,
  recentStart: Date,
): Promise<DashboardPayload> {
  const { data, error } = await (supabase as unknown as DashboardRpcClient)
    .rpc('get_dashboard_payload', {
      p_week_start: weekStart.toISOString(),
      p_recent_start: recentStart.toISOString(),
    })

  if (!error && data) {
    return {
      planRaw: data.active_plan ?? null,
      workouts: normalizeWorkouts(data.workouts ?? []),
      allRecentLogs: data.recent_logs ?? [],
      weekLogs: data.week_logs ?? [],
      weekVolumeKg: Number(data.week_volume_kg ?? 0),
      hasCompletedSessions: Boolean(data.has_completed_sessions),
    }
  }

  return loadDashboardFallback(supabase, userId, weekStart, recentStart)
}

type RecentInsights = {
  topRecord:    TopRecordHighlight
  volumeSeries: number[]
}

async function loadRecentInsights(
  supabase: SupabaseServerClient,
  recentLogs: WeekLogRow[],
  language: ExerciseLanguage,
  fallbackExerciseName: string,
): Promise<RecentInsights> {
  const logIds = recentLogs.map(log => log.id)
  if (logIds.length === 0) return { topRecord: null, volumeSeries: [] }

  const { data } = await supabase
    .from('exercise_logs')
    .select('progress_log_id, exercise_id, weights_kg, reps_completed, exercise:exercises(name, name_es)')
    .in('progress_log_id', logIds) as unknown as { data: ExerciseProgressRow[] | null }

  let best: NonNullable<TopRecordHighlight> | null = null
  const volumeByLog = new Map<string, number>()
  const logById = new Map(recentLogs.map(log => [log.id, log]))

  for (const row of data ?? []) {
    const weights = row.weights_kg ?? []
    const reps = row.reps_completed ?? []

    // ── Volumen acumulado por sesión (peso × reps) ─────────────────────────
    let logVolume = volumeByLog.get(row.progress_log_id) ?? 0
    for (let i = 0; i < weights.length; i++) {
      logVolume += (Number(weights[i]) || 0) * (Number(reps[i]) || 0)
    }
    volumeByLog.set(row.progress_log_id, logVolume)

    // ── Mejor marca personal ───────────────────────────────────────────────
    const log = logById.get(row.progress_log_id)
    if (!row.exercise_id || !log) continue
    const liveExercise = Array.isArray(row.exercise) ? row.exercise[0] ?? null : row.exercise
    const exerciseName = resolveHistoricalExercisePresentation({
      exerciseId: row.exercise_id,
      sessionContextSnapshot: log.session_context_snapshot ?? null,
      liveExercise,
      language,
      fallbackExerciseName,
    }).name

    const maxWeightKg = weights.reduce((max, weight) => Math.max(max, Number(weight) || 0), 0)
    const maxWeightIndex = weights.findIndex(weight => (Number(weight) || 0) === maxWeightKg)
    const repsAtMaxWeight = Number(reps[maxWeightIndex] ?? 0) || 0

    if (maxWeightKg <= 0 && repsAtMaxWeight <= 0) continue

    if (
      !best ||
      maxWeightKg > best.maxWeightKg ||
      (maxWeightKg === best.maxWeightKg && repsAtMaxWeight > best.repsAtMaxWeight)
    ) {
      best = {
        logId: row.progress_log_id,
        exerciseId: row.exercise_id,
        exerciseName,
        maxWeightKg,
        repsAtMaxWeight,
      }
    }
  }

  // recentLogs viene en orden descendente (reciente → antiguo); lo invertimos
  // para obtener una serie cronológica de las últimas 10 sesiones con carga.
  const volumeSeries = [...recentLogs]
    .reverse()
    .map(log => Math.round(volumeByLog.get(log.id) ?? 0))
    .filter(volume => volume > 0)
    .slice(-10)

  return { topRecord: best, volumeSeries }
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const communityEnabled = isCommunityEnabled()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)
  const referenceNow = new Date()

  // ── Perfil del usuario ─────────────────────────────────────────────────────
  const firstName = profile?.full_name?.split(' ')[0]
    ?? user.email?.split('@')[0]
    ?? t('Campeón')

  const tz        = resolveUserTimeZone(profile?.timezone)
  const todayIso  = getIsoWeekday(referenceNow, tz)
  const weekStart = getCurrentWeekMonday(referenceNow, tz)
  const todayStr  = getLocalDateString(referenceNow, tz)
  const dateLabel = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  }).format(referenceNow)

  // ── Plan activo ────────────────────────────────────────────────────────────
  const [dashboardPayload, { data: bannerRaw }] = await Promise.all([
    loadDashboardPayload(
      supabase,
      user.id,
      weekStart,
      addCalendarDays(referenceNow, -30, tz),
    ),
    supabase
      .from('dashboard_banners')
      .select('slot, kind, title, description, image_url, cta_label, cta_href, status, starts_on, ends_on, updated_at')
      .eq('slot', DASHBOARD_BANNER_SLOT)
      .maybeSingle(),
  ])
  const bannerCandidate = bannerRaw as DashboardBannerData | null
  const dashboardBanner = isDashboardBannerVisible(bannerCandidate, todayStr)
    ? bannerCandidate
    : null
  const {
    planRaw,
    allRecentLogs,
    weekLogs,
    weekVolumeKg,
    hasCompletedSessions,
  } = dashboardPayload
  const workouts = await attachProgressionCounts(supabase, dashboardPayload.workouts)
  const { topRecord: topRecordHighlight, volumeSeries } = await loadRecentInsights(
    supabase,
    allRecentLogs,
    language,
    t('Ejercicio'),
  )
  const workoutById = new Map<string, CompletedSessionWorkoutRelation>(workouts.map(workout => [
    workout.id,
    { name: workout.name, focus: workout.focus },
  ]))
  const latestCompletedSession = allRecentLogs[0]
  const latestSessionPresentation = latestCompletedSession
    ? toCompletedSessionPresentation({
        ...latestCompletedSession,
        session_context_snapshot: latestCompletedSession.session_context_snapshot ?? null,
        workout: latestCompletedSession.workout_id
          ? latestCompletedSession.workout ?? workoutById.get(latestCompletedSession.workout_id) ?? null
          : latestCompletedSession.workout ?? null,
      }, t('Entrenamiento'))
    : null
  const latestSession = latestCompletedSession
    ? {
        id: latestCompletedSession.id,
        workoutName: getWorkoutDisplayName(
          latestSessionPresentation!.workoutName,
          latestSessionPresentation!.focus,
        ),
        completedAt: latestCompletedSession.completed_at,
        durationMinutes: latestCompletedSession.duration_minutes,
      }
    : null
  const activeAdjustmentCount = workouts.reduce(
    (sum, workout) => sum + workout.progression_suggestion_count,
    0,
  )

  // ── Workouts del plan + conteo de ejercicios ───────────────────────────────
  // ── Datos de esta semana ───────────────────────────────────────────────────
  // ── Volumen semanal ────────────────────────────────────────────────────────
  // ── Racha (30 días hacia atrás) ────────────────────────────────────────────
  let streak = 0
  if (allRecentLogs.length > 0) {
    const logDateSet = new Set(allRecentLogs.map(l => getLocalDateString(new Date(l.completed_at), tz)))
    let check = referenceNow
    while (logDateSet.has(getLocalDateString(check, tz))) {
      streak++
      check = addCalendarDays(check, -1, tz)
    }
  }

  // ── Workout de hoy + si ya está completado ─────────────────────────────────
  const todayWorkout = workouts.find(w => w.day_of_week === todayIso) ?? null

  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(weekStart, index, tz)
    return {
      isoDay: index + 1,
      dateStr: getLocalDateString(date, tz),
    }
  })
  const continuityDays = buildWeekContinuity({
    activeWorkouts: workouts,
    weekLogs: weekLogs.map(log => ({
      ...log,
      session_context_snapshot: log.session_context_snapshot ?? null,
      workout: log.workout ?? null,
    })),
    dates: weekDates,
    today: todayStr,
    timeZone: tz,
    fallbackWorkoutName: t('Entrenamiento'),
  })
  const todayContinuity = continuityDays.find(day => day.isToday) ?? null

  // ── Siguiente workout (para día de descanso) ───────────────────────────────
  const nextWorkoutDay = Array.from({ length: 7 }, (_, i) => {
    const iso = ((todayIso - 1 + i + 1) % 7) + 1
    return { iso, workout: workouts.find(w => w.day_of_week === iso) ?? null }
  }).find(d => d.iso !== todayIso && d.workout)

  // ── Datos del calendario semanal ──────────────────────────────────────────
  const hasSessionToday = Boolean(todayContinuity?.hasTrainingEvidence)

  const weekDays = continuityDays.map(day => {
    const daysLate = todayIso - day.isoDay
    return {
      ...day,
      isRecoverable: Boolean(day.scheduledWorkout) && day.canStartScheduledWorkout && !hasSessionToday &&
        daysLate >= 1 && daysLate <= WORKOUT_ACCESS_POLICY.missedWorkoutRecoveryDays,
    }
  })

  const recoverableDay = weekDays.find(day => day.isRecoverable) ?? null

  // ── Quick stats ────────────────────────────────────────────────────────────
  const sessionsThisWeek   = weekLogs.length
  const scheduledThisWeek  = workouts.length

  const bannerContext = getBannerContext(planRaw, hasCompletedSessions)

  // Banner del plan: usa ai_notes como columna legacy para notas del motor o de IA.
  const showAiBanner = !!(
    planRaw?.ai_notes &&
    new Date(planRaw.created_at).getTime() > addCalendarDays(referenceNow, -7, tz).getTime()
  )

  // ── Brief diario personalizado (sólo cuando hay un plan activo) ────────────
  const dailyBriefMessage = planRaw
    ? generateDailyBrief({
        firstName,
        streak,
        todayWorkout: todayWorkout
          ? { name: todayWorkout.name, exercise_count: todayWorkout.exercise_count }
          : null,
        isCompletedToday:  hasSessionToday,
        progressionCount:  activeAdjustmentCount,
        topRecord:         topRecordHighlight
          ? { exerciseName: topRecordHighlight.exerciseName, maxWeightKg: topRecordHighlight.maxWeightKg }
          : null,
        weekSessions:      sessionsThisWeek,
        scheduledSessions: scheduledThisWeek,
      }, {
        locale: language,
        variantSeed: Number(todayStr.slice(-2)),
      })
    : null

  const dashboard = buildDashboardViewModel({
    needsPlan: !planRaw,
    checkInDue: isCheckInDue(profile?.last_check_in_at ?? null),
    aiNotes: showAiBanner ? planRaw?.ai_notes ?? null : null,
    promo: dashboardBanner ? { title: dashboardBanner.title } : null,
    todayWorkout,
    isCompletedToday: Boolean(todayContinuity?.isScheduledWorkoutCompleted),
    hasSessionToday,
    nextWorkout: nextWorkoutDay?.workout ?? null,
    nextWorkoutIsoDay: nextWorkoutDay?.iso ?? null,
    recoverableWorkout: recoverableDay?.scheduledWorkout ?? null,
    recoverableIsoDay: recoverableDay?.isoDay ?? null,
    weekDays,
    sessionsThisWeek,
    scheduledThisWeek,
    streak,
    weekVolumeKg,
    volumeSeries,
    hasCompletedSessions,
    dailyBriefMessage,
    latestSession,
    topRecord: topRecordHighlight,
    activeAdjustmentCount,
    timeZone: tz,
    referenceInstant: referenceNow.toISOString(),
  })

  return (
    <div className="min-h-screen bg-background pb-28">
      <DashboardHeader
        greeting={getDashboardGreeting(language, referenceNow, tz)}
        firstName={firstName}
        dateLabel={dateLabel}
        avatarUrl={profile?.avatar_url ?? null}
        profileHref={resolveDashboardProfileHref({
          communityEnabled,
          username: profile.username,
        })}
        noticeLabel={t('Notificaciones')}
        noticeContent={dashboard.noticePlacement === 'hub' ? (
          <DashboardNotice
            notice={dashboard.notice}
            aiNotes={showAiBanner ? planRaw?.ai_notes ?? null : null}
            planName={planRaw?.name ?? null}
            bannerContext={bannerContext}
            promo={dashboardBanner}
            placement="hub"
          />
        ) : null}
      />

      <main aria-label={t('Dashboard')} data-marketing-capture="dashboard" className="mx-auto max-w-6xl space-y-6 px-4 pt-5 sm:px-6">
        <h1 className="sr-only">{t('Dashboard')}</h1>
        {dashboard.noticePlacement !== 'hub' && (
          <DashboardMainNotice
            notice={dashboard.notice}
            aiNotes={showAiBanner ? planRaw?.ai_notes ?? null : null}
            planName={planRaw?.name ?? null}
            bannerContext={bannerContext}
            promo={dashboardBanner}
            placement={dashboard.noticePlacement ?? 'inline'}
          />
        )}
        <DashboardWeekJourney dashboard={dashboard} />
      </main>
    </div>
  )
}
