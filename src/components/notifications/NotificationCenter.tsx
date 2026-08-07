'use client'

import { useMemo, useState } from 'react'
import { Bell, ChevronRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  listProductNotifications,
  markProductNotificationRead,
  type ProductNotificationPage,
  type ProductNotificationView,
} from '@/app/actions/notifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { cn } from '@/lib/utils'

export type { ProductNotificationView }

function hasUnsafeUrlCharacter(value: string): boolean {
  return value.includes('\\') || Array.from(value).some(character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function getSafeInternalNotificationUrl(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  if (hasUnsafeUrlCharacter(value)) return null

  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || hasUnsafeUrlCharacter(decoded)) {
      return null
    }
    const base = new URL('https://vekira.internal')
    const destination = new URL(value, base)
    return destination.origin === base.origin ? value : null
  } catch {
    return null
  }
}

export function mergeNotificationPageIntoCurrent(
  current: ProductNotificationView[],
  incoming: ProductNotificationView[],
): ProductNotificationView[] {
  const byId = new Map(incoming.map(notification => [notification.id, notification]))
  for (const notification of current) byId.set(notification.id, notification)

  return Array.from(byId.values()).sort((left, right) => {
    const byCreatedAt = Date.parse(right.createdAt) - Date.parse(left.createdAt)
    return byCreatedAt || right.id.localeCompare(left.id)
  })
}

type NotificationInteractionToast = {
  title: string
  variant: 'error'
}

type NotificationLoadInteractionResult = {
  ok: boolean
  incomingNotifications: ProductNotificationView[]
  nextCursor: string | null
  announcement: string
  error: string | null
  toast: NotificationInteractionToast | null
}

const LOAD_NOTIFICATIONS_ERROR = 'No se pudieron cargar las notificaciones.'
const MARK_NOTIFICATION_ERROR = 'No se pudo marcar la notificación.'

export async function loadNextNotificationPage(
  input: { cursor: string },
  fetchPage: (input: { cursor: string }) => Promise<ProductNotificationPage> = listProductNotifications,
): Promise<NotificationLoadInteractionResult> {
  try {
    const page = await fetchPage({ cursor: input.cursor })
    if (page.error) {
      return {
        ok: false,
        incomingNotifications: [],
        nextCursor: input.cursor,
        announcement: page.error,
        error: page.error,
        toast: { title: page.error, variant: 'error' },
      }
    }

    return {
      ok: true,
      incomingNotifications: page.notifications,
      nextCursor: page.nextCursor,
      announcement: `${page.notifications.length} notificaciones cargadas.`,
      error: null,
      toast: null,
    }
  } catch {
    return {
      ok: false,
      incomingNotifications: [],
      nextCursor: input.cursor,
      announcement: LOAD_NOTIFICATIONS_ERROR,
      error: LOAD_NOTIFICATIONS_ERROR,
      toast: { title: LOAD_NOTIFICATIONS_ERROR, variant: 'error' },
    }
  }
}

type MarkReadResult = { ok: true } | { ok: false; error: string }

type MarkReadInteractionResult = {
  ok: boolean
  notification: ProductNotificationView
  announcement: string
  error: string | null
  toast: NotificationInteractionToast | null
}

export async function markNotificationReadInteraction(
  notification: ProductNotificationView,
  markRead: (id: string) => Promise<MarkReadResult> = markProductNotificationRead,
): Promise<MarkReadInteractionResult> {
  try {
    const result = await markRead(notification.id)
    if (!result.ok) {
      return {
        ok: false,
        notification,
        announcement: result.error,
        error: result.error,
        toast: { title: result.error, variant: 'error' },
      }
    }

    return {
      ok: true,
      notification: { ...notification, readAt: new Date().toISOString() },
      announcement: `${notification.title} marcada como leída.`,
      error: null,
      toast: null,
    }
  } catch {
    return {
      ok: false,
      notification,
      announcement: MARK_NOTIFICATION_ERROR,
      error: MARK_NOTIFICATION_ERROR,
      toast: { title: MARK_NOTIFICATION_ERROR, variant: 'error' },
    }
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})

function formatCreatedAt(value: string): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? DATE_FORMAT.format(timestamp) : value
}

export function NotificationCenter({ initialPage }: { initialPage: ProductNotificationPage }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [notifications, setNotifications] = useState(() => (
    mergeNotificationPageIntoCurrent([], initialPage.notifications)
  ))
  const [cursor, setCursor] = useState(initialPage.nextCursor)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState(initialPage.error ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(initialPage.error ?? null)
  const [loadingMore, setLoadingMore] = useState(false)

  const unreadCount = useMemo(
    () => notifications.filter(notification => notification.readAt === null).length,
    [notifications],
  )

  async function openOrMark(notification: ProductNotificationView, destination: string | null) {
    if (busyId) return

    if (notification.readAt === null) {
      setBusyId(notification.id)
      const result = await markNotificationReadInteraction(notification)
      setBusyId(null)

      if (!result.ok) {
        setErrorMessage(result.error)
        setAnnouncement(result.announcement)
        if (result.toast) showToast(result.toast)
        return
      }

      setErrorMessage(null)
      setNotifications(current => current.map(item => (
        item.id === notification.id ? result.notification : item
      )))
      setAnnouncement(result.announcement)
    }

    if (destination) router.push(destination)
  }

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await loadNextNotificationPage({ cursor })
      if (result.ok) {
        setNotifications(current => (
          mergeNotificationPageIntoCurrent(current, result.incomingNotifications)
        ))
      }
      setCursor(result.nextCursor)
      setAnnouncement(result.announcement)
      setErrorMessage(result.error)
      if (result.toast) showToast(result.toast)
    } finally {
      setLoadingMore(false)
    }
  }

  if (notifications.length === 0) {
    if (errorMessage) {
      return (
        <section
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-12 text-center"
        >
          <Bell className="mx-auto h-8 w-8 text-red-300" aria-hidden="true" />
          <h2 className="mt-4 text-base font-semibold text-foreground">No pudimos cargar tus notificaciones</h2>
          <p className="mt-2 text-sm leading-relaxed text-red-200">{errorMessage}</p>
        </section>
      )
    }

    return (
      <section className="rounded-2xl border border-border/60 bg-muted/10 px-5 py-12 text-center">
        <Bell className="mx-auto h-8 w-8 text-violet-300" aria-hidden="true" />
        <h2 className="mt-4 text-base font-semibold text-foreground">No tienes notificaciones todavía</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Aquí aparecerán las novedades sobre entrenadores, solicitudes y rutinas.
        </p>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="notification-center-title">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="notification-center-title" className="text-sm font-semibold text-foreground">
          Recientes
        </h2>
        <p className="text-xs text-muted-foreground">
          {unreadCount === 1 ? '1 sin leer' : `${unreadCount} sin leer`}
        </p>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-3">
        {notifications.map(notification => {
          const destination = getSafeInternalNotificationUrl(notification.url)
          const unread = notification.readAt === null
          const busy = busyId === notification.id
          const canAct = Boolean(destination) || unread

          return (
            <article
              key={notification.id}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                unread
                  ? 'border-violet-500/35 bg-violet-500/[0.08]'
                  : 'border-border/60 bg-muted/10',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{notification.title}</h3>
                    {unread ? (
                      <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                        Nueva
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{notification.body}</p>
                  <time dateTime={notification.createdAt} className="mt-2 block text-xs text-muted-foreground/80">
                    {formatCreatedAt(notification.createdAt)}
                  </time>
                </div>
              </div>

              {canAct ? (
                <button
                  type="button"
                  onClick={() => openOrMark(notification, destination)}
                  disabled={busy}
                  aria-label={destination ? `Abrir: ${notification.title}` : `Marcar como leída: ${notification.title}`}
                  className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {destination ? `Abrir: ${notification.title}` : 'Marcar como leída'}
                  {destination && !busy ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
              ) : null}
            </article>
          )
        })}
      </div>

      {cursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {loadingMore ? 'Cargando…' : 'Cargar más'}
        </button>
      ) : null}

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  )
}
