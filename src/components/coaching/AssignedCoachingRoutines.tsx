import { ArrowRight, ChevronDown } from 'lucide-react'

export type AssignedCoachingRoutine = {
  id: string
  name: string
  trainerName: string
  message?: string | null
}

export function AssignedCoachingRoutines({ routines }: { routines: AssignedCoachingRoutine[] }) {
  return <section className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4" aria-labelledby="assigned-routines-title">
    <h2 id="assigned-routines-title" className="text-lg font-bold text-foreground">Rutinas de tu entrenador</h2>
    <p className="mt-1 text-sm text-muted-foreground">Elige en Plan la que quieres entrenar.</p>
    <ul className="mt-4 space-y-3">{routines.map(routine => <li key={routine.id} className="min-w-0 rounded-xl border border-border/70 bg-card p-3">
      <h3 className="break-words font-semibold text-foreground">{routine.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{routine.trainerName}</p>
      {routine.message ? <details className="group mt-2 border-t border-border/70">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Nota del entrenador<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
        <p className="whitespace-pre-wrap break-words pb-1 text-sm text-foreground">{routine.message}</p>
      </details> : null}
    </li>)}</ul>
    <a href="/plan" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2">Ver mis rutinas<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></a>
  </section>
}
