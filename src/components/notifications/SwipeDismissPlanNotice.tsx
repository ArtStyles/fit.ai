'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, RefreshCw, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { dismissPlanUpdateNotification } from '@/app/actions/notifications'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'

const SWIPE_DISTANCE_PX = 88
const SWIPE_VELOCITY_PX_PER_SECOND = 650

type PersistDismissal = (
  noticeKey: string,
) => Promise<{ ok: true } | { ok: false; error: string }>

export type PlanNoticeDismissalResult = {
  ok: boolean
  announcement: string
  error: string | null
}

export function shouldDismissPlanNotice(offsetX: number, velocityX: number): boolean {
  return offsetX <= -SWIPE_DISTANCE_PX || velocityX <= -SWIPE_VELOCITY_PX_PER_SECOND
}

export async function dismissPlanNoticeInteraction(
  noticeKey: string,
  persist: PersistDismissal = dismissPlanUpdateNotification,
): Promise<PlanNoticeDismissalResult> {
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

export function SwipeDismissPlanNotice({
  aiNotes,
  planName,
  dismissalKey,
}: {
  aiNotes: string
  planName: string
  dismissalKey: string | null
}) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  async function dismiss() {
    if (!dismissalKey || busy) return
    setBusy(true)
    setVisible(false)

    const result = await dismissPlanNoticeInteraction(dismissalKey)
    setAnnouncement(t(result.announcement))
    setBusy(false)

    if (result.ok) {
      router.refresh()
      return
    }

    setVisible(true)
    showToast({
      title: t(result.error ?? 'No se pudo quitar el aviso.'),
      variant: 'error',
    })
  }

  return (
    <div className="relative overflow-hidden rounded-2xl" data-swipe-dismiss={dismissalKey ? 'plan-update' : undefined}>
      {dismissalKey ? (
        <div aria-hidden="true" className="absolute inset-y-0 right-0 flex w-28 items-center justify-center gap-2 bg-red-500/15 text-xs font-semibold text-red-200">
          <Trash2 className="h-4 w-4" />
          {t('Quitar')}
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {visible ? (
          <motion.article
            key="plan-update-notice"
            drag={dismissalKey && !busy ? 'x' : false}
            dragConstraints={{ left: -112, right: 0 }}
            dragElastic={0.08}
            dragDirectionLock
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (shouldDismissPlanNotice(info.offset.x, info.velocity.x)) void dismiss()
            }}
            initial={{ opacity: 1, x: 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -180 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="relative rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm touch-pan-y sm:px-5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-violet-300">{t('Plan actualizado')}</p>
                <h3 className="mt-0.5 truncate text-base font-semibold text-foreground">{planName}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{aiNotes}</p>
                <PendingLink
                  href="/plan"
                  className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  {t('Ver plan')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </PendingLink>
              </div>

              {dismissalKey ? (
                <button
                  type="button"
                  onPointerDown={event => event.stopPropagation()}
                  onClick={() => void dismiss()}
                  disabled={busy}
                  aria-label={t('Quitar aviso del plan')}
                  className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </motion.article>
        ) : null}
      </AnimatePresence>

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  )
}
