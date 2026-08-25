'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Relationship = { id: string; label: string }
type Result = { ok: boolean; error?: string }
type PendingChangeGuardProps = {
  blocked?: boolean
  blockedMessage?: string
}

const DEFAULT_BLOCKED_MESSAGE = 'Guarda los cambios pendientes antes de asignar o publicar.'

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

/** Sends a template as an inactive, immutable proposal; it never activates it. */
export function AssignProgramDialog({
  templateId,
  relationships,
  blocked = false,
  blockedMessage = DEFAULT_BLOCKED_MESSAGE,
}: {
  templateId: string
  relationships: Relationship[]
} & PendingChangeGuardProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const attemptKey = useRef<string | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const router = useRouter()

  function explainBlocked() {
    setOpen(false)
    setMessage(blockedMessage)
    requestAnimationFrame(() => statusRef.current?.focus())
  }

  function toggleOpen() {
    if (open) {
      setOpen(false)
      return
    }
    if (blocked) {
      explainBlocked()
      return
    }
    setMessage('')
    setOpen(true)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked) {
      explainBlocked()
      return
    }
    if (busy) return
    setBusy(true)
    setMessage('')
    const data = new FormData(event.currentTarget)
    data.set('templateId', templateId)
    const key = attemptKey.current ?? newIdempotencyKey()
    attemptKey.current = key
    data.set('idempotencyKey', key)
    try {
      const action = await import('@/app/actions/trainerAssignments')
      const result: Result = await action.proposeTrainerAssignment(data)
      if (result.ok) {
        setMessage('Rutina enviada para que el cliente la revise.')
        attemptKey.current = null
        router.refresh()
      } else setMessage(result.error ?? 'No se pudo enviar la rutina.')
    } catch {
      setMessage('No se pudo enviar la rutina.')
    } finally {
      setBusy(false)
    }
  }

  if (!relationships.length) return <p className="rounded-xl border border-border/70 p-3 text-sm text-muted-foreground">Necesitas un acompañamiento activo para enviar esta rutina.</p>

  return <section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 [&_button[type=submit]]:bg-violet-600 [&_button[type=submit]]:text-white" aria-labelledby="assign-program-title">
    <h2 id="assign-program-title" className="font-bold text-foreground">Enviar como rutina profesional</h2>
    <p className="mt-1 text-sm text-muted-foreground">Se creará una copia bloqueada para revisión. No reemplaza la rutina actual hasta que el cliente la acepte.</p>
    <button type="button" onClick={toggleOpen} aria-expanded={open} aria-controls="assign-program-form" disabled={busy} className="mt-3 min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{open ? 'Cerrar' : 'Enviar a un cliente'}</button>
    {open ? <form id="assign-program-form" onSubmit={event => void submit(event)} noValidate className="mt-4 space-y-3 rounded-xl border border-border/70 p-3">
      <label className="block text-sm font-semibold text-foreground">Cliente del acompañamiento<select required name="relationshipId" defaultValue="" disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal"><option value="" disabled>Selecciona una relación activa</option>{relationships.map(relationship => <option key={relationship.id} value={relationship.id}>{relationship.label}</option>)}</select></label>
      <label className="block text-sm font-semibold text-foreground">Resumen para el cliente <span className="font-normal text-muted-foreground">(opcional)</span><textarea name="changeSummary" maxLength={1000} rows={3} disabled={busy} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" /></label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar propuesta bloqueada'}</button>
    </form> : null}
    {message ? <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground outline-none">{message}</p> : null}
  </section>
}
