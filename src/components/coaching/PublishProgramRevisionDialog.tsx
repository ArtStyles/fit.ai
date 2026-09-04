'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

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

/** Publishes one immutable future-only replacement for a selected client assignment. */
export function PublishProgramRevisionDialog({
  templateId,
  assignments,
  blocked = false,
  blockedMessage = DEFAULT_BLOCKED_MESSAGE,
}: {
  templateId: string
  assignments: Array<{ id: string; label?: string; clientName?: string; clientAvatarUrl?: string | null; serviceName?: string; startedAt?: string; state?: string }>
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
      const result: Result = await action.publishTrainerAssignmentRevision(data)
      if (result.ok) {
        attemptKey.current = null
        setMessage('La revisión quedó publicada para las próximas sesiones.')
        router.refresh()
      } else setMessage(result.error ?? 'No se pudo publicar la revisión.')
    } catch {
      setMessage('No se pudo publicar la revisión.')
    } finally {
      setBusy(false)
    }
  }

  if (!assignments.length) return null

  return <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4" aria-labelledby="publish-program-revision-title">
    <h2 id="publish-program-revision-title" className="font-bold text-foreground">Publicar una revisión</h2>
    <p className="mt-1 text-sm text-muted-foreground">La nueva versión se aplicará solo a sesiones que el cliente inicie después de publicarla.</p>
    <button type="button" onClick={toggleOpen} aria-expanded={open} aria-controls="publish-program-revision-form" disabled={busy} className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-background disabled:opacity-50">{open ? 'Cerrar' : 'Publicar revisión'}</button>
    {open ? <form id="publish-program-revision-form" onSubmit={event => void submit(event)} noValidate className="mt-4 space-y-3 rounded-xl border border-border/70 p-3">
      <fieldset disabled={busy}><legend className="text-sm font-semibold text-foreground">Cliente</legend><div className="mt-2 grid gap-2">{assignments.map(assignment => { const name = assignment.clientName ?? assignment.label ?? 'Cliente'; return <label key={assignment.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-background p-3 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-500/5"><input required type="radio" name="assignmentId" value={assignment.id} className="h-4 w-4 accent-sky-600" />{assignment.clientAvatarUrl ? <img src={assignment.clientAvatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-semibold">{name.slice(0, 1).toUpperCase()}</span>}<span className="min-w-0"><span className="block font-semibold text-foreground">{name}</span><span className="block text-xs text-muted-foreground">{assignment.serviceName ?? assignment.label ?? 'Rutina activa'}{assignment.startedAt ? ` · iniciado ${assignment.startedAt}` : ''}{assignment.state ? ` · ${assignment.state}` : ''}</span></span></label> })}</div></fieldset>
      <label className="block text-sm font-semibold text-foreground">Resumen del cambio<textarea required name="changeSummary" maxLength={1000} rows={3} disabled={busy} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" /></label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Publicando…' : 'Publicar para sesiones futuras'}</button>
    </form> : null}
    {message ? <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground outline-none">{message}</p> : null}
  </section>
}
