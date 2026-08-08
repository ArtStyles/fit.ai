'use client'

import { useState } from 'react'
import { cancelCoachingRequest } from '@/app/actions/coachingRequests'
import type { CoachingRequestStatus } from '@/lib/coaching/relationships'

const statusLabels: Record<CoachingRequestStatus, string> = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'No aceptada', cancelled: 'Cancelada' }

export type ClientCoachingRequestView = { id: string; status: CoachingRequestStatus; createdAt: string }

export function ClientCoachingStatus({ requests }: { requests: ClientCoachingRequestView[] }) {
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function cancel(requestId: string) {
    setCancellingId(requestId)
    const formData = new FormData()
    formData.set('requestId', requestId)
    const result = await cancelCoachingRequest(formData)
    setCancellingId(null)
    setMessage(result.ok ? 'La solicitud fue cancelada.' : result.error)
  }

  if (!requests.length) return <p className="rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">No tienes solicitudes de acompañamiento.</p>

  return <section className="space-y-3" aria-labelledby="coaching-requests-title">
    <h2 id="coaching-requests-title" className="text-lg font-bold text-foreground">Tus solicitudes</h2>
    <ul className="space-y-3">{requests.map(request => <li key={request.id} className="rounded-2xl border border-border/70 p-4">
      <p className="font-semibold text-foreground">{statusLabels[request.status]}</p>
      <p className="mt-1 text-sm text-muted-foreground">Enviada el {new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(request.createdAt))}</p>
      {request.status === 'pending' ? <button type="button" onClick={() => void cancel(request.id)} disabled={cancellingId === request.id} className="mt-3 min-h-11 rounded-xl border border-border/70 px-3 text-sm font-semibold text-foreground disabled:opacity-50">{cancellingId === request.id ? 'Cancelando…' : 'Cancelar solicitud'}</button> : null}
    </li>)}</ul>
    <p aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
  </section>
}
