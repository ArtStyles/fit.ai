import { DashboardHeader }    from '@/components/dashboard/DashboardHeader'
import { HeroCard }           from '@/components/dashboard/HeroCard'
import { WeekCalendar }       from '@/components/dashboard/WeekCalendar'
import { QuickStats }         from '@/components/dashboard/QuickStats'
import { AINotesBanner }      from '@/components/dashboard/AINotesBanner'
import { CheckInBanner }      from '@/components/dashboard/CheckInBanner'
import { ProgressHighlights } from '@/components/dashboard/ProgressHighlights'
import { DailyBrief }         from '@/components/dashboard/DailyBrief'
import { PendingLink }        from '@/components/navigation/PendingLink'
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
import { createTranslator } from '@/lib/i18n'

export const metadata = { title: 'Dashboard · FitAI' }

function getGreeting(language: ExerciseLanguage): string {
  const t = createTranslator(language)
  const h = new Date().getHours()
  if (h < 12) return t('Buenos días')
  if (h < 19) return t('Buenas tardes')
  return t('Buenas noches')
}

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

type WorkoutPayloadSummary = Omit<WorkoutSummary, 'progression_suggestion_count'> & {
  progression_suggestion_count?: number | null
}

export interface DayData {
  isoDay:                   number        // 1=Lun … 7=Dom
  dateStr:                  string        // YYYY-MM-DD
  workout:                  WorkoutSummary | null
  isCompleted:              boolean
  isToday:                  boolean
  isRecoverable:            boolean       // perdida pero dentro de la ventana de recuperación
  completedDurationMinutes: number | null
  completedLogId:           string | null // ID del log para navegar al historial
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
      .select('id, workout_id, completed_at, duration_minutes')
      .eq('user_id', userId)
      .not('workout_id', 'is', null)
      .gte('completed_at', recentStart.toISOString())
      .order('completed_at', { ascending: false }) as unknown as Promise<{ data: WeekLogRow[] | null }>,
    supabase
      .from('progress_logs')
      .select('id')
      .eq('user_id', userId)
      .not('workout_id', 'is', null)
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

  const allRecentLogs = recentLogs ?? []
  const weekLogs = allRecentLogs.filter(log => log.completed_at >= weekStart.toISOString())
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
    hasCompletedSessions: allRecentLogs.length > 0 || (completedHistoryRows?.length ?? 0) > 0,
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

function getExerciseName(row: ExerciseProgressRow, language: ExerciseLanguage): string | null {
  const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
  if (!exercise) return null
  return language === 'es' ? exercise.name_es?.trim() || exercise.name : exercise.name
}

type RecentInsights = {
  topRecord:    TopRecordHighlight
  volumeSeries: number[]
}

async function loadRecentInsights(
  supabase: SupabaseServerClient,
  recentLogs: WeekLogRow[],
  language: ExerciseLanguage,
): Promise<RecentInsights> {
  const logIds = recentLogs.map(log => log.id)
  if (logIds.length === 0) return { topRecord: null, volumeSeries: [] }

  const { data } = await supabase
    .from('exercise_logs')
    .select('progress_log_id, exercise_id, weights_kg, reps_completed, exercise:exercises(name, name_es)')
    .in('progress_log_id', logIds) as unknown as { data: ExerciseProgressRow[] | null }

  let best: NonNullable<TopRecordHighlight> | null = null
  const volumeByLog = new Map<string, number>()

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
    const exerciseName = getExerciseName(row, language)
    if (!exerciseName || !row.exercise_id) continue

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
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)

  // ── Perfil del usuario ─────────────────────────────────────────────────────
  const firstName = profile?.full_name?.split(' ')[0]
    ?? user.email?.split('@')[0]
    ?? t('Campeón')

  const tz        = resolveUserTimeZone(profile?.timezone)
  const todayIso  = getIsoWeekday(new Date(), tz)
  const weekStart = getCurrentWeekMonday(new Date(), tz)
  const todayStr  = getLocalDateString(new Date(), tz)

  // ── Plan activo ────────────────────────────────────────────────────────────
  const dashboardPayload = await loadDashboardPayload(
    supabase,
    user.id,
    weekStart,
    addCalendarDays(new Date(), -30, tz),
  )
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
  )
  const workoutNameById = new Map(workouts.map(workout => [workout.id, workout.name]))
  const latestCompletedSession = allRecentLogs[0]
  const latestSession = latestCompletedSession
    ? {
        id: latestCompletedSession.id,
        workoutName: latestCompletedSession.workout_id
          ? workoutNameById.get(latestCompletedSession.workout_id) ?? t('Entrenamiento')
          : t('Entrenamiento'),
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
    let check = new Date()
    while (logDateSet.has(getLocalDateString(check, tz))) {
      streak++
      check = addCalendarDays(check, -1, tz)
    }
  }

  // ── Workout de hoy + si ya está completado ─────────────────────────────────
  const todayWorkout = workouts.find(w => w.day_of_week === todayIso) ?? null

  const todayLog = weekLogs.find(l =>
    l.workout_id === todayWorkout?.id &&
    getLocalDateString(new Date(l.completed_at), tz) === todayStr,
  )

  // ── Siguiente workout (para día de descanso) ───────────────────────────────
  const nextWorkoutDay = Array.from({ length: 7 }, (_, i) => {
    const iso = ((todayIso - 1 + i + 1) % 7) + 1
    return { iso, workout: workouts.find(w => w.day_of_week === iso) ?? null }
  }).find(d => d.iso !== todayIso && d.workout)

  // ── Datos del calendario semanal ──────────────────────────────────────────
  const hasSessionToday = weekLogs.some(l =>
    getLocalDateString(new Date(l.completed_at), tz) === todayStr,
  )

  const weekDays: DayData[] = Array.from({ length: 7 }, (_, i) => {
    const date    = addCalendarDays(weekStart, i, tz)
    const dateStr = getLocalDateString(date, tz)
    const iso     = i + 1
    const workout = workouts.find(w => w.day_of_week === iso) ?? null
    // Una sesión recuperada cuenta para el día programado de la rutina,
    // aunque se haya registrado uno o dos días más tarde.
    const log     = workout
      ? weekLogs.find(l => l.workout_id === workout.id)
      : undefined
    const daysLate = todayIso - iso
    return {
      isoDay: iso,
      dateStr,
      workout,
      isCompleted: !!log,
      isToday: iso === todayIso,
      isRecoverable: !!workout && !log && !hasSessionToday &&
        daysLate >= 1 && daysLate <= WORKOUT_ACCESS_POLICY.missedWorkoutRecoveryDays,
      completedDurationMinutes: log?.duration_minutes ?? null,
      completedLogId: log?.id ?? null,
    }
  })

  const recoverableDay = weekDays.find(d => d.isRecoverable) ?? null

  // ── Quick stats ────────────────────────────────────────────────────────────
  const sessionsThisWeek   = weekLogs.filter(l => l.workout_id !== null).length
  const scheduledThisWeek  = workouts.length

  const bannerContext = getBannerContext(planRaw, hasCompletedSessions)

  // ── Banner de IA: si el plan tiene ai_notes y se creó en los últimos 7 días ─
  const showAiBanner = !!(
    planRaw?.ai_notes &&
    new Date(planRaw.created_at).getTime() > addCalendarDays(new Date(), -7, tz).getTime()
  )

  // ── Momentum Score (0-100) ────────────────────────────────────────────────
  const momentumScore = Math.min(100, Math.round(
    Math.min(streak * 4, 40) +
    (scheduledThisWeek > 0 ? (sessionsThisWeek / scheduledThisWeek) * 40 : 0) +
    Math.min(weekVolumeKg / 500 * 20, 20),
  ))

  // ── Brief diario personalizado (sólo cuando hay un plan activo) ────────────
  const dailyBriefMessage = planRaw
    ? generateDailyBrief({
        firstName,
        streak,
        todayWorkout: todayWorkout
          ? { name: todayWorkout.name, exercise_count: todayWorkout.exercise_count }
          : null,
        isCompletedToday:  !!todayLog,
        progressionCount:  activeAdjustmentCount,
        topRecord:         topRecordHighlight
          ? { exerciseName: topRecordHighlight.exerciseName, maxWeightKg: topRecordHighlight.maxWeightKg }
          : null,
        weekSessions:      sessionsThisWeek,
        scheduledSessions: scheduledThisWeek,
      })
    : null

  return (
    <div className="min-h-screen bg-background pb-28">
      <DashboardHeader greeting={getGreeting(language)} firstName={firstName} avatarUrl={profile?.avatar_url ?? null} momentumScore={momentumScore} username={profile?.username ?? null} />

      <main className="mx-auto max-w-lg px-4">
        {showAiBanner && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-6 duration-500"
            style={{ animationDelay: '80ms' }}
          >
            <AINotesBanner
              aiNotes={planRaw!.ai_notes!}
              planName={planRaw!.name}
              bannerContext={bannerContext}
            />
          </section>
        )}

        {dailyBriefMessage && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-6 duration-500"
            style={{ animationDelay: showAiBanner ? '160ms' : '80ms' }}
          >
            <DailyBrief message={dailyBriefMessage} />
          </section>
        )}

        {isCheckInDue(profile?.last_check_in_at ?? null) && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-6 duration-500"
            style={{ animationDelay: '200ms' }}
          >
            <CheckInBanner />
          </section>
        )}

        <section
          className="animate-in fade-in slide-in-from-bottom-3 mt-6 duration-500"
          style={{ animationDelay: showAiBanner ? '240ms' : '160ms' }}
        >
          <HeroCard
            todayWorkout={todayWorkout}
            isCompletedToday={!!todayLog}
            planExists={!!planRaw}
            nextWorkout={nextWorkoutDay?.workout ?? null}
            nextWorkoutIsoDay={nextWorkoutDay?.iso ?? null}
            recoverableWorkout={recoverableDay?.workout ?? null}
            recoverableIsoDay={recoverableDay?.isoDay ?? null}
            streak={streak}
            weekDone={sessionsThisWeek}
            weekTotal={scheduledThisWeek}
          />
        </section>

        {workouts.length > 0 && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-10 duration-500"
            style={{ animationDelay: '320ms' }}
          >
            <WeekCalendar days={weekDays} todayIso={todayIso} />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <PendingLink
                href="/plan"
                className="inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
              >
                Ver plan completo →
              </PendingLink>
              <PendingLink
                href="/calendario"
                className="inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
              >
                Ver calendario →
              </PendingLink>
            </div>
          </section>
        )}

        <section
          className="animate-in fade-in slide-in-from-bottom-3 mt-10 duration-500"
          style={{ animationDelay: '400ms' }}
        >
          <QuickStats
            streak={streak}
            sessionsThisWeek={sessionsThisWeek}
            scheduledThisWeek={scheduledThisWeek}
            volumeKg={Math.round(weekVolumeKg)}
            volumeSeries={volumeSeries}
            hasCompletedSessions={hasCompletedSessions}
          />
        </section>

        {hasCompletedSessions && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-10 duration-500"
            style={{ animationDelay: '480ms' }}
          >
            <ProgressHighlights
              latestSession={latestSession}
              topRecord={topRecordHighlight}
              activeAdjustments={activeAdjustmentCount}
            />
          </section>
        )}
      </main>
    </div>
  )
}
