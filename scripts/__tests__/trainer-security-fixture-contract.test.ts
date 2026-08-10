import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTrainerSecuritySnapshotScope,
  cleanupTrainerSecurityPublishedFixtures,
  readPersistedForeignIdorDependencies,
  runPublishedSecurityPreparation,
} from '../../tests/e2e/helpers/trainer-marketplace'

describe('trainer security fixture contracts', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('resolves the accepted source request after relationship activation and filters services by profile id', async () => {
    const calls: Array<[string, string, unknown]> = []
    const relationship = {
      select(columns: string) {
        calls.push(['coaching_relationships', 'select', columns])
        return this
      },
      eq(column: string, value: unknown) {
        calls.push(['coaching_relationships', column, value])
        return this
      },
      single: vi.fn().mockResolvedValue({
        data: { source_request_id: 'request-real', service_id: 'service-real' },
        error: null,
      }),
    }
    const services = {
      select(columns: string) {
        calls.push(['trainer_service_offerings', 'select', columns])
        return this
      },
      in(column: string, value: unknown) {
        calls.push(['trainer_service_offerings', column, value])
        return this
      },
      order(column: string) {
        calls.push(['trainer_service_offerings', 'order', column])
        return Promise.resolve({ data: [{ id: 'service-real' }], error: null })
      },
    }
    const service = {
      from: vi.fn((table: string) => {
        if (table === 'coaching_relationships') return relationship
        if (table === 'trainer_service_offerings') return services
        throw new Error(`unexpected table ${table}`)
      }),
      rpc: vi.fn(() => {
        throw new Error('no request may be created after the active relationship exists')
      }),
    }

    await expect(readPersistedForeignIdorDependencies(service as never, {
      relationshipId: 'relationship-real',
      trainerProfileIds: ['profile-a', 'profile-b'],
    })).resolves.toEqual({ requestId: 'request-real', serviceRows: [{ id: 'service-real' }] })

    expect(calls).toContainEqual(['coaching_relationships', 'id', 'relationship-real'])
    expect(calls).toContainEqual(['trainer_service_offerings', 'trainer_profile_id', ['profile-a', 'profile-b']])
    expect(service.rpc).not.toHaveBeenCalled()
  })

  it('builds one snapshot scope from both attacker and foreign fixture graphs', () => {
    const fixture = (prefix: string) => ({
      client: { id: `${prefix}-client` },
      trainerA: { id: `${prefix}-trainer-a`, applicationId: `${prefix}-application-a`, profileId: `${prefix}-profile-a` },
      trainerB: { id: `${prefix}-trainer-b`, applicationId: `${prefix}-application-b`, profileId: `${prefix}-profile-b` },
      admin: { id: `${prefix}-admin` },
      relationshipId: `${prefix}-relationship`,
    })

    expect(buildTrainerSecuritySnapshotScope(fixture('attacker') as never, fixture('foreign') as never)).toEqual({
      userIds: [
        'attacker-client', 'attacker-trainer-a', 'attacker-trainer-b', 'attacker-admin',
        'foreign-client', 'foreign-trainer-a', 'foreign-trainer-b', 'foreign-admin',
      ],
      applicationIds: [
        'attacker-application-a', 'attacker-application-b',
        'foreign-application-a', 'foreign-application-b',
      ],
      trainerProfileIds: [
        'attacker-profile-a', 'attacker-profile-b',
        'foreign-profile-a', 'foreign-profile-b',
      ],
      relationshipIds: ['attacker-relationship', 'foreign-relationship'],
    })
  })

  it('blocks published cleanup without every dedicated security opt-in', async () => {
    const rpc = vi.fn()
    vi.stubEnv('E2E_TRAINER_SECURITY_ENABLED', 'true')
    await expect(cleanupTrainerSecurityPublishedFixtures([{
      service: { rpc } as never,
      runId: 'run-safe',
      created: { userIds: ['user-a'] },
    } as never])).rejects.toThrow('dedicated trainer security cleanup')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('executes exact-user published cleanup after the full opt-in gate', async () => {
    for (const [name, value] of Object.entries({
      E2E_TRAINER_RELATIONSHIPS_ENABLED: 'true',
      E2E_TRAINER_PROGRAMMING_ENABLED: 'true',
      E2E_TRAINER_PROGRAMMING_RETENTION_ACK: 'dedicated-project-reset',
      E2E_TRAINER_INSIGHTS_ENABLED: 'true',
      E2E_TRAINER_SECURITY_ENABLED: 'true',
    })) vi.stubEnv(name, value)
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null })

    await expect(cleanupTrainerSecurityPublishedFixtures([
      { service: { rpc } as never, runId: 'run-safe', created: { userIds: ['user-a'] } } as never,
      { service: { rpc } as never, runId: 'run-safe', created: { userIds: ['user-b'] } } as never,
    ])).resolves.toBe(2)

    expect(rpc).toHaveBeenCalledWith('cleanup_trainer_security_e2e_fixture', {
      p_run_id: 'run-safe',
      p_user_ids: ['user-a', 'user-b'],
    })
  })

  it('executes published cleanup when preparation fails after registration', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    await expect(runPublishedSecurityPreparation({
      prepare: async () => { throw new Error('partial published fixture') },
      cleanup,
    })).rejects.toThrow('partial published fixture')
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
