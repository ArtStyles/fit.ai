import { requireAppUserContext } from '@/lib/auth/server'
import { PageTransition } from '@/components/navigation/PageTransition'
import { AppScrollViewport } from '@/components/navigation/AppScrollViewport'
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
      <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex flex-col overflow-hidden">
        <AndroidBackHandler />
        <SocialPushNotificationsInit />
        <TimezoneSync current={profile.timezone} />
        <AppScrollViewport>
          <PageTransition>{children}</PageTransition>
        </AppScrollViewport>
        <ChatFab />
        <BottomNav />
      </div>
    </I18nProvider>
  )
}
