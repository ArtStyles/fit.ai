import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/sw.js/route'

describe('retired web application cache', () => {
  it('removes old product responses without removing user storage or unrelated caches', async () => {
    const listeners: Record<string, (event: { waitUntil: (work: Promise<void>) => void }) => void> = {}
    const removed: string[] = [], navigated: string[] = []
    let unregistered = false
    const response = GET()
    runInNewContext(await response.text(), {
      self: {
        addEventListener: (type: string, handler: typeof listeners[string]) => { listeners[type] = handler },
        skipWaiting: () => {}, registration: { unregister: async () => { unregistered = true } },
        clients: { matchAll: async () => [{ url: 'https://vekira.test/dashboard', navigate: async (url: string) => { navigated.push(url) } }] },
      },
      caches: { keys: async () => ['pages', 'start-url', 'workbox-precache-v2', 'personal-backup'], delete: async (name: string) => { removed.push(name) } },
    })
    let work: Promise<void> | undefined
    listeners.activate({ waitUntil: operation => { work = operation } })
    await work
    expect(removed).toEqual(['pages', 'start-url', 'workbox-precache-v2'])
    expect(unregistered).toBe(true)
    expect(navigated).toEqual(['https://vekira.test/dashboard'])
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
