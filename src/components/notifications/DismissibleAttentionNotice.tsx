'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { dismissNotificationAttention } from '@/app/actions/notifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { shouldDismissNotificationSwipe } from '@/components/notifications/swipeDismissal'

type PersistDismissal = (
  noticeKey: string,
) => Promise<{ ok: true } | { ok: false; error: string }>

export type AttentionNoticeDismissalResult = {
  ok: boolean
  announcement: string
  error: string | null
}

export async function dismissAttentionNoticeInteraction(
  noticeKey: string,
  persist: PersistDismissal = dismissNotificationAttention,
): Promise<AttentionNoticeDismissalResult> {
  try {
    const result = await persist(noticeKey)
    if (!result.ok) {
      return { ok: false, announcement: result.error, error: result.error }
    }
    return { ok: true, announcement: 'Aviso quitado.', error: null }
  } catch {
    return {
      ok: false,
      announcement: 'No se pudo quitar el aviso.',
      error: 'No se pudo quitar el aviso.',
    }
  }
}

export function DismissibleAttentionNotice({
  noticeKey,
  ariaLabel,
  children,
}: {
  noticeKey: string
  ariaLabel: string
  children: ReactNode
}) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const dismissButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)
  const suppressChildClickRef = useRef(false)

  useEffect(() => {
    if (!visible || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    dismissButtonRef.current?.focus()
  }, [visible])

  async function dismiss() {
    if (busy) return
    setBusy(true)
    setVisible(false)
    const result = await dismissAttentionNoticeInteraction(noticeKey)
    setAnnouncement(t(result.announcement))
    setBusy(false)

    if (result.ok) {
      router.refresh()
      return
    }

    restoreFocusRef.current = true
    setVisible(true)
    showToast({
      title: t(result.error ?? 'No se pudo quitar el aviso.'),
      variant: 'error',
    })
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      data-dismissible-attention="true"
      data-swipe-dismiss="attention"
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex w-28 items-center justify-center gap-2 bg-red-500/15 text-xs font-semibold text-red-200"
      >
        <Trash2 className="h-4 w-4" />
        {t('Quitar')}
      </div>

      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            key={noticeKey}
            drag={busy ? false : 'x'}
            dragConstraints={{ left: -112, right: 0 }}
            dragElastic={0.08}
            dragDirectionLock
            dragSnapToOrigin
            onDragStart={() => {
              suppressChildClickRef.current = true
            }}
            onDragEnd={(_, info) => {
              setTimeout(() => {
                suppressChildClickRef.current = false
              }, 0)
              if (shouldDismissNotificationSwipe(info.offset.x, info.velocity.x)) void dismiss()
            }}
            onClickCapture={event => {
              if (!suppressChildClickRef.current) return
              suppressChildClickRef.current = false
              event.preventDefault()
              event.stopPropagation()
            }}
            initial={{ opacity: 1, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -180 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="relative touch-pan-y"
          >
            {children}
            <button
              ref={dismissButtonRef}
              type="button"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => void dismiss()}
              disabled={busy}
              aria-label={t(ariaLabel)}
              className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  )
}
