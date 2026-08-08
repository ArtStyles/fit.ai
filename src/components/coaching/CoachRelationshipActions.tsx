'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

function nextIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

type EndAction = (formData: FormData) => Promise<{ ok: boolean; relationshipId?: string; changed?: boolean; error?: string }>

export async function performCoachRelationshipEnd(
  relationshipId: string,
  idempotencyKey: string,
  action: EndAction,
  update: { setBusy: (value: boolean) => void; setMessage: (value: { text: string; error: boolean }) => void; refresh: () => void },
) {
  update.setBusy(true)
  try {
    const formData = new FormData()
    formData.set('relationshipId', relationshipId)
    formData.set('idempotencyKey', idempotencyKey)
    const result = await action(formData)
    update.setMessage(result.ok
      ? { text: result.changed ? 'El acompañamiento fue finalizado.' : 'Este acompañamiento ya estaba finalizado.', error: false }
      : { text: result.error ?? 'No se pudo finalizar el acompañamiento.', error: true })
    if (result.ok) update.refresh()
    return result.ok
  } catch {
    update.setMessage({ text: 'No se pudo finalizar el acompañamiento.', error: true })
    return false
  } finally {
    update.setBusy(false)
  }
}

export function CoachRelationshipActions({ relationshipId, status }: { relationshipId: string; status: 'active' | 'paused_by_platform' }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: '', error: false })
  const attemptKey = useRef<string | undefined>(undefined)
  const descriptionId = `coach-relationship-end-${relationshipId}`

  async function finish() {
    const key = attemptKey.current ?? nextIdempotencyKey()
    attemptKey.current = key
    const ended = await performCoachRelationshipEnd(relationshipId, key, async formData => {
      const { endCoachingRelationship } = await import('@/app/actions/coachingRelationships')
      return endCoachingRelationship(formData)
    }, { setBusy, setMessage, refresh: router.refresh })
    if (ended) {
      attemptKey.current = undefined
      setConfirming(false)
    }
  }

  return <section className="space-y-3" aria-labelledby={`${descriptionId}-title`}>
    <h2 id={`${descriptionId}-title`} className="text-lg font-bold text-foreground">Gestionar acompaÃ±amiento</h2>
    {status === 'paused_by_platform' ? <p className="text-sm text-muted-foreground">Pausado por la plataforma: pendiente de confirmaciÃ³n del cliente. No hay acceso al progreso mientras permanezca pausado.</p> : null}
    <button type="button" aria-controls={descriptionId} aria-expanded={confirming} onClick={() => setConfirming(value => !value)}
      disabled={busy} className="min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-foreground disabled:opacity-50">Finalizar acompaÃ±amiento</button>
    {confirming ? <div id={descriptionId} role="group" aria-describedby={`${descriptionId}-description`} className="rounded-2xl border border-red-500/30 p-4">
      <p id={`${descriptionId}-description`} className="text-sm text-muted-foreground">El acceso a los datos se revocarÃ¡ de inmediato. Esta acciÃ³n no se puede deshacer.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void finish()} disabled={busy} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Finalizandoâ€¦' : 'Confirmar finalizaciÃ³n'}</button>
        <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="min-h-11 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground disabled:opacity-50">Cancelar</button>
      </div>
    </div> : null}
    {message.text ? <p {...(message.error ? { role: 'alert' } : { 'aria-live': 'polite' })} className="text-sm text-muted-foreground">{message.text}</p> : null}
  </section>
}
