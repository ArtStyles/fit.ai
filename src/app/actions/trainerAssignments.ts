'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { requireAppUserContext } from '@/lib/auth/server'

type FieldErrors = Record<string, string>
type Failure = { ok: false; error: string; fieldErrors?: FieldErrors }
type ProposalResult = { ok: true; assignmentId: string; assignmentVersionId: string; workoutPlanId: string } | Failure
type AcceptanceResult = { ok: true; assignmentId: string; workoutPlanId: string } | Failure
export type DeclineResult = { ok: true; assignmentId: string; changed: boolean } | Failure
type RevisionResult = { ok: true; assignmentId: string; assignmentVersionId: string; workoutPlanId: string } | Failure

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const GENERIC_PROPOSAL_ERROR = 'No se pudo enviar la rutina. Inténtalo de nuevo.'
const PROPOSAL_ERROR_MESSAGES = {
  TRAINER_ASSIGNMENT_CONSENT_REQUIRED: 'No se puede enviar la rutina porque la autorización de datos de entrenamiento del cliente no está activa. Pídele que revise Acompañamiento.',
  COACHING_RELATIONSHIP_NOT_ACTIVE: 'El acompañamiento está pausado o finalizado. Revísalo antes de enviar la rutina.',
  TRAINER_ASSIGNMENT_ACTIVE_EXISTS: 'Este cliente ya tiene una rutina profesional activa. Gestiona esa rutina en lugar de enviar otra.',
  TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE: 'Completa todos los días y añade al menos un ejercicio por día antes de enviar la rutina.',
  TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE: 'Esta rutina ya no está disponible para enviarla.',
  TRAINER_ASSIGNMENT_TRAINER_INACTIVE: 'Tu perfil de entrenador no está activo.',
  TRAINER_ASSIGNMENT_CLIENT_INACTIVE: 'La cuenta del cliente no está activa.',
} as const

export function mapTrainerAssignmentProposalError(error: unknown): string {
  const texts = typeof error === 'string'
    ? [error]
    : error && typeof error === 'object'
      ? ['message', 'details', 'hint'].flatMap(field => {
        const candidate = (error as Record<string, unknown>)[field]
        return typeof candidate === 'string' ? [candidate] : []
      })
      : []

  for (const [token, message] of Object.entries(PROPOSAL_ERROR_MESSAGES)) {
    if (texts.some(text => text.includes(token))) return message
  }

  return GENERIC_PROPOSAL_ERROR
}

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

  if (!isUuid(relationshipId)) fieldErrors.relationshipId = 'La relación no es válida.'
  if (!isUuid(templateId)) fieldErrors.templateId = 'La rutina no es válida.'
  if (changeSummary.length > 1000) fieldErrors.changeSummary = 'El resumen no puede superar 1000 caracteres.'
  if (!idempotencyKey || idempotencyKey.length > 200) fieldErrors.idempotencyKey = 'No se pudo identificar este envío. Inténtalo de nuevo.'
  if (Object.keys(fieldErrors).length) return failure(fieldErrors, 'Revisa los datos de la propuesta.')

  const { supabase } = await requireActiveTrainerContext()
  const { data, error } = await (supabase.rpc as any)('propose_trainer_assignment', {
    p_relationship_id: relationshipId,
    p_template_id: templateId,
    p_change_summary: changeSummary || null,
    p_idempotency_key: idempotencyKey,
  })
  const proposal = Array.isArray(data) ? data[0] : data
  if (error) return failure({}, mapTrainerAssignmentProposalError(error))
  if (!proposal?.assignment_id || !proposal?.assignment_version_id || !proposal?.workout_plan_id) return failure({}, GENERIC_PROPOSAL_ERROR)

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

  if (!isUuid(assignmentId)) fieldErrors.assignmentId = 'La propuesta no es válida.'
  if (!idempotencyKey || idempotencyKey.length > 200) {
    fieldErrors.idempotencyKey = 'No se pudo identificar esta aceptación. Inténtalo de nuevo.'
  }
  if (Object.keys(fieldErrors).length) return failure(fieldErrors, 'Revisa los datos de la propuesta.')

  const { supabase } = await requireAppUserContext()
  const { data, error } = await (supabase.rpc as any)('accept_trainer_assignment', {
    p_assignment_id: assignmentId,
    p_idempotency_key: idempotencyKey,
  })
  const accepted = Array.isArray(data) ? data[0] : data
  if (error || !accepted?.assignment_id || !accepted?.workout_plan_id) {
    return failure({}, 'No se pudo activar la rutina. Verifica que el acompañamiento siga activo e inténtalo de nuevo.')
  }

  revalidatePath('/coaching')
  revalidatePath('/plan')
  return { ok: true, assignmentId: accepted.assignment_id, workoutPlanId: accepted.workout_plan_id }
}

/** Terminates an unaccepted proposal without requiring an active coaching relationship. */
export async function declineTrainerAssignment(formData: FormData): Promise<DeclineResult> {
  const assignmentId = value(formData, 'assignmentId')
  const reason = value(formData, 'reason')
  const idempotencyKey = value(formData, 'idempotencyKey')
  const fieldErrors: FieldErrors = {}

  if (!isUuid(assignmentId)) fieldErrors.assignmentId = 'La propuesta no es válida.'
  if (reason.length > 500) fieldErrors.reason = 'El motivo no puede superar 500 caracteres.'
  if (!idempotencyKey || idempotencyKey.length > 200) {
    fieldErrors.idempotencyKey = 'No se pudo identificar este rechazo. Inténtalo de nuevo.'
  }
  if (Object.keys(fieldErrors).length) return failure(fieldErrors, 'Revisa los datos del rechazo.')

  const { supabase } = await requireAppUserContext()
  const { data, error } = await (supabase.rpc as any)('decline_trainer_assignment', {
    p_assignment_id: assignmentId,
    p_reason: reason || null,
    p_idempotency_key: idempotencyKey,
  })
  const declined = Array.isArray(data) ? data[0] : data
  if (error || !declined?.assignment_id || typeof declined.changed !== 'boolean') {
    return failure({}, 'No se pudo rechazar la rutina. Verifica que la propuesta siga pendiente e inténtalo de nuevo.')
  }

  revalidatePath('/coaching')
  revalidatePath('/coach/programs')
  return { ok: true, assignmentId: declined.assignment_id, changed: declined.changed }
}

/** Publishes an immutable replacement that only affects sessions authorized later. */
export async function publishTrainerAssignmentRevision(formData: FormData): Promise<RevisionResult> {
  const assignmentId = value(formData, 'assignmentId')
  const templateId = value(formData, 'templateId')
  const changeSummary = value(formData, 'changeSummary')
  const idempotencyKey = value(formData, 'idempotencyKey')
  const fieldErrors: FieldErrors = {}

  if (!isUuid(assignmentId)) fieldErrors.assignmentId = 'La asignación no es válida.'
  if (!isUuid(templateId)) fieldErrors.templateId = 'La rutina no es válida.'
  if (!changeSummary) fieldErrors.changeSummary = 'Explica qué cambió para tu cliente.'
  if (changeSummary.length > 1000) fieldErrors.changeSummary = 'El resumen no puede superar 1000 caracteres.'
  if (!idempotencyKey || idempotencyKey.length > 200) fieldErrors.idempotencyKey = 'No se pudo identificar esta publicación. Inténtalo de nuevo.'
  if (Object.keys(fieldErrors).length) return failure(fieldErrors, 'Revisa los datos de la revisión.')

  const { supabase } = await requireActiveTrainerContext()
  const { data, error } = await (supabase.rpc as any)('publish_trainer_assignment_revision', {
    p_assignment_id: assignmentId,
    p_template_id: templateId,
    p_change_summary: changeSummary,
    p_idempotency_key: idempotencyKey,
  })
  const revision = Array.isArray(data) ? data[0] : data
  if (error || !revision?.assignment_id || !revision?.assignment_version_id || !revision?.workout_plan_id) {
    return failure({}, 'No se pudo publicar la revisión. Verifica que el acompañamiento siga activo e inténtalo de nuevo.')
  }

  revalidatePath('/coaching')
  revalidatePath('/coach/programs')
  revalidatePath('/plan')
  return {
    ok: true,
    assignmentId: revision.assignment_id,
    assignmentVersionId: revision.assignment_version_id,
    workoutPlanId: revision.workout_plan_id,
  }
}
