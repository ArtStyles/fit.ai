import { describe, expect, it, vi } from 'vitest'
import { loadClientCoachingSummary } from '../clientSummary'

type QueryResult = { data: unknown; error: { message: string } | null }
type QueryCall = { table: string; method: string; args: unknown[] }

function chain(table: string, result: QueryResult, queryCalls: QueryCall[]) {
  const record = (method: string, args: unknown[]) => {
    queryCalls.push({ table, method, args })
    return query
  }
  const query = {
    select: (...args: unknown[]) => record('select', args),
    eq: (...args: unknown[]) => record('eq', args),
    in: (...args: unknown[]) => record('in', args),
    is: (...args: unknown[]) => record('is', args),
    order: (...args: unknown[]) => record('order', args),
    limit: async (...args: unknown[]) => {
      record('limit', args)
      return result
    },
    then: <T>(onfulfilled?: ((value: QueryResult) => T | PromiseLike<T>) | null, onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return query
}

function clientFor({
  relationship = {
    id: 'relationship-1',
    status: 'active',
    trainer_user_id: 'trainer-1',
    service_id: 'service-1',
    started_at: '2026-09-01T10:00:00.000Z',
  },
  relationshipError = null,
  profile = { id: 'trainer-1', full_name: 'Ada Lovelace', username: 'ada', avatar_url: 'https://example.com/ada.jpg' },
  directory = { user_id: 'trainer-1', slug: 'ada-lovelace' },
  consents = [{ scope: 'training_profile', revoked_at: null }],
  assignments = [
    { id: 'assignment-active', status: 'active', created_at: '2026-09-04T10:00:00.000Z' },
    { id: 'assignment-proposed', status: 'proposed', created_at: '2026-09-03T10:00:00.000Z' },
  ],
}: {
  relationship?: unknown
  relationshipError?: { message: string } | null
  profile?: unknown
  directory?: unknown
  consents?: unknown[]
  assignments?: unknown[]
} = {}) {
  const queryCalls: QueryCall[] = []
  const from = (table: string) => {
    if (table === 'coaching_relationships') return chain(table, { data: relationship ? [relationship] : [], error: relationshipError }, queryCalls)
    if (table === 'public_profiles') return chain(table, { data: profile ? [profile] : [], error: null }, queryCalls)
    if (table === 'active_trainer_directory') return chain(table, { data: directory ? [directory] : [], error: null }, queryCalls)
    if (table === 'coaching_consents') return chain(table, { data: consents, error: null }, queryCalls)
    if (table === 'trainer_plan_assignments') return chain(table, { data: assignments, error: null }, queryCalls)
    throw new Error(`Unexpected table: ${table}`)
  }

  const rpc = vi.fn(async () => {
    return { data: [{ service_id: 'service-1', name: 'Acompañamiento de fuerza' }], error: null }
  })

  return {
    from,
    rpc,
    queryCalls,
  }
}

describe('loadClientCoachingSummary', () => {
  it('projects the owned relationship, active training consent, latest proposed assignment, public trainer identity, and contracted service', async () => {
    const client = clientFor()

    const result = await loadClientCoachingSummary(client, 'client-1')

    expect(result).toEqual({
      summary: {
        relationshipId: 'relationship-1',
        relationshipStatus: 'active',
        trainerUserId: 'trainer-1',
        trainerName: 'Ada Lovelace',
        trainerAvatarUrl: 'https://example.com/ada.jpg',
        trainerSlug: 'ada-lovelace',
        serviceId: 'service-1',
        serviceName: 'Acompañamiento de fuerza',
        startedAt: '2026-09-01T10:00:00.000Z',
        trainingConsentActive: true,
        assignmentStatus: 'proposed',
      },
      error: null,
    })
    expect(client.queryCalls).toContainEqual({
      table: 'coaching_relationships',
      method: 'eq',
      args: ['client_user_id', 'client-1'],
    })
    expect(client.queryCalls).toContainEqual({
      table: 'coaching_consents',
      method: 'is',
      args: ['revoked_at', null],
    })
    expect(client.rpc).toHaveBeenCalledWith('get_requestable_trainer_services', {
      trainer_slug: 'ada-lovelace',
    })
  })

  it('returns an empty, non-error summary when the client has no active relationship', async () => {
    const result = await loadClientCoachingSummary(clientFor({ relationship: null }), 'client-1')

    expect(result).toEqual({ summary: null, error: null })
  })

  it('returns the contracted error when the relationship query cannot load', async () => {
    const result = await loadClientCoachingSummary(clientFor({ relationshipError: { message: 'network' } }), 'client-1')

    expect(result).toEqual({ summary: null, error: 'No se pudo cargar tu acompañamiento.' })
  })

  it('preserves the relationship with safe fallbacks when public trainer details are unavailable', async () => {
    const client = clientFor({ profile: null, directory: null, consents: [], assignments: [] })

    const result = await loadClientCoachingSummary(client, 'client-1')

    expect(result).toEqual({
      summary: {
        relationshipId: 'relationship-1',
        relationshipStatus: 'active',
        trainerUserId: 'trainer-1',
        trainerName: 'Entrenador no disponible',
        trainerAvatarUrl: null,
        trainerSlug: null,
        serviceId: 'service-1',
        serviceName: 'Servicio de acompañamiento no disponible',
        startedAt: '2026-09-01T10:00:00.000Z',
        trainingConsentActive: false,
        assignmentStatus: null,
      },
      error: null,
    })
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
