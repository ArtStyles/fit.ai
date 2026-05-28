'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generatePlan } from '@/app/actions/generatePlan'
import { useToast } from '@/components/feedback/ToastProvider'

export function PlanRegenerateButton() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)

    const result = await generatePlan({ mode: 'weekly_regeneration' })

    if (!result.success) {
      const message = result.error ?? 'No se pudo regenerar el plan.'
      setError(message)
      showToast({
        title: 'No se pudo regenerar',
        description: message,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    showToast({
      title: 'Semana regenerada',
      description: result.weekNumber
        ? `Tu plan se actualizó para la semana ${result.weekNumber}.`
        : 'Tu plan semanal quedó actualizado.',
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
        className="h-10 w-full gap-2 bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-70"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Regenerando semana
          </>
        ) : (
          <>
            <RefreshCcw className="h-4 w-4" />
            Regenerar semana
          </>
        )}
      </Button>

      {error && (
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-red-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
