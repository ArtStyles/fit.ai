import { BellRing } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { WorkoutReminders } from '@/components/settings/WorkoutReminders'
import { requireAppUserContext } from '@/lib/auth/server'

export const metadata = { title: 'Notificaciones · FitAI' }

type NotificationsProfile = {
  preferred_workout_days: number[] | null
}

export default async function NotificationsSettingsPage() {
  const { supabase, user } = await requireAppUserContext()

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_workout_days')
    .eq('id', user.id)
    .single() as unknown as { data: NotificationsProfile | null }

  return (
    <SettingsScreen
      title="Notificaciones"
      backHref="/settings"
      backLabel="Ajustes"
      icon={<BellRing className="h-5 w-5" />}
    >
      <WorkoutReminders preferredWorkoutDays={profile?.preferred_workout_days ?? []} />
    </SettingsScreen>
  )
}
