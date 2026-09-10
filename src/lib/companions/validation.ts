import type { CompanionCode, CompanionCodePreview, CompanionPerson, CompanionResult, CompanionSnapshot, CompanionWeek } from './types'

export const COMPANION_MESSAGE_LIMIT = 120
export const COMPANION_DEFAULT_GREETING = '👏 ¡Bien hecho!'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const isCompanionId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10000

export function measureCompanionMessage(text: string): number {
  return Array.from(text.normalize('NFC')).length
}

export function validateCompanionMessage(value: unknown): CompanionResult<string> {
  if (typeof value !== 'string' || value.includes('\u0000')) return { ok: false, code: 'invalid', error: 'Escribe un mensaje de texto válido.' }
  const normalized = value.normalize('NFC').trim()
  if (measureCompanionMessage(normalized) > COMPANION_MESSAGE_LIMIT) return { ok: false, code: 'invalid', error: 'Tu mensaje puede tener hasta 120 caracteres.' }
  return { ok: true, value: normalized || COMPANION_DEFAULT_GREETING }
}

export function normalizeCompanionCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^VKR-[0-9A-F]{12}$/.test(code) ? code : null
}

function parsePerson(value: unknown): CompanionPerson | null {
  const row = record(value)
  if (!row || !isCompanionId(row.userId) || typeof row.fullName !== 'string' || !row.fullName.trim() || row.fullName.length > 300) return null
  let avatarUrl: string | null = null
  if (typeof row.avatarUrl === 'string' && row.avatarUrl.length <= 4096) {
    try { const url = new URL(row.avatarUrl); if (url.protocol === 'https:' && !url.username && !url.password) avatarUrl = url.href } catch { /* No image for malformed URLs. */ }
  }
  return { userId: row.userId, fullName: row.fullName, avatarUrl }
}

function parseWeek(value: unknown): CompanionWeek | null {
  const row = record(value)
  if (!row || !count(row.completedSessions) || (row.goal !== null && !count(row.goal)) || !date(row.weekStart) || !date(row.weekEnd) || row.weekEnd < row.weekStart || !instant(row.updatedAt) || typeof row.timeZone !== 'string') return null
  try { new Intl.DateTimeFormat('es', { timeZone: row.timeZone }).format(0) } catch { return null }
  return { completedSessions: row.completedSessions, goal: row.goal, weekStart: row.weekStart, weekEnd: row.weekEnd, timeZone: row.timeZone, updatedAt: row.updatedAt }
}

export function parseCompanionSnapshot(value: unknown, viewerId: string): CompanionSnapshot | null {
  const row = record(value)
  if (!row || !isCompanionId(viewerId) || row.viewerId !== viewerId || !instant(row.fetchedAt)) return null
  const status = row.status
  if (status !== 'none' && status !== 'pending_outgoing' && status !== 'pending_incoming' && status !== 'active') return null
  let relationship: CompanionSnapshot['relationship'] = null
  if (status !== 'none') {
    const link = record(row.relationship), other = parsePerson(link?.other)
    if (!link || !isCompanionId(link.id) || !other || other.userId === viewerId) return null
    if (status === 'active' ? link.expiresAt !== null : !instant(link.expiresAt)) return null
    relationship = { id: link.id, other, expiresAt: link.expiresAt as string | null }
  } else if (row.relationship !== null) return null
  const self = row.self === null ? null : parseWeek(row.self)
  const partner = row.partner === null ? null : parseWeek(row.partner)
  if (row.self !== null && !self) return null
  if (status === 'active' ? (!self || (row.partner !== null && !partner)) : row.partner !== null) return null
  let greeting: CompanionSnapshot['greeting'] = null
  if (row.greeting !== null) {
    const signal = record(row.greeting)
    if (status !== 'active' || !signal || !instant(signal.sentAt) || typeof signal.message !== 'string' || !signal.message.trim() || !validateCompanionMessage(signal.message).ok) return null
    greeting = { sentAt: signal.sentAt, message: signal.message }
  }
  let receivedGreeting: CompanionSnapshot['receivedGreeting']
  if (row.receivedGreeting === null) receivedGreeting = null
  else if (row.receivedGreeting !== undefined) {
    const signal = record(row.receivedGreeting)
    if (status !== 'active' || !partner || !signal || !instant(signal.sentAt) || typeof signal.message !== 'string' || !signal.message.trim() || !validateCompanionMessage(signal.message).ok) return null
    receivedGreeting = { sentAt: signal.sentAt, message: signal.message }
  }
  if (row.nextGreetingAt !== null && !instant(row.nextGreetingAt)) return null
  return { viewerId, status, relationship, self, partner, greeting, ...(receivedGreeting !== undefined ? { receivedGreeting } : {}), nextGreetingAt: row.nextGreetingAt as string | null, fetchedAt: row.fetchedAt, ...(row.offline === true ? { offline: true } : {}) }
}

export function parseCompanionCode(value: unknown): CompanionCode | null {
  const row = record(value)
  if (!row || typeof row.code !== 'string' || normalizeCompanionCode(row.code) !== row.code || !instant(row.expiresAt)) return null
  return { code: row.code, expiresAt: row.expiresAt }
}

export function parseCompanionCodePreview(value: unknown, viewerId: string, expectedCode: string): CompanionCodePreview | null {
  const code = parseCompanionCode(value), row = record(value), person = parsePerson(row?.person)
  return code && code.code === expectedCode && person && person.userId !== viewerId ? { ...code, person } : null
}
