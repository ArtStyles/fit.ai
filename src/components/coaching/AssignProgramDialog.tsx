'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type Relationship = {
  id: string
  clientUserId: string
  clientName?: string
  clientAvatarUrl?: string | null
  serviceName?: string
  startedAt?: string
  state?: string
  canReceiveAssignment: boolean
  blockingReason?: string
  label?: string
}
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

/** Adds a locked prescription to the library while preserving the client's selection. */
export function AssignProgramDialog({
  templateId,
  relationships,
  selectedRelationshipId,
  blocked = false,
  blockedMessage = DEFAULT_BLOCKED_MESSAGE,
}: {
  templateId: string
  relationships: Relationship[]
  selectedRelationshipId?: string
} & PendingChangeGuardProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | { kind: 'blocked' }>('')
  const visibleMessage = typeof message === 'string' ? message : blocked ? blockedMessage : ''
  const attemptKeys = useRef(new Map<string, string>())
  const [assignedRecipients, setAssignedRecipients] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState(selectedRelationshipId)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const router = useRouter()
  useEffect(() => {
    // Once refresh confirms retention, server eligibility owns the disabled state.
    // A later removal can therefore make this recipient available again.
    setAssignedRecipients(current => {
      const next = current.filter(key => relationships.some(relationship => `${templateId}:${relationship.id}` === key && relationship.canReceiveAssignment))
      return next.length === current.length ? current : next
    })
  }, [relationships, templateId])
  const availableRelationships = relationships.filter(relationship => relationship.canReceiveAssignment && !assignedRecipients.includes(`${templateId}:${relationship.id}`))
  const currentRelationshipId = availableRelationships.find(relationship => relationship.id === selectedId)?.id ?? availableRelationships[0]?.id
  const hasReadyRelationship = Boolean(currentRelationshipId)

  function explainBlocked() {
    setOpen(false)
    setMessage({ kind: 'blocked' })
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
    if (busy || !currentRelationshipId) return
    setBusy(true)
    setMessage('')
    const data = new FormData(event.currentTarget)
    data.set('templateId', templateId)
    const recipientKey = `${templateId}:${currentRelationshipId}`
    data.set('relationshipId', currentRelationshipId)
    const key = attemptKeys.current.get(recipientKey) ?? newIdempotencyKey()
    attemptKeys.current.set(recipientKey, key)
    data.set('idempotencyKey', key)
    try {
      const action = await import('@/app/actions/trainerAssignments')
      const result: Result = await action.assignTrainerProgram(data)
      if (result.ok) {
        setMessage('Rutina añadida a la lista del cliente.')
        attemptKeys.current.delete(recipientKey)
        setAssignedRecipients(current => [...current, recipientKey])
        router.refresh()
      } else {
        setMessage(result.error ?? 'No se pudo enviar la rutina.')
        if (result.error === 'Este cliente ya tiene esta rutina asignada.') setAssignedRecipients(current => [...current, recipientKey])
        if (result.error === 'Este envío corresponde a otra selección o a una rutina eliminada. Inicia un nuevo envío.') attemptKeys.current.delete(recipientKey)
      }
    } catch {
      setMessage('No se pudo enviar la rutina.')
    } finally {
      setBusy(false)
    }
  }

  if (!relationships.length) return <p className="rounded-xl border border-border/70 p-3 text-sm text-muted-foreground">Necesitas un acompañamiento activo y una autorización de datos de entrenamiento vigente para enviar esta rutina.</p>

  return <section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 [&_button[type=submit]]:bg-violet-600 [&_button[type=submit]]:text-white" aria-labelledby="assign-program-title">
    <h2 id="assign-program-title" className="font-bold text-foreground">Asignar rutina profesional</h2>
    <p className="mt-1 text-sm text-foreground/80">Se añadirá a la lista del cliente sin cambiar su rutina principal ni pedir aceptación. El cliente podrá elegir cuándo usarla.</p>
    <button type="button" onClick={toggleOpen} aria-expanded={open} aria-controls="assign-program-form" disabled={busy} className="mt-3 min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{open ? 'Cerrar' : 'Asignar a un cliente'}</button>
    {open ? <form id="assign-program-form" onSubmit={event => void submit(event)} noValidate className="mt-4 space-y-3 rounded-xl border border-border/70 p-3">
      <fieldset disabled={busy}>
        <legend className="text-sm font-semibold text-foreground">Cliente del acompañamiento</legend>
        <div className="mt-2 grid gap-2">
          {relationships.map(relationship => {
            const name = relationship.clientName ?? relationship.label ?? 'Cliente'
            const isBlocked = !relationship.canReceiveAssignment || assignedRecipients.includes(`${templateId}:${relationship.id}`)
            return <label key={relationship.id} className={`flex items-center gap-3 rounded-xl border border-border/70 bg-background p-3 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/5 ${isBlocked ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}>
              <input required type="radio" name="relationshipId" value={relationship.id} disabled={busy || isBlocked} checked={relationship.id === currentRelationshipId} onChange={() => setSelectedId(relationship.id)} className="h-4 w-4 shrink-0 accent-violet-600" />
              {relationship.clientAvatarUrl ? <img src={relationship.clientAvatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{name.slice(0, 1).toUpperCase()}</span>}
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{name}</span>
                <span className="block text-xs text-muted-foreground">{relationship.serviceName ?? relationship.label ?? 'Acompañamiento activo'}{relationship.startedAt ? ` · iniciado ${relationship.startedAt}` : ''}{relationship.state ? ` · ${relationship.state}` : ''}</span>
                {relationship.blockingReason ? <span className="mt-1 block text-xs font-medium text-foreground/80">{relationship.blockingReason}</span> : null}
              </span>
            </label>
          })}
        </div>
      </fieldset>
      <label className="block text-sm font-semibold text-foreground">Resumen para el cliente <span className="font-normal text-muted-foreground">(opcional)</span><textarea name="changeSummary" maxLength={1000} rows={3} disabled={busy} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" /></label>
      <button type="submit" disabled={busy || !hasReadyRelationship} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Enviando…' : 'Asignar rutina'}</button>
    </form> : null}
    {visibleMessage ? <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground outline-none">{visibleMessage}</p> : null}
  </section>
}
