import Link from 'next/link'
import { AlertTriangle, ChevronRight, UsersRound } from 'lucide-react'
import type { CoachClientSummary } from '@/lib/coaching/insights'

function sessionDate(value: string | null) {
  if (!value) return 'Aún no hay sesión prescrita registrada'
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value))
}

export function CoachClientList({ clients }: { clients: readonly CoachClientSummary[] }) {
  if (!clients.length) return <section className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
    <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
    <h1 className="mt-4 text-xl font-bold text-foreground">Todavía no tienes clientes activos</h1>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Los clientes con una relación activa y consentimiento vigente aparecerán aquí.</p>
  </section>

  return <section aria-labelledby="coach-client-list-title">
    <h1 id="coach-client-list-title" className="text-xl font-bold text-foreground">Clientes activos</h1>
    <ul className="mt-4 space-y-3">{clients.map(client => <li key={client.clientId}>
      <Link href={`/coach/clients/${client.clientId}`} className="block rounded-2xl border border-border/70 bg-muted/10 p-4 transition-colors hover:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">{client.fullName ?? 'Cliente'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Última sesión prescrita: {sessionDate(client.lastPrescribedSessionAt)}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">{client.adherence.completed} de {client.adherence.prescribed} sesiones prescritas ({client.adherence.adherencePercent}%)</p>
        {client.alerts.length > 0 ? <div className="mt-3 flex items-start gap-2 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div><span className="font-medium">Atención operativa</span><span className="sr-only">: </span>{client.alerts.map(alert => alert.message).join(' ')}</div>
        </div> : null}
      </Link>
    </li>)}</ul>
  </section>
}
