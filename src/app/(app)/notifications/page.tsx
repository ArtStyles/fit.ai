import { BellRing, SlidersHorizontal } from 'lucide-react'
import { listProductNotifications, loadNotificationAttention } from '@/app/actions/notifications'
import { NotificationsPageContent } from '@/components/notifications/NotificationsPageContent'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'

export const metadata = { title: 'Notificaciones · Vekira' }

export default async function NotificationsPage() {
  const [initialPage, attentionResult] = await Promise.all([
    listProductNotifications(),
    loadNotificationAttention(),
  ])

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar
        title="Notificaciones"
        subtitle="Avisos y novedades de tu cuenta"
        backHref="/dashboard"
        backLabel="Volver al dashboard"
        icon={<BellRing className="h-5 w-5" aria-hidden="true" />}
        right={(
          <PendingLink
            href="/settings/notificaciones"
            aria-label="Preferencias de notificaciones"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground transition-colors hover:border-violet-400/50 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Preferencias</span>
          </PendingLink>
        )}
      />

      <NotificationsPageContent initialPage={initialPage} attentionResult={attentionResult} />
    </div>
  )
}
