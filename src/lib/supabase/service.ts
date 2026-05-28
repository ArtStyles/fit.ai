/**
 * service.ts
 *
 * Cliente Supabase con service role key para operaciones server-side que
 * necesitan bypassear RLS (Row Level Security):
 *
 *   - Inserts en ai_usage_logs (no hay política INSERT para 'authenticated')
 *   - Queries cross-user para el límite global de gasto (checkGlobalSpendLimit)
 *   - Cualquier operación administrativa que requiera acceso sin restricción
 *
 * Seguridad:
 *   - `server-only` provoca un error de compilación si este módulo se importa
 *     desde un componente cliente. Protección en build-time.
 *   - SUPABASE_SERVICE_ROLE_KEY nunca debe comenzar con NEXT_PUBLIC_.
 *   - autoRefreshToken y persistSession en false: este cliente no mantiene
 *     estado de sesión de usuario (es un cliente de servidor, no de usuario).
 *
 * Uso: solo en Server Components, Route Handlers y Server Actions.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[Supabase] Service role key no configurada. ' +
      'Añade SUPABASE_SERVICE_ROLE_KEY a .env.local (desarrollo) o a las ' +
      'variables de entorno del servidor en producción. ' +
      'Nunca uses NEXT_PUBLIC_ para esta clave — quedaría expuesta al cliente.',
    )
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  })
}
