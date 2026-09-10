import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isPluginAvailable: vi.fn(() => true),
  tap: vi.fn<() => Promise<void>>(),
  impact: vi.fn<() => Promise<void>>(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: native.getPlatform, isPluginAvailable: native.isPluginAvailable },
  registerPlugin: () => ({ tap: native.tap }),
}))
vi.mock('../haptics', () => ({ hapticImpact: native.impact }))

describe('navigation tap feedback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    native.getPlatform.mockReturnValue('android')
    native.isPluginAvailable.mockReturnValue(true)
    native.tap.mockResolvedValue(undefined)
    native.impact.mockResolvedValue(undefined)
  })
  afterEach(() => vi.restoreAllMocks())

  it('uses the native navigation tap without adding the long impact vibration', async () => {
    const { navigationTapFeedback } = await import('../navigationFeedback')
    await navigationTapFeedback()
    expect(native.tap).toHaveBeenCalledOnce()
    expect(native.impact).not.toHaveBeenCalled()
  })

  it('does not pile up feedback on rapid repeated activations', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    const { navigationTapFeedback } = await import('../navigationFeedback')
    await navigationTapFeedback()
    now.mockReturnValue(40)
    await navigationTapFeedback()
    now.mockReturnValue(140)
    await navigationTapFeedback()
    expect(native.tap).toHaveBeenCalledTimes(2)
  })

  it('recovers after a native rejection without falling back to a stronger effect', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    native.tap.mockRejectedValueOnce(new Error('Native feedback unavailable'))
    const { navigationTapFeedback } = await import('../navigationFeedback')
    await expect(navigationTapFeedback()).resolves.toBeUndefined()
    now.mockReturnValue(200)
    await expect(navigationTapFeedback()).resolves.toBeUndefined()
    expect(native.tap).toHaveBeenCalledTimes(2)
    expect(native.impact).not.toHaveBeenCalled()
  })

  it('leaves older Android containers silent when the new plugin is absent', async () => {
    native.isPluginAvailable.mockReturnValue(false)
    const { navigationTapFeedback } = await import('../navigationFeedback')
    await expect(navigationTapFeedback()).resolves.toBeUndefined()
    expect(native.tap).not.toHaveBeenCalled()
    expect(native.impact).not.toHaveBeenCalled()
  })

  it.each(['web', 'ios'])('preserves the existing light feedback on %s', async platform => {
    native.getPlatform.mockReturnValue(platform)
    const { navigationTapFeedback } = await import('../navigationFeedback')
    await navigationTapFeedback()
    expect(native.impact).toHaveBeenCalledWith('light')
    expect(native.tap).not.toHaveBeenCalled()
  })
})
