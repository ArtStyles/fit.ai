import { describe, expect, it } from 'vitest'
import { resolveDashboardProfileHref } from '../profileNavigation'

describe('dashboard profile navigation', () => {
  it('withholds the social profile route while Community is disabled', () => {
    expect(resolveDashboardProfileHref({
      communityEnabled: false,
      username: 'ana',
    })).toBeNull()
  })

  it('withholds the social profile route when no username exists', () => {
    expect(resolveDashboardProfileHref({
      communityEnabled: true,
      username: null,
    })).toBeNull()
  })

  it('returns the social profile route only when Community and username are available', () => {
    expect(resolveDashboardProfileHref({
      communityEnabled: true,
      username: 'ana',
    })).toBe('/u/ana')
  })
})
