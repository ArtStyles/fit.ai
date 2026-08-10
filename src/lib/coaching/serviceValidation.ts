export type TrainerServiceModality = 'online' | 'in_person' | 'hybrid'

export type TrainerServiceValue = {
  name: string
  description: string
  modality: TrainerServiceModality
  durationMinutes: number
  content: string
  capacity: number
}

export type TrainerServiceValidation =
  | { ok: true; value: TrainerServiceValue }
  | { ok: false; fieldErrors: Record<string, string> }

const COMMERCIAL_FORM_KEYS = new Set([
  'price',
  'priceMinor',
  'price_minor',
  'currency',
  'billingInterval',
  'billing_interval',
  'billingMode',
  'billing_mode',
])
const ALLOWED_MODALITIES = new Set<TrainerServiceModality>(['online', 'in_person', 'hybrid'])
const COMMERCIAL_FIELDS_ERROR = 'Los servicios no admiten precios ni facturación.'

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function wholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function hasInjectedCommercialField(formData: FormData): boolean {
  return Array.from(formData.keys()).some(key => COMMERCIAL_FORM_KEYS.has(key))
}

export function validateTrainerService(formData: FormData): TrainerServiceValidation {
  if (hasInjectedCommercialField(formData)) {
    return { ok: false, fieldErrors: { commercial: COMMERCIAL_FIELDS_ERROR } }
  }

  const name = formString(formData, 'name')
  const description = formString(formData, 'description')
  const modality = formString(formData, 'modality')
  const durationMinutes = wholeNumber(formString(formData, 'durationMinutes'))
  const content = formString(formData, 'content')
  const capacity = wholeNumber(formString(formData, 'capacity'))
  const fieldErrors: Record<string, string> = {}

  if (name.length < 1 || name.length > 160) fieldErrors.name = 'Indica un nombre de hasta 160 caracteres.'
  if (description.length > 4000) fieldErrors.description = 'La descripción debe tener hasta 4000 caracteres.'
  if (!ALLOWED_MODALITIES.has(modality as TrainerServiceModality)) fieldErrors.modality = 'Selecciona una modalidad válida.'
  if (durationMinutes === null || durationMinutes < 15 || durationMinutes > 480) {
    fieldErrors.durationMinutes = 'La duración debe estar entre 15 y 480 minutos.'
  }
  if (content.length > 4000) fieldErrors.content = 'El contenido debe tener hasta 4000 caracteres.'
  if (capacity === null || capacity < 1 || capacity > 1000) {
    fieldErrors.capacity = 'El cupo debe estar entre 1 y 1000 personas.'
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: {
      name,
      description,
      modality: modality as TrainerServiceModality,
      durationMinutes: durationMinutes as number,
      content,
      capacity: capacity as number,
    },
  }
}
