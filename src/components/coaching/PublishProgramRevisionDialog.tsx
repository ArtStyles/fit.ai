'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Result = { ok: boolean; error?: string }

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

/** Publishes one immutable future-only replacement for a selected client assignment. */
export function PublishProgramRevisionDialog({
  templateId,
  assignments,
}: {
  templateId: string
  assignments: Array<{ id: string; label: string }>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const attemptKey = useRef<string | null>(null)
  const router = useRouter()

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="publish-program-revision-form" disabled={busy} className="mt-3 min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{open ? 'Cerrar' : 'Publicar revisión'}</button>
    {open ? <form id="publish-program-revision-form" onSubmit={event => void submit(event)} noValidate className="mt-4 space-y-3 rounded-xl border border-border/70 p-3">
      <label className="block text-sm font-semibold text-foreground">Cliente<select required name="assignmentId" defaultValue="" disabled={busy} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal"><option value="" disabled>Selecciona una asignación activa</option>{assignments.map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}</select></label>
      <label className="block text-sm font-semibold text-foreground">Resumen del cambio<textarea required name="changeSummary" maxLength={1000} rows={3} disabled={busy} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" /></label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Publicando…' : 'Publicar para sesiones futuras'}</button>
    </form> : null}
    <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">{message}</p>
  </section>
}
