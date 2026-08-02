import { CalendarRange } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { CalendarView } from '@/components/calendar/CalendarView'
import { EmptyCalendar } from '@/components/calendar/EmptyCalendar'
import { requireAppUserContext } from '@/lib/auth/server'
import { addDays, getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import {
  buildCalendarSessionPayload,
  type DayAggregate,
  type RawCalendarExerciseLog,
  type RawCalendarProgressLog,
} from '@/lib/calendar/aggregate'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Calendario · Vekira' }

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type CalendarRpcRow = {
  date: string
  sessions: number
  duration_min: number
  volume_kg: number | string
  log_ids: string[]
}

type CalendarRpcClient = {
  rpc: (
    functionName: 'get_calendar_payload',
    args: { p_time_zone: string },
  ) => Promise<{ data: CalendarRpcRow[] | null; error: { message?: string } | null }>
}

async function loadCalendarSessionPayload(
  supabase: AppSupabaseClient,
  userId: string,
  timeZone: string,
  fallbackWorkoutName: string,
) {
  const from = addDays(new Date(), -365).toISOString()

  const { data: logs, error: logsError } = await supabase
    .from('progress_logs')
    .select('id, workout_id, completed_at, duration_minutes, session_context_snapshot, workout:workouts(name, focus)')
    .eq('user_id', userId)
    .gte('completed_at', from)
    .order('completed_at', { ascending: false }) as unknown as {
      data: RawCalendarProgressLog[] | null
      error: { message?: string } | null
    }

  if (logsError) throw new Error(logsError.message ?? 'Could not load calendar sessions')

  const ids = (logs ?? []).map(log => log.id)
  let exerciseLogs: RawCalendarExerciseLog[] = []

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('exercise_logs')
      .select('progress_log_id, sets_completed, weights_kg, reps_completed')
      .in('progress_log_id', ids) as unknown as {
        data: RawCalendarExerciseLog[] | null
        error: { message?: string } | null
      }

    if (error) throw new Error(error.message ?? 'Could not load calendar exercise data')
    exerciseLogs = data ?? []
  }

  return buildCalendarSessionPayload(logs ?? [], exerciseLogs, timeZone, fallbackWorkoutName)
}

async function loadCalendarDays(
  supabase: AppSupabaseClient,
  timeZone: string,
  fallbackDays: DayAggregate[],
): Promise<DayAggregate[]> {
  try {
    const { data, error } = await (supabase as unknown as CalendarRpcClient)
      .rpc('get_calendar_payload', { p_time_zone: timeZone })

    if (!error && data) {
      return data.map(row => ({
        date: row.date,
        sessions: Number(row.sessions),
        volumeKg: Number(row.volume_kg),
        durationMin: Number(row.duration_min),
        logIds: row.log_ids ?? [],
      }))
    }
  } catch {
    // La migración 012 puede no estar aplicada todavía; el fallback mantiene la pantalla usable.
  }

  return fallbackDays
}

export default async function CalendarPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const timeZone = resolveUserTimeZone(profile.timezone)
  const todayStr = getLocalDateString(new Date(), timeZone)
  const rawPayload = await loadCalendarSessionPayload(supabase, user.id, timeZone, t('Entrenamiento'))
  const days = await loadCalendarDays(supabase, timeZone, rawPayload.days)

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageTopBar
        title={t('Calendario')}
        subtitle={t('Tu historial de entrenamiento mes a mes')}
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<CalendarRange className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {days.length === 0 ? (
          <EmptyCalendar />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
            <CalendarView days={days} sessions={rawPayload.sessions} todayStr={todayStr} />
          </div>
        )}
      </main>
    </div>
  )
}
