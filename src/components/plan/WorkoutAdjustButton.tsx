'use client'

import { useState } from 'react'
import { Check, ChevronRight, Send, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/feedback/ToastProvider'
import { applyWorkoutAdjustment, suggestWorkoutAdjustment } from '@/app/actions/adjustPlan'
import type { AdjustmentChange } from '@/lib/ai/adjustments'

interface Props {
  workoutId: string
  workoutName: string
}

// Converts **text** to bold spans and newlines to <br>
function FormatSuggestion({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-gray-300">
      {text.split('\n\n').map((block, i) => (
        <p key={i}>
          {block.split('\n').map((line, j) => (
            <span key={j}>
              {line.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
                part.startsWith('**') && part.endsWith('**')
                  ? <strong key={k} className="font-semibold text-white">{part.slice(2, -2)}</strong>
                  : part,
              )}
              {j < block.split('\n').length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}

const QUICK_REQUESTS = [
  'Hazlo más corto, tengo poco tiempo',
  'Quiero aumentar la intensidad',
  'Me duele un músculo, adapta el día',
  'Dame una variante más fácil',
]

export function WorkoutAdjustButton({ workoutId, workoutName }: Props) {
  const [open, setOpen]                     = useState(false)
  const [request, setRequest]               = useState('')
  const [suggestion, setSuggestion]         = useState<string | null>(null)
  const [changes, setChanges]               = useState<AdjustmentChange[]>([])
  const [changesSummary, setChangesSummary] = useState<string[]>([])
  const [loading, setLoading]               = useState(false)
  const [applying, setApplying]             = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const { showToast }                       = useToast()

  async function handleSubmit(req: string) {
    if (!req.trim() || loading) return
    setLoading(true)
    setError(null)
    setSuggestion(null)
    setChanges([])
    setChangesSummary([])

    const result = await suggestWorkoutAdjustment(workoutId, req)
    setLoading(false)

    if (!result.success) { setError(result.error ?? 'Error al generar la sugerencia'); return }
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
      setError(result.error ?? 'No se pudieron aplicar los cambios')
      return
    }

    showToast({
      title: 'Ajuste aplicado',
      description: `${result.appliedCount} cambio${result.appliedCount === 1 ? '' : 's'} en ${workoutName}.`,
      variant: 'success',
    })
    setOpen(false)
  }

  function handleOpen() {
    setOpen(true)
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
        onClick={handleOpen}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-violet-500/30 px-3.5 py-2.5 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/10"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Sugerir ajuste IA
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-sm text-white">
              <Sparkles className="h-4 w-4 text-violet-400" />
              Ajuste IA — {workoutName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 p-5">
            {/* Suggestion area */}
            {suggestion ? (
              <>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <FormatSuggestion text={suggestion} />
                </div>

                {changesSummary.length > 0 ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                      Cambios propuestos
                    </p>
                    <ul className="space-y-1.5">
                      {changesSummary.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-600">
                    Sugerencia informativa · aplica los cambios manualmente usando las opciones del plan
                  </p>
                )}

                {error && <p className="text-xs text-red-400">{error}</p>}

                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => { setSuggestion(null); setChanges([]); setChangesSummary([]); setRequest('') }}
                    className="flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Otra pregunta
                  </button>
                  {changesSummary.length > 0 ? (
                    <button type="button" onClick={handleApply} disabled={applying}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60">
                      {applying ? 'Aplicando…' : 'Aplicar cambios'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => setOpen(false)}
                      className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500">
                      Cerrar
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Quick prompts */}
                {!loading && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Sugerencias rápidas</p>
                    {QUICK_REQUESTS.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => { setRequest(q); handleSubmit(q) }}
                        className="flex items-center justify-between rounded-lg border border-border/40 bg-white/5 px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:border-violet-500/30 hover:text-white"
                      >
                        {q}
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom input */}
                {loading ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                    <p className="text-xs text-gray-400">Analizando tu entrenamiento…</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-white/5 px-3 py-2 focus-within:border-violet-500/50">
                      <textarea
                        value={request}
                        onChange={e => setRequest(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(request) } }}
                        placeholder="O describe tú qué quieres cambiar..."
                        rows={2}
                        className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmit(request)}
                        disabled={!request.trim()}
                        className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {error && <p className="text-xs text-red-400">{error}</p>}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
