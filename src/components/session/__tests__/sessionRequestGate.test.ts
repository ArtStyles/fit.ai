import { describe, expect, it } from 'vitest'
import { createSessionRequestGate } from '../sessionRequestGate'

describe('session save request gate', () => {
  it('rejects a second activation while a request is in flight', () => {
    const gate = createSessionRequestGate()
    const first = gate.begin()
    expect(first).not.toBeNull()
    expect(gate.begin()).toBeNull()
    expect(gate.finish(first!)).toBe(true)
    expect(gate.begin()).not.toBeNull()
  })

  it('prevents stale success or error callbacks from overwriting newer state', () => {
    const gate = createSessionRequestGate()
    const staleSuccess = gate.begin()!
    gate.invalidate()
    const current = gate.begin()!
    let state = 'syncing'

    expect(gate.commit(current, () => { state = 'synced' })).toBe(true)
    expect(gate.commit(staleSuccess, () => { state = 'error' })).toBe(false)
    expect(state).toBe('synced')

    gate.invalidate()
    const staleError = gate.begin()!
    gate.invalidate()
    const newest = gate.begin()!
    expect(gate.commit(newest, () => { state = 'error' })).toBe(true)
    expect(gate.commit(staleError, () => { state = 'synced' })).toBe(false)
    expect(state).toBe('error')
  })
})
