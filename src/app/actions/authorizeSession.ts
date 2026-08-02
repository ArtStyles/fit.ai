'use server'

import { createClient } from '@/lib/supabase/server'
import { parseSessionContextSnapshot, type SessionContextSnapshotV1 } from '@/lib/session/contextSnapshot'

export type AuthorizeSessionStartResult =
  | { success: true; contextSnapshot: SessionContextSnapshotV1 }
  | { success: false; error: string }

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function authorizeSessionStart(
  clientSessionId: string,
  workoutId: string,
): Promise<AuthorizeSessionStartResult> {
  if (!isUuid(clientSessionId) || !isUuid(workoutId)) {
    return { success: false, error: 'Identificador de sesión inválido' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'No autenticado' }

  const { data, error } = await (supabase as any).rpc('authorize_session_start', {
    p_client_session_id: clientSessionId,
    p_workout_id: workoutId,
  }) as { data: unknown; error: { message: string } | null }

  if (error) return { success: false, error: error.message }

  const contextSnapshot = parseSessionContextSnapshot(data)
  if (!contextSnapshot) {
    return { success: false, error: 'No se pudo autorizar la sesión' }
  }

  return { success: true, contextSnapshot }
}
