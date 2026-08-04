import { describe, expect, it } from 'vitest'
import { requirePlanLibraryResults } from '../library'

describe('requirePlanLibraryResults', () => {
  it('throws when the active-plan query fails', () => {
    expect(() => requirePlanLibraryResults(
      { data: null, error: { message: 'active failed' } },
      { data: [], error: null },
    )).toThrow('PLAN_LIBRARY_QUERY_FAILED: active failed')
  })

  it('throws when the library query fails instead of returning an empty list', () => {
    expect(() => requirePlanLibraryResults(
      { data: null, error: null },
      { data: null, error: { message: 'library failed' } },
    )).toThrow('PLAN_LIBRARY_QUERY_FAILED: library failed')
  })

  it('returns successful empty results without inventing a query error', () => {
    expect(requirePlanLibraryResults(
      { data: null, error: null },
      { data: null, error: null },
    )).toEqual({ activePlan: null, plans: [] })
  })
})
