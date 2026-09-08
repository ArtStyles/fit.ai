export type CoachManagedRelationship = {
  relationshipId: string
  clientId: string
  clientName: string | null
  username: string | null
  avatarUrl: string | null
  serviceName: string
  status: 'active' | 'paused_by_platform'
  startedAt: string
  trainingConsentActive: boolean
  trainingAccessAvailable: boolean
}
export type CoachRelationshipManagement = {
  counts: { pendingRequests: number; activeRelationships: number; pausedRelationships: number }
  relationships: CoachManagedRelationship[]
}
const unavailable = (): never => { throw new Error('COACH_RELATIONSHIP_MANAGEMENT_UNAVAILABLE') }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable()
  if (Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) return unavailable()
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return unavailable()
  return value
}
function nullableText(value: unknown): string | null { return value === null ? null : text(value) }
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return unavailable()
  return value
}
export function adaptCoachRelationshipManagement(value: unknown): CoachRelationshipManagement {
  const payload = record(value, ['counts', 'relationships'])
  const rawCounts = record(payload.counts, ['pendingRequests', 'activeRelationships', 'pausedRelationships'])
  const counts = { pendingRequests: count(rawCounts.pendingRequests), activeRelationships: count(rawCounts.activeRelationships), pausedRelationships: count(rawCounts.pausedRelationships) }
  if (!Array.isArray(payload.relationships)) return unavailable()
  const relationships = payload.relationships.map((value): CoachManagedRelationship => {
    const row = record(value, ['relationshipId', 'clientId', 'clientName', 'username', 'avatarUrl', 'serviceName', 'status', 'startedAt', 'trainingConsentActive', 'trainingAccessAvailable'])
    if (row.status !== 'active' && row.status !== 'paused_by_platform') return unavailable()
    if (typeof row.trainingConsentActive !== 'boolean' || typeof row.trainingAccessAvailable !== 'boolean') return unavailable()
    if (row.trainingAccessAvailable && (row.status !== 'active' || !row.trainingConsentActive)) return unavailable()
    const startedAt = text(row.startedAt)
    if (!Number.isFinite(Date.parse(startedAt))) return unavailable()
    return { relationshipId: text(row.relationshipId), clientId: text(row.clientId), clientName: nullableText(row.clientName), username: nullableText(row.username), avatarUrl: nullableText(row.avatarUrl), serviceName: text(row.serviceName), status: row.status, startedAt, trainingConsentActive: row.trainingConsentActive, trainingAccessAvailable: row.trainingAccessAvailable }
  })
  if (new Set(relationships.map(row => row.relationshipId)).size !== relationships.length
    || relationships.filter(row => row.status === 'active').length !== counts.activeRelationships
    || relationships.filter(row => row.status === 'paused_by_platform').length !== counts.pausedRelationships) return unavailable()
  return { counts, relationships }
}
export async function getCoachRelationshipManagement(
  supabase: { rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<CoachRelationshipManagement> {
  try {
    const { data, error } = await supabase.rpc('get_coach_relationship_management')
    if (error) return unavailable()
    return adaptCoachRelationshipManagement(data)
  } catch { return unavailable() }
}
