import type { Metadata } from 'next'
import { requireAppUserContext } from '@/lib/auth/server'
import { AppShell } from '@/components/navigation/AppShell'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { ProductPushNotificationsInit } from '@/components/native/ProductPushNotificationsInit'
import { SocialPushNotificationsInit } from '@/components/native/SocialPushNotificationsInit'
import { TimezoneSync } from '@/components/profile/TimezoneSync'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { getPersonalNavItems } from '@/components/navigation/appNavigation'
import { isCommunityEnabled } from '@/lib/features/community'
import { normalizeLanguage } from '@/lib/i18n'

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAppUserContext()
  const communityEnabled = isCommunityEnabled()
  const language = normalizeLanguage(profile.language)
  const navItems = getPersonalNavItems({ communityEnabled })

  return (
    <I18nProvider language={language}>
      <AndroidBackHandler />
      <ProductPushNotificationsInit />
      {communityEnabled ? <SocialPushNotificationsInit /> : null}
      <TimezoneSync current={profile.timezone} />
      <AppShell navItems={navItems}>{children}</AppShell>
    </I18nProvider>
  )
}
