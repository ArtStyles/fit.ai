import { parseFitnessCardLink, storePendingFitnessInvite } from '@/lib/fitness-card/sharing'

type ListenerHandle = { remove(): Promise<void> }
type NativeAppLinks = {
  getLaunchUrl(): Promise<{ url: string } | undefined>
  addListener(name: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<ListenerHandle>
}
type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export async function installFitnessCardDeepLinks(
  app: NativeAppLinks,
  options: { storage?: SessionStore; onInvite?: (ownerId: string) => void } = {},
): Promise<() => Promise<void>> {
  const storage = options.storage ?? sessionStorage
  const accept = (url: string) => {
    const ownerId = parseFitnessCardLink(url)
    if (!ownerId || !storePendingFitnessInvite(url, storage)) return
    options.onInvite?.(ownerId)
  }
  let receivedWarmLink = false
  const listener = await app.addListener('appUrlOpen', event => {
    if (parseFitnessCardLink(event.url)) receivedWarmLink = true
    accept(event.url)
  })
  try {
    const launch = await app.getLaunchUrl()
    if (launch?.url && !receivedWarmLink) accept(launch.url)
  } catch { /* Warm links remain available if the platform has no launch URL. */ }
  return () => listener.remove()
}
