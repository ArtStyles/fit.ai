import { describe, expect, it } from 'vitest'
import { waitForFinalDatabase } from '../trainer-foundations-readiness.mjs'

describe('waitForFinalDatabase', () => {
  it('does not probe the temporary startup server before container health is healthy', () => {
    const healthStates = ['starting', 'starting', 'healthy']
    let now = 0
    let probeCalls = 0

    const result = waitForFinalDatabase({
      inspectHealth: () => healthStates.shift() ?? 'healthy',
      probeFinalDatabase: () => {
        probeCalls += 1
        return { ok: true, diagnostic: 'final prerequisites ready' }
      },
      wait: milliseconds => { now += milliseconds },
      now: () => now,
      timeoutMs: 5_000,
      pollIntervalMs: 500,
    })

    expect(probeCalls).toBe(1)
    expect(now).toBe(1_000)
    expect(result).toEqual({
      health: 'healthy',
      diagnostic: 'final prerequisites ready',
    })
  })

  it('waits for final database prerequisites even after container health becomes healthy', () => {
    const probes = [
      { ok: false, diagnostic: 'auth.users missing' },
      { ok: true, diagnostic: 'final prerequisites ready' },
    ]
    let now = 0

    const result = waitForFinalDatabase({
      inspectHealth: () => 'healthy',
      probeFinalDatabase: () => probes.shift() ?? probes[probes.length - 1],
      wait: milliseconds => { now += milliseconds },
      now: () => now,
      timeoutMs: 5_000,
      pollIntervalMs: 500,
    })

    expect(now).toBe(500)
    expect(result.diagnostic).toBe('final prerequisites ready')
  })

  it('reports the last health and prerequisite probe states on timeout', () => {
    let now = 0

    expect(() => waitForFinalDatabase({
      inspectHealth: () => 'healthy',
      probeFinalDatabase: () => ({ ok: false, diagnostic: 'service_role missing' }),
      wait: milliseconds => { now += milliseconds },
      now: () => now,
      timeoutMs: 1_000,
      pollIntervalMs: 500,
    })).toThrow(
      'final PostgreSQL database did not become ready within 1000ms '
      + '(health=healthy, probe=service_role missing)',
    )
  })
})
