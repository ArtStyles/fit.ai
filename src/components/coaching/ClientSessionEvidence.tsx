import type { CoachClientSessionEvidence } from '@/lib/coaching/insights'

function values(value: number[] | null, suffix = '') {
  return value === null || value.length === 0 ? 'Sin registrar' : `${value.join(', ')}${suffix}`
}

export function ClientSessionEvidence({ session, timeZone }: { session: CoachClientSessionEvidence; timeZone: string }) {
  const completedAt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(session.completedAt))
  return <article className="rounded-2xl border border-border/70 bg-muted/10 p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold text-foreground">{session.workoutName}</h3>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{session.status}</span>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">Completada: {completedAt}{session.durationMinutes === null ? '' : ` · ${session.durationMinutes} min`}</p>
    {session.exerciseResults.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Sin ejercicios registrados; evidencia incompleta.</p> : <ul className="mt-3 space-y-3">
      {session.exerciseResults.map(result => <li key={result.id} className="border-l-2 border-violet-400/50 pl-3 text-sm">
        <p className="font-medium text-foreground">{result.name}</p>
        <p className="mt-1 text-muted-foreground">Sets: {result.setsCompleted ?? 'Sin registrar'} · Reps: {values(result.repsCompleted)} · Carga: {values(result.weightsKg, ' kg')} · RPE: {values(result.rpeValues)} · Duración: {result.durationSeconds === null ? 'Sin registrar' : `${result.durationSeconds} s`}</p>
        {result.notes === null ? null : <p className="mt-1 whitespace-pre-wrap text-muted-foreground">Notas: {result.notes}</p>}
      </li>)}
    </ul>}
    {session.notes === null ? null : <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">Notas de la sesión: {session.notes}</p>}
  </article>
}
