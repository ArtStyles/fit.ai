import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { requireAppUserContext } from '@/lib/auth/server'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { ApplicationForm, type TrainerApplicationView } from '@/components/coaching/ApplicationForm'
import { ApplicationTimeline, type TrainerApplicationEventView, type TrainerInterviewView } from '@/components/coaching/ApplicationTimeline'
import type { TrainerCredentialView } from '@/components/coaching/CredentialFields'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

type ApplicationRow = {
  id: string
  status: TrainerApplicationView['status']
  professional_name: string
  professional_photo_url: string | null
  bio: string
  specialties: string[]
  modalities: TrainerApplicationView['modalities']
  experience_summary: string
  general_location: string | null
  languages: string[]
  contact_email: string
  contact_phone: string | null
  preferred_contact: TrainerApplicationView['preferredContact']
  timezone: string
  interview_availability: string
}
type CredentialRow = {
  id: string
  credential_type: TrainerCredentialView['credentialType']
  title: string
  issuer: string | null
  issued_on: string | null
  expires_on: string | null
  external_url: string | null
}
type EventRow = {
  id: string
  to_status: TrainerApplicationEventView['toStatus']
  public_note: string | null
  created_at: string
}
type InterviewRow = {
  proposed_at: string
  timezone: string
  medium: TrainerInterviewView['medium']
  external_url: string | null
  status: TrainerInterviewView['status']
  public_note: string | null
}

function mapApplication(row: ApplicationRow): TrainerApplicationView {
  return {
    id: row.id,
    status: row.status,
    professionalName: row.professional_name,
    professionalPhotoUrl: row.professional_photo_url,
    bio: row.bio,
    specialties: row.specialties,
    modalities: row.modalities,
    experienceSummary: row.experience_summary,
    generalLocation: row.general_location,
    languages: row.languages,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    preferredContact: row.preferred_contact,
    timezone: row.timezone,
    interviewAvailability: row.interview_availability,
  }
}

export default async function TrainerApplicationPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const openedFromSettings = searchParams?.from === 'settings'
  const backHref = openedFromSettings ? '/settings' : '/trainers'
  const backLabelKey = openedFromSettings ? 'Volver a ajustes' : 'Volver a entrenadores'
  const { supabase, user, profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const { data: applicationRow, error: applicationError } = await supabase.from('trainer_applications')
    .select('id, status, professional_name, professional_photo_url, bio, specialties, modalities, experience_summary, general_location, languages, contact_email, contact_phone, preferred_contact, timezone, interview_availability')
    .eq('user_id', user.id)
    .eq('application_kind', 'initial')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: ApplicationRow | null; error: unknown }

  const application = applicationRow ? mapApplication(applicationRow) : null
  let credentials: TrainerCredentialView[] = []
  let events: TrainerApplicationEventView[] = []
  let interview: TrainerInterviewView | null = null
  let relatedDataFailed = false

  if (application) {
    const [credentialQuery, eventQuery, interviewQuery] = await Promise.all([
      supabase.from('trainer_application_credentials')
        .select('id, credential_type, title, issuer, issued_on, expires_on, external_url')
        .eq('application_id', application.id)
        .order('created_at', { ascending: true }),
      supabase.from('trainer_application_events_public')
        .select('id, to_status, public_note, created_at')
        .eq('application_id', application.id)
        .order('created_at', { ascending: true }),
      supabase.from('trainer_interviews_applicant_public')
        .select('proposed_at, timezone, medium, external_url, status, public_note')
        .eq('application_id', application.id)
        .order('proposed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const credentialResponse = credentialQuery as unknown as { data: CredentialRow[] | null; error: unknown }
    const eventResponse = eventQuery as unknown as { data: EventRow[] | null; error: unknown }
    const interviewResponse = interviewQuery as unknown as { data: InterviewRow | null; error: unknown }

    relatedDataFailed = Boolean(credentialResponse.error || eventResponse.error || interviewResponse.error)
    credentials = (credentialResponse.data ?? []).map(row => ({
      id: row.id,
      credentialType: row.credential_type,
      title: row.title,
      issuer: row.issuer,
      issuedOn: row.issued_on,
      expiresOn: row.expires_on,
      externalUrl: row.external_url,
      fileName: row.credential_type === 'document' ? 'Documento privado' : null,
    }))
    events = (eventResponse.data ?? []).map(row => ({
      id: row.id,
      toStatus: row.to_status,
      publicNote: row.public_note,
      createdAt: row.created_at,
    }))
    if (interviewResponse.data) {
      interview = {
        proposedAt: interviewResponse.data.proposed_at,
        timezone: interviewResponse.data.timezone,
        medium: interviewResponse.data.medium,
        externalUrl: interviewResponse.data.external_url,
        status: interviewResponse.data.status,
        publicNote: interviewResponse.data.public_note,
      }
    }
  }

  const loadFailed = Boolean(applicationError) || relatedDataFailed
  const allowedPhotoUrls = Array.from(new Set([
    profile.avatar_url,
    application?.professionalPhotoUrl,
  ].filter((value): value is string => Boolean(value))))

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24">
      <FixedTopBar>
        <Link href={backHref} aria-label={t(backLabelKey)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="text-lg font-bold">Solicitud de entrenador</h1>
      </FixedTopBar>

      <main className="space-y-6 pt-24">
        <header className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-violet-300">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <p className="text-sm font-semibold">Experiencia privada del postulante</p>
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Postúlate como entrenador verificado</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Completa tu perfil profesional y agrega al menos una credencial. Tu contacto y tus credenciales solo se muestran dentro de esta revisión privada.
          </p>
        </header>

        {loadFailed ? (
          <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-200">
            No pudimos cargar toda la información de tu solicitud. Recarga la página antes de hacer cambios.
          </div>
        ) : (
          <>
            <ApplicationTimeline events={events} interview={interview} applicantTimezone={application?.timezone ?? profile.timezone ?? 'UTC'} />
            <ApplicationForm
              initialApplication={application}
              initialValues={{
                professionalName: profile.full_name ?? '',
                professionalPhotoUrl: profile.avatar_url,
                contactEmail: user.email ?? '',
                timezone: profile.timezone ?? 'UTC',
              }}
              initialCredentials={credentials}
              allowedPhotoUrls={allowedPhotoUrls}
            />
          </>
        )}
      </main>
    </div>
  )
}
