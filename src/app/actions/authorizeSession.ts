'use server'

import { createClient } from '@/lib/supabase/server'
import { parseSessionContextSnapshot, type SessionContextSnapshotV1 } from '@/lib/session/contextSnapshot'
import { authorizationErrorMessage } from '@/lib/session/authorization'

export type AuthorizeSessionStartResult =
  | { success: true; contextSnapshot: SessionContextSnapshotV1 }
  | { success: false; error: string }

export type ReleaseSessionAuthorizationResult =
  | { success: true }
  | { success: false; error: string }

const RELEASE_ERROR = 'No se pudo descartar el entrenamiento. Inténtalo nuevamente.'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function authorizeSessionStart(
  clientSessionId: string,
  workoutId: string,
): Promise<AuthorizeSessionStartResult> {
  if (!isUuid(clientSessionId) || !isUuid(workoutId)) {
    return { success: false, error: 'No se pudo preparar la sesión. Inténtalo nuevamente.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Tu sesión expiró. Inicia sesión nuevamente.' }

  const { data, error } = await (supabase as any).rpc('authorize_session_start', {
    p_client_session_id: clientSessionId,
    p_workout_id: workoutId,
  }) as { data: unknown; error: { message: string } | null }

  if (error) return { success: false, error: authorizationErrorMessage(error.message) }

  const contextSnapshot = parseSessionContextSnapshot(data)
  if (!contextSnapshot) {
    return { success: false, error: 'No se pudo preparar la sesión. Inténtalo nuevamente.' }
  }

  return { success: true, contextSnapshot }
}

export async function releaseSessionAuthorization(
  clientSessionId: string,
  workoutId: string,
): Promise<ReleaseSessionAuthorizationResult> {
  if (!isUuid(clientSessionId) || !isUuid(workoutId)) {
    return { success: false, error: RELEASE_ERROR }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Tu sesión expiró. Inicia sesión nuevamente.' }

  const { error } = await (supabase as any).rpc('release_session_authorization', {
    p_client_session_id: clientSessionId,
    p_workout_id: workoutId,
  }) as { error: { message: string } | null }

  if (error) return { success: false, error: RELEASE_ERROR }

  return { success: true }
}
