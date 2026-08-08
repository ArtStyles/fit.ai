import { describe, expect, it } from 'vitest'
import { normalizeWorkspace } from '../workspace'

describe('workspace selection', () => {
  it('does not allow a person without an active trainer profile to select coach', () => {
    expect(normalizeWorkspace('coach', false)).toBe('personal')
  })

  it('normalizes an obsolete or invalid cookie to personal', () => {
    expect(normalizeWorkspace('coach', false)).toBe('personal')
    expect(normalizeWorkspace('unknown', true)).toBe('personal')
    expect(normalizeWorkspace(undefined, true)).toBe('personal')
  })

  it('keeps coach selected only for an active trainer', () => {
    expect(normalizeWorkspace('coach', true)).toBe('coach')
  })
})
