'use server'

import { revalidatePath } from 'next/cache'
import { requireAppUserContext } from '@/lib/auth/server'

type ConsentResult = { ok: true; relationshipId: string; changed: boolean } | { ok: false; error: string }
type RelationshipResult = { ok: true; relationshipId: string; changed: boolean } | { ok: false; error: string }

function formString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function revalidateConsentPaths() {
  revalidatePath('/dashboard')
  revalidatePath('/coaching')
  revalidatePath('/coach/clients')
  revalidatePath('/coach/programs')
}

function revalidateRelationshipPaths() {
  revalidateConsentPaths()
  revalidatePath('/coach/requests')
}

function parseConsentRpcResult(data: unknown, expectedRelationshipId: string) {
  if (!Array.isArray(data) || data.length !== 1) return null
  const row = data[0]
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const result = row as Record<string, unknown>
  if (
    typeof result.relationship_id !== 'string'
    || result.relationship_id !== expectedRelationshipId
    || typeof result.changed !== 'boolean'
  ) return null
  return { relationshipId: result.relationship_id, changed: result.changed }
}

async function invokeConsentAction(
  rpcName: 'grant_training_profile_consent' | 'grant_body_measurements_consent' | 'revoke_body_measurements_consent' | 'revoke_training_profile_consent',
  formData: FormData,
): Promise<ConsentResult> {
  const relationshipId = formString(formData, 'relationshipId')
  const idempotencyKey = formString(formData, 'idempotencyKey')
  if (!relationshipId || !idempotencyKey) return { ok: false, error: 'No se pudo identificar el acompañamiento.' }

  try {
    const { supabase } = await requireAppUserContext()
    const args = rpcName === 'grant_training_profile_consent'
      ? { p_relationship_id: relationshipId, p_consent_version: 'training-profile-v1', p_idempotency_key: idempotencyKey }
      : rpcName === 'grant_body_measurements_consent'
        ? { p_relationship_id: relationshipId, p_consent_version: 'body-measurements-v1', p_idempotency_key: idempotencyKey }
        : { p_relationship_id: relationshipId, p_idempotency_key: idempotencyKey }
    const { data, error } = await (supabase as any).rpc(rpcName, args)
    const result = error ? null : parseConsentRpcResult(data, relationshipId)
    if (!result) return { ok: false, error: 'No se pudo actualizar el consentimiento.' }

    revalidateConsentPaths()
    return { ok: true, relationshipId: result.relationshipId, changed: result.changed }
  } catch {
    return { ok: false, error: 'No se pudo actualizar el consentimiento.' }
  }
}

export async function grantTrainingProfileConsent(formData: FormData) {
  return invokeConsentAction('grant_training_profile_consent', formData)
}

export async function grantBodyMeasurementsConsent(formData: FormData) {
  return invokeConsentAction('grant_body_measurements_consent', formData)
}

export async function revokeBodyMeasurementsConsent(formData: FormData) {
  return invokeConsentAction('revoke_body_measurements_consent', formData)
}

export async function revokeTrainingProfileConsent(formData: FormData) {
  return invokeConsentAction('revoke_training_profile_consent', formData)
}

async function invokeRelationshipAction(
  rpcName: 'end_coaching_relationship' | 'resume_paused_coaching_relationship',
  formData: FormData,
): Promise<RelationshipResult> {
  const relationshipId = formString(formData, 'relationshipId')
  const idempotencyKey = formString(formData, 'idempotencyKey')
  const reason = formString(formData, 'reason')
  if (!relationshipId || !idempotencyKey) return { ok: false, error: 'No se pudo identificar el acompañamiento.' }
  if (rpcName === 'end_coaching_relationship' && reason.length > 500) {
    return { ok: false, error: 'El motivo no puede superar 500 caracteres.' }
  }

  try {
    const { supabase } = await requireAppUserContext()
    const args = rpcName === 'end_coaching_relationship'
      ? { p_relationship_id: relationshipId, p_reason: reason || null, p_idempotency_key: idempotencyKey }
      : { p_relationship_id: relationshipId, p_idempotency_key: idempotencyKey }
    const { data, error } = await (supabase as any).rpc(rpcName, args)
    const result = Array.isArray(data) ? data[0] : data
    if (error || !result?.relationship_id) return { ok: false, error: 'No se pudo actualizar el acompañamiento.' }

    revalidateRelationshipPaths()
    return { ok: true, relationshipId: result.relationship_id, changed: result.changed === true }
  } catch {
    return { ok: false, error: 'No se pudo actualizar el acompañamiento.' }
  }
}

export async function endCoachingRelationship(formData: FormData) {
  return invokeRelationshipAction('end_coaching_relationship', formData)
}

export async function resumePausedCoachingRelationship(formData: FormData) {
  return invokeRelationshipAction('resume_paused_coaching_relationship', formData)
}
