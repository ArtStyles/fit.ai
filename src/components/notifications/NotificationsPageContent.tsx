'use client'

import { useState } from 'react'
import { BellRing } from 'lucide-react'
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

  return (
    <main aria-label="Centro de notificaciones" className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <section className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-violet-500/[0.12] via-card to-card p-5 sm:p-6" aria-labelledby="notification-summary-title">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-200">
            <BellRing className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Centro personal</p>
            <h2 id="notification-summary-title" className="mt-1 font-display text-2xl font-bold text-foreground">
              {unreadCount === null
                ? 'No pudimos calcular tus pendientes'
                : unreadCount === 1
                  ? '1 notificación sin leer'
                  : `${unreadCount} notificaciones sin leer`}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {unreadCount === null
                ? 'El historial sigue disponible mientras recuperamos el conteo.'
                : 'Todo lo importante, ordenado en un solo lugar.'}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="notification-attention-title" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Prioridad</p>
          <h2 id="notification-attention-title" className="mt-1 font-display text-xl font-bold text-foreground">Requiere tu atención</h2>
        </div>
        {attentionResult.status === 'error' ? (
          <div role="alert" className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] px-5 py-6">
            <p className="font-semibold text-foreground">No pudimos comprobar las acciones prioritarias</p>
            <p className="mt-1 text-sm text-muted-foreground">Tu historial de actividad sigue disponible más abajo.</p>
          </div>
        ) : attentionResult.attention ? (
          <NotificationAttentionCard attention={attentionResult.attention} />
        ) : (
          <div className="rounded-2xl border border-border/60 bg-muted/[0.08] px-5 py-6">
            <p className="font-semibold text-foreground">Todo está al día</p>
            <p className="mt-1 text-sm text-muted-foreground">No tienes acciones prioritarias pendientes.</p>
          </div>
        )}
      </section>

      <div className="rounded-3xl border border-border/60 bg-card/40 p-4 sm:p-6">
        <NotificationCenter
          initialPage={initialPage}
          unreadCount={unreadCount}
          onNotificationRead={() => setUnreadCount(current => decrementUnreadCount(current))}
        />
      </div>
    </main>
  )
}
