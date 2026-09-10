'use client'

import { useEffect, useState } from 'react'
import { hasSharedWeeklyAchievement } from '@/lib/companions/achievement'
import type { CompanionSnapshot } from '@/lib/companions/types'

export function useCompanionConnection() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return online
}

export function useCompanionQuota(nextGreetingAt: string | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!nextGreetingAt) return
    const remaining = Date.parse(nextGreetingAt) - Date.now()
    if (remaining <= 0) { if (now < Date.parse(nextGreetingAt)) setNow(Date.now()); return }
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining + 100, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [nextGreetingAt, now])
  return !!nextGreetingAt && Date.parse(nextGreetingAt) > now
}

export function useCompanionWeeklyAchievement(snapshot: CompanionSnapshot | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const update = () => setNow(Date.now())
    const resume = () => { if (document.visibilityState === 'visible') update() }
    // A saved summary must stop celebrating when either person's week ends,
    // including when the app resumes without a new server snapshot.
    update()
    const timer = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', resume)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [])
  return hasSharedWeeklyAchievement(snapshot, now)
}
