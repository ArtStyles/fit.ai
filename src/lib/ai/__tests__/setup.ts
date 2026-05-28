/**
 * setup.ts — Configuración global de Vitest
 *
 * Mockea módulos que solo funcionan en el entorno de Next.js (server-only)
 * o que requieren infraestructura externa (Supabase, Anthropic API).
 */
import { vi } from 'vitest'

// 'server-only' lanza un error en entornos no-Next.js; en tests lo ignoramos.
vi.mock('server-only', () => ({}))

// El Supabase client y el cliente Anthropic no se usan en el mock,
// pero si algún import transitivo los carga, que no fallen.
vi.mock('@/lib/supabase/server',  () => ({ createClient:         vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient:  vi.fn() }))
vi.mock('@/lib/anthropic/client', () => ({ getAnthropicClient:   vi.fn() }))
