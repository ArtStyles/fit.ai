import 'server-only'

import { ADMIN_TRAINER_ATTENTION_STATUSES } from '@/lib/admin/overview'
import { requireAdminUserContext } from '@/lib/auth/admin'
import type { AdminServiceClient } from '@/lib/auth/admin'
import type { Database } from '@/types/database'

const TRAINER_CREDENTIAL_BUCKET = 'trainer-credentials'
const SIGNED_CREDENTIAL_TTL_SECONDS = 300
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const APPLICATION_DETAIL_COLUMNS = 'id, application_kind, source_profile_id, credential_source_application_id, status, professional_name, professional_photo_url, bio, specialties, modalities, experience_summary, general_location, languages, contact_email, contact_phone, preferred_contact, timezone, interview_availability, submitted_at, decided_at, created_at, updated_at' as const

export const ADMIN_TRAINER_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'interview_required',
  'approved',
  'rejected',
  'withdrawn',
] as const

export type AdminTrainerApplicationStatus = typeof ADMIN_TRAINER_STATUSES[number]

export type AdminTrainerQueueItem = {
  id: string
  professionalName: string
  applicationDate: string
  status: AdminTrainerApplicationStatus
  specialties: string[]
  applicationKind: 'initial' | 'profile_update'
}

export type AdminTrainerCredential = {
  id: string
  credentialType: 'document' | 'link'
  title: string
  issuer: string | null
  issuedOn: string | null
  expiresOn: string | null
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
  url: string | null
  signedUrlExpiresInSeconds: number | null
}

export type AdminTrainerApplicationEvent = {
  id: string
  fromStatus: AdminTrainerApplicationStatus | null
  toStatus: AdminTrainerApplicationStatus
  publicNote: string | null
  internalNote: string | null
  actorRole: 'applicant' | 'admin' | 'system'
  createdAt: string
}

export type AdminTrainerInterview = {
  id: string
  proposedAt: string
  timezone: string
  medium: 'video_call' | 'phone' | 'in_person'
  externalUrl: string | null
  status: 'proposed' | 'scheduled' | 'completed' | 'cancelled'
  outcome: string | null
  publicNote: string | null
  internalNote: string | null
  createdAt: string
}

export type AdminTrainerApplicationDetail = {
  id: string
  status: AdminTrainerApplicationStatus
  applicationKind: 'initial' | 'profile_update'
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
  contactEmail: string
  contactPhone: string | null
  preferredContact: 'email' | 'phone' | 'whatsapp'
  timezone: string
  interviewAvailability: string
  submittedAt: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
  credentials: AdminTrainerCredential[]
  events: AdminTrainerApplicationEvent[]
  interviews: AdminTrainerInterview[]
}

type CredentialRow = Database['public']['Tables']['trainer_application_credentials']['Row']
type EventRow = Database['public']['Tables']['trainer_application_events']['Row']
type InterviewRow = Database['public']['Tables']['trainer_interviews']['Row']

function isAdminTrainerStatus(value: string): value is AdminTrainerApplicationStatus {
  return (ADMIN_TRAINER_STATUSES as readonly string[]).includes(value)
}

export function normalizeAdminTrainerStatus(value?: string): AdminTrainerApplicationStatus | undefined {
  return value && isAdminTrainerStatus(value) ? value : undefined
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function listAdminTrainerApplications(
  status?: string,
): Promise<AdminTrainerQueueItem[]> {
  const { service } = await requireAdminUserContext()
  return loadAdminTrainerApplications(service, status)
}

export async function loadAdminTrainerApplications(
  service: AdminServiceClient,
  status?: string,
): Promise<AdminTrainerQueueItem[]> {
  const selectedStatus = normalizeAdminTrainerStatus(status)
  let query = service
    .from('trainer_applications')
    .select('id, professional_name, submitted_at, created_at, status, specialties, application_kind')

  if (selectedStatus) query = query.eq('status', selectedStatus)

  const { data, error } = await query
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'No se pudo cargar la cola de entrenadores.')

  return (data ?? []).map(row => ({
    id: row.id,
    professionalName: row.professional_name,
    applicationDate: row.submitted_at ?? row.created_at,
    status: row.status,
    specialties: [...row.specialties],
    applicationKind: row.application_kind,
  }))
}

export async function countAdminTrainerApplicationsRequiringAttention(
  service: AdminServiceClient,
): Promise<number> {
  const { count, error } = await service
    .from('trainer_applications')
    .select('id', { count: 'exact', head: true })
    .in('status', [...ADMIN_TRAINER_ATTENTION_STATUSES])

  if (error || count === null) {
    throw new Error(error?.message || 'No se pudo cargar el contador de solicitudes.')
  }

  return count
}

async function signCredential(
  service: Awaited<ReturnType<typeof requireAdminUserContext>>['service'],
  row: CredentialRow,
): Promise<AdminTrainerCredential> {
  let url = safeHttpsUrl(row.external_url)
  let signedUrlExpiresInSeconds: number | null = null

  if (row.credential_type === 'document' && row.storage_path) {
    const { data, error } = await service.storage
      .from(TRAINER_CREDENTIAL_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_CREDENTIAL_TTL_SECONDS)
    url = error ? null : safeHttpsUrl(data?.signedUrl ?? null)
    signedUrlExpiresInSeconds = url ? SIGNED_CREDENTIAL_TTL_SECONDS : null
  }

  return {
    id: row.id,
    credentialType: row.credential_type,
    title: row.title,
    issuer: row.issuer,
    issuedOn: row.issued_on,
    expiresOn: row.expires_on,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    url,
    signedUrlExpiresInSeconds,
  }
}

export async function getAdminTrainerApplication(
  applicationId: string,
): Promise<AdminTrainerApplicationDetail | null> {
  const { service } = await requireAdminUserContext()
  if (!UUID_PATTERN.test(applicationId)) return null

  const { data: application, error: applicationError } = await service
    .from('trainer_applications')
    .select(APPLICATION_DETAIL_COLUMNS)
    .eq('id', applicationId)
    .maybeSingle()

  if (applicationError) throw new Error(applicationError.message || 'No se pudo cargar la solicitud.')
  if (!application) return null

  const credentialApplicationId = application.credential_source_application_id ?? applicationId
  const [credentialsResult, eventsResult, interviewsResult] = await Promise.all([
    service
      .from('trainer_application_credentials')
      .select('id, application_id, credential_type, title, issuer, issued_on, expires_on, storage_path, external_url, mime_type, size_bytes, created_at')
      .eq('application_id', credentialApplicationId)
      .order('created_at', { ascending: true }),
    service
      .from('trainer_application_events')
      .select('id, application_id, from_status, to_status, public_note, internal_note, actor_role, created_at')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false }),
    service
      .from('trainer_interviews')
      .select('id, application_id, proposed_at, timezone, medium, external_url, status, outcome, public_note, internal_note, created_at')
      .eq('application_id', applicationId)
      .order('proposed_at', { ascending: false }),
  ])

  const detailError = credentialsResult.error ?? eventsResult.error ?? interviewsResult.error
  if (detailError) throw new Error(detailError.message || 'No se pudo cargar el expediente privado.')

  const credentials = await Promise.all(
    ((credentialsResult.data ?? []) as CredentialRow[]).map(row => signCredential(service, row)),
  )
  const events = ((eventsResult.data ?? []) as EventRow[]).map(row => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    publicNote: row.public_note,
    internalNote: row.internal_note,
    actorRole: row.actor_role,
    createdAt: row.created_at,
  }))
  const interviews = ((interviewsResult.data ?? []) as InterviewRow[]).map(row => ({
    id: row.id,
    proposedAt: row.proposed_at,
    timezone: row.timezone,
    medium: row.medium,
    externalUrl: safeHttpsUrl(row.external_url),
    status: row.status,
    outcome: row.outcome,
    publicNote: row.public_note,
    internalNote: row.internal_note,
    createdAt: row.created_at,
  }))
  return {
    id: application.id,
    status: application.status,
    applicationKind: application.application_kind,
    professionalName: application.professional_name,
    professionalPhotoUrl: safeHttpsUrl(application.professional_photo_url),
    bio: application.bio,
    specialties: [...application.specialties],
    modalities: [...application.modalities],
    experienceSummary: application.experience_summary,
    generalLocation: application.general_location,
    languages: [...application.languages],
    contactEmail: application.contact_email,
    contactPhone: application.contact_phone,
    preferredContact: application.preferred_contact,
    timezone: application.timezone,
    interviewAvailability: application.interview_availability,
    submittedAt: application.submitted_at,
    decidedAt: application.decided_at,
    createdAt: application.created_at,
    updatedAt: application.updated_at,
    credentials,
    events,
    interviews,
  }
}
