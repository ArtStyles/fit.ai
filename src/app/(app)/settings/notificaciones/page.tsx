import { BellRing } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SocialNotificationPreferences } from '@/components/settings/SocialNotificationPreferences'
import { WorkoutReminders } from '@/components/settings/WorkoutReminders'
import { requireAppUserContext } from '@/lib/auth/server'
import type { SocialNotificationPreferencesInput } from '@/app/actions/pushNotifications'

export const metadata = { title: 'Notificaciones · FitAI' }

type NotificationsProfile = {
  preferred_workout_days: number[] | null
}

const DEFAULT_SOCIAL_PREFERENCES: SocialNotificationPreferencesInput = {
  likes_enabled: true,
  comments_enabled: true,
  follows_enabled: true,
  follow_requests_enabled: true,
}

export default async function NotificationsSettingsPage() {
  const { supabase, user } = await requireAppUserContext()

  const [{ data: profile }, { data: socialPreferences }] = await Promise.all([
    supabase
      .from('profiles')
      .select('preferred_workout_days')
      .eq('id', user.id)
      .single() as unknown as Promise<{ data: NotificationsProfile | null }>,
    (supabase.from('social_notification_preferences') as any)
      .select('likes_enabled, comments_enabled, follows_enabled, follow_requests_enabled')
      .eq('user_id', user.id)
      .maybeSingle() as Promise<{ data: SocialNotificationPreferencesInput | null }>,
  ])

  return (
    <SettingsScreen
      title="Notificaciones"
      backHref="/settings"
      backLabel="Ajustes"
      icon={<BellRing className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <WorkoutReminders preferredWorkoutDays={profile?.preferred_workout_days ?? []} />
        <SocialNotificationPreferences
          initialPreferences={socialPreferences ?? DEFAULT_SOCIAL_PREFERENCES}
        />
      </div>
    </SettingsScreen>
  )
}
