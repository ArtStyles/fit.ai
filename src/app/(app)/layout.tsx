import { requireAppUserContext } from '@/lib/auth/server'
import { PageTransition } from '@/components/navigation/PageTransition'
import { BottomNav } from '@/components/navigation/BottomNav'
import { ChatFab } from '@/components/navigation/ChatFab'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { TimezoneSync } from '@/components/profile/TimezoneSync'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAppUserContext()

  return (
    <div className="min-h-screen flex flex-col">
      <AndroidBackHandler />
      <TimezoneSync current={profile.timezone} />
      <main className="flex-1 overflow-x-hidden">
        <PageTransition>{children}</PageTransition>
      </main>
      <ChatFab />
      <BottomNav />
    </div>
  )
}
