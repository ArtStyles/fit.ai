import { CalendarClock, CheckCircle2, CircleDot, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import type { TrainerApplicationStatus } from '@/lib/coaching/status'
import { cn } from '@/lib/utils'

export type TrainerApplicationEventView = {
  id: string
  toStatus: TrainerApplicationStatus
  publicNote: string | null
  createdAt: string
}

export type TrainerInterviewView = {
  proposedAt: string
  timezone: string
  medium: 'video_call' | 'phone' | 'in_person'
  externalUrl: string | null
  status: 'proposed' | 'scheduled' | 'completed' | 'cancelled'
  publicNote: string | null
}

const STATUS_COPY: Record<TrainerApplicationStatus, { label: string; tone: string }> = {
  draft: { label: 'Borrador', tone: 'text-slate-300' },
  submitted: { label: 'Enviada', tone: 'text-blue-300' },
  under_review: { label: 'En revisión', tone: 'text-amber-300' },
  changes_requested: { label: 'Cambios solicitados', tone: 'text-orange-300' },
  interview_required: { label: 'Entrevista requerida', tone: 'text-violet-300' },
  approved: { label: 'Aprobada', tone: 'text-emerald-300' },
  rejected: { label: 'No aprobada', tone: 'text-red-300' },
  withdrawn: { label: 'Retirada', tone: 'text-slate-300' },
}

const MEDIUM_COPY: Record<TrainerInterviewView['medium'], string> = {
  video_call: 'Videollamada',
  phone: 'Llamada telefónica',
  in_person: 'Presencial',
}

const INTERVIEW_STATUS_COPY: Record<TrainerInterviewView['status'], string> = {
  proposed: 'Propuesta',
  scheduled: 'Programada',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

function safeTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: value }).format()
    return value
  } catch {
    return 'UTC'
  }
}

function formatDate(value: string, timezone: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const resolvedTimezone = safeTimezone(timezone)
  const formatted = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: resolvedTimezone,
  }).format(timestamp)
  return `${formatted} (${resolvedTimezone})`
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) ? url.toString() : null
  } catch {
    return null
  }
}

function StatusIcon({ status }: { status: TrainerApplicationStatus }) {
  if (status === 'approved') return <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
  if (status === 'rejected') return <XCircle className="h-5 w-5" aria-hidden="true" />
  if (status === 'changes_requested') return <RefreshCw className="h-5 w-5" aria-hidden="true" />
  return <CircleDot className="h-5 w-5" aria-hidden="true" />
}

export function ApplicationTimeline({
  events,
  interview,
  applicantTimezone,
}: {
  events: TrainerApplicationEventView[]
  interview: TrainerInterviewView | null
  applicantTimezone: string
}) {
  const orderedEvents = [...events].sort((left, right) => (
    Date.parse(left.createdAt) - Date.parse(right.createdAt)
  ))
  const interviewUrl = safeHttpsUrl(interview?.externalUrl ?? null)
  const actionableInterviewUrl = interview?.status === 'scheduled' ? interviewUrl : null

  if (orderedEvents.length === 0 && !interview) return null

  return (
    <section aria-labelledby="application-timeline-title" className="rounded-3xl border border-border/60 bg-muted/10 p-5 sm:p-6">
      <h2 id="application-timeline-title" className="text-lg font-bold text-foreground">Seguimiento de tu solicitud</h2>
      <ol className="mt-5 space-y-5">
        {orderedEvents.map(event => {
          const copy = STATUS_COPY[event.toStatus]
          return (
            <li key={event.id} className="relative flex gap-4">
              <span className={cn('mt-0.5 shrink-0', copy.tone)}><StatusIcon status={event.toStatus} /></span>
              <div className="min-w-0">
                <h3 className="font-semibold text-foreground">{copy.label}</h3>
                <time dateTime={event.createdAt} className="mt-0.5 block text-xs text-muted-foreground">
                  {formatDate(event.createdAt, applicantTimezone)}
                </time>
                {event.publicNote ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{event.publicNote}</p> : null}
              </div>
            </li>
          )
        })}
      </ol>

      {interview ? (
        <article className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-500/[0.08] p-4" aria-labelledby="interview-title">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
            <div>
              <h3 id="interview-title" className="font-semibold text-foreground">Entrevista · {MEDIUM_COPY[interview.medium]}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(interview.proposedAt, applicantTimezone)}
              </p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                Estado: {INTERVIEW_STATUS_COPY[interview.status]}
              </p>
              {interview.publicNote ? <p className="mt-2 text-sm leading-relaxed text-foreground/90">{interview.publicNote}</p> : null}
              {actionableInterviewUrl ? (
                <a
                  href={actionableInterviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                >
                  Abrir enlace seguro <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : interview.status === 'scheduled' && interview.externalUrl ? (
                <p role="alert" className="mt-3 text-sm text-amber-200">
                  El enlace de la entrevista no está disponible de forma segura.
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-4 border-t border-violet-500/20 pt-4 text-xs leading-relaxed text-muted-foreground">
            La coordinación usa los datos de contacto suministrados y no existe mensajería privada en esta versión.
          </p>
        </article>
      ) : null}
    </section>
  )
}
