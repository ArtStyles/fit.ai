import { describe, expect, it, vi } from 'vitest'
import type { FitnessEvidence, FitnessHubState } from '@/lib/fitness-card/types'
import type { FitnessPlatform } from '@/lib/fitness-card/platform-types'
import { createFitnessCardAutoSyncCoordinator } from './FitnessCardAutoSync'

const evidence = (sessions: number, updatedAt = '2026-09-12T12:00:00.000Z'): FitnessEvidence => ({
  records: [], muscles: [], totalSessions: sessions, partialSessions: 0,
  rangeFrom: '2026-06-21', rangeTo: '2026-09-12', updatedAt,
})

function fixture(options: { own?: FitnessEvidence | null; shared?: FitnessEvidence; publish?: () => Promise<unknown> } = {}) {
  let listener: ((kind: 'local' | 'remote' | 'account') => void) | undefined
  const platform = {
    identity: { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Ana', username: 'ana', avatarUrl: null }, linked: true,
    assertCurrent: vi.fn(async () => {}), getClient: vi.fn(), evidence: vi.fn(async () => evidence(1)),
    sharedEvidence: vi.fn(async () => options.shared ?? evidence(2)),
    watch: vi.fn(callback => { listener = callback; return vi.fn() }), dispose: vi.fn(),
  } as unknown as FitnessPlatform
  let revision = 3
  const hub = vi.fn(async (): Promise<FitnessHubState> => ({
    viewerId: platform.identity.userId,
    own: options.own === null ? null : { owner: platform.identity, artisticName: '', theme: 'violet', revision, photos: [], evidence: options.own ?? evidence(1), updatedAt: '' },
    received: [], access: [],
  }))
  const publish = vi.fn(async (value: FitnessEvidence, _expected: number) => {
    if (options.publish) return options.publish()
    revision++
    return { revision, evidence: value, owner: platform.identity }
  })
  return { platform, hub, publish, emit: (kind: 'local' | 'remote' | 'account') => listener?.(kind) }
}

describe('FitnessCardAutoSync coordinator', () => {
  it('publishes only after explicit card creation and ignores updatedAt-only changes', async () => {
    const optedOut = fixture({ own: null })
    const stopped = createFitnessCardAutoSyncCoordinator({ openPlatform: async () => optedOut.platform, createClient: () => ({ hub: optedOut.hub, publish: optedOut.publish }) })
    await stopped.start()
    expect(optedOut.publish).not.toHaveBeenCalled()
    stopped.dispose()

    const unchanged = fixture({ own: evidence(2, 'old'), shared: evidence(2, 'new') })
    const active = createFitnessCardAutoSyncCoordinator({ openPlatform: async () => unchanged.platform, createClient: () => ({ hub: unchanged.hub, publish: unchanged.publish }) })
    await active.start()
    expect(unchanged.publish).not.toHaveBeenCalled()
    unchanged.platform.sharedEvidence = vi.fn(async () => evidence(3))
    unchanged.emit('remote')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(unchanged.publish).not.toHaveBeenCalled()
    active.dispose()
  })

  it('serializes a pending local change behind the active publication', async () => {
    let release!: () => void
    const first = new Promise<void>(resolve => { release = resolve })
    let calls = 0
    const current = fixture({ publish: async () => { calls++; if (calls === 1) await first } })
    current.platform.sharedEvidence = vi.fn(async () => evidence(calls + 2))
    const coordinator = createFitnessCardAutoSyncCoordinator({ openPlatform: async () => current.platform, createClient: () => ({ hub: current.hub, publish: current.publish }) })
    const starting = coordinator.start()
    await vi.waitFor(() => expect(current.publish).toHaveBeenCalledTimes(1))
    current.emit('local')
    release()
    await starting
    await vi.waitFor(() => expect(current.publish).toHaveBeenCalledTimes(2))
    coordinator.dispose()
  })

  it('disposes the old account and prevents its pending evidence from publishing after account change', async () => {
    let release!: (value: FitnessEvidence) => void
    const delayed = new Promise<FitnessEvidence>(resolve => { release = resolve })
    const old = fixture(); old.platform.sharedEvidence = vi.fn(() => delayed)
    const next = fixture({ shared: evidence(4) })
    let opens = 0
    const coordinator = createFitnessCardAutoSyncCoordinator({ openPlatform: async () => ++opens === 1 ? old.platform : next.platform, createClient: platform => platform === old.platform ? { hub: old.hub, publish: old.publish } : { hub: next.hub, publish: next.publish } })
    const starting = coordinator.start()
    await vi.waitFor(() => expect(old.platform.sharedEvidence).toHaveBeenCalled())
    old.emit('account')
    release(evidence(9))
    await starting
    await vi.waitFor(() => expect(opens).toBe(2))
    expect(old.publish).not.toHaveBeenCalled()
    expect(old.platform.dispose).toHaveBeenCalled()
    await vi.waitFor(() => expect(next.publish).toHaveBeenCalledTimes(1))
    coordinator.dispose()
  })

  it('refreshes once after a conflict and retries with the fresh revision and projection', async () => {
    const current = fixture()
    current.publish.mockRejectedValueOnce(new Error('FITNESS_CARD_CONFLICT')).mockResolvedValueOnce({})
    const coordinator = createFitnessCardAutoSyncCoordinator({ openPlatform: async () => current.platform, createClient: () => ({ hub: current.hub, publish: current.publish }) })
    await coordinator.start()
    expect(current.hub).toHaveBeenCalledTimes(2)
    expect(current.platform.sharedEvidence).toHaveBeenCalledTimes(2)
    expect(current.publish).toHaveBeenCalledTimes(2)
    coordinator.dispose()
  })
})
