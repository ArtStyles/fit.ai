'use server'

import {
  containsForbiddenTrainerIdentityFields,
  validateTrainerApplication,
  validateTrainerCredential,
  type ValidationResult,
} from '@/lib/coaching/applicationValidation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'

const TRAINER_CREDENTIAL_BUCKET = 'trainer-credentials'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

type TrainerApplicationStatus = Database['public']['Tables']['trainer_applications']['Row']['status']
type ActionError = { ok: false; error: string; fieldErrors?: Record<string, string> }
type ApplicationActionSuccess = {
  ok: true
  applicationId: string
  status: TrainerApplicationStatus
  transitioned?: boolean
}
type ApplicationActionResult = ApplicationActionSuccess | ActionError
type CredentialActionResult = { ok: true; credentialId: string } | ActionError
type SimpleActionResult = { ok: true } | ActionError
type TransitionRpcResult = {
  application_id: string
  user_id: string
  status: TrainerApplicationStatus
  transitioned: boolean
  event_id: string
}
type CleanupJob = { id: string; storage_path: string }

function actionError(error: string, validation?: ValidationResult<unknown>): ActionError {
  return {
    ok: false,
    error,
    ...(validation && !validation.ok && validation.fieldErrors
      ? { fieldErrors: validation.fieldErrors }
      : {}),
  }
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function validUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function isTransitionResult(value: unknown): value is TransitionRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.application_id === 'string'
    && typeof row.user_id === 'string'
    && typeof row.status === 'string'
    && typeof row.transitioned === 'boolean'
    && typeof row.event_id === 'string'
}

function isCleanupJob(value: unknown): value is CleanupJob {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const job = value as Record<string, unknown>
  return typeof job.id === 'string' && validUuid(job.id)
    && typeof job.storage_path === 'string' && job.storage_path.length > 0
}

function storageFailureMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error
    && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Storage cleanup failed.'
}

async function cleanupStorageJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  job: CleanupJob,
): Promise<boolean> {
  if (!job.storage_path.startsWith(`${userId}/`)
    || !/\.(?:pdf|jpg|png)$/.test(job.storage_path)) {
    await (supabase.rpc as any)('record_trainer_credential_cleanup_failure', {
      p_cleanup_id: job.id,
      p_error: 'Cleanup path rejected by server action.',
    })
    return false
  }

  const service = createServiceClient()
  const { error: storageError } = await service.storage
    .from(TRAINER_CREDENTIAL_BUCKET)
    .remove([job.storage_path])
  if (storageError) {
    await (supabase.rpc as any)('record_trainer_credential_cleanup_failure', {
      p_cleanup_id: job.id,
      p_error: storageFailureMessage(storageError),
    })
    return false
  }

  const { data, error } = await (supabase.rpc as any)('finalize_trainer_credential_cleanup', {
    p_cleanup_id: job.id,
  })
  return !error && data === true
}

async function processPendingTrainerCredentialCleanup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await (supabase.rpc as any)('list_trainer_credential_cleanup')
  if (error || !Array.isArray(data)) return false

  let clean = true
  for (const value of data) {
    if (!isCleanupJob(value) || !await cleanupStorageJob(supabase, userId, value)) clean = false
  }
  return clean
}

export function trainerCredentialPath(
  userId: string,
  applicationId: string,
  credentialId: string,
  extension: string,
): string {
  return `${userId}/${applicationId}/${credentialId}.${extension}`
}

export async function saveTrainerApplicationDraft(formData: FormData): Promise<ApplicationActionResult> {
  if (containsForbiddenTrainerIdentityFields(formData)) {
    return actionError('La solicitud contiene campos de identidad no permitidos.')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return actionError('Sesion no valida.')

  const profiles = supabase.from('profiles') as any
  const applications = supabase.from('trainer_applications') as any
  const [{ data: profile, error: profileError }, { data: current, error: currentError }] = await Promise.all([
    profiles
      .select('avatar_url, onboarding_done')
      .eq('id', user.id)
      .maybeSingle(),
    applications
      .select('id, status, professional_photo_url')
      .eq('user_id', user.id)
      .in('status', ['draft', 'changes_requested'])
      .maybeSingle(),
  ])
  if (profileError || currentError || !profile?.onboarding_done) {
    return actionError('No se pudo abrir el borrador de solicitud.')
  }

  const allowedPhotoUrls = [profile.avatar_url, current?.professional_photo_url]
    .filter((value): value is string => Boolean(value))
  const validation = validateTrainerApplication(formData, { mode: 'draft', allowedPhotoUrls })
  if (!validation.ok) return actionError(validation.error ?? 'Revisa los datos del borrador.', validation)

  const draft = validation.value
  const payload = {
    professional_name: draft.professionalName,
    professional_photo_url: draft.professionalPhotoUrl,
    bio: draft.bio,
    specialties: draft.specialties,
    modalities: draft.modalities,
    experience_summary: draft.experienceSummary,
    general_location: draft.generalLocation,
    languages: draft.languages,
    contact_email: draft.contactEmail,
    contact_phone: draft.contactPhone,
    preferred_contact: draft.preferredContact,
    timezone: draft.timezone,
    interview_availability: draft.interviewAvailability,
  }

  if (current) {
    const { data, error } = await applications
      .update(payload)
      .eq('id', current.id)
      .eq('user_id', user.id)
      .select('id, status')
      .single()
    if (error || !data) return actionError('No se pudo guardar el borrador.')
    return { ok: true, applicationId: data.id, status: data.status }
  }

  const { data, error } = await applications
    .insert({ ...payload, user_id: user.id, status: 'draft' })
    .select('id, status')
    .single()
  if (error || !data) return actionError('No se pudo guardar el borrador.')
  return { ok: true, applicationId: data.id, status: data.status }
}

export async function uploadTrainerCredential(formData: FormData): Promise<CredentialActionResult> {
  const applicationId = formString(formData, 'applicationId')
  if (!validUuid(applicationId)) return actionError('Solicitud no valida.')

  const credentialValidation = validateTrainerCredential({
    credentialType: formString(formData, 'credentialType'),
    title: formString(formData, 'title'),
    issuer: formString(formData, 'issuer'),
    issuedOn: formString(formData, 'issuedOn'),
    expiresOn: formString(formData, 'expiresOn'),
    externalUrl: formString(formData, 'externalUrl'),
    file: formData.get('file') instanceof File ? formData.get('file') as File : null,
  })
  if (!credentialValidation.ok) {
    return actionError('Revisa la credencial.', credentialValidation)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return actionError('Sesion no valida.')

  const applications = supabase.from('trainer_applications') as any
  const { data: application, error: applicationError } = await applications
    .select('id, user_id, status')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (applicationError || !application || !['draft', 'changes_requested'].includes(application.status)) {
    return actionError('Solicitud no disponible.')
  }

  if (!await processPendingTrainerCredentialCleanup(supabase, user.id)) {
    return actionError('Hay una limpieza de credencial pendiente; intenta nuevamente.')
  }

  const credentialId = crypto.randomUUID()
  const credential = credentialValidation.value
  let storagePath: string | null = null
  let cleanupJob: CleanupJob | null = null

  if (credential.credentialType === 'document' && credential.file) {
    const extension = EXTENSION_BY_MIME_TYPE[credential.file.type]
    if (!extension) return actionError('Tipo de credencial no permitido.')
    storagePath = trainerCredentialPath(user.id, applicationId, credentialId, extension)
    const service = createServiceClient()
    const { error: uploadError } = await service.storage
      .from(TRAINER_CREDENTIAL_BUCKET)
      .upload(storagePath, credential.file, {
        contentType: credential.file.type,
        upsert: false,
      })
    if (uploadError) return actionError('No se pudo cargar la credencial.')

    const { data: queued, error: queueError } = await (supabase.rpc as any)(
      'queue_trainer_credential_cleanup',
      {
        p_application_id: applicationId,
        p_credential_id: credentialId,
        p_storage_path: storagePath,
      },
    )
    if (queueError || !isCleanupJob(queued)) {
      const { error: cleanupError } = await service.storage
        .from(TRAINER_CREDENTIAL_BUCKET)
        .remove([storagePath])
      return actionError(cleanupError
        ? 'No se pudo registrar ni limpiar el archivo privado.'
        : 'No se pudo registrar la carga privada.')
    }
    cleanupJob = queued
  }

  const credentialRpcArgs = {
    p_credential_id: credentialId,
    p_application_id: applicationId,
    p_credential_type: credential.credentialType,
    p_title: credential.title,
    p_issuer: credential.issuer,
    p_issued_on: credential.issuedOn,
    p_expires_on: credential.expiresOn,
    p_external_url: credential.externalUrl,
    p_mime_type: credential.file?.type ?? null,
    p_size_bytes: credential.file?.size ?? null,
  }
  let credentialResponse = await (supabase.rpc as any)(
    'create_trainer_application_credential',
    credentialRpcArgs,
  )
  if (credentialResponse.error) {
    credentialResponse = await (supabase.rpc as any)(
      'create_trainer_application_credential',
      credentialRpcArgs,
    )
  }

  const credentialCreated = !credentialResponse.error
    && credentialResponse.data
    && typeof credentialResponse.data === 'object'
    && (credentialResponse.data as { id?: unknown }).id === credentialId
  if (!credentialCreated) {
    if (cleanupJob) {
      const pendingResponse = await (supabase.rpc as any)('list_trainer_credential_cleanup')
      if (pendingResponse.error || !Array.isArray(pendingResponse.data)) {
        return actionError('No se pudo confirmar el estado de la credencial; intenta nuevamente.')
      }
      const pendingJob = pendingResponse.data.find((value: unknown) => (
        isCleanupJob(value) && value.id === cleanupJob.id
      ))
      if (!pendingJob) return { ok: true, credentialId }
      if (!await cleanupStorageJob(supabase, user.id, pendingJob)) {
        return actionError('No se pudo guardar la credencial; la limpieza del archivo quedo pendiente.')
      }
    }
    return actionError('No se pudo guardar la credencial.')
  }
  return { ok: true, credentialId }
}

export async function removeTrainerCredential(formData: FormData): Promise<SimpleActionResult> {
  const applicationId = formString(formData, 'applicationId')
  const credentialId = formString(formData, 'credentialId')
  if (!validUuid(applicationId) || !validUuid(credentialId)) return actionError('Credencial no valida.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return actionError('Sesion no valida.')

  if (!await processPendingTrainerCredentialCleanup(supabase, user.id)) {
    return actionError('No se pudo limpiar el archivo privado; la limpieza quedo pendiente.')
  }

  const { data, error } = await (supabase.rpc as any)('prepare_trainer_credential_removal', {
    p_application_id: applicationId,
    p_credential_id: credentialId,
  })
  if (error) return actionError('No se pudo preparar la eliminacion de la credencial.')
  if (data === null) return { ok: true }
  if (!data || typeof data !== 'object') return actionError('Respuesta de eliminacion no valida.')
  const cleanupId = (data as { cleanup_id?: unknown }).cleanup_id
  const storagePath = (data as { storage_path?: unknown }).storage_path
  if (cleanupId === null && storagePath === null) return { ok: true }
  const cleanupJob = isCleanupJob({ id: cleanupId, storage_path: storagePath })
    ? { id: cleanupId as string, storage_path: storagePath as string }
    : null
  if (!cleanupJob) return actionError('Respuesta de limpieza no valida.')
  if (!await cleanupStorageJob(supabase, user.id, cleanupJob)) {
    return actionError('No se pudo limpiar el archivo privado; la limpieza quedo pendiente.')
  }
  return { ok: true }
}

async function executeApplicantTransition(
  formData: FormData,
  rpcName: 'submit_trainer_application' | 'withdraw_trainer_application',
): Promise<ApplicationActionResult & { eventId?: string }> {
  const applicationId = formString(formData, 'applicationId')
  if (!validUuid(applicationId)) return actionError('Solicitud no valida.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return actionError('Sesion no valida.')

  const { data, error } = await (supabase.rpc as any)(rpcName, { p_application_id: applicationId })
  if (error || !isTransitionResult(data) || data.user_id !== user.id || data.application_id !== applicationId) {
    return actionError(rpcName === 'submit_trainer_application'
      ? 'No se pudo enviar la solicitud.'
      : 'No se pudo retirar la solicitud.')
  }
  return {
    ok: true,
    applicationId: data.application_id,
    status: data.status,
    transitioned: data.transitioned,
    eventId: data.event_id,
  }
}

export async function submitTrainerApplication(formData: FormData): Promise<ApplicationActionResult> {
  const result = await executeApplicantTransition(formData, 'submit_trainer_application')
  if (!result.ok) return result

  const { eventId: _eventId, ...publicResult } = result
  return publicResult
}

export async function withdrawTrainerApplication(formData: FormData): Promise<ApplicationActionResult> {
  const result = await executeApplicantTransition(formData, 'withdraw_trainer_application')
  if (!result.ok) return result
  const { eventId: _eventId, ...publicResult } = result
  return publicResult
}
