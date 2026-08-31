'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { validateTrainerService, type TrainerServiceValue } from '@/lib/coaching/serviceValidation'

type FieldErrors = Record<string, string>
type ServiceFailure = { ok: false; error: string; fieldErrors?: FieldErrors }
type TrainerServiceActionResult =
  | { ok: true; serviceId: string }
  | ServiceFailure
type ActiveServiceActionResult =
  | { ok: true; serviceId: string; isActive: boolean }
  | ServiceFailure

function formString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function servicePayload(value: TrainerServiceValue) {
  return {
    name: value.name,
    description: value.description,
    modality: value.modality,
    duration_minutes: value.durationMinutes,
    content: value.content,
    capacity: value.capacity,
  }
}

function validationFailure(fieldErrors: FieldErrors): ServiceFailure {
  return { ok: false, error: 'Revisa los campos del servicio.', fieldErrors }
}

function revalidateTrainerServices() {
  revalidatePath('/coach/services')
  revalidatePath('/coach/profile')
  revalidatePath('/coach')
}

async function findOwnedService(supabase: unknown, trainerProfileId: string, serviceId: string) {
  const services = (supabase as any).from('trainer_service_offerings')
  const { data, error } = await services
    .select('id')
    .eq('id', serviceId)
    .eq('trainer_profile_id', trainerProfileId)
    .maybeSingle()
  return { service: data as { id: string } | null, error }
}

async function ownedServiceContext(
  formData: FormData,
  context: Awaited<ReturnType<typeof requireActiveTrainerContext>>,
) {
  const serviceId = formString(formData, 'serviceId')
  if (!serviceId) return { ok: false as const, result: validationFailure({ serviceId: 'No se encontró el servicio.' }) }

  const ownership = await findOwnedService(context.supabase, context.trainerProfile.id, serviceId)
  if (ownership.error) return { ok: false as const, result: { ok: false as const, error: 'No se pudo verificar el servicio.' } }
  if (!ownership.service) return { ok: false as const, result: { ok: false as const, error: 'No tienes permiso para modificar este servicio.' } }
  return { ok: true as const, context, serviceId }
}

export async function createTrainerService(formData: FormData): Promise<TrainerServiceActionResult> {
  const { supabase, trainerProfile } = await requireActiveTrainerContext()
  const validation = validateTrainerService(formData)
  if (!validation.ok) return validationFailure(validation.fieldErrors)

  const services = supabase.from('trainer_service_offerings') as any
  const { data, error } = await services
    .insert({ trainer_profile_id: trainerProfile.id, ...servicePayload(validation.value) })
    .select('id')
    .single()
  if (error || !data?.id) return { ok: false, error: 'No se pudo crear el servicio.' }

  revalidateTrainerServices()
  return { ok: true, serviceId: data.id }
}

export async function updateTrainerService(formData: FormData): Promise<TrainerServiceActionResult> {
  const context = await requireActiveTrainerContext()
  const validation = validateTrainerService(formData)
  if (!validation.ok) return validationFailure(validation.fieldErrors)

  const ownership = await ownedServiceContext(formData, context)
  if (!ownership.ok) return ownership.result
  const services = ownership.context.supabase.from('trainer_service_offerings') as any
  const { data, error } = await services
    .update(servicePayload(validation.value))
    .eq('id', ownership.serviceId)
    .eq('trainer_profile_id', ownership.context.trainerProfile.id)
    .select('id')
    .single()
  if (error || !data?.id) return { ok: false, error: 'No se pudo guardar el servicio.' }

  revalidateTrainerServices()
  return { ok: true, serviceId: ownership.serviceId }
}

export async function setTrainerServiceActive(formData: FormData): Promise<ActiveServiceActionResult> {
  const context = await requireActiveTrainerContext()
  const validation = validateTrainerService(formData)
  if (!validation.ok && validation.fieldErrors.commercial) return validationFailure(validation.fieldErrors)

  const isActiveValue = formString(formData, 'isActive')
  if (isActiveValue !== 'true' && isActiveValue !== 'false') {
    return validationFailure({ isActive: 'Selecciona un estado válido.' })
  }
  const ownership = await ownedServiceContext(formData, context)
  if (!ownership.ok) return ownership.result
  const isActive = isActiveValue === 'true'
  const services = ownership.context.supabase.from('trainer_service_offerings') as any
  const { error } = await services
    .update({ is_active: isActive })
    .eq('id', ownership.serviceId)
    .eq('trainer_profile_id', ownership.context.trainerProfile.id)
    .select('id')
    .single()
  if (error) return { ok: false, error: 'No se pudo actualizar el estado del servicio.' }

  revalidateTrainerServices()
  return { ok: true, serviceId: ownership.serviceId, isActive }
}
