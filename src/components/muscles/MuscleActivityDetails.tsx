'use client'

import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { buildMuscleBreakdown, MuscleDateRange } from '@/lib/muscles/activity'

type Breakdown = ReturnType<typeof buildMuscleBreakdown>
type Props = {
  current: Breakdown
  previous: Breakdown
  range: MuscleDateRange
  previousRange: MuscleDateRange
  hasPreviousRecords: boolean
  muscleName: string
  language: 'es' | 'en'
}

function dateLabel(value: string, language: 'es' | 'en') {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}
function rangeLabel(range: MuscleDateRange, language: 'es' | 'en') {
  return `${dateLabel(range.from, language)} – ${dateLabel(range.to, language)}`
}
function setsLabel(sets: number, es: boolean) { return es ? (sets === 1 ? 'serie' : 'series') : (sets === 1 ? 'set' : 'sets') }

function Contributions({ breakdown, language }: { breakdown: Breakdown; language: 'es' | 'en' }) {
  const es = language === 'es'
  return (
    <ul className="mt-3 space-y-3">
      {breakdown.exercises.map(exercise => (
        <li key={exercise.key} className="min-w-0 rounded-xl border border-border/60 bg-background/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {exercise.exerciseId ? (
                <PendingLink href={`/exercises/${exercise.exerciseId}#exercise-history-title`} aria-label={`${es ? 'Historial de' : 'History of'} ${exercise.exerciseName}`} className="flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  <span className="min-w-0 break-words">{exercise.exerciseName}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
                </PendingLink>
              ) : <p className="py-3 text-sm font-semibold text-foreground">{exercise.exerciseName}</p>}
            </div>
            <p className="shrink-0 pt-3 text-sm font-bold tabular-nums text-foreground">{exercise.sets} <span className="text-xs font-normal text-muted-foreground">{setsLabel(exercise.sets, es)}</span></p>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-violet-400" style={{ width: `${breakdown.sets ? exercise.sets / breakdown.sets * 100 : 0}%` }} /></div>
          {exercise.sessions.length > 0 && (
            <details className="group mt-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                {es ? `Ver ${exercise.sessions.length} ${exercise.sessions.length === 1 ? 'sesión' : 'sesiones'}` : `View ${exercise.sessions.length} ${exercise.sessions.length === 1 ? 'session' : 'sessions'}`}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="border-t border-border/50">
                {exercise.sessions.map(session => (
                  <li key={session.sessionId}>
                    <PendingLink href={`/history/${session.sessionId}`} className="flex min-h-14 items-center justify-between gap-3 rounded-lg py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                      <span className="min-w-0"><span className="block break-words font-medium text-foreground">{session.sessionName}</span><span className="mt-1 block text-xs text-muted-foreground">{dateLabel(session.date, language)}</span></span>
                      <span className="shrink-0 text-xs tabular-nums text-violet-300">{session.sets} {setsLabel(session.sets, es)}</span>
                    </PendingLink>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  )
}

export function MuscleActivityDetails({ current, previous, range, previousRange, hasPreviousRecords, muscleName, language }: Props) {
  const es = language === 'es'
  const delta = current.sets - previous.sets
  return (
    <section data-muscle-details aria-label={`${es ? 'Detalle de' : 'Details for'} ${muscleName}`} className="mt-3 min-w-0 rounded-2xl border border-violet-400/25 bg-violet-500/[0.04] p-3 sm:p-4">
      <h3 className="font-display text-xl font-bold text-foreground">{muscleName}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div data-period="current" className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{es ? 'Periodo elegido' : 'Selected period'}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{current.sets}<span className="ml-1.5 text-xs font-normal text-muted-foreground">{setsLabel(current.sets, es)}</span></p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{rangeLabel(range, language)}</p>
        </div>
        <div data-period="previous" className="min-w-0 border-l border-border/70 pl-3">
          <p className="text-xs font-semibold text-muted-foreground">{es ? 'Periodo anterior' : 'Previous period'}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{hasPreviousRecords ? previous.sets : '—'}{hasPreviousRecords && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{setsLabel(previous.sets, es)}</span>}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{rangeLabel(previousRange, language)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm font-medium text-violet-700 dark:text-violet-300">
        {!hasPreviousRecords
          ? (es ? 'Sin registros en el periodo anterior para comparar.' : 'No records in the previous period to compare.')
          : delta === 0
            ? (es ? 'Mismo número de series que en el periodo anterior.' : 'The same number of sets as in the previous period.')
            : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${setsLabel(Math.abs(delta), es)} ${es ? 'frente al periodo anterior' : 'versus the previous period'}`}
      </p>
      <h4 className="mt-5 text-sm font-semibold text-foreground">{es ? 'Ejercicios que aportaron series' : 'Exercises contributing sets'}</h4>
      {current.exercises.length === 0
        ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{es ? 'No hay series de este músculo en el periodo elegido.' : 'No sets for this muscle in the selected period.'}</p>
        : <Contributions breakdown={current} language={language} />}
      {hasPreviousRecords && previous.exercises.length > 0 && (
        <details className="mt-4 border-t border-border/60 pt-1">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-lg text-sm font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{es ? 'Ver aportes del periodo anterior' : 'View contributions from the previous period'}</summary>
          <Contributions breakdown={previous} language={language} />
        </details>
      )}
    </section>
  )
}
