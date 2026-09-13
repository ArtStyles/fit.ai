import { describe, expect, it, vi } from 'vitest'
import { installFitnessCardDeepLinks } from './deep-links'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function storage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}

describe('native fitness card deep links', () => {
  it('handles a validated cold-start URL and removes its listener on cleanup', async () => {
    const remove = vi.fn(async () => {})
    const addListener = vi.fn(async () => ({ remove }))
    const onInvite = vi.fn()
    const stop = await installFitnessCardDeepLinks({ getLaunchUrl: async () => ({ url: `vekira://fitness-card/${owner}` }), addListener }, { storage: storage(), onInvite })
    expect(onInvite).toHaveBeenCalledWith(owner)
    await stop()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('accepts warm links but ignores unrelated and malformed URLs', async () => {
    let opened: ((event: { url: string }) => void) | undefined
    const onInvite = vi.fn()
    await installFitnessCardDeepLinks({ getLaunchUrl: async () => undefined, addListener: async (_name, listener) => { opened = listener; return { remove: async () => {} } } }, { storage: storage(), onInvite })
    opened?.({ url: 'https://example.test' })
    opened?.({ url: `vekira://fitness-card/${owner}?secret=x` })
    opened?.({ url: `vekira://fitness-card/${owner}` })
    expect(onInvite).toHaveBeenCalledTimes(1)
    expect(onInvite).toHaveBeenCalledWith(owner)
  })

  it('keeps warm links working while a cold-start lookup fails', async () => {
    let opened: ((event: { url: string }) => void) | undefined
    const onInvite = vi.fn()
    const remove = vi.fn(async () => {})
    const stop = await installFitnessCardDeepLinks({ getLaunchUrl: async () => {
      opened?.({ url: `vekira://fitness-card/${owner}` })
      throw new Error('No launch URL available')
    }, addListener: async (_name, listener) => { opened = listener; return { remove } } }, { storage: storage(), onInvite })
    expect(onInvite).toHaveBeenCalledWith(owner)
    await stop()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('does not replace a newer warm invite with a delayed launch URL', async () => {
    let opened: ((event: { url: string }) => void) | undefined
    const onInvite = vi.fn()
    const newer = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await installFitnessCardDeepLinks({ getLaunchUrl: async () => {
      opened?.({ url: `vekira://fitness-card/${newer}` })
      return { url: `vekira://fitness-card/${owner}` }
    }, addListener: async (_name, listener) => { opened = listener; return { remove: async () => {} } } }, { storage: storage(), onInvite })
    expect(onInvite).toHaveBeenCalledTimes(1)
    expect(onInvite).toHaveBeenCalledWith(newer)
  })
})
