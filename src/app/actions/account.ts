'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { deleteVerifiedAccount } from '@/lib/account/delete'

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
 *   - El servicio compartido limpia archivos y registros personales con SET NULL
 *     antes de borrar la identidad. Una limpieza incompleta devuelve un error.
 */
export async function deleteAccount(formData: FormData) {
  const supabase = await createClient()
  const result = await deleteVerifiedAccount(String(formData.get('confirmText') ?? ''), {
    verifyUser: async () => { const { data, error } = await supabase.auth.getUser(); return error ? null : data.user },
    createAdmin: createServiceClient,
  })
  if (!result.ok) redirect(`/delete-account?error=${result.code}`)

  // Limpiar la sesión local tras la confirmación del servidor.
  try {
    await supabase.auth.signOut()
  } catch {
    /* la sesión ya no existe en el servidor */
  }

  redirect('/login?notice=account_deleted')
}
