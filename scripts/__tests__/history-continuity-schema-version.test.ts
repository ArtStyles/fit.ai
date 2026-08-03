import { describe, expect, it } from 'vitest'
import { isHistoryContinuitySchemaVersion } from '../../tests/e2e/helpers/core-product'

describe('history continuity schema version gate', () => {
  it('refuses a database that has only migrations through 038', () => {
    expect(isHistoryContinuitySchemaVersion(38)).toBe(false)
  })

  it('accepts only the 039 marker', () => {
    expect(isHistoryContinuitySchemaVersion(39)).toBe(true)
    expect(isHistoryContinuitySchemaVersion(null)).toBe(false)
    expect(isHistoryContinuitySchemaVersion(40)).toBe(false)
  })
})
