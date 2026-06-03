'use client'

import { useState } from 'react'
import { Sparkles, Send, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { suggestWorkoutAdjustment } from '@/app/actions/adjustPlan'
import type { AdjustmentContext } from '@/lib/ai/mock-adjustmentGenerator'

interface Props {
  workoutId: string
  context: AdjustmentContext
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

export function WorkoutAdjustButton({ workoutId, context }: Props) {
  const [open, setOpen]           = useState(false)
  const [request, setRequest]     = useState('')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function handleSubmit(req: string) {
    if (!req.trim() || loading) return
    setLoading(true)
    setError(null)
    setSuggestion(null)

    const result = await suggestWorkoutAdjustment(workoutId, req, context)
    setLoading(false)

    if (!result.success) { setError(result.error ?? 'Error al generar la sugerencia'); return }
    setSuggestion(result.suggestion ?? '')
  }

  function handleOpen() {
    setOpen(true)
    setRequest('')
    setSuggestion(null)
    setError(null)
  }

  function handleClose() {
    setOpen(false)
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
              Ajuste IA — {context.workoutName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 p-5">
            {/* Suggestion area */}
            {suggestion ? (
              <>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                  <FormatSuggestion text={suggestion} />
                </div>
                <p className="text-center text-xs text-gray-600">
                  Sugerencia de IA · aplica los cambios manualmente usando las opciones del plan
                </p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => { setSuggestion(null); setRequest('') }}
                    className="flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Otra pregunta
                  </button>
                  <button type="button" onClick={handleClose}
                    className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500">
                    Cerrar
                  </button>
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
