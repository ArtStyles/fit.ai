import { ArrowUpRight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { ProgressLocale } from './progressSummary'
import type { ProgressExercisePoint, ProgressRecord } from './progressViewModel'

function result(weight: number, reps: number, locale: ProgressLocale) {
  const amount = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: 2 }).format(weight)
  return weight > 0 ? `${amount} kg × ${reps} reps` : `${reps} reps`
}

function dateLabel(date: string, locale: ProgressLocale) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

function isLaterPoint(candidate: ProgressExercisePoint, current: ProgressExercisePoint): boolean {
  if (candidate.date !== current.date) return candidate.date > current.date
  if (!candidate.completedAt || !current.completedAt) return false
  const candidateTime = Date.parse(candidate.completedAt)
  const currentTime = Date.parse(current.completedAt)
  if (!Number.isFinite(candidateTime) || !Number.isFinite(currentTime)) return false
  if (candidateTime !== currentTime) return candidateTime > currentTime
  if (!candidate.sessionId || !current.sessionId) return false
  return candidate.sessionId > current.sessionId
}

export function ProgressPerformanceList({ records, points, locale }: {
  records: ProgressRecord[]
  points: ProgressExercisePoint[]
  locale: ProgressLocale
}) {
  const latestByExercise = new Map<string, ProgressExercisePoint>()
  for (const point of points) {
    const current = latestByExercise.get(point.exerciseId)
    if (!current || isLaterPoint(point, current)) latestByExercise.set(point.exerciseId, point)
  }
  const recordsByExercise = new Map(records.map(record => [record.exerciseId, record]))
  const ids = Array.from(new Set([...Array.from(latestByExercise.keys()), ...Array.from(recordsByExercise.keys())]))
  ids.sort((a, b) => {
    const dateA = latestByExercise.get(a)?.date ?? recordsByExercise.get(a)!.bestDate
    const dateB = latestByExercise.get(b)?.date ?? recordsByExercise.get(b)!.bestDate
    return dateB.localeCompare(dateA) || a.localeCompare(b)
  })

  if (!ids.length) return <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{locale === 'en' ? 'Log sets with weight and repetitions to see exercise results in this period.' : 'Guarda series con carga y repeticiones para ver resultados por ejercicio en este periodo.'}</p>

  return <ul className="mt-4 divide-y divide-border/50">
    {ids.map(id => {
      const latest = latestByExercise.get(id)
      const record = recordsByExercise.get(id)
      return <li key={id}>
        <PendingLink href={`/exercises/${id}`} className="group flex min-h-16 items-start justify-between gap-3 rounded-xl py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" spinnerClassName="h-3.5 w-3.5">
          <div className="min-w-0 space-y-2">
            <p className="break-words text-sm font-semibold text-foreground group-hover:text-violet-300">{latest?.exerciseName ?? record!.exerciseName}</p>
            {latest && <p className="text-xs leading-relaxed text-muted-foreground">
              {locale === 'en' ? 'Latest recorded day' : 'Último día registrado'} · {dateLabel(latest.date, locale)}
              <span className="mt-0.5 block font-semibold tabular-nums text-foreground">{result(latest.maxWeightKg, latest.repsAtMaxWeight, locale)}</span>
            </p>}
            {record && <p className="text-xs leading-relaxed text-muted-foreground">
              {locale === 'en' ? 'Best in the last 12 months' : 'Mejor en los últimos 12 meses'} · {dateLabel(record.bestDate, locale)}
              <span className="mt-0.5 block font-semibold tabular-nums text-violet-300">{result(record.maxWeightKg, record.maxWeightKg > 0 ? record.repsAtMaxWeight : record.maxReps, locale)}</span>
            </p>}
          </div>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PendingLink>
      </li>
    })}
  </ul>
}
