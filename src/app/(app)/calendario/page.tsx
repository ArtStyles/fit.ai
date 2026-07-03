import { CalendarRange } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { CalendarView } from '@/components/calendar/CalendarView'
import { EmptyCalendar } from '@/components/calendar/EmptyCalendar'
import { requireAppUserContext } from '@/lib/auth/server'
import { addDays, getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import {
  aggregateLogsToDays,
  type DayAggregate,
  type RawExerciseLog,
  type RawProgressLog,
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

async function loadCalendarFallback(
  supabase: AppSupabaseClient,
  userId: string,
  timeZone: string,
): Promise<DayAggregate[]> {
  const from = addDays(new Date(), -365).toISOString()

  const { data: logs } = await supabase
    .from('progress_logs')
    .select('id, completed_at, duration_minutes')
    .eq('user_id', userId)
    .not('workout_id', 'is', null)
    .gte('completed_at', from)
    .order('completed_at', { ascending: false }) as unknown as { data: RawProgressLog[] | null }

  const ids = (logs ?? []).map(log => log.id)
  let exerciseLogs: RawExerciseLog[] = []

  if (ids.length > 0) {
    const { data } = await supabase
      .from('exercise_logs')
      .select('progress_log_id, weights_kg, reps_completed')
      .in('progress_log_id', ids) as unknown as { data: RawExerciseLog[] | null }
    exerciseLogs = data ?? []
  }

  return aggregateLogsToDays(logs ?? [], exerciseLogs, timeZone)
}

async function loadCalendarDays(
  supabase: AppSupabaseClient,
  userId: string,
  timeZone: string,
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

  return loadCalendarFallback(supabase, userId, timeZone)
}

export default async function CalendarPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const timeZone = resolveUserTimeZone(profile.timezone)
  const todayStr = getLocalDateString(new Date(), timeZone)
  const days = await loadCalendarDays(supabase, user.id, timeZone)

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageTopBar
        title={t('Calendario')}
        subtitle={t('Tu historial de entrenamiento mes a mes')}
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<CalendarRange className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-lg px-4 py-8">
        {days.length === 0 ? (
          <EmptyCalendar />
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-3 mt-8 duration-500">
            <CalendarView days={days} todayStr={todayStr} />
          </div>
        )}
      </main>
    </div>
  )
}
