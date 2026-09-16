import { describe, expect, it } from 'vitest'
import { createProductPushLifecycle, getProductNotificationUrl } from '@/lib/native/productPushLifecycle'
import { hasAndroidPushConfiguration } from '../../../config/push-capability'

function fixture() {
  const listeners = new Map<string, Array<(value: any) => void>>()
  const events: string[] = []
  const plugin = {
    checkPermissions: async () => ({ receive: 'granted' as const }),
    requestPermissions: async () => { events.push('prompt'); return { receive: 'granted' as const } },
    register: async () => { events.push('register') },
    unregister: async () => { events.push('unregister') },
    addListener: async (name: string, callback: (value: any) => void) => {
      const callbacks = listeners.get(name) ?? []; callbacks.push(callback); listeners.set(name, callbacks)
      return { remove: async () => { events.push(`remove:${name}`) } }
    },
  }
  return { listeners, events, plugin }
}
describe('push registration lifecycle', () => {
  it('makes old callbacks inert on logout/switch and serializes native unregister before the next account', async () => {
    const f = fixture(), writes: string[] = [], navigations: string[] = []
    const lifecycle = createProductPushLifecycle(f.plugin)
    await lifecycle.update({ accountId: 'a', registerToken: async token => { writes.push(`a:${token}`) }, navigate: url => navigations.push(`a:${url}`) })
    const oldToken = f.listeners.get('registration')![0]
    const oldClick = f.listeners.get('pushNotificationActionPerformed')![0]
    oldToken({ value: 'first' })
    const switching = lifecycle.update({ accountId: 'b', registerToken: async token => { writes.push(`b:${token}`) }, navigate: url => navigations.push(`b:${url}`) })
    oldToken({ value: 'late' }); oldClick({ notification: { data: { url: '/plan' } } })
    await switching
    f.listeners.get('registration')![1]({ value: 'second' })
    expect(writes).toEqual(['a:first', 'b:second'])
    expect(navigations).toEqual([])
    expect(f.events.filter(event => ['register', 'unregister'].includes(event))).toEqual(['register', 'unregister', 'register'])
    await lifecycle.update(null)
    f.listeners.get('registration')![1]({ value: 'logged-out' })
    expect(writes).toEqual(['a:first', 'b:second'])
  })
  it('removes a listener that finishes installing after disposal without registering', async () => {
    const f = fixture(); let finish!: () => void
    let signal!: () => void; const started = new Promise<void>(resolve => { signal = resolve })
    f.plugin.addListener = async () => { signal(); await new Promise<void>(resolve => { finish = resolve }); return { remove: async () => { f.events.push('removed-late') } } }
    const lifecycle = createProductPushLifecycle(f.plugin)
    const starting = lifecycle.update({ accountId: 'a', registerToken: async () => { throw new Error('Must not write') }, navigate: () => {} })
    await started
    const stopping = lifecycle.update(null)
    finish()
    await Promise.all([starting, stopping])
    expect(f.events).toEqual(['removed-late'])
  })
  it('does not request permission during app initialization', async () => {
    const f = fixture()
    f.plugin.checkPermissions = async () => ({ receive: 'prompt' as any })
    const lifecycle = createProductPushLifecycle(f.plugin)
    await lifecycle.update({ accountId: 'a', requestPermission: false, registerToken: async () => {}, navigate: () => {} })
    expect(f.events).toEqual([])
    expect(f.listeners.size).toBe(0)
  })
  it('cleans earlier listeners when a later listener installation fails', async () => {
    const f = fixture(), addListener = f.plugin.addListener
    f.plugin.addListener = async (name, callback) => {
      if (name === 'registrationError') throw new Error('Listener unavailable')
      return addListener(name, callback)
    }
    const lifecycle = createProductPushLifecycle(f.plugin)
    await expect(lifecycle.update({ accountId: 'a', registerToken: async () => {}, navigate: () => {} })).rejects.toThrow('Listener unavailable')
    expect(f.events).toEqual(['remove:registration'])
  })
  it('rejects notification links outside the current app', () => {
    expect(getProductNotificationUrl({ url: '/plan?from=push' })).toBe('/plan?from=push')
    expect(getProductNotificationUrl({ url: '/history/../plan?from=push#today' })).toBe('/plan?from=push#today')
    for (const url of ['https://other.invalid', '//other.invalid', '/\\other.invalid', '/\n/other.invalid', '/\r/other.invalid', '/\t/other.invalid', '/plan\u0000', '/plan\u007f', '/a/..//other.invalid']) expect(getProductNotificationUrl({ url })).toBeNull()
  })
})
describe('Android push build capability', () => {
  const config = { project_info: { project_number: '123456', project_id: 'fixture-project' }, client: [{ client_info: { mobilesdk_app_id: '1:123456:android:abcdef', android_client_info: { package_name: 'com.fitai.app' } }, api_key: [{ current_key: 'public-fixture-key' }] }] }
  it('requires usable client configuration matching this APK and rejects server credentials', () => {
    expect(hasAndroidPushConfiguration(config)).toBe(true)
    for (const invalid of [null, {}, { ...config, client: [] }, { ...config, type: 'service_account', private_key: 'TEST' }]) expect(hasAndroidPushConfiguration(invalid)).toBe(false)
    expect(hasAndroidPushConfiguration(config, 'another.package')).toBe(false)
    expect(hasAndroidPushConfiguration({ ...config, client: [{ ...config.client[0], api_key: [] }] })).toBe(false)
  })
})
