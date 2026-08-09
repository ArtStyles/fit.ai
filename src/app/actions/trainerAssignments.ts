'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { requireAppUserContext } from '@/lib/auth/server'

type FieldErrors = Record<string, string>
type Failure = { ok: false; error: string; fieldErrors?: FieldErrors }
type ProposalResult = { ok: true; assignmentId: string; assignmentVersionId: string; workoutPlanId: string } | Failure
type AcceptanceResult = { ok: true; assignmentId: string; workoutPlanId: string } | Failure

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function value(formData: FormData, field: string) {
  const candidate = formData.get(field)
  return typeof candidate === 'string' ? candidate.trim() : ''
}

function isUuid(candidate: string) {
  return UUID.test(candidate)
}

function failure(fieldErrors: FieldErrors, error: string): Failure {
  return { ok: false, error, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) }
}

/** Proposes, but never activates, a trainer's immutable professional plan. */
export async function proposeTrainerAssignment(formData: FormData): Promise<ProposalResult> {
  const relationshipId = value(formData, 'relationshipId')
  const templateId = value(formData, 'templateId')
  const changeSummary = value(formData, 'changeSummary')
  const idempotencyKey = value(formData, 'idempotencyKey')
  const fieldErrors: FieldErrors = {}

  if (!isUuid(relationshipId)) fieldErrors.relationshipId = 'La relaciÃ³n no es vÃ¡lida.'
  if (!isUuid(templateId)) fieldErrors.templateId = 'La rutina no es vÃ¡lida.'
  if (changeSummary.length > 1000) fieldErrors.changeSummary = 'El resumen no puede superar 1000 caracteres.'
  if (!idempotencyKey || idempotencyKey.length > 200) fieldErrors.idempotencyKey = 'No se pudo identificar este envÃ­o. IntÃ©ntalo de nuevo.'
  if (Object.keys(fieldErrors).length) return failure(fieldErrors, 'Revisa los datos de la propuesta.')

  const { supabase } = await requireActiveTrainerContext()
  const { data, error } = await (supabase.rpc as any)('propose_trainer_assignment', {
    p_relationship_id: relationshipId,
    p_template_id: templateId,
    p_change_summary: changeSummary || null,
    p_idempotency_key: idempotencyKey,
  })
  const proposal = Array.isArray(data) ? data[0] : data
  if (error || !proposal?.assignment_id || !proposal?.assignment_version_id || !proposal?.workout_plan_id) {
    return failure({}, 'No se pudo enviar la rutina. Verifica que el acompaÃ±amiento siga activo y que el cliente haya dado su consentimiento.')
  }

  revalidatePath('/coaching')
  revalidatePath('/coach/programs')
  return {
    ok: true,
    assignmentId: proposal.assignment_id,
    assignmentVersionId: proposal.assignment_version_id,
    workoutPlanId: proposal.workout_plan_id,
  }
}

/** Activates a client's first accepted professional prescription atomically. */
export async function acceptTrainerAssignment(formData: FormData): Promise<AcceptanceResult> {
  const assignmentId = value(formData, 'assignmentId')
  const idempotencyKey = value(formData, 'idempotencyKey')
  const fieldErrors: FieldErrors = {}

  if (!isUuid(assignmentId)) fieldErrors.assignmentId = 'La propuesta no es vÃ¡lida.'
  if (!idempotencyKey || idempotencyKey.length > 200) {
    fieldErrors.idempotencyKey = 'No se pudo identificar esta aceptaciÃ³n. IntÃ©ntalo de nuevo.'
  }
  if (Object.keys(fieldErrors).length) return failure(fieldErrors, 'Revisa los datos de la propuesta.')

  const { supabase } = await requireAppUserContext()
  const { data, error } = await (supabase.rpc as any)('accept_trainer_assignment', {
    p_assignment_id: assignmentId,
    p_idempotency_key: idempotencyKey,
  })
  const accepted = Array.isArray(data) ? data[0] : data
  if (error || !accepted?.assignment_id || !accepted?.workout_plan_id) {
    return failure({}, 'No se pudo activar la rutina. Verifica que el acompaÃ±amiento siga activo e intÃ©ntalo de nuevo.')
  }

  revalidatePath('/coaching')
  revalidatePath('/plan')
  return { ok: true, assignmentId: accepted.assignment_id, workoutPlanId: accepted.workout_plan_id }
}
