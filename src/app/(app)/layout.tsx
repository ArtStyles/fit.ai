import type { Metadata } from 'next'
import { requireAppUserContext } from '@/lib/auth/server'
import { AppShell } from '@/components/navigation/AppShell'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { ProductPushNotificationsInit } from '@/components/native/ProductPushNotificationsInit'
import { SocialPushNotificationsInit } from '@/components/native/SocialPushNotificationsInit'
import { TimezoneSync } from '@/components/profile/TimezoneSync'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { getCoachNavItems, getPersonalNavItems } from '@/components/navigation/appNavigation'
import { isCommunityEnabled } from '@/lib/features/community'
import { normalizeLanguage } from '@/lib/i18n'
import { cookies } from 'next/headers'
import { getTrainerAccess } from '@/lib/coaching/access'
import { normalizeWorkspace, WORKSPACE_COOKIE } from '@/lib/coaching/workspace'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase, user } = await requireAppUserContext()
  const communityEnabled = isCommunityEnabled()
  const language = normalizeLanguage(profile.language)
  const timeZone = resolveUserTimeZone(profile.timezone)
  const trainerAccess = await getTrainerAccess(user.id, supabase)
  const preferredWorkspace = normalizeWorkspace(
    cookies().get(WORKSPACE_COOKIE)?.value,
    trainerAccess.granted,
  )
  const accountWorkspace = {
    account: {
      name: profile.full_name,
      email: user.email ?? '',
      avatarUrl: profile.avatar_url,
    },
    trainerAccess: trainerAccess.granted
      ? { granted: true as const }
      : trainerAccess,
    preferredWorkspace,
    personalNavItems: getPersonalNavItems({ communityEnabled }),
    coachNavItems: getCoachNavItems(),
  }

  return (
    <I18nProvider language={language} timeZone={timeZone}>
      <AndroidBackHandler />
      <ProductPushNotificationsInit />
      {communityEnabled ? <SocialPushNotificationsInit /> : null}
      <TimezoneSync current={profile.timezone} />
      <AppShell accountWorkspace={accountWorkspace}>{children}</AppShell>
    </I18nProvider>
  )
}
