import type { ClientCoachingSummary } from '@/lib/coaching/clientSummary'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export type CoachingSummaryDisplayState =
  | 'paused'
  | 'needs_consent'
  | 'routines_available'
  | 'awaiting_routine'

const stateLabels: Record<CoachingSummaryDisplayState, string> = {
  paused: 'Acompañamiento pausado',
  needs_consent: 'Falta autorizar tus datos de entrenamiento',
  routines_available: 'Rutinas en tu lista',
  awaiting_routine: 'Tu entrenador está preparando el siguiente paso',
}

const ctaLabels: Record<CoachingSummaryDisplayState, string> = {
  paused: 'Revisar acompañamiento',
  needs_consent: 'Completar autorización',
  routines_available: 'Ver mis rutinas',
  awaiting_routine: 'Ver acompañamiento',
}

export function getCoachingSummaryDisplayState(
  summary: ClientCoachingSummary,
): CoachingSummaryDisplayState {
  if (summary.relationshipStatus === 'paused_by_platform') return 'paused'
  if (!summary.trainingConsentActive) return 'needs_consent'
  if (summary.assignmentCount > 0) return 'routines_available'
  return 'awaiting_routine'
}

export function CoachingSummaryCard({
  summary,
}: {
  summary: ClientCoachingSummary
}): React.JSX.Element {
  const state = getCoachingSummaryDisplayState(summary)
  const initials = summary.trainerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'E'

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar aria-hidden="true" className="h-12 w-12 shrink-0 border border-border/70">
          {summary.trainerAvatarUrl ? (
            <AvatarImage
              alt=""
              className="object-cover"
              src={summary.trainerAvatarUrl}
            />
          ) : null}
          <AvatarFallback className="bg-violet-600 font-semibold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tu acompañamiento
          </p>
          <p className="truncate font-semibold text-foreground">{summary.trainerName}</p>
          <p className="truncate text-sm text-muted-foreground">{summary.serviceName}</p>
          <p className="mt-1 text-sm font-medium text-foreground" aria-label="Estado del acompañamiento">
            {state === 'routines_available' ? `${summary.assignmentCount} ${summary.assignmentCount === 1 ? 'rutina en tu lista' : 'rutinas en tu lista'}` : stateLabels[state]}
          </p>
        </div>
      </div>
      <a
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        href={state === 'routines_available' ? '/plan' : '/coaching'}
      >
        {ctaLabels[state]}
      </a>
    </article>
  )
}
