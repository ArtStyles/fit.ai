import { BellRing } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import {
  ProductNotificationPreferences,
  type ProductNotificationPreferencesInput,
} from '@/components/settings/ProductNotificationPreferences'
import { SocialNotificationPreferences } from '@/components/settings/SocialNotificationPreferences'
import { WorkoutReminders } from '@/components/settings/WorkoutReminders'
import { requireAppUserContext } from '@/lib/auth/server'
import type { SocialNotificationPreferencesInput } from '@/app/actions/pushNotifications'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { isCommunityEnabled } from '@/lib/features/community'

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

const DEFAULT_PRODUCT_PREFERENCES: ProductNotificationPreferencesInput = {
  professionalEnabled: true,
  pushEnabled: true,
}

type ProductPreferencesRow = {
  professional_enabled: boolean
  push_enabled: boolean
}

export default async function NotificationsSettingsPage() {
  const { supabase, user, profile: appProfile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(appProfile.language))
  const communityEnabled = isCommunityEnabled()

  const [{ data: profile }, { data: productPreferences }] = await Promise.all([
    supabase
      .from('profiles')
      .select('preferred_workout_days')
      .eq('id', user.id)
      .single() as unknown as Promise<{ data: NotificationsProfile | null }>,
    (supabase.from('product_notification_preferences') as any)
      .select('professional_enabled, push_enabled')
      .eq('user_id', user.id)
      .maybeSingle() as Promise<{ data: ProductPreferencesRow | null }>,
  ])

  const socialPreferences = communityEnabled
    ? await (supabase.from('social_notification_preferences') as any)
      .select('likes_enabled, comments_enabled, follows_enabled, follow_requests_enabled')
      .eq('user_id', user.id)
      .maybeSingle() as { data: SocialNotificationPreferencesInput | null }
    : null

  return (
    <SettingsScreen
      title={t('Notificaciones')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon={<BellRing className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <WorkoutReminders preferredWorkoutDays={profile?.preferred_workout_days ?? []} />
        <ProductNotificationPreferences
          initialPreferences={productPreferences
            ? {
              professionalEnabled: productPreferences.professional_enabled,
              pushEnabled: productPreferences.push_enabled,
            }
            : DEFAULT_PRODUCT_PREFERENCES}
        />
        {communityEnabled ? (
          <SocialNotificationPreferences
            initialPreferences={socialPreferences?.data ?? DEFAULT_SOCIAL_PREFERENCES}
          />
        ) : null}
      </div>
    </SettingsScreen>
  )
}
