'use client'

import { useState } from 'react'
import type {
  NotificationAttentionResult,
  ProductNotificationPage,
} from '@/app/actions/notifications'
import { NotificationAttentionCard } from '@/components/notifications/NotificationAttentionCard'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export function decrementUnreadCount(count: number | null): number | null {
  return count === null ? null : Math.max(0, count - 1)
}

export function NotificationsPageContent({
  initialPage,
  attentionResult,
}: {
  initialPage: ProductNotificationPage
  attentionResult: NotificationAttentionResult
}) {
  const [unreadCount, setUnreadCount] = useState(initialPage.unreadCount)
  const attention = attentionResult.status === 'ready' ? attentionResult.attention : null

  return (
    <main aria-label="Centro de notificaciones" className="mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      {attentionResult.status === 'error' ? (
        <section role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-4">
          <p className="text-sm font-semibold text-foreground">No pudimos comprobar las acciones prioritarias</p>
          <p className="mt-1 text-sm text-muted-foreground">Tu actividad reciente sigue disponible.</p>
        </section>
      ) : attention ? (
        <section aria-label="Aviso importante">
          <NotificationAttentionCard attention={attention} />
        </section>
      ) : null}

      <NotificationCenter
        initialPage={initialPage}
        unreadCount={unreadCount}
        onNotificationRead={() => setUnreadCount(current => decrementUnreadCount(current))}
        suppressEmptyState={Boolean(attention)}
      />
    </main>
  )
}
