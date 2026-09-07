import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dismissOpenRadixOverlay,
  OPEN_RADIX_OVERLAY_SELECTOR,
} from '../androidBackOverlay'

afterEach(() => vi.unstubAllGlobals())

describe('Android back overlay priority', () => {
  it.each(['dialog', 'alertdialog', 'menu'])('recognizes an open %s', role => {
    expect(OPEN_RADIX_OVERLAY_SELECTOR)
      .toContain(`[role="${role}"][data-state="open"]`)
  })

  it('returns false without dispatching when no overlay is open', () => {
    const dispatchEvent = vi.fn()
    const root = {
      querySelector: vi.fn().mockReturnValue(null),
      dispatchEvent,
    } as unknown as Document
    expect(dismissOpenRadixOverlay(root)).toBe(false)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('dispatches one cancelable Escape when the top overlay is open', () => {
    class FakeKeyboardEvent {
      constructor(public type: string, public init: KeyboardEventInit) {}
    }
    vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent)
    const dispatchEvent = vi.fn()
    const root = {
      querySelector: vi.fn().mockReturnValue({}),
      dispatchEvent,
    } as unknown as Document
    expect(dismissOpenRadixOverlay(root)).toBe(true)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: 'keydown',
      init: { key: 'Escape', bubbles: true, cancelable: true },
    })
  })
})
