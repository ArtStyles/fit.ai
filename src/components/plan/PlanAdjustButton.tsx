'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Send, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/feedback/ToastProvider'
import { applyPlanAdjustment, suggestPlanAdjustment } from '@/app/actions/adjustPlan'
import type { PlanAdjustmentIntent } from '@/lib/training-engine'
import { AssistantSuggestion } from './AssistantSuggestion'
import { ReadinessReviewDialog } from './ReadinessReviewDialog'

interface Props {
  planId: string
}

const QUICK_REQUESTS = [
  'Quiero entrenar 4 días por semana',
  'Quiero sesiones de 45 minutos',
  'Haz más suave toda la semana',
  'Subir intensidad de toda la semana',
]

export function PlanAdjustButton({ planId }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [intent, setIntent] = useState<PlanAdjustmentIntent | null>(null)
  const [changesSummary, setChangesSummary] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readinessOpen, setReadinessOpen] = useState(false)

  async function handleSubmit(nextRequest: string) {
    if (!nextRequest.trim() || loading) return
    setLoading(true)
    setError(null)
    setSuggestion(null)
    setIntent(null)
    setChangesSummary([])

    const result = await suggestPlanAdjustment(planId, nextRequest)
    setLoading(false)

    if (!result.success) {
      setError(result.error ?? 'No se pudo analizar el plan semanal')
      if (result.requiresReadinessReview) setReadinessOpen(true)
      return
    }
    setSuggestion(result.suggestion ?? '')
    setIntent(result.intent ?? null)
    setChangesSummary(result.changesSummary ?? [])
  }

  async function handleApply() {
    if (applying || !intent) return
    setApplying(true)
    setError(null)

    const result = await applyPlanAdjustment(planId, intent)
    setApplying(false)

    if (!result.success) {
      setError(result.error ?? 'No se pudieron aplicar los cambios semanales')
      return
    }

    showToast({
      title: 'Plan semanal ajustado',
      description: 'Se recalculó y validó toda la semana.',
      variant: 'success',
    })
    setOpen(false)
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.replace('/plan')
    router.refresh()
  }

  function resetDialog() {
    setRequest('')
    setSuggestion(null)
    setIntent(null)
    setChangesSummary([])
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { resetDialog(); setOpen(true) }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 px-4 text-sm font-semibold text-violet-200 transition-colors hover:bg-violet-500/10"
      >
        <Sparkles className="h-4 w-4" />
        Ajustar plan semanal
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-sm text-white">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Ajustar todo el plan semanal
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 p-5">
            {suggestion !== null ? (
              <>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <AssistantSuggestion text={suggestion} />
                </div>

                {changesSummary.length > 0 ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Cambios en toda la semana</p>
                    <ul className="space-y-1.5">
                      {changesSummary.map(line => (
                        <li key={line} className="flex items-start gap-2 text-sm text-gray-300">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  Al aplicar, se reemplazará el plan activo completo por una versión recalculada.
                </p>
                {error ? <p className="text-xs text-red-400">{error}</p> : null}

                <div className="flex gap-2">
                  <button type="button" onClick={resetDialog} className="flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground hover:text-foreground">
                    Otra petición
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    disabled={applying || !intent}
                    className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {applying ? 'Aplicando…' : 'Aplicar a toda la semana'}
                  </button>
                </div>
              </>
            ) : loading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-xs text-gray-400">Recalculando la vista previa semanal…</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Cambios que afectan toda la semana</p>
                  {QUICK_REQUESTS.map(quickRequest => (
                    <button
                      key={quickRequest}
                      type="button"
                      onClick={() => { setRequest(quickRequest); void handleSubmit(quickRequest) }}
                      className="flex items-center justify-between rounded-lg border border-border/40 bg-white/5 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:border-violet-500/30 hover:text-white"
                    >
                      {quickRequest}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-white/5 px-3 py-2 focus-within:border-violet-500/50">
                  <textarea
                    value={request}
                    onChange={event => setRequest(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void handleSubmit(request)
                      }
                    }}
                    placeholder="Describe qué cambiar en toda la semana..."
                    rows={2}
                    className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Analizar ajuste semanal"
                    onClick={() => { void handleSubmit(request) }}
                    disabled={!request.trim()}
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
                {error ? <p className="text-xs text-red-400">{error}</p> : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ReadinessReviewDialog
        open={readinessOpen}
        onOpenChange={setReadinessOpen}
        onSaved={() => { if (request.trim()) void handleSubmit(request) }}
      />
    </>
  )
}
