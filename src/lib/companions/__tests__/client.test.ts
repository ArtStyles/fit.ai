import { describe, expect, it, vi } from 'vitest'
import { createCompanionClient } from '../client'
import { measureCompanionMessage, parseCompanionSnapshot, validateCompanionMessage } from '../validation'
import type { CompanionSnapshot } from '../types'

const viewerId = '10000000-0000-4000-8000-000000000001'
const otherId = '10000000-0000-4000-8000-000000000002'
const relationshipId = '20000000-0000-4000-8000-000000000001'
const requestId = '30000000-0000-4000-8000-000000000001'
const week = { completedSessions: 2, goal: 3, weekStart: '2026-09-07', weekEnd: '2026-09-13', timeZone: 'America/Havana', updatedAt: '2026-09-10T12:00:00Z' }
const active: CompanionSnapshot = {
  viewerId, status: 'active', relationship: { id: relationshipId, other: { userId: otherId, fullName: 'Frank', avatarUrl: null }, expiresAt: null },
  self: week, partner: week, greeting: null, nextGreetingAt: null, fetchedAt: week.updatedAt,
}

describe('companion public contract', () => {
  it('keeps only the approved public fields', () => {
    const value = parseCompanionSnapshot({ ...active, privateHealth: 'secret', partner: { ...week, measurements: 'secret' } }, viewerId)
    expect(value).toEqual(active)
    expect(JSON.stringify(value)).not.toContain('secret')
  })
  it('rejects another viewer and self relationships', () => {
    expect(parseCompanionSnapshot(active, otherId)).toBeNull()
    expect(parseCompanionSnapshot({ ...active, relationship: { ...active.relationship, other: { ...active.relationship!.other, userId: viewerId } } }, viewerId)).toBeNull()
  })
  it.each([
    { status: 'none' }, { partner: { ...week, completedSessions: -1 } },
    { partner: { ...week, goal: 1.5 } }, { partner: { ...week, weekStart: '2026-02-30' } },
    { partner: { ...week, timeZone: 'Not/AZone' } }, { fetchedAt: 'yesterday' },
    { nextGreetingAt: 'tomorrow' }, { greeting: { message: 'x'.repeat(121), sentAt: week.updatedAt } },
  ])('rejects malformed or inconsistent server state %j', patch => {
    expect(parseCompanionSnapshot({ ...active, ...patch }, viewerId)).toBeNull()
  })
  it('does not expose partner progress before acceptance', () => {
    expect(parseCompanionSnapshot({ ...active, status: 'pending_incoming', relationship: { ...active.relationship, expiresAt: week.updatedAt } }, viewerId)).toBeNull()
  })
  it('retains a missing weekly goal without inventing a number', () => {
    expect(parseCompanionSnapshot({ ...active, partner: { ...week, goal: null } }, viewerId)?.partner?.goal).toBeNull()
  })
  it('keeps an unavailable partner relationship accessible for unlinking', () => {
    expect(parseCompanionSnapshot({ ...active, partner: null }, viewerId)).toEqual({ ...active, partner: null })
    expect(parseCompanionSnapshot({ ...active, partner: {}, self: week }, viewerId)).toBeNull()
  })
  it('removes unsafe avatar URLs', () => {
    const value = parseCompanionSnapshot({ ...active, relationship: { ...active.relationship, other: { ...active.relationship!.other, avatarUrl: 'javascript:alert(1)' } } }, viewerId)
    expect(value?.relationship?.other.avatarUrl).toBeNull()
  })
  it('preserves the received greeting separately from the viewer greeting and strips extra data', () => {
    const incoming = { message: '<b>¡Bien hecho!</b> 💪', sentAt: '2026-09-09T13:00:00Z' }
    const outgoing = { message: 'Gracias, seguimos', sentAt: week.updatedAt }
    const value = parseCompanionSnapshot({ ...active, greeting: outgoing, receivedGreeting: { ...incoming, privateNote: 'secret' } }, viewerId)
    expect(value).toEqual({ ...active, greeting: outgoing, receivedGreeting: incoming })
    expect(JSON.stringify(value)).not.toContain('secret')
  })
  it('accepts older servers without a received field and an explicit empty received greeting', () => {
    expect(parseCompanionSnapshot(active, viewerId)).toEqual(active)
    expect(parseCompanionSnapshot({ ...active, receivedGreeting: null }, viewerId)).toEqual({ ...active, receivedGreeting: null })
  })
  it.each([
    { message: '', sentAt: week.updatedAt }, { message: 'x'.repeat(121), sentAt: week.updatedAt },
    { message: 'Hola', sentAt: 'yesterday' }, { message: 42, sentAt: week.updatedAt },
  ])('rejects a malformed received greeting %j', receivedGreeting => {
    expect(parseCompanionSnapshot({ ...active, receivedGreeting }, viewerId)).toBeNull()
  })
  it('rejects received messages before consent or when partner access is unavailable', () => {
    const receivedGreeting = { message: 'Hola', sentAt: week.updatedAt }
    expect(parseCompanionSnapshot({ ...active, status: 'pending_incoming', partner: null, relationship: { ...active.relationship, expiresAt: week.updatedAt }, receivedGreeting }, viewerId)).toBeNull()
    expect(parseCompanionSnapshot({ ...active, partner: null, receivedGreeting }, viewerId)).toBeNull()
    expect(parseCompanionSnapshot({ ...active, status: 'none', relationship: null, partner: null, receivedGreeting }, viewerId)).toBeNull()
  })
})

describe('personal greeting validation', () => {
  it('normalizes accents and counts Unicode without double-counting surrogate pairs', () => {
    expect(measureCompanionMessage('e\u0301💪')).toBe(2)
    expect(validateCompanionMessage('  ¡Bien hecho! 💪  ')).toEqual({ ok: true, value: '¡Bien hecho! 💪' })
    expect(validateCompanionMessage('💪'.repeat(120)).ok).toBe(true)
    expect(validateCompanionMessage('💪'.repeat(121)).ok).toBe(false)
  })
  it('uses the shown default for empty or whitespace-only greetings', () => {
    expect(validateCompanionMessage(' \n\t ')).toEqual({ ok: true, value: '👏 ¡Bien hecho!' })
    expect(validateCompanionMessage(' '.repeat(121))).toEqual({ ok: true, value: '👏 ¡Bien hecho!' })
    expect(validateCompanionMessage(`  ${'x'.repeat(120)}  `)).toEqual({ ok: true, value: 'x'.repeat(120) })
  })
  it('rejects non-text, NUL and excess text rather than truncating it', () => {
    expect(validateCompanionMessage(null).ok).toBe(false)
    expect(validateCompanionMessage('x\u0000').ok).toBe(false)
    expect(validateCompanionMessage('x'.repeat(121)).ok).toBe(false)
  })
})

describe('shared companion RPC client', () => {
  it('does not return state belonging to an earlier account', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...active, viewerId: otherId }, error: null })
    expect(await createCompanionClient({ viewerId, rpc }).loadCompanion()).toMatchObject({ ok: false, code: 'unavailable' })
  })
  it('passes stable request UUID and normalized plain text to an authenticated mutation', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: active, error: null })
    const result = await createCompanionClient({ viewerId, rpc }).sendCompanionGreeting(relationshipId, '  Hola <b>Frank</b>  ', requestId)
    expect(rpc).toHaveBeenCalledWith('send_companion_greeting', { p_relationship_id: relationshipId, p_message: 'Hola <b>Frank</b>', p_request_id: requestId })
    expect(result).toEqual({ ok: true, value: active })
  })
  it('rejects invalid input before performing a network request', async () => {
    const rpc = vi.fn()
    const client = createCompanionClient({ viewerId, rpc })
    expect((await client.sendCompanionGreeting('wrong', 'Hola', requestId)).ok).toBe(false)
    expect((await client.sendCompanionGreeting(relationshipId, 'x'.repeat(121), requestId)).ok).toBe(false)
    expect((await client.respondCompanionInvitation(relationshipId, 'yes' as unknown as boolean)).ok).toBe(false)
    expect((await client.previewCompanionCode('broken')).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('normalizes invitation codes and rejects mismatched previews', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { code: 'VKR-012345ABCDEF', person: active.relationship!.other, expiresAt: week.updatedAt }, error: null })
    const client = createCompanionClient({ viewerId, rpc })
    expect((await client.previewCompanionCode(' vkr-012345abcdef ')).ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('preview_companion_invite_code', { p_code: 'VKR-012345ABCDEF' })
    expect((await client.previewCompanionCode('VKR-111111111111')).ok).toBe(false)
  })
  it('reports safe quota errors and never displays raw SQL/network errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'COMPANION_DAILY_LIMIT' } })
    expect(await createCompanionClient({ viewerId, rpc }).loadCompanion()).toMatchObject({ ok: false, code: 'daily_limit' })
    rpc.mockResolvedValue({ data: null, error: { message: 'password=secret internal database' } })
    const result = await createCompanionClient({ viewerId, rpc }).loadCompanion()
    expect(result).toMatchObject({ ok: false, code: 'unavailable' })
    expect(JSON.stringify(result)).not.toContain('secret')
    rpc.mockRejectedValue(new Error('secret'))
    expect(await createCompanionClient({ viewerId, rpc }).loadCompanion()).toMatchObject({ ok: false, code: 'connection_required' })
  })
  it.each(['COMPANION_NOT_ALLOWED', 'COMPANION_INVITATION_UNAVAILABLE', 'COMPANION_UNAVAILABLE', 'COMPANION_IDEMPOTENCY_MISMATCH'])('handles a changed relationship or retry: %s', async message => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } })
    expect(await createCompanionClient({ viewerId, rpc }).loadCompanion()).toMatchObject({ ok: false, code: 'conflict' })
  })
})
