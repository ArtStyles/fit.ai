import { requireAppUserContext } from '@/lib/auth/server'
import { PageTransition } from '@/components/navigation/PageTransition'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAppUserContext()

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 overflow-x-hidden">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  )
}
