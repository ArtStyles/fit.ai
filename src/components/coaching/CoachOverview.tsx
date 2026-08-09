import Link from 'next/link'
import { ClipboardList, Dumbbell, PauseCircle, UserRound, UsersRound } from 'lucide-react'
import type { CoachClientsSummary } from '@/lib/coaching/insights'

export function CoachOverview({ professionalName, summary }: { professionalName: string; summary: CoachClientsSummary }) {
  return <section aria-labelledby="coach-overview-title">
    <div className="rounded-3xl border border-border/60 bg-muted/10 p-6">
      <p className="text-sm font-medium text-violet-300">Perfil activo</p>
      <h1 id="coach-overview-title" className="mt-2 text-2xl font-bold text-foreground">{professionalName}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Resumen de relaciones profesionales y seguimiento operativo de rutinas prescritas.</p>
    </div>
    <dl className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5"><dt className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardList className="h-4 w-4" aria-hidden="true" />Solicitudes pendientes</dt><dd className="mt-2 text-2xl font-bold text-foreground">{summary.counts.pendingRequests}</dd></div>
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5"><dt className="flex items-center gap-2 text-sm text-muted-foreground"><UsersRound className="h-4 w-4" aria-hidden="true" />Clientes activos</dt><dd className="mt-2 text-2xl font-bold text-foreground">{summary.counts.activeClients}</dd></div>
      <div className="rounded-2xl border border-border/60 bg-muted/10 p-5"><dt className="flex items-center gap-2 text-sm text-muted-foreground"><PauseCircle className="h-4 w-4" aria-hidden="true" />Relaciones pausadas</dt><dd className="mt-2 text-2xl font-bold text-foreground">{summary.counts.pausedRelationships}</dd></div>
    </dl>
    <nav aria-label="Espacio profesional" className="mt-6 grid gap-3 sm:grid-cols-2">
      <Link href="/coach/clients" className="flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white"><UsersRound className="h-4 w-4" aria-hidden="true" />Ver clientes activos</Link>
      <Link href="/coach/requests" className="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground"><ClipboardList className="h-4 w-4" aria-hidden="true" />Revisar solicitudes</Link>
      <Link href="/coach/programs" className="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground"><Dumbbell className="h-4 w-4" aria-hidden="true" />Gestionar rutinas</Link>
      <Link href="/coach/profile" className="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground"><UserRound className="h-4 w-4" aria-hidden="true" />Editar perfil</Link>
    </nav>
  </section>
}
