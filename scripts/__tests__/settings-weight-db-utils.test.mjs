import { describe, expect, it } from 'vitest'
import { parsePsqlScalar } from '../settings-weight-db-utils.mjs'

describe('parsePsqlScalar', () => {
  it('returns an unaligned psql scalar result', () => {
    expect(parsePsqlScalar('ok\n', 'concurrent weight result')).toBe('ok')
  })

  it('rejects table-formatted output instead of accepting an ambiguous result', () => {
    expect(() => parsePsqlScalar(' weight_kg \n-----------\n        82\n(1 row)\n', 'concurrent weight result'))
      .toThrow('concurrent weight result did not return exactly one scalar value')
  })
})
