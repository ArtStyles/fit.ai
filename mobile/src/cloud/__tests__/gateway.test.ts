import { describe, expect, it } from 'vitest'
import { createSupabaseGateway, cloudError } from '../supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutboxOperation } from '../../domain/types'

describe('direct mobile RPC boundary', () => {
  it('describes a missing mobile deployment without suggesting an unsafe insert', () => {
    expect(cloudError({ code: 'PGRST202', message: 'not found' }).message).toMatch(/habilitarse.*servidor/i)
  })
  it('requires explicit matching acknowledgment of the immutable operation', async () => {
    const calls: unknown[] = []
    const client = { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data: [{ operation_id: 'wrong' }], error: null } } } as unknown as SupabaseClient
    const operation = { id: 'operation', kind: 'session', entityId: 'session', accountId: 'owner', createdAt: '2026-09-01', payload: { id: 'session' } } as OutboxOperation
    await expect(createSupabaseGateway(client).upload(operation)).rejects.toThrow(/confirmó/i)
    expect(calls).toEqual([{ name: 'mobile_sync_push_v1', args: { p_operation_id: 'operation', p_kind: 'session', p_entity_id: 'session', p_payload: { id: 'session' }, p_client_updated_at: '2026-09-01' } }])
  })
  it('rejects an expired auth instead of using a cached user ID', async () => {
    const client = { auth: { getUser: async () => ({ data: { user: null }, error: { message: 'expired' } }) } } as unknown as SupabaseClient
    await expect(createSupabaseGateway(client).currentUser()).rejects.toThrow(/inicia sesión/i)
  })
  it('clears the local identity even when offline revocation fails', async () => {
    let stored = true
    const client = { auth: { stopAutoRefresh: () => {}, signOut: async () => { throw new Error('offline') } } } as unknown as SupabaseClient
    const gateway = createSupabaseGateway(client, () => { stored = false })
    await gateway.signOut()
    expect(stored).toBe(false)
    await expect(gateway.currentUser()).rejects.toThrow(/inicia sesión/i)
  })
})
