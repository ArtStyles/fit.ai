import { describe, expect, it } from 'vitest'
import { normalizeFitnessSocialLinks } from './socials'

describe('fitness social profile normalization', () => {
  it('normalizes handles, provider aliases and an exact Facebook profile id', () => {
    expect(normalizeFitnessSocialLinks({ instagram: '@Ana.Fit', x: 'https://www.twitter.com/Ana_1/', facebook: 'https://facebook.com/profile.php?id=12345' })).toEqual({ instagram: 'https://instagram.com/ana.fit', x: 'https://x.com/ana_1', facebook: 'https://facebook.com/profile.php?id=12345' })
    expect(normalizeFitnessSocialLinks({ instagram: '  ', facebook: 'Ana.Fitness' })).toEqual({ facebook: 'https://facebook.com/ana.fitness' })
    expect(normalizeFitnessSocialLinks(undefined)).toEqual({})
  })
  it.each(['https://evil.test/ana','https://instagram.com.evil.test/ana','https://u:p@instagram.com/ana','https://instagram.com:443/ana','https://instagram.com/ana?next=evil','https://instagram.com/ana#x','https://instagram.com/p/123','https://instagram.com/accounts','javascript:alert(1)','https://instagram.com/%61na'])('rejects unsafe Instagram destination %s', value => {
    expect(() => normalizeFitnessSocialLinks({ instagram: value })).toThrow()
  })
  it.each([{ x: 'https://x.com/intent' }, { x: 'https://x.com/ana/status/123' }, { facebook: 'https://facebook.com/sharer.php' }, { facebook: 'https://facebook.com/profile.php' }, { facebook: 'https://facebook.com/photo.php' }, { facebook: 'https://facebook.com/profile.php?id=123&next=evil' }, { facebook: 'https://facebook.com/login' }, { unknown: 'https://example.test' }])('rejects non-profile links and unknown keys', value => { expect(() => normalizeFitnessSocialLinks(value)).toThrow() })
})
