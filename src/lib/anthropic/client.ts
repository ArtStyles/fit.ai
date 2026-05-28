/**
 * Anthropic SDK client — singleton para uso server-side exclusivamente.
 *
 * `server-only` provoca un error de compilación si este módulo se importa
 * desde un componente cliente ('use client'). Protección en build-time.
 *
 * Seguridad:
 *   - ANTHROPIC_API_KEY nunca se expone al bundle cliente.
 *   - La validación es lazy (al primer uso, no al arranque del servidor)
 *     para no crashear rutas que no usan IA si la clave no está presente.
 *   - En producción: configura ANTHROPIC_API_KEY como variable de entorno
 *     server-only en Vercel/Railway/etc. (nunca NEXT_PUBLIC_*).
 *
 * Uso solo en:
 *   - Server Components
 *   - Route Handlers (src/app/api/**)
 *   - Server Actions ('use server')
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (_client) return _client

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Error controlado: no crashea el servidor, lanza al caller
    // El Route Handler lo atrapa y devuelve 503 al cliente sin exponer detalles.
    throw new Error(
      'ANTHROPIC_API_KEY no configurada. ' +
      'Añade la clave a .env.local (desarrollo) o a las variables de entorno ' +
      'del servidor en producción. Nunca uses NEXT_PUBLIC_ para esta clave.'
    )
  }

  _client = new Anthropic({ apiKey })
  return _client
}
