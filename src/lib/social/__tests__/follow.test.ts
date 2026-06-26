import { describe, it, expect } from 'vitest'
import { followButtonState } from '../follow'

describe('followButtonState', () => {
  it('accepted → following', () => {
    expect(followButtonState({ isPrivate: true, status: 'accepted' })).toBe('following')
    expect(followButtonState({ isPrivate: false, status: 'accepted' })).toBe('following')
  })
  it('pending → requested', () => {
    expect(followButtonState({ isPrivate: true, status: 'pending' })).toBe('requested')
  })
  it('none + privada → request', () => {
    expect(followButtonState({ isPrivate: true, status: 'none' })).toBe('request')
  })
  it('none + pública → follow', () => {
    expect(followButtonState({ isPrivate: false, status: 'none' })).toBe('follow')
  })
})
