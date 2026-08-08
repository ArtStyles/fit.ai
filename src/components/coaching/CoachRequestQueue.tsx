'use client'

import { useState } from 'react'

type CoachRequest = { id: string; message: string; createdAt: string; serviceName: string }

function CoachingActionAnnouncement({ message, isError }: { message: string; isError: boolean }) {
  return <p {...(isError ? { role: 'alert' } : { 'aria-live': 'polite' })} className="mt-3 text-sm text-muted-foreground">{message}</p>
}

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

export function CoachRequestQueue({ requests }: { requests: CoachRequest[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState({ text: '', isError: false })

  async function accept(requestId: string) {
    if (!window.confirm('Â¿Aceptar esta solicitud de acompaÃ±amiento?')) return
    setBusyId(requestId)
    try {
      const formData = new FormData()
      formData.set('requestId', requestId)
      formData.set('idempotencyKey', newIdempotencyKey())
      const { acceptCoachingRequest } = await import('@/app/actions/coachingRequests')
      const result = await acceptCoachingRequest(formData)
      setMessage({ text: result.ok ? 'La solicitud fue aceptada.' : result.error, isError: !result.ok })
    } catch {
      setMessage({ text: 'No se pudo aceptar la solicitud.', isError: true })
    } finally {
      setBusyId(null)
    }
  }

  async function decline(requestId: string) {
    if (!window.confirm('Â¿Rechazar esta solicitud?')) return
    setBusyId(requestId)
    try {
      const formData = new FormData()
      formData.set('requestId', requestId)
      formData.set('reason', '')
      const { declineCoachingRequest } = await import('@/app/actions/coachingRequests')
      const result = await declineCoachingRequest(formData)
      setMessage({ text: result.ok ? 'La solicitud fue rechazada.' : result.error, isError: !result.ok })
    } catch {
      setMessage({ text: 'No se pudo rechazar la solicitud.', isError: true })
    } finally {
      setBusyId(null)
    }
  }

  if (!requests.length) return <section className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
    <h1 className="text-xl font-bold text-foreground">No hay solicitudes nuevas</h1>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Las solicitudes reales aparecerÃ¡n aquÃ­ cuando alguien pida trabajar contigo.</p>
  </section>

  return <section aria-labelledby="coach-request-queue-title" className="space-y-3">
    <h1 id="coach-request-queue-title" className="text-xl font-bold text-foreground">Solicitudes pendientes</h1>
    <ul className="space-y-3">{requests.map(request => {
      const busy = busyId === request.id
      return <li key={request.id} className="rounded-2xl border border-border/70 p-4">
        <h2 className="font-semibold text-foreground">{request.serviceName}</h2>
        {request.message ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.message}</p> : <p className="mt-2 text-sm text-muted-foreground">Sin mensaje adicional.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Recibida el {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(request.createdAt))}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void accept(request.id)} className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Guardandoâ€¦' : 'Aceptar'}</button>
          <button type="button" disabled={busy} onClick={() => void decline(request.id)} className="min-h-11 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground disabled:opacity-50">Rechazar</button>
        </div>
      </li>
    })}</ul>
    <CoachingActionAnnouncement message={message.text} isError={message.isError} />
  </section>
}
