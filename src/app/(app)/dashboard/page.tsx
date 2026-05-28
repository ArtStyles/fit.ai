import { DashboardHeader }   from '@/components/dashboard/DashboardHeader'
import { HeroCard }          from '@/components/dashboard/HeroCard'
import { WeekCalendar }      from '@/components/dashboard/WeekCalendar'
import { QuickStats }        from '@/components/dashboard/QuickStats'
import { AINotesBanner }     from '@/components/dashboard/AINotesBanner'
import { PendingLink }       from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import {
  addDays as addCalendarDays,
  getIsoWeekday,
  getLocalDateString,
  getWeekMonday as getCurrentWeekMonday,
} from '@/lib/workouts/schedule'
import type { BannerContext } from '@/components/dashboard/AINotesBanner'

export const metadata = { title: 'Dashboard · FitAI' }

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
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

export interface DayData {
  isoDay:                   number        // 1=Lun … 7=Dom
  dateStr:                  string        // YYYY-MM-DD
  workout:                  WorkoutSummary | null
  isCompleted:              boolean
  isToday:                  boolean
  completedDurationMinutes: number | null
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

type DashboardPayload = {
  planRaw: PlanRow | null
  workouts: WorkoutSummary[]
  allRecentLogs: WeekLogRow[]
  weekLogs: WeekLogRow[]
  weekVolumeKg: number
  hasCompletedSessions: boolean
}

type RpcDashboardPayload = {
  active_plan?: PlanRow | null
  workouts?: WorkoutSummary[]
  recent_logs?: WeekLogRow[]
  week_logs?: WeekLogRow[]
  week_volume_kg?: number | string | null
  has_completed_sessions?: boolean | null
}

function normalizeWorkouts(workouts: WorkoutSummary[]): WorkoutSummary[] {
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
  const { data, error } = await (supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, string>,
    ) => Promise<{ data: RpcDashboardPayload | null; error: { message: string } | null }>
  }).rpc('get_dashboard_payload', {
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

// ─── Página ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireAppUserContext()

  // ── Perfil del usuario ─────────────────────────────────────────────────────
  const firstName = profile?.full_name?.split(' ')[0]
    ?? user.email?.split('@')[0]
    ?? 'Campeón'

  const todayIso  = getIsoWeekday()
  const weekStart = getCurrentWeekMonday()
  const todayStr  = getLocalDateString()

  // ── Plan activo ────────────────────────────────────────────────────────────
  const dashboardPayload = await loadDashboardPayload(
    supabase,
    user.id,
    weekStart,
    addCalendarDays(new Date(), -30),
  )
  const {
    planRaw,
    allRecentLogs,
    weekLogs,
    weekVolumeKg,
    hasCompletedSessions,
  } = dashboardPayload
  const workouts = await attachProgressionCounts(supabase, dashboardPayload.workouts)

  // ── Workouts del plan + conteo de ejercicios ───────────────────────────────
  // ── Datos de esta semana ───────────────────────────────────────────────────
  // ── Volumen semanal ────────────────────────────────────────────────────────
  // ── Racha (30 días hacia atrás) ────────────────────────────────────────────
  let streak = 0
  if (allRecentLogs.length > 0) {
    const logDateSet = new Set(allRecentLogs.map(l => getLocalDateString(new Date(l.completed_at))))
    let check = new Date()
    while (logDateSet.has(getLocalDateString(check))) {
      streak++
      check = addCalendarDays(check, -1)
    }
  }

  // ── Workout de hoy + si ya está completado ─────────────────────────────────
  const todayWorkout = workouts.find(w => w.day_of_week === todayIso) ?? null

  const todayLog = weekLogs.find(l =>
    l.workout_id === todayWorkout?.id &&
    getLocalDateString(new Date(l.completed_at)) === todayStr,
  )

  // ── Siguiente workout (para día de descanso) ───────────────────────────────
  const nextWorkoutDay = Array.from({ length: 7 }, (_, i) => {
    const iso = ((todayIso - 1 + i + 1) % 7) + 1
    return { iso, workout: workouts.find(w => w.day_of_week === iso) ?? null }
  }).find(d => d.iso !== todayIso && d.workout)

  // ── Datos del calendario semanal ──────────────────────────────────────────
  const weekDays: DayData[] = Array.from({ length: 7 }, (_, i) => {
    const date    = addCalendarDays(weekStart, i)
    const dateStr = getLocalDateString(date)
    const iso     = i + 1
    const workout = workouts.find(w => w.day_of_week === iso) ?? null
    const log     = weekLogs.find(l =>
      l.workout_id === workout?.id &&
      getLocalDateString(new Date(l.completed_at)) === dateStr,
    )
    return {
      isoDay: iso,
      dateStr,
      workout,
      isCompleted: !!log,
      isToday: iso === todayIso,
      completedDurationMinutes: log?.duration_minutes ?? null,
    }
  })

  // ── Quick stats ────────────────────────────────────────────────────────────
  const sessionsThisWeek   = weekLogs.filter(l => l.workout_id !== null).length
  const scheduledThisWeek  = workouts.length

  const bannerContext = getBannerContext(planRaw, hasCompletedSessions)

  // ── Banner de IA: si el plan tiene ai_notes y se creó en los últimos 7 días ─
  const showAiBanner = !!(
    planRaw?.ai_notes &&
    new Date(planRaw.created_at).getTime() > addCalendarDays(new Date(), -7).getTime()
  )

  return (
    <div className="min-h-screen bg-background pb-16">
      <DashboardHeader greeting={getGreeting()} firstName={firstName} avatarUrl={profile?.avatar_url ?? null} />

      <main className="mx-auto max-w-lg px-4">
        {showAiBanner && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-8 duration-500"
            style={{ animationDelay: '40ms' }}
          >
            <AINotesBanner
              aiNotes={planRaw!.ai_notes!}
              planName={planRaw!.name}
              bannerContext={bannerContext}
            />
          </section>
        )}

        <section
          className="animate-in fade-in slide-in-from-bottom-3 mt-8 duration-500"
          style={{ animationDelay: showAiBanner ? '120ms' : '40ms' }}
        >
          <HeroCard
            todayWorkout={todayWorkout}
            isCompletedToday={!!todayLog}
            planExists={!!planRaw}
            nextWorkout={nextWorkoutDay?.workout ?? null}
            nextWorkoutIsoDay={nextWorkoutDay?.iso ?? null}
          />
        </section>

        {workouts.length > 0 && (
          <section
            className="animate-in fade-in slide-in-from-bottom-3 mt-12 duration-500"
            style={{ animationDelay: '200ms' }}
          >
            <WeekCalendar days={weekDays} todayIso={todayIso} />
            <PendingLink
              href="/plan"
              className="mt-4 inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
            >
              Ver plan completo →
            </PendingLink>
          </section>
        )}

        <section
          className="animate-in fade-in slide-in-from-bottom-3 mt-12 duration-500"
          style={{ animationDelay: '280ms' }}
        >
          <QuickStats
            streak={streak}
            sessionsThisWeek={sessionsThisWeek}
            scheduledThisWeek={scheduledThisWeek}
            volumeKg={Math.round(weekVolumeKg)}
            hasCompletedSessions={hasCompletedSessions}
          />
          {hasCompletedSessions && (
            <PendingLink
              href="/history"
              className="mt-4 inline-flex text-sm font-medium text-violet-400 underline-offset-4 hover:underline"
            >
              Ver historial →
            </PendingLink>
          )}
        </section>
      </main>
    </div>
  )
}
