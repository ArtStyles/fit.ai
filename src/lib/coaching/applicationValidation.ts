import type { TrainerApplicationDraft } from './status'

export const MAX_TRAINER_CREDENTIAL_BYTES = 10 * 1024 * 1024

const ALLOWED_CREDENTIAL_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
])
const ALLOWED_MODALITIES = new Set(['online', 'in_person', 'hybrid'])
const ALLOWED_CONTACT_METHODS = new Set(['email', 'phone', 'whatsapp'])
const FORBIDDEN_IDENTITY_FIELDS = ['government_id', 'identity_document', 'passport']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]{6,31}$/

type FieldErrors = Record<string, string>

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error?: string; fieldErrors?: FieldErrors }

export type TrainerApplicationValidationOptions = {
  mode: 'draft' | 'submit'
  allowedPhotoUrls?: readonly string[]
  credentialCount?: number
}

export type TrainerCredentialInput = {
  credentialType: 'document' | 'link' | string
  title: string
  issuer?: string | null
  issuedOn?: string | null
  expiresOn?: string | null
  externalUrl?: string | null
  file?: File | null
}

export type ValidTrainerCredential = {
  credentialType: 'document' | 'link'
  title: string
  issuer: string | null
  issuedOn: string | null
  expiresOn: string | null
  externalUrl: string | null
  file: File | null
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function listValue(formData: FormData, key: string): string[] {
  return Array.from(new Set(
    formData.getAll(key)
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean),
  ))
}

function optional(value: string): string | null {
  return value || null
}

function hasValidIanaTimezone(timezone: string): boolean {
  if (!timezone || !timezone.includes('/')) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

function addLengthError(
  errors: FieldErrors,
  key: string,
  value: string,
  minimum: number,
  maximum: number,
  required: boolean,
): void {
  if ((!value && required) || (value && (value.length < minimum || value.length > maximum))) {
    errors[key] = `Debe tener entre ${minimum} y ${maximum} caracteres.`
  }
}

export function containsForbiddenTrainerIdentityFields(formData: FormData): boolean {
  return FORBIDDEN_IDENTITY_FIELDS.some(key => formData.has(key))
}

export function validateTrainerApplication(
  formData: FormData,
  options: TrainerApplicationValidationOptions,
): ValidationResult<TrainerApplicationDraft> {
  if (containsForbiddenTrainerIdentityFields(formData)) {
    return { ok: false, error: 'La solicitud contiene campos de identidad no permitidos.' }
  }

  const professionalName = stringValue(formData, 'professionalName')
  const professionalPhotoUrl = optional(stringValue(formData, 'professionalPhotoUrl'))
  const bio = stringValue(formData, 'bio')
  const specialties = listValue(formData, 'specialties')
  const modalities = listValue(formData, 'modalities')
  const experienceSummary = stringValue(formData, 'experienceSummary')
  const generalLocation = optional(stringValue(formData, 'generalLocation'))
  const languages = listValue(formData, 'languages')
  const contactEmail = stringValue(formData, 'contactEmail').toLowerCase()
  const contactPhone = optional(stringValue(formData, 'contactPhone'))
  const preferredContact = stringValue(formData, 'preferredContact') || 'email'
  const timezone = stringValue(formData, 'timezone') || (options.mode === 'draft' ? 'UTC' : '')
  const interviewAvailability = stringValue(formData, 'interviewAvailability')
  const required = options.mode === 'submit'
  const fieldErrors: FieldErrors = {}

  addLengthError(fieldErrors, 'professionalName', professionalName, 2, 100, required)
  addLengthError(fieldErrors, 'bio', bio, 50, 2000, required)
  addLengthError(fieldErrors, 'experienceSummary', experienceSummary, 20, 2000, required)
  const locationRequired = required && modalities.some(value => value === 'in_person' || value === 'hybrid')
  addLengthError(fieldErrors, 'generalLocation', generalLocation ?? '', 1, 120, locationRequired)
  addLengthError(fieldErrors, 'interviewAvailability', interviewAvailability, 10, 1000, required)

  if (professionalPhotoUrl) {
    let urlIsHttps = false
    try {
      urlIsHttps = new URL(professionalPhotoUrl).protocol === 'https:'
    } catch {
      urlIsHttps = false
    }
    const photoIsOwned = !options.allowedPhotoUrls
      || options.allowedPhotoUrls.includes(professionalPhotoUrl)
    if (!urlIsHttps || !photoIsOwned) {
      fieldErrors.professionalPhotoUrl = 'Selecciona una foto profesional propia o tu avatar existente.'
    }
  } else if (required) {
    fieldErrors.professionalPhotoUrl = 'La foto profesional es obligatoria.'
  }

  if (specialties.length > 10 || (required && specialties.length === 0)
    || specialties.some(value => value.length > 80)) {
    fieldErrors.specialties = 'Selecciona entre 1 y 10 especialidades validas.'
  }
  if (modalities.some(value => !ALLOWED_MODALITIES.has(value)) || (required && modalities.length === 0)) {
    fieldErrors.modalities = 'Selecciona una modalidad valida.'
  }
  if (languages.length > 10 || (required && languages.length === 0)
    || languages.some(value => value.length > 80)) {
    fieldErrors.languages = 'Indica entre 1 y 10 idiomas validos.'
  }
  if (contactEmail && (contactEmail.length > 254 || !EMAIL_PATTERN.test(contactEmail))) {
    fieldErrors.contactEmail = 'Introduce un correo valido.'
  } else if (required && !contactEmail) {
    fieldErrors.contactEmail = 'El correo es obligatorio.'
  }
  if (contactPhone && !PHONE_PATTERN.test(contactPhone)) {
    fieldErrors.contactPhone = 'Introduce un telefono valido.'
  }
  if (!ALLOWED_CONTACT_METHODS.has(preferredContact)) {
    fieldErrors.preferredContact = 'Selecciona un medio de contacto valido.'
  } else if (required && preferredContact !== 'email' && !contactPhone) {
    fieldErrors.contactPhone = 'El telefono es obligatorio para este medio de contacto.'
  }
  if (timezone !== 'UTC' && !hasValidIanaTimezone(timezone)) {
    fieldErrors.timezone = 'Selecciona una zona horaria IANA valida.'
  }
  if (required && (options.credentialCount ?? 0) < 1) {
    fieldErrors.credentials = 'Agrega al menos una credencial por documento o enlace.'
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

  return {
    ok: true,
    value: {
      professionalName,
      professionalPhotoUrl,
      bio,
      specialties,
      modalities: modalities as TrainerApplicationDraft['modalities'],
      experienceSummary,
      generalLocation,
      languages,
      contactEmail,
      contactPhone,
      preferredContact: preferredContact as TrainerApplicationDraft['preferredContact'],
      timezone,
      interviewAvailability,
    },
  }
}

export function validateTrainerCredential(
  input: TrainerCredentialInput,
): ValidationResult<ValidTrainerCredential> {
  const credentialType = input.credentialType
  const title = input.title.trim()
  const issuer = optional(input.issuer?.trim() ?? '')
  const issuedOn = optional(input.issuedOn?.trim() ?? '')
  const expiresOn = optional(input.expiresOn?.trim() ?? '')
  const externalUrl = optional(input.externalUrl?.trim() ?? '')
  const file = input.file ?? null
  const fieldErrors: FieldErrors = {}

  if (credentialType !== 'document' && credentialType !== 'link') {
    fieldErrors.credentialType = 'Selecciona un tipo de credencial valido.'
  }
  if (title.length < 1 || title.length > 160) {
    fieldErrors.title = 'El titulo debe tener entre 1 y 160 caracteres.'
  }

  if (credentialType === 'document') {
    if (!file || file.size < 1 || file.size > MAX_TRAINER_CREDENTIAL_BYTES
      || !ALLOWED_CREDENTIAL_MIME_TYPES.has(file.type)) {
      fieldErrors.file = 'Adjunta un PDF, JPEG o PNG de hasta 10 MB.'
    }
  }

  if (credentialType === 'link') {
    try {
      if (!externalUrl || new URL(externalUrl).protocol !== 'https:') throw new Error('invalid')
    } catch {
      fieldErrors.externalUrl = 'Introduce un enlace HTTPS valido.'
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

  return {
    ok: true,
    value: {
      credentialType: credentialType as 'document' | 'link',
      title,
      issuer,
      issuedOn,
      expiresOn,
      externalUrl: credentialType === 'link' ? externalUrl : null,
      file: credentialType === 'document' ? file : null,
    },
  }
}
