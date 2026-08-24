'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, ChevronRight, Loader2, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  dismissProductNotification,
  listProductNotifications,
  markProductNotificationRead,
  type ProductNotificationPage,
  type ProductNotificationView,
} from '@/app/actions/notifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { shouldDismissNotificationSwipe } from '@/components/notifications/swipeDismissal'
import { dateLocale } from '@/lib/i18n'
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
const DISMISS_NOTIFICATION_ERROR = 'No se pudo quitar la notificación.'
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

export async function dismissNotificationInteraction(
  notification: ProductNotificationView,
  dismiss: (id: string) => Promise<MarkReadResult> = dismissProductNotification,
): Promise<MarkReadInteractionResult> {
  try {
    const result = await dismiss(notification.id)
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
      notification,
      announcement: `${notification.title} quitada.`,
      error: null,
      toast: null,
    }
  } catch {
    return {
      ok: false,
      notification,
      announcement: DISMISS_NOTIFICATION_ERROR,
      error: DISMISS_NOTIFICATION_ERROR,
      toast: { title: DISMISS_NOTIFICATION_ERROR, variant: 'error' },
    }
  }
}

function formatCreatedAt(value: string, formatter: Intl.DateTimeFormat): string {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? formatter.format(timestamp) : value
}

export function NotificationCenter({
  initialPage,
  unreadCount: aggregateUnreadCount,
  onNotificationRead,
  suppressEmptyState = false,
}: {
  initialPage: ProductNotificationPage
  unreadCount?: number | null
  onNotificationRead?: () => void
  suppressEmptyState?: boolean
}) {
  const router = useRouter()
  const { language, timeZone, t } = useI18n()
  const { showToast } = useToast()
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(dateLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }), [language, timeZone])
  const [notifications, setNotifications] = useState(() => (
    mergeNotificationPageIntoCurrent([], initialPage.notifications)
  ))
  const [cursor, setCursor] = useState(initialPage.nextCursor)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState(initialPage.error ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(initialPage.error ?? null)
  const [loadingMore, setLoadingMore] = useState(false)
  const suppressOpenClickIdRef = useRef<string | null>(null)
  const restoreDismissFocusIdRef = useRef<string | null>(null)
  const dismissButtonRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    const notificationId = restoreDismissFocusIdRef.current
    if (!notificationId) return
    const button = dismissButtonRefs.current.get(notificationId)
    if (!button) return
    restoreDismissFocusIdRef.current = null
    button.focus()
  }, [notifications])

  const loadedUnreadCount = useMemo(
    () => notifications.filter(notification => notification.readAt === null).length,
    [notifications],
  )
  const unreadCount = aggregateUnreadCount === undefined
    ? loadedUnreadCount
    : aggregateUnreadCount

  async function openOrMark(notification: ProductNotificationView, destination: string | null) {
    if (suppressOpenClickIdRef.current === notification.id) {
      suppressOpenClickIdRef.current = null
      return
    }
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
      onNotificationRead?.()
      setAnnouncement(result.announcement)
    }

    if (destination) router.push(destination)
  }

  async function dismiss(notification: ProductNotificationView) {
    if (busyId) return
    setBusyId(notification.id)
    setNotifications(current => current.filter(item => item.id !== notification.id))
    const result = await dismissNotificationInteraction(notification)
    setBusyId(null)

    if (!result.ok) {
      setNotifications(current => mergeNotificationPageIntoCurrent(current, [notification]))
      setErrorMessage(result.error)
      setAnnouncement(result.announcement)
      if (result.toast) showToast(result.toast)
      return
    }

    setErrorMessage(null)
    restoreDismissFocusIdRef.current = null
    if (notification.readAt === null) onNotificationRead?.()
    setAnnouncement(result.announcement)
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

    if (suppressEmptyState) return null

    return (
      <section className="px-5 py-10 text-center">
        <Bell className="mx-auto h-7 w-7 text-violet-300" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-foreground">No tienes notificaciones todavía</h2>
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
          Actividad reciente
        </h2>
        <p className="text-xs text-muted-foreground">
          {unreadCount === null
            ? 'Conteo no disponible'
            : unreadCount === 1
              ? '1 sin leer'
              : `${unreadCount} sin leer`}
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
            <div
              key={notification.id}
              className="relative overflow-hidden rounded-2xl"
              data-swipe-dismiss="product-notification"
            >
              <div
                aria-hidden="true"
                className="absolute inset-y-0 right-0 flex w-28 items-center justify-center gap-2 bg-red-500/15 text-xs font-semibold text-red-200"
              >
                <Trash2 className="h-4 w-4" />
                {t('Quitar')}
              </div>

              <motion.article
                drag={busyId ? false : 'x'}
                dragConstraints={{ left: -112, right: 0 }}
                dragElastic={0.08}
                dragDirectionLock
                dragSnapToOrigin
                onDragStart={() => {
                  suppressOpenClickIdRef.current = notification.id
                }}
                onDragEnd={(_, info) => {
                  setTimeout(() => {
                    if (suppressOpenClickIdRef.current === notification.id) {
                      suppressOpenClickIdRef.current = null
                    }
                  }, 0)
                  if (shouldDismissNotificationSwipe(info.offset.x, info.velocity.x)) {
                    void dismiss(notification)
                  }
                }}
                initial={{ x: 0 }}
                animate={{ x: 0 }}
                className={cn(
                  'relative rounded-2xl border p-4 transition-colors touch-pan-y',
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
                    {formatCreatedAt(notification.createdAt, dateFormat)}
                  </time>
                </div>
                <button
                  ref={element => {
                    if (element) dismissButtonRefs.current.set(notification.id, element)
                    else dismissButtonRefs.current.delete(notification.id)
                  }}
                  type="button"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => {
                    restoreDismissFocusIdRef.current = notification.id
                    void dismiss(notification)
                  }}
                  disabled={busy}
                  aria-label={`${t('Quitar notificación')}: ${notification.title}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                </button>
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
              </motion.article>
            </div>
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
