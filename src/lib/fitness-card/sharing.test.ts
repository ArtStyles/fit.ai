import { describe, expect, it } from 'vitest'
import { buildFitnessCardLink, consumePendingFitnessInvite, parseFitnessCardLink, storePendingFitnessInvite } from './sharing'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}

describe('fitness card sharing links', () => {
  it('builds and parses only the exact native card route', () => {
    expect(buildFitnessCardLink(owner)).toBe(`vekira://fitness-card/${owner}`)
    expect(parseFitnessCardLink(`vekira://fitness-card/${owner}`)).toBe(owner)
    for (const value of [
      `https://fitness-card/${owner}`, `vekira://other/${owner}`, `vekira://fitness-card/${owner}/extra`,
      `vekira://fitness-card/${owner}?token=secret`, `vekira://user@fitness-card/${owner}`, 'not a url',
    ]) expect(parseFitnessCardLink(value)).toBeNull()
  })

  it('rejects invalid owner IDs when building', () => {
    expect(() => buildFitnessCardLink('not-an-id')).toThrow(/owner/i)
  })

  it('stores only a validated owner with bounded lifetime and consumes it once', () => {
    const session = storage()
    expect(storePendingFitnessInvite(`vekira://fitness-card/${owner}`, session, 1_000)).toBe(true)
    expect(consumePendingFitnessInvite(session, 1_000 + 10 * 60_000)).toBe(owner)
    expect(consumePendingFitnessInvite(session, 1_001)).toBeNull()
    expect(storePendingFitnessInvite('https://attacker.invalid', session, 2_000)).toBe(false)
    expect(consumePendingFitnessInvite(session, 2_001)).toBeNull()
  })

  it('expires old pending invites', () => {
    const session = storage()
    storePendingFitnessInvite(`vekira://fitness-card/${owner}`, session, 1_000)
    expect(consumePendingFitnessInvite(session, 1_000 + 31 * 60_000)).toBeNull()
  })

  it('discards a pending invite whose expiry exceeds the allowed lifetime', () => {
    const session = storage()
    storePendingFitnessInvite(`vekira://fitness-card/${owner}`, session, 60 * 60_000)
    expect(consumePendingFitnessInvite(session, 0)).toBeNull()
  })
})
