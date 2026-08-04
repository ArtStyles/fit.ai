'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generatePlan } from '@/app/actions/generatePlan'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { ReadinessReviewDialog } from './ReadinessReviewDialog'
import { createPersistentRequestId, runPersistentPlanRequest } from '@/lib/plans/persistentRequestId'

export function PlanRegenerateButton() {
  const router = useRouter()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readinessOpen, setReadinessOpen] = useState(false)
  const planRequestRef = useRef(createPersistentRequestId())

  async function handleClick() {
    setLoading(true)
    setError(null)

    const result = await runPersistentPlanRequest(
      planRequestRef.current,
      requestId => generatePlan({ mode: 'weekly_regeneration', requestId }),
    ).catch(() => null)

    if (!result) {
      const message = t('No se pudo regenerar el plan.')
      setError(message)
      showToast({
        title: t('No se pudo regenerar'),
        description: message,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    if (!result.success) {
      if (result.requiresReadinessReview) setReadinessOpen(true)
      const message = result.error ?? t('No se pudo regenerar el plan.')
      setError(message)
      showToast({
        title: t('No se pudo regenerar'),
        description: message,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    showToast({
      title: t('Semana regenerada'),
      description: result.weekNumber
        ? t('Tu plan se actualizó para la semana {week}.', { week: result.weekNumber })
        : t('Tu plan semanal quedó actualizado.'),
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="h-11 w-full gap-2 bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-70"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('Regenerando semana')}
          </>
        ) : (
          <>
            <RefreshCcw className="h-4 w-4" />
            {t('Regenerar semana')}
          </>
        )}
      </Button>

      {error && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-red-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      <ReadinessReviewDialog
        open={readinessOpen}
        onOpenChange={setReadinessOpen}
        onSaved={() => { void handleClick() }}
      />
    </div>
  )
}
