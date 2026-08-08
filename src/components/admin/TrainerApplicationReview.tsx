import { CalendarClock, ExternalLink, FileCheck2, History, Inbox, Mail, MapPin, Phone, UserRoundSearch } from 'lucide-react'
import {
  approveTrainerApplication,
  recordTrainerInterviewOutcome,
  rejectTrainerApplication,
  requestTrainerChanges,
  scheduleTrainerInterview,
  startTrainerReview,
} from '@/app/actions/adminTrainers'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ADMIN_TRAINER_STATUSES,
  type AdminTrainerApplicationDetail,
  type AdminTrainerApplicationStatus,
  type AdminTrainerQueueItem,
} from '@/lib/auth/adminTrainers'

const STATUS_LABELS: Record<AdminTrainerApplicationStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  under_review: 'En revisión',
  changes_requested: 'Cambios solicitados',
  interview_required: 'Entrevista requerida',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  withdrawn: 'Retirada',
}

const MODALITY_LABELS = {
  online: 'Online',
  in_person: 'Presencial',
  hybrid: 'Híbrida',
} as const

const INTERVIEW_MEDIUM_LABELS = {
  video_call: 'Videollamada',
  phone: 'Teléfono',
  in_person: 'Presencial',
} as const

function formatDate(value: string | null): string {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusBadge(status: AdminTrainerApplicationStatus) {
  return <Badge variant="outline" className="border-violet-500/30 text-violet-200">{STATUS_LABELS[status]}</Badge>
}

const fieldClass = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500'
const noteClass = 'w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500'

async function submitStartTrainerReview(formData: FormData): Promise<void> {
  'use server'
  await startTrainerReview(formData)
}

async function submitTrainerChanges(formData: FormData): Promise<void> {
  'use server'
  await requestTrainerChanges(formData)
}

async function submitTrainerInterview(formData: FormData): Promise<void> {
  'use server'
  await scheduleTrainerInterview(formData)
}

async function submitTrainerInterviewOutcome(formData: FormData): Promise<void> {
  'use server'
  await recordTrainerInterviewOutcome(formData)
}

async function submitTrainerApproval(formData: FormData): Promise<void> {
  'use server'
  await approveTrainerApplication(formData)
}

async function submitTrainerRejection(formData: FormData): Promise<void> {
  'use server'
  await rejectTrainerApplication(formData)
}

export function TrainerApplicationQueue({
  applications,
  selectedStatus,
}: {
  applications: AdminTrainerQueueItem[]
  selectedStatus?: AdminTrainerApplicationStatus
}) {
  return (
    <div className="space-y-5">
      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Estado</span>
          <select
            name="status"
            defaultValue={selectedStatus ?? ''}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">Todos los estados</option>
            {ADMIN_TRAINER_STATUSES.map(status => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <SubmitButton
          label="Filtrar"
          pendingLabel="Filtrando"
          className="h-11 bg-violet-500 text-white hover:bg-violet-400"
        />
      </form>

      <section className="space-y-3" aria-label="Solicitudes de entrenador">
        {applications.length === 0 ? (
          <Card className="border-border/60 bg-muted/10">
            <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-7 w-7" />
              No hay solicitudes para este estado.
            </CardContent>
          </Card>
        ) : applications.map(application => (
          <Card key={application.id} className="border-border/60 bg-card/50">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{application.professionalName || 'Sin nombre profesional'}</h2>
                    {statusBadge(application.status)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(application.applicationDate)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {application.specialties.length > 0
                      ? application.specialties.map(specialty => <Badge key={specialty} variant="secondary">{specialty}</Badge>)
                      : <span className="text-xs text-muted-foreground">Sin especialidades indicadas</span>}
                  </div>
                </div>
                <PendingLink
                  href={`/admin/trainers/${application.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-border/60 px-4 text-sm font-medium transition-colors hover:bg-muted/30"
                >
                  <UserRoundSearch className="mr-2 h-4 w-4" />
                  Abrir expediente
                </PendingLink>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}

export function TrainerApplicationReview({
  application,
}: {
  application: AdminTrainerApplicationDetail
}) {
  const canStartReview = application.status === 'submitted'
  const canDecide = application.status === 'under_review' || application.status === 'interview_required'
  const canScheduleInterview = application.status === 'under_review'
  const pendingInterview = application.interviews.find(interview => (
    interview.status === 'proposed' || interview.status === 'scheduled'
  ))
  const interviewId = crypto.randomUUID()

  return (
    <div className="space-y-5">
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-bold">{application.professionalName || 'Sin nombre profesional'}</h2>
              {statusBadge(application.status)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Enviada: {formatDate(application.submittedAt)}</p>
          </div>
          <details className="w-full max-w-3xl sm:w-auto">
            <summary className="ml-auto flex h-10 w-fit cursor-pointer list-none items-center rounded-md border border-violet-500/30 bg-background px-4 text-sm font-medium hover:bg-accent">
              Gestionar revisión
            </summary>
            <div className="mt-4 max-h-[75vh] overflow-y-auto rounded-2xl border border-border/60 bg-background p-5 sm:w-[min(48rem,calc(100vw-2.5rem))]">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Decisión administrativa</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Registra cambios, entrevistas y decisiones. Las notas internas solo aparecen en este expediente.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <form action={submitStartTrainerReview} className="rounded-xl border border-border/60 p-4">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <h3 className="font-semibold">Iniciar revisión</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Marca la solicitud enviada como revisión activa.</p>
                  <SubmitButton label="Iniciar revisión" pendingLabel="Iniciando" disabled={!canStartReview} className="mt-3 w-full" />
                </form>

                <form action={submitTrainerChanges} className="space-y-3 rounded-xl border border-border/60 p-4">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <h3 className="font-semibold">Solicitar cambios</h3>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Nota pública obligatoria</span>
                    <textarea name="publicNote" required minLength={3} maxLength={1000} rows={3} className={noteClass} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                    <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
                  </label>
                  <SubmitButton label="Solicitar cambios" pendingLabel="Guardando" disabled={!canDecide} className="w-full" />
                </form>

                <form action={submitTrainerInterview} className="space-y-3 rounded-xl border border-border/60 p-4 sm:col-span-2">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="interviewId" value={interviewId} />
                  <div>
                    <h3 className="font-semibold">Programar entrevista</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Coordina por los datos de contacto del expediente. Vekira no envía correo ni crea la videollamada.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Fecha futura</span>
                      <input name="proposedAt" type="datetime-local" required className={fieldClass} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Zona horaria</span>
                      <input name="timezone" required maxLength={100} defaultValue={application.timezone} className={fieldClass} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Medio</span>
                      <select name="medium" defaultValue="video_call" className={fieldClass}>
                        <option value="video_call">Videollamada externa</option>
                        <option value="phone">Teléfono</option>
                        <option value="in_person">Presencial</option>
                      </select>
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">URL HTTPS opcional</span>
                    <input name="externalUrl" type="url" inputMode="url" placeholder="https://meet.example.com/..." className={fieldClass} />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Nota pública</span>
                      <textarea name="publicNote" maxLength={1000} rows={2} className={noteClass} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                      <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
                    </label>
                  </div>
                  <SubmitButton label="Programar entrevista" pendingLabel="Programando" disabled={!canScheduleInterview} className="w-full" />
                </form>

                <form action={submitTrainerInterviewOutcome} className="space-y-3 rounded-xl border border-border/60 p-4 sm:col-span-2">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="interviewId" value={pendingInterview?.id ?? ''} />
                  <h3 className="font-semibold">Registrar resultado</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Estado</span>
                      <select name="interviewStatus" defaultValue="completed" className={fieldClass}>
                        <option value="completed">Completada</option>
                        <option value="cancelled">Cancelada</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Resultado</span>
                      <input name="outcome" required minLength={3} maxLength={1000} className={fieldClass} />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Nota pública</span>
                      <textarea name="publicNote" maxLength={1000} rows={2} className={noteClass} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                      <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
                    </label>
                  </div>
                  <SubmitButton label="Registrar resultado" pendingLabel="Registrando" disabled={!pendingInterview || application.status !== 'interview_required'} className="w-full" />
                </form>

                <form action={submitTrainerApproval} className="space-y-3 rounded-xl border border-emerald-500/25 p-4">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <h3 className="font-semibold text-emerald-200">Aprobar solicitud</h3>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Nota pública</span>
                    <textarea name="publicNote" maxLength={1000} rows={2} className={noteClass} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                    <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
                  </label>
                  <SubmitButton label="Aprobar solicitud" pendingLabel="Aprobando" disabled={!canDecide} className="w-full bg-emerald-600 text-white hover:bg-emerald-500" />
                </form>

                <form action={submitTrainerRejection} className="space-y-3 rounded-xl border border-red-500/25 p-4">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <h3 className="font-semibold text-red-200">Rechazar solicitud</h3>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Nota pública obligatoria</span>
                    <textarea name="publicNote" required minLength={3} maxLength={1000} rows={3} className={noteClass} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground">Nota interna</span>
                    <textarea name="internalNote" maxLength={2000} rows={2} className={noteClass} />
                  </label>
                  <SubmitButton label="Rechazar solicitud" pendingLabel="Rechazando" disabled={!canDecide} className="w-full" />
                </form>
              </div>

            </div>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle className="text-lg">Perfil profesional</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="whitespace-pre-wrap text-muted-foreground">{application.bio || 'Sin biografía.'}</p>
            <div><p className="font-semibold">Experiencia</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{application.experienceSummary || 'Sin resumen.'}</p></div>
            <div className="flex flex-wrap gap-1.5">{application.specialties.map(value => <Badge key={value} variant="secondary">{value}</Badge>)}</div>
            <p className="text-muted-foreground">Modalidades: {application.modalities.map(value => MODALITY_LABELS[value]).join(', ') || 'Sin indicar'}</p>
            <p className="text-muted-foreground">Idiomas: {application.languages.join(', ') || 'Sin indicar'}</p>
            {application.generalLocation && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{application.generalLocation}</p>}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle className="text-lg">Contacto y disponibilidad</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><a className="text-violet-300 hover:underline" href={`mailto:${application.contactEmail}`}>{application.contactEmail}</a></p>
            {application.contactPhone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{application.contactPhone}</p>}
            <p className="text-muted-foreground">Contacto preferido: {application.preferredContact}</p>
            <p className="text-muted-foreground">Zona horaria: {application.timezone}</p>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4" />Disponibilidad para entrevista</p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{application.interviewAvailability || 'Sin disponibilidad indicada.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileCheck2 className="h-5 w-5" />Credenciales privadas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {application.credentials.length === 0 ? <p className="text-sm text-muted-foreground">No hay credenciales.</p> : application.credentials.map(credential => (
            <div key={credential.id} className="flex flex-col gap-3 rounded-xl border border-border/60 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{credential.title}</p>
                <p className="text-xs text-muted-foreground">{credential.issuer || 'Emisor no indicado'} · {credential.credentialType === 'document' ? 'Documento privado' : 'Enlace externo'}</p>
                {credential.signedUrlExpiresInSeconds && <p className="mt-1 text-xs text-amber-200/80">El acceso temporal expira en 5 minutos.</p>}
              </div>
              {credential.url ? (
                <a href={credential.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-md border border-border/60 px-4 text-sm font-medium hover:bg-muted/30">
                  Abrir credencial <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              ) : <span className="text-xs text-muted-foreground">Archivo no disponible</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5" />Historial privado</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {application.events.length === 0 && application.interviews.length === 0 && <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>}
          {application.events.map(event => (
            <article key={event.id} className="border-l-2 border-violet-500/30 pl-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{STATUS_LABELS[event.toStatus]}</span><span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span></div>
              {event.publicNote && <p className="mt-1 text-muted-foreground">Nota pública: {event.publicNote}</p>}
              {event.internalNote && <p className="mt-1 rounded-lg bg-amber-500/5 px-3 py-2 text-amber-100/80">Nota interna: {event.internalNote}</p>}
            </article>
          ))}
          {application.interviews.map(interview => (
            <article key={interview.id} className="rounded-xl border border-border/60 p-4 text-sm">
              <p className="font-semibold">Entrevista · {INTERVIEW_MEDIUM_LABELS[interview.medium]}</p>
              <p className="mt-1 text-muted-foreground">{formatDate(interview.proposedAt)} · {interview.timezone} · {interview.status}</p>
              {interview.externalUrl && <a href={interview.externalUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-violet-300 hover:underline">Abrir enlace <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>}
              {interview.publicNote && <p className="mt-2 text-muted-foreground">Nota pública: {interview.publicNote}</p>}
              {interview.internalNote && <p className="mt-2 rounded-lg bg-amber-500/5 px-3 py-2 text-amber-100/80">Nota interna: {interview.internalNote}</p>}
            </article>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
