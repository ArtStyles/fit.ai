import { describe, expect, it, vi } from 'vitest'
import { createFitnessClient, createPrivateCardLease } from './client'
import type { FitnessPlatform } from './platform-types'
import type { FitnessCard } from './types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const card = { owner: { userId: owner, name: 'Ana', username: 'ana', avatarUrl: null }, artisticName: '', theme: 'violet', revision: 1, photos: [], evidence: { records: [], muscles: [], totalSessions: 0, partialSessions: 0, rangeFrom: '2026-06-21', rangeTo: '2026-09-12', updatedAt: '2026-09-12T10:00:00Z' }, updatedAt: '2026-09-12T10:00:00Z' } satisfies FitnessCard

describe('Fitness Card account-bound requests', () => {
  it('rejects a delayed authorized response after logout or account switch', async () => {
    let active = true
    let release!: (value: unknown) => void
    const platform = { identity: card.owner, assertCurrent: async () => { if (!active) throw new Error('ACCOUNT_CHANGED') }, getClient: async () => ({ rpc: () => new Promise(resolve => { release = resolve }) }) } as unknown as FitnessPlatform
    const request = createFitnessClient(platform).read(owner)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    active = false; release({ data: card, error: null })
    await expect(request).rejects.toThrow('ACCOUNT_CHANGED')
  })
  it('checks returned actor identity and forwards the exact edit revision', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { viewerId: 'other', own: null, received: [], access: [] }, error: null })
    const platform = { identity: card.owner, assertCurrent: async () => {}, getClient: async () => ({ rpc }) } as unknown as FitnessPlatform
    const client = createFitnessClient(platform)
    await expect(client.hub()).rejects.toThrow()
    rpc.mockResolvedValue({ data: card, error: null })
    await client.save('Astra', 'ice', 19)
    expect(rpc).toHaveBeenLastCalledWith('save_fitness_card', { p_artistic_name: 'Astra', p_theme: 'ice', p_expected_revision: 19 })
    await client.save('Astra', 'ice', 20, { x: '@ana' })
    expect(rpc).toHaveBeenLastCalledWith('save_fitness_card_v2', { p_artistic_name: 'Astra', p_theme: 'ice', p_expected_revision: 20, p_social_links: { x: 'https://x.com/ana' } })
    rpc.mockResolvedValue({ data: { owner: card.owner, status: 'available' }, error: null })
    await expect(client.invite(owner)).resolves.toMatchObject({ status: 'available' })
    expect(rpc).toHaveBeenLastCalledWith('get_fitness_card_invite', { p_owner_id: owner })
    rpc.mockResolvedValue({ data: { viewerId: owner, own: null, received: [], access: [] }, error: null })
    await client.requestById(owner)
    expect(rpc).toHaveBeenLastCalledWith('request_fitness_card_by_id', { p_owner_id: owner })
  })
  it('never dispatches an unsent mutation after the preflight has timed out', async () => {
    vi.useFakeTimers()
    let release!: (value: unknown) => void
    const rpc = vi.fn().mockResolvedValue({ data: card, error: null })
    const platform = { identity: card.owner, assertCurrent: async () => {}, getClient: () => new Promise(resolve => { release = resolve }) } as unknown as FitnessPlatform
    const client = createFitnessClient(platform)
    const result = client.save('Astra', 'ice', 1).catch(error => error)
    await vi.advanceTimersByTimeAsync(10001)
    expect(await result).toBeInstanceOf(Error)
    release({ rpc }); await vi.advanceTimersByTimeAsync(1)
    expect(rpc).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('private viewer lease', () => {
  it('erases visible content on invalidation and rejects a stale read', () => {
    const changed = vi.fn()
    const lease = createPrivateCardLease<FitnessCard>(changed)
    const first = lease.beginRead()
    lease.invalidate()
    expect(lease.commit(first, card)).toBe(false)
    expect(changed).toHaveBeenLastCalledWith(null)
    const second = lease.beginRead()
    expect(lease.commit(second, card)).toBe(true)
    lease.dispose()
    expect(changed).toHaveBeenLastCalledWith(null)
  })
  it('clears content after its authority lease even if refresh hangs', () => {
    vi.useFakeTimers()
    const changed = vi.fn()
    const lease = createPrivateCardLease<FitnessCard>(changed, 15000)
    lease.commit(lease.beginRead(), card)
    vi.advanceTimersByTime(15001)
    expect(changed).toHaveBeenLastCalledWith(null)
    lease.dispose(); vi.useRealTimers()
  })
})
