import { BellRing } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SocialNotificationPreferences } from '@/components/settings/SocialNotificationPreferences'
import { WorkoutReminders } from '@/components/settings/WorkoutReminders'
import { requireAppUserContext } from '@/lib/auth/server'
import type { SocialNotificationPreferencesInput } from '@/app/actions/pushNotifications'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Notificaciones · Vekira' }

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
  const { supabase, user, profile: appProfile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(appProfile.language))

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
      title={t('Notificaciones')}
      backHref="/settings"
      backLabel={t('Ajustes')}
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
