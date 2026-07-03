import { requireAppUserContext } from '@/lib/auth/server'
import { PageTransition } from '@/components/navigation/PageTransition'
import { BottomNav } from '@/components/navigation/BottomNav'
import { ChatFab } from '@/components/navigation/ChatFab'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { SocialPushNotificationsInit } from '@/components/native/SocialPushNotificationsInit'
import { TimezoneSync } from '@/components/profile/TimezoneSync'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { normalizeLanguage } from '@/lib/i18n'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)

  return (
    <I18nProvider language={language}>
      <div className="min-h-screen flex flex-col">
        <AndroidBackHandler />
        <SocialPushNotificationsInit />
        <TimezoneSync current={profile.timezone} />
        <main className="fitai-safe-content-bottom flex-1 overflow-x-hidden">
          <PageTransition>{children}</PageTransition>
        </main>
        <ChatFab />
        <BottomNav />
      </div>
    </I18nProvider>
  )
}
