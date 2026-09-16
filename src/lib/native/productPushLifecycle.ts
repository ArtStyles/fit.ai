import type { PushNotificationsPlugin } from '@capacitor/push-notifications'

export type ProductPushSession = {
  accountId: string
  requestPermission?: boolean
  registerToken(token: string, isCurrent: () => boolean): Promise<unknown>
  onRegistrationFailure?(): void
  navigate(url: string): void
}
export function getProductNotificationUrl(data: unknown): string | null {
  const value = data && typeof data === 'object' ? (data as { url?: unknown }).url : null
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  if (Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null
  try {
    const base = 'https://notification.invalid'
    const url = new URL(value, base)
    // Returning a normalized pathname beginning // would itself be interpreted
    // as a new origin by the router (for example /a/..//outside.invalid).
    if (url.origin !== base || url.pathname.startsWith('//')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}

/** Serial ownership transitions prevent an older unregister from invalidating
 * the new account's registration; callbacks become inert before async teardown. */
export function createProductPushLifecycle(plugin: Pick<PushNotificationsPlugin, 'checkPermissions' | 'requestPermissions' | 'addListener' | 'register' | 'unregister'>) {
  let version = 0
  let tail: Promise<void> = Promise.resolve()
  let handles: Array<{ remove(): Promise<void> }> = []
  let registered = false
  const cleanup = async () => {
    const old = handles; handles = []
    await Promise.all(old.map(handle => handle.remove().catch(() => undefined)))
    if (registered) { registered = false; await plugin.unregister() }
  }
  return {
    update(session: ProductPushSession | null): Promise<void> {
      const attempt = ++version
      const current = () => attempt === version
      tail = tail.catch(() => undefined).then(async () => {
        await cleanup()
        if (!current() || !session) return
        let permission = await plugin.checkPermissions()
        if (!current()) return
        if (permission.receive !== 'granted' && session.requestPermission) permission = await plugin.requestPermissions()
        if (!current() || permission.receive !== 'granted') return
        const registration = await plugin.addListener('registration', token => {
          if (current()) void session.registerToken(token.value, current).catch(() => {
            if (current()) session.onRegistrationFailure?.()
          })
        })
        handles.push(registration)
        if (!current()) { await cleanup(); return }
        handles.push(await plugin.addListener('registrationError', () => {
          if (current()) session.onRegistrationFailure?.()
        }))
        if (!current()) { await cleanup(); return }
        handles.push(await plugin.addListener('pushNotificationActionPerformed', event => {
          const url = getProductNotificationUrl(event.notification.data)
          if (current() && url) session.navigate(url)
        }))
        if (!current()) { await cleanup(); return }
        // Register may emit its token before its promise settles.
        registered = true
        try { await plugin.register() } catch (error) { await cleanup(); throw error }
        if (!current()) await cleanup()
      }).catch(async error => {
        if (current()) version++
        await cleanup().catch(() => undefined)
        throw error
      })
      return tail
    },
  }
}

export function getOrCreatePushDeviceId(): string {
  const key = 'fitai:native-device-id'
  try {
    const existing = globalThis.localStorage.getItem(key)
    if (existing) return existing
    const next = crypto.randomUUID()
    globalThis.localStorage.setItem(key, next)
    return next
  } catch { return crypto.randomUUID() }
}
