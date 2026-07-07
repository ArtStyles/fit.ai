'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Send, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { applyWorkoutAdjustment, suggestWorkoutAdjustment } from '@/app/actions/adjustPlan'
import type { AdjustmentChange } from '@/lib/ai/adjustments'
import { AssistantSuggestion } from './AssistantSuggestion'

interface Props {
  workoutId: string
  workoutName: string
}

const QUICK_REQUESTS = [
  'Haz esta sesión más corta',
  'Aumenta un poco la intensidad de esta sesión',
  'Haz esta sesión más fácil',
]

export function WorkoutAdjustButton({ workoutId, workoutName }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [request, setRequest] = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [changes, setChanges] = useState<AdjustmentChange[]>([])
  const [changesSummary, setChangesSummary] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(nextRequest: string) {
    if (!nextRequest.trim() || loading) return
    setLoading(true)
    setError(null)
    setSuggestion(null)
    setChanges([])
    setChangesSummary([])

    const result = await suggestWorkoutAdjustment(workoutId, nextRequest)
    setLoading(false)

    if (!result.success) {
      setError(result.error ?? t('No se pudo analizar esta sesión'))
      return
    }
    setSuggestion(result.suggestion ?? '')
    setChanges(result.changes ?? [])
    setChangesSummary(result.changesSummary ?? [])
  }

  async function handleApply() {
    if (applying || changes.length === 0) return
    setApplying(true)
    setError(null)

    const result = await applyWorkoutAdjustment(workoutId, changes)
    setApplying(false)

    if (!result.success) {
      setError(result.error ?? t('No se pudieron aplicar los cambios'))
      return
    }

    showToast({
      title: t('Sesión ajustada'),
      description: t('{count} cambios aplicados solo a {workout}.', {
        count: result.appliedCount ?? changes.length,
        workout: workoutName,
      }),
      variant: 'success',
    })
    setOpen(false)
    router.refresh()
  }

  function resetDialog() {
    setRequest('')
    setSuggestion(null)
    setChanges([])
    setChangesSummary([])
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { resetDialog(); setOpen(true) }}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-violet-500/30 px-3.5 py-2.5 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/10"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t('Pedir ajuste al coach')}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-sm text-white">
              <Sparkles className="h-4 w-4 text-violet-400" />
              {t('Pedir ajuste al coach — {workout}', { workout: workoutName })}
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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">{t('Cambios en esta sesión')}</p>
                    <ul className="space-y-1.5">
                      {changesSummary.map(line => (
                        <li key={line} className="flex items-start gap-2 text-sm text-gray-300">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-500">{t('Sugerencia informativa; no se aplicarán cambios automáticos.')}</p>
                )}

                {error ? <p className="text-xs text-red-400">{error}</p> : null}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetDialog}
                    className="min-h-[44px] flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t('Otra petición')}
                  </button>
                  {changes.length > 0 ? (
                    <button
                      type="button"
                    onClick={handleApply}
                    disabled={applying}
                    className="min-h-[44px] flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
                  >
                      {applying ? t('Aplicando…') : t('Aplicar a esta sesión')}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500">
                      {t('Cerrar')}
                    </button>
                  )}
                </div>
              </>
            ) : loading ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                <p className="text-xs text-gray-400">{t('Analizando únicamente esta sesión…')}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t('Ajustes rápidos de esta sesión')}</p>
                  {QUICK_REQUESTS.map(quickRequest => (
                    <button
                      key={quickRequest}
                      type="button"
                      onClick={() => { setRequest(quickRequest); void handleSubmit(quickRequest) }}
                      className="flex min-h-[44px] items-center justify-between rounded-lg border border-border/40 bg-white/5 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:border-violet-500/30 hover:text-white"
                    >
                      {t(quickRequest)}
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
                    placeholder={t('Describe qué cambiar solo en esta sesión...')}
                    rows={2}
                    className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={t('Analizar ajuste de esta sesión')}
                    onClick={() => { void handleSubmit(request) }}
                    disabled={!request.trim()}
                    className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
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
    </>
  )
}
