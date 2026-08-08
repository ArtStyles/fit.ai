'use client'

import { useRef, useState } from 'react'
import { cancelCoachingRequest } from '@/app/actions/coachingRequests'
import type { CoachingRequestStatus } from '@/lib/coaching/relationships'
import { CoachingActionAnnouncement } from './CoachingRequestForm'

const statusLabels: Record<CoachingRequestStatus, string> = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'No aceptada', cancelled: 'Cancelada' }

export type ClientCoachingRequestView = { id: string; status: CoachingRequestStatus; createdAt: string }
export type ClientCoachingRelationshipView = { id: string; status: 'active' | 'paused_by_platform' }

type CancelRequestAction = typeof cancelCoachingRequest

export async function performCoachingRequestCancellation(
  requestId: string,
  action: CancelRequestAction,
  update: { setCancellingId: (id: string | null) => void; setMessage: (message: string, isError?: boolean) => void },
) {
  update.setCancellingId(requestId)
  const formData = new FormData()
  formData.set('requestId', requestId)
  try {
    const result = await action(formData)
    update.setMessage(result.ok ? 'La solicitud fue cancelada.' : 'No se pudo cancelar la solicitud.', !result.ok)
  } catch {
    update.setMessage('No se pudo cancelar la solicitud.', true)
  } finally {
    update.setCancellingId(null)
  }
}

function nextIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

export function ClientCoachingStatus({ requests, relationship }: { requests: ClientCoachingRequestView[]; relationship?: ClientCoachingRelationshipView }) {
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [message, setMessage] = useState({ text: '', isError: false })
  const [confirming, setConfirming] = useState<'end' | 'resume' | null>(null)
  const [relationshipBusy, setRelationshipBusy] = useState(false)
  const attemptKeys = useRef(new Map<'end' | 'resume', string>())

  async function cancel(requestId: string) {
    await performCoachingRequestCancellation(requestId, cancelCoachingRequest, {
      setCancellingId,
      setMessage: (text, isError = false) => setMessage({ text, isError }),
    })
  }

  async function manageRelationship(action: 'end' | 'resume') {
    if (!relationship) return
    setRelationshipBusy(true)
    try {
      const formData = new FormData()
      formData.set('relationshipId', relationship.id)
      const key = attemptKeys.current.get(action) ?? nextIdempotencyKey()
      attemptKeys.current.set(action, key)
      formData.set('idempotencyKey', key)
      const actions = await import('@/app/actions/coachingRelationships')
      const result = action === 'end'
        ? await actions.endCoachingRelationship(formData)
        : await actions.resumePausedCoachingRelationship(formData)
      setMessage({ text: result.ok ? action === 'end' ? 'El acompaÃ±amiento fue finalizado.' : 'El acompaÃ±amiento fue reanudado.' : result.error, isError: !result.ok })
      if (result.ok) {
        attemptKeys.current.delete(action)
        setConfirming(null)
      }
    } catch {
      setMessage({ text: 'No se pudo actualizar el acompaÃ±amiento.', isError: true })
    } finally {
      setRelationshipBusy(false)
    }
  }

  if (!requests.length && !relationship) return <p className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">No tienes solicitudes de acompaÃ±amiento.</p>

  return <section className="space-y-3" aria-labelledby="coaching-requests-title">
    <h2 id="coaching-requests-title" className="text-lg font-bold text-foreground">Tus solicitudes</h2>
    {relationship ? <article className="rounded-2xl border border-border/70 p-4" aria-labelledby="coaching-relationship-title">
      <h3 id="coaching-relationship-title" className="font-semibold text-foreground">{relationship.status === 'active' ? 'AcompaÃ±amiento activo' : 'AcompaÃ±amiento pausado'}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{relationship.status === 'active' ? 'Puedes finalizar este acompaÃ±amiento en cualquier momento.' : 'Tu entrenador ya puede atenderte. Confirma si deseas reanudarlo.'}</p>
      <button type="button" onClick={() => setConfirming(relationship.status === 'active' ? 'end' : 'resume')} disabled={relationshipBusy}
        aria-controls="client-relationship-confirmation" aria-expanded={confirming !== null} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">{relationship.status === 'active' ? 'Finalizar acompaÃ±amiento' : 'Reanudar acompaÃ±amiento'}</button>
      {confirming ? <div id="client-relationship-confirmation" role="group" aria-describedby="client-relationship-confirmation-description" className="mt-3 rounded-xl border border-border/70 p-3">
        <p id="client-relationship-confirmation-description" className="text-sm text-muted-foreground">{confirming === 'end' ? 'Se revocarÃ¡ el acceso a tus datos de entrenamiento de inmediato.' : 'Se crearÃ¡ un nuevo consentimiento de datos de entrenamiento. Las medidas corporales seguirÃ¡n sin compartirse hasta que las autorices.'}</p>
        <div className="mt-3 flex gap-2"><button type="button" onClick={() => void manageRelationship(confirming)} disabled={relationshipBusy} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{relationshipBusy ? 'Guardandoâ€¦' : confirming === 'end' ? 'Confirmar finalizaciÃ³n' : 'Confirmar reanudaciÃ³n'}</button><button type="button" onClick={() => setConfirming(null)} disabled={relationshipBusy} className="min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">Cancelar</button></div>
      </div> : null}
    </article> : null}
    <ul className="space-y-3">{requests.map(request => <li key={request.id} className="rounded-2xl border border-border/70 p-4">
      <p className="font-semibold text-foreground">{statusLabels[request.status]}</p>
      <p className="mt-1 text-sm text-muted-foreground">Enviada el {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(request.createdAt))}</p>
      {request.status === 'pending' ? <button type="button" onClick={() => void cancel(request.id)} disabled={cancellingId === request.id} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">{cancellingId === request.id ? 'Cancelandoâ€¦' : 'Cancelar solicitud'}</button> : null}
    </li>)}</ul>
    <CoachingActionAnnouncement message={message.text} isError={message.isError} />
  </section>
}
