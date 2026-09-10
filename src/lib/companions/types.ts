export type CompanionPerson = { userId: string; fullName: string; avatarUrl: string | null }
export type CompanionGreeting = { sentAt: string; message: string }
export type CompanionWeek = {
  completedSessions: number
  goal: number | null
  weekStart: string
  weekEnd: string
  timeZone: string
  updatedAt: string
}
export type CompanionSnapshot = {
  viewerId: string
  status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'active'
  relationship: { id: string; other: CompanionPerson; expiresAt: string | null } | null
  self: CompanionWeek | null
  partner: CompanionWeek | null
  greeting: CompanionGreeting | null
  /** Absent in older RPC responses and per-account caches. */
  receivedGreeting?: CompanionGreeting | null
  nextGreetingAt: string | null
  fetchedAt: string
  offline?: boolean
}
export type CompanionCode = { code: string; expiresAt: string }
export type CompanionCodePreview = CompanionCode & { person: CompanionPerson }
export type CompanionResult<T> = { ok: true; value: T } | { ok: false; code: string; error: string }
export type CompanionRpcTransport = {
  viewerId: string
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{
    data: unknown
    error: { message?: string; code?: string } | null
  }>
}
