'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import type { Json } from '@/types/database'

type TrainerReviewStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required'
type FieldErrors = Record<string, string>
type TrainerProfileActionResult =
  | {
      ok: true
      directUpdated: boolean
      reviewApplicationId: string | null
      reviewStatus: TrainerReviewStatus | null
    }
  | { ok: false; error: string; fieldErrors?: FieldErrors }

type TrainerProfilePayload = {
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
}

const ALLOWED_MODALITIES = new Set(['online', 'in_person', 'hybrid'])
const REVIEW_STATUSES = new Set<TrainerReviewStatus>([
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'interview_required',
])

function formString(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function formList(formData: FormData, key: string): string[] {
  return Array.from(new Set(
    formData.getAll(key)
      .filter((value): value is string => typeof value === 'string')
      .flatMap(value => value.split(/[,\n]/))
      .map(value => value.trim())
      .filter(Boolean),
  ))
}

function lengthError(
  errors: FieldErrors,
  key: string,
  value: string,
  minimum: number,
  maximum: number,
) {
  if (value.length < minimum || value.length > maximum) {
    errors[key] = `Debe tener entre ${minimum} y ${maximum} caracteres.`
  }
}

function validateProfileForm(formData: FormData):
  | { ok: true; value: TrainerProfilePayload }
  | { ok: false; fieldErrors: FieldErrors } {
  const professionalName = formString(formData, 'professionalName')
  const professionalPhotoUrl = formString(formData, 'professionalPhotoUrl') || null
  const bio = formString(formData, 'bio')
  const specialties = formList(formData, 'specialties')
  const modalities = formList(formData, 'modalities')
  const experienceSummary = formString(formData, 'experienceSummary')
  const generalLocation = formString(formData, 'generalLocation') || null
  const languages = formList(formData, 'languages')
  const fieldErrors: FieldErrors = {}

  lengthError(fieldErrors, 'professionalName', professionalName, 2, 100)
  lengthError(fieldErrors, 'bio', bio, 50, 2000)
  lengthError(fieldErrors, 'experienceSummary', experienceSummary, 20, 2000)

  if (professionalPhotoUrl) {
    try {
      if (new URL(professionalPhotoUrl).protocol !== 'https:' || professionalPhotoUrl.length > 2048) {
        throw new Error('invalid')
      }
    } catch {
      fieldErrors.professionalPhotoUrl = 'Introduce una URL HTTPS válida.'
    }
  }
  if (specialties.length < 1 || specialties.length > 10 || specialties.some(item => item.length > 80)) {
    fieldErrors.specialties = 'Indica entre 1 y 10 especialidades válidas.'
  }
  if (modalities.length < 1 || modalities.length > 3 || modalities.some(item => !ALLOWED_MODALITIES.has(item))) {
    fieldErrors.modalities = 'Selecciona al menos una modalidad válida.'
  }
  if ((modalities.includes('in_person') || modalities.includes('hybrid')) && !generalLocation) {
    fieldErrors.generalLocation = 'La ubicación es necesaria para atención presencial.'
  } else if ((generalLocation?.length ?? 0) > 120) {
    fieldErrors.generalLocation = 'La ubicación debe tener hasta 120 caracteres.'
  }
  if (languages.length < 1 || languages.length > 10 || languages.some(item => item.length > 80)) {
    fieldErrors.languages = 'Indica entre 1 y 10 idiomas válidos.'
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: {
      professionalName,
      professionalPhotoUrl,
      bio,
      specialties,
      modalities: modalities as TrainerProfilePayload['modalities'],
      experienceSummary,
      generalLocation,
      languages,
    },
  }
}

function isProfileSaveResult(value: unknown): value is {
  profile_updated: boolean
  review_application_id: string | null
  review_status: TrainerReviewStatus | null
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  return result.profile_updated === true
    && (result.review_application_id === null || typeof result.review_application_id === 'string')
    && (result.review_status === null
      || (typeof result.review_status === 'string' && REVIEW_STATUSES.has(result.review_status as TrainerReviewStatus)))
}

export async function updateTrainerProfile(formData: FormData): Promise<TrainerProfileActionResult> {
  const { supabase, user, trainerProfile } = await requireActiveTrainerContext()
  const validation = validateProfileForm(formData)
  if (!validation.ok) {
    return {
      ok: false,
      error: 'Revisa los campos del perfil profesional.',
      fieldErrors: validation.fieldErrors,
    }
  }

  const reviews = supabase.from('trainer_applications') as any
  const { data: pendingReview, error: pendingReviewError } = await reviews
    .select('status, modalities')
    .eq('user_id', user.id)
    .eq('application_kind', 'profile_update')
    .in('status', ['draft', 'submitted', 'under_review', 'changes_requested', 'interview_required'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendingReviewError) {
    return { ok: false, error: 'No se pudo verificar la revisión profesional pendiente.' }
  }

  const pendingModalities = pendingReview
    && ['under_review', 'interview_required'].includes(pendingReview.status)
    ? pendingReview.modalities as string[]
    : validation.value.modalities
  const effectiveModalities = Array.from(new Set([
    ...(trainerProfile.modalities ?? []),
    ...pendingModalities,
  ]))
  if (!validation.value.generalLocation
    && (effectiveModalities.includes('in_person') || effectiveModalities.includes('hybrid'))) {
    return {
      ok: false,
      error: 'Añade una ubicación general antes de guardar: tu perfil aprobado o revisión pendiente incluye atención presencial o híbrida.',
      fieldErrors: {
        generalLocation: 'La ubicación es obligatoria mientras el perfil aprobado o pendiente incluya atención presencial o híbrida.',
      },
    }
  }

  const { data, error } = await (supabase.rpc as any)('save_trainer_profile_changes', {
    p_payload: validation.value as unknown as Json,
  })
  if (error || !isProfileSaveResult(data)) {
    return { ok: false, error: 'No se pudo guardar el perfil profesional.' }
  }

  revalidatePath('/coach/profile')
  revalidatePath('/coach')
  return {
    ok: true,
    directUpdated: data.profile_updated,
    reviewApplicationId: data.review_application_id,
    reviewStatus: data.review_status,
  }
}
