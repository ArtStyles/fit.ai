'use client'
import { useEffect } from 'react'
import { isRetiredWebCache } from '@/lib/marketing/webCache'

/** Retire only Vekira's old web worker/caches. Account/local training data
 * belongs to the user and must never be cleared by the download portal. */
export function RetireWebAppCache() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    void navigator.serviceWorker.getRegistrations().then(async registrations => {
      for (const registration of registrations) {
        const script = registration.active?.scriptURL ?? registration.waiting?.scriptURL ?? registration.installing?.scriptURL
        if (script && new URL(script).pathname === '/sw.js') {
          await registration.update().catch(() => {})
          await registration.unregister()
        }
      }
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.filter(isRetiredWebCache).map(name => caches.delete(name)))
      }
    }).catch(() => {})
  }, [])
  return null
}
