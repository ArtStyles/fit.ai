'use server'

import { revalidatePath } from 'next/cache'
import { requireAppUserContext } from '@/lib/auth/server'
import { createCompanionClient, type CompanionClient } from '@/lib/companions/client'
import type { CompanionResult, CompanionRpcTransport } from '@/lib/companions/types'

async function invoke<T>(operation: (client: CompanionClient) => Promise<CompanionResult<T>>, mutation = false): Promise<CompanionResult<T>> {
  try {
    const { user, supabase } = await requireAppUserContext()
    const client = createCompanionClient({ viewerId: user.id, rpc: (name, args) => (supabase as unknown as Pick<CompanionRpcTransport, 'rpc'>).rpc(name, args) })
    const result = await operation(client)
    if (mutation) {
      revalidatePath('/companion')
      revalidatePath('/dashboard')
      revalidatePath('/notifications')
    }
    return result
  } catch {
    return { ok: false, code: 'unavailable', error: 'No se pudo acceder a tu compañero. Comprueba tu sesión y tu conexión.' }
  }
}

export async function loadCompanion() { return invoke(client => client.loadCompanion()) }
export async function getCompanionCode() { return invoke(client => client.getCompanionCode(), true) }
export async function previewCompanionCode(code: string) { return invoke(client => client.previewCompanionCode(code)) }
export async function sendCompanionInvitation(code: string) { return invoke(client => client.sendCompanionInvitation(code), true) }
export async function respondCompanionInvitation(id: string, accept: boolean) { return invoke(client => client.respondCompanionInvitation(id, accept), true) }
export async function cancelCompanionInvitation(id: string) { return invoke(client => client.cancelCompanionInvitation(id), true) }
export async function leaveCompanion(id: string) { return invoke(client => client.leaveCompanion(id), true) }
export async function sendCompanionGreeting(id: string, message: string, requestId: string) { return invoke(client => client.sendCompanionGreeting(id, message, requestId), true) }
