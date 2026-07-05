import type { Metadata } from 'next'
import { requireAppUserContext } from '@/lib/auth/server'
import { AppShell } from '@/components/navigation/AppShell'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { SocialPushNotificationsInit } from '@/components/native/SocialPushNotificationsInit'
import { TimezoneSync } from '@/components/profile/TimezoneSync'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { normalizeLanguage } from '@/lib/i18n'

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)

  return (
    <I18nProvider language={language}>
      <AndroidBackHandler />
      <SocialPushNotificationsInit />
      <TimezoneSync current={profile.timezone} />
      <AppShell>{children}</AppShell>
    </I18nProvider>
  )
}
