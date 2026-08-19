'use client'

import Link from 'next/link'
import { AlertTriangle, ChevronRight, UsersRound } from 'lucide-react'
import { useState } from 'react'
import type { CoachClientSummary } from '@/lib/coaching/insights'
import { trackEvent } from '@/lib/analytics/events'

function evidenceDate(value: string | null, timeZone: string) {
  if (!value) return 'Aún no hay evidencia profesional registrada'
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone }).format(new Date(value))
}

export function CoachClientList({ clients, viewerTimeZone }: {
  clients: readonly CoachClientSummary[]
  viewerTimeZone: string
}) {
  const [filter, setFilter] = useState<'all' | 'attention'>('all')
  const attentionClients = clients.filter(client => client.alerts.length > 0)

  if (!clients.length) return <section className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
    <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
    <h1 className="mt-4 text-xl font-bold text-foreground">Todavía no tienes clientes activos</h1>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Los clientes con una relación activa y consentimiento vigente aparecerán aquí.</p>
  </section>

  const visibleClients = filter === 'attention' ? attentionClients : clients

  function selectFilter(nextFilter: 'all' | 'attention') {
    if (nextFilter === filter) return
    setFilter(nextFilter)
    void trackEvent('coach_alert_filter_used', {
      alert_filter: nextFilter,
      matching_client_count: nextFilter === 'attention' ? attentionClients.length : clients.length,
    })
  }

  return <section aria-labelledby="coach-client-list-title">
    <h1 id="coach-client-list-title" className="text-xl font-bold text-foreground">Clientes activos</h1>
    <div aria-label="Filtrar alertas" className="mt-4 flex flex-wrap gap-2">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => selectFilter('all')} className="rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Todos ({clients.length})</button>
      <button type="button" aria-pressed={filter === 'attention'} onClick={() => selectFilter('attention')} className="rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Con atención ({attentionClients.length})</button>
    </div>
    {visibleClients.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-border/70 p-5 text-sm text-muted-foreground">No hay clientes con alertas operativas.</p> : <ul className="mt-4 space-y-3">{visibleClients.map(client => <li key={client.clientId}>
      <Link href={`/coach/clients/${client.clientId}`} className="block rounded-2xl border border-border/70 bg-muted/10 p-4 transition-colors hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">{client.fullName ?? 'Cliente'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Última evidencia profesional: {evidenceDate(client.lastProfessionalEvidenceAt, viewerTimeZone)}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">{client.adherence.completed} de {client.adherence.prescribed} sesiones prescritas ({client.adherence.adherencePercent}%)</p>
        {client.alerts.length > 0 ? <div className="mt-3 flex items-start gap-2 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div><span className="font-medium">Atención operativa</span><span className="sr-only">: </span>{client.alerts.map(alert => alert.message).join(' ')}</div>
        </div> : null}
      </Link>
    </li>)}</ul>}
  </section>
}
