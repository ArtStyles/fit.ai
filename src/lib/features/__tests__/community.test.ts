import { describe, expect, it } from 'vitest'
import { isCommunityEnabled } from '../community'

describe('isCommunityEnabled', () => {
  it.each([
    [{}, false],
    [{ COMMUNITY_ENABLED: 'false' }, false],
    [{ COMMUNITY_ENABLED: 'true' }, true],
  ] as const)('returns %s when COMMUNITY_ENABLED is configured as %s', (env, expected) => {
    expect(isCommunityEnabled(env)).toBe(expected)
  })
})
