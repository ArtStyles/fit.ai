'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isOwnerAdminEmail } from '@/lib/auth/identity'

const CONFIRM_WORDS = new Set(['ELIMINAR', 'DELETE'])

/**
 * Elimina la cuenta del usuario autenticado y todos sus datos.
 *
 * Seguridad y completitud:
 *   - Requiere escribir la palabra de confirmación (revalidada en servidor).
 *   - Re-verifica la sesión con el cliente de usuario (no confía en el cliente).
 *   - Usa el cliente service-role para borrar de auth.users; las FK con
 *     ON DELETE CASCADE eliminan profiles, workout_plans, workouts,
 *     workout_exercises, progress_logs, exercise_logs, measurements,
 *     ai_conversations y ai_messages.
 *   - ai_usage_logs usa ON DELETE SET NULL, así que se borra explícitamente
 *     antes para no dejar registros con datos del usuario.
 */
export async function deleteAccount(formData: FormData) {
  const confirmText = String(formData.get('confirmText') ?? '').trim()
  if (!CONFIRM_WORDS.has(confirmText)) {
    redirect('/settings?error=delete_confirm')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')
  if (isOwnerAdminEmail(user.email)) redirect('/settings/cuenta?error=admin_owner_protected')

  const userId = user.id
  const admin = createServiceClient()

  // 1) Registros con SET NULL (no cascada): borrar explícitamente.
  await admin.from('ai_usage_logs').delete().eq('user_id', userId)

  // 2) Borrar el usuario → cascada al resto de tablas vinculadas a auth.users.
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    console.error('[deleteAccount] No se pudo eliminar el usuario:', error.message)
    redirect('/settings?error=delete_failed')
  }

  // 3) Limpiar la sesión local (el token ya es inválido tras el borrado).
  try {
    await supabase.auth.signOut()
  } catch {
    /* la sesión ya no existe en el servidor */
  }

  redirect('/login?notice=account_deleted')
}
