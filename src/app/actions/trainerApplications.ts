'use server'

import { createProductNotification } from '@/lib/notifications/product'
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
  const credentials = supabase.from('trainer_application_credentials') as any
  const { data: application, error: applicationError } = await applications
    .select('id, user_id, status')
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (applicationError || !application || !['draft', 'changes_requested'].includes(application.status)) {
    return actionError('Solicitud no disponible.')
  }

  const credentialId = crypto.randomUUID()
  const credential = credentialValidation.value
  let storagePath: string | null = null
  let service: ReturnType<typeof createServiceClient> | null = null

  if (credential.credentialType === 'document' && credential.file) {
    const extension = EXTENSION_BY_MIME_TYPE[credential.file.type]
    if (!extension) return actionError('Tipo de credencial no permitido.')
    storagePath = trainerCredentialPath(user.id, applicationId, credentialId, extension)
    service = createServiceClient()
    const { error: uploadError } = await service.storage
      .from(TRAINER_CREDENTIAL_BUCKET)
      .upload(storagePath, credential.file, {
        contentType: credential.file.type,
        upsert: false,
      })
    if (uploadError) return actionError('No se pudo cargar la credencial.')
  }

  const { data, error } = await credentials
    .insert({
      id: credentialId,
      application_id: applicationId,
      credential_type: credential.credentialType,
      title: credential.title,
      issuer: credential.issuer,
      issued_on: credential.issuedOn,
      expires_on: credential.expiresOn,
      storage_path: storagePath,
      external_url: credential.externalUrl,
      mime_type: credential.file?.type as 'application/pdf' | 'image/jpeg' | 'image/png' | undefined ?? null,
      size_bytes: credential.file?.size ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    if (service && storagePath) {
      await service.storage.from(TRAINER_CREDENTIAL_BUCKET).remove([storagePath])
    }
    return actionError('No se pudo guardar la credencial.')
  }
  return { ok: true, credentialId: data.id }
}

export async function removeTrainerCredential(formData: FormData): Promise<SimpleActionResult> {
  const applicationId = formString(formData, 'applicationId')
  const credentialId = formString(formData, 'credentialId')
  if (!validUuid(applicationId) || !validUuid(credentialId)) return actionError('Credencial no valida.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return actionError('Sesion no valida.')

  const credentials = supabase.from('trainer_application_credentials') as any
  const { data: credential, error: lookupError } = await credentials
    .select('id, application_id, storage_path')
    .eq('id', credentialId)
    .eq('application_id', applicationId)
    .maybeSingle()
  if (lookupError) return actionError('No se pudo leer la credencial.')
  if (!credential) return { ok: true }

  if (credential.storage_path) {
    const expectedPrefix = `${user.id}/${applicationId}/${credentialId}.`
    const allowedPath = credential.storage_path.startsWith(expectedPrefix)
      && ['pdf', 'jpg', 'png'].some(extension => credential.storage_path === `${expectedPrefix}${extension}`)
    if (!allowedPath) return actionError('Ruta de credencial no valida.')
  }

  const { error } = await credentials
    .delete()
    .eq('id', credentialId)
    .eq('application_id', applicationId)
  if (error) return actionError('No se pudo eliminar la credencial.')

  if (credential.storage_path) {
    const service = createServiceClient()
    const { error: storageError } = await service.storage
      .from(TRAINER_CREDENTIAL_BUCKET)
      .remove([credential.storage_path])
    if (storageError) return actionError('La credencial se elimino, pero no se pudo limpiar el archivo privado.')
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

  const service = createServiceClient()
  const { data: admins } = await service
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .eq('account_status', 'active')

  if (result.eventId) {
    await Promise.allSettled((admins ?? []).map(admin => createProductNotification({
      recipientUserId: admin.id,
      type: 'trainer_application_status',
      title: 'Nueva solicitud de entrenador',
      body: 'Una solicitud de entrenador esta lista para revision.',
      url: `/admin/trainers/${result.applicationId}`,
      dedupeKey: `trainer-application:${result.applicationId}:submitted:${result.eventId}`,
      payload: { applicationId: result.applicationId, status: 'submitted' },
    })))
  }

  const { eventId: _eventId, ...publicResult } = result
  return publicResult
}

export async function withdrawTrainerApplication(formData: FormData): Promise<ApplicationActionResult> {
  const result = await executeApplicantTransition(formData, 'withdraw_trainer_application')
  if (!result.ok) return result
  const { eventId: _eventId, ...publicResult } = result
  return publicResult
}
