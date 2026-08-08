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
  revalidatePath('/coaching')
  revalidatePath('/coach/requests')
}

async function invokeConsentAction(
  rpcName: 'grant_body_measurements_consent' | 'revoke_body_measurements_consent' | 'revoke_training_profile_consent',
  formData: FormData,
): Promise<ConsentResult> {
  const relationshipId = formString(formData, 'relationshipId')
  const idempotencyKey = formString(formData, 'idempotencyKey')
  if (!relationshipId || !idempotencyKey) return { ok: false, error: 'No se pudo identificar el acompañamiento.' }

  try {
    const { supabase } = await requireAppUserContext()
    const args = rpcName === 'grant_body_measurements_consent'
      ? { relationship_id: relationshipId, consent_version: 'body-measurements-v1', idempotency_key: idempotencyKey }
      : { relationship_id: relationshipId, idempotency_key: idempotencyKey }
    const { data, error } = await (supabase as any).rpc(rpcName, args)
    const result = Array.isArray(data) ? data[0] : data
    if (error || !result?.relationship_id) return { ok: false, error: 'No se pudo actualizar el consentimiento.' }

    revalidateConsentPaths()
    return { ok: true, relationshipId: result.relationship_id, changed: result.changed === true }
  } catch {
    return { ok: false, error: 'No se pudo actualizar el consentimiento.' }
  }
}

export function grantBodyMeasurementsConsent(formData: FormData) {
  return invokeConsentAction('grant_body_measurements_consent', formData)
}

export function revokeBodyMeasurementsConsent(formData: FormData) {
  return invokeConsentAction('revoke_body_measurements_consent', formData)
}

export function revokeTrainingProfileConsent(formData: FormData) {
  return invokeConsentAction('revoke_training_profile_consent', formData)
}

async function invokeRelationshipAction(
  rpcName: 'end_coaching_relationship' | 'resume_paused_coaching_relationship',
  formData: FormData,
): Promise<RelationshipResult> {
  const relationshipId = formString(formData, 'relationshipId')
  const idempotencyKey = formString(formData, 'idempotencyKey')
  const reason = formString(formData, 'reason')
  if (!relationshipId || !idempotencyKey) return { ok: false, error: 'No se pudo identificar el acompaÃ±amiento.' }
  if (rpcName === 'end_coaching_relationship' && reason.length > 500) {
    return { ok: false, error: 'El motivo no puede superar 500 caracteres.' }
  }

  try {
    const { supabase } = await requireAppUserContext()
    const args = rpcName === 'end_coaching_relationship'
      ? { relationship_id: relationshipId, reason: reason || null, idempotency_key: idempotencyKey }
      : { relationship_id: relationshipId, idempotency_key: idempotencyKey }
    const { data, error } = await (supabase as any).rpc(rpcName, args)
    const result = Array.isArray(data) ? data[0] : data
    if (error || !result?.relationship_id) return { ok: false, error: 'No se pudo actualizar el acompaÃ±amiento.' }

    revalidateConsentPaths()
    return { ok: true, relationshipId: result.relationship_id, changed: result.changed === true }
  } catch {
    return { ok: false, error: 'No se pudo actualizar el acompaÃ±amiento.' }
  }
}

export function endCoachingRelationship(formData: FormData) {
  return invokeRelationshipAction('end_coaching_relationship', formData)
}

export function resumePausedCoachingRelationship(formData: FormData) {
  return invokeRelationshipAction('resume_paused_coaching_relationship', formData)
}
