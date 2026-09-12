'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createFitnessClient } from '@/lib/fitness-card/client'
import { fitnessEvidenceFingerprint } from '@/lib/fitness-card/fingerprint'
import { watchFitnessDataChanged } from '@/lib/fitness-card/events'
import { openFitnessPlatform } from '@/lib/fitness-card/platform'
import type { FitnessPlatform } from '@/lib/fitness-card/platform-types'
import type { FitnessEvidence, FitnessHubState } from '@/lib/fitness-card/types'

type AutoSyncClient = {
  hub: () => Promise<FitnessHubState>
  publish: (evidence: FitnessEvidence, revision: number) => Promise<unknown>
}

type AutoSyncDependencies = {
  openPlatform: () => Promise<FitnessPlatform>
  createClient: (platform: FitnessPlatform) => AutoSyncClient
  debounceMs?: number
  online?: () => boolean
  visible?: () => boolean
}

function conflict(reason: unknown): boolean {
  return reason instanceof Error && /FITNESS_CARD_CONFLICT/.test(reason.message)
}

export function createFitnessCardAutoSyncCoordinator(dependencies: AutoSyncDependencies) {
  const online = dependencies.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const visible = dependencies.visible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible')
  let platform: FitnessPlatform | null = null
  let client: AutoSyncClient | null = null
  let stopWatch: (() => void) | null = null
  let generation = 0
  let disposed = false
  let running: Promise<void> | null = null
  let requested = false
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const current = (epoch: number, expected: FitnessPlatform) => !disposed && generation === epoch && platform === expected

  async function publishOnce(epoch: number, expected: FitnessPlatform, api: AutoSyncClient) {
    if (!current(epoch, expected) || !expected.linked || !online() || !visible()) return
    await expected.assertCurrent()
    const state = await api.hub()
    if (!current(epoch, expected) || !state.own) return
    const evidence = await expected.sharedEvidence()
    if (!current(epoch, expected)) return
    if (fitnessEvidenceFingerprint(evidence) === fitnessEvidenceFingerprint(state.own.evidence)) return
    try {
      await api.publish(evidence, state.own.revision)
      await expected.assertCurrent()
    } catch (reason) {
      if (!conflict(reason) || !current(epoch, expected)) throw reason
      const fresh = await api.hub()
      if (!current(epoch, expected) || !fresh.own) return
      const freshEvidence = await expected.sharedEvidence()
      if (!current(epoch, expected) || fitnessEvidenceFingerprint(freshEvidence) === fitnessEvidenceFingerprint(fresh.own.evidence)) return
      await api.publish(freshEvidence, fresh.own.revision)
      await expected.assertCurrent()
    }
  }

  function enqueue(): Promise<void> {
    requested = true
    if (running) return running
    const epoch = generation
    const expected = platform
    const api = client
    if (!expected || !api) return Promise.resolve()
    running = (async () => {
      while (requested && current(epoch, expected)) {
        requested = false
        try { await publishOnce(epoch, expected, api) } catch { /* Retry on the next connectivity or data signal. */ }
      }
    })().finally(() => { running = null })
    return running
  }

  function schedule(kind: 'local' | 'remote' | 'account') {
    if (disposed) return
    if (kind === 'account') { void restart(); return }
    if (kind === 'remote') return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => { void enqueue() }, kind === 'local' ? dependencies.debounceMs ?? 0 : 0)
  }

  async function restart() {
    const epoch = ++generation
    const previousRun = running
    clearTimeout(debounceTimer)
    requested = false
    stopWatch?.(); stopWatch = null
    platform?.dispose(); platform = null; client = null
    let opened: FitnessPlatform
    try { opened = await dependencies.openPlatform() } catch { return }
    if (disposed || generation !== epoch) { opened.dispose(); return }
    platform = opened
    client = dependencies.createClient(opened)
    stopWatch = opened.watch(schedule)
    if (previousRun) await previousRun
    if (!current(epoch, opened)) return
    await enqueue()
  }

  return {
    start: restart,
    trigger: () => enqueue(),
    schedule,
    dispose: () => {
      disposed = true
      generation++
      requested = false
      clearTimeout(debounceTimer)
      stopWatch?.(); stopWatch = null
      platform?.dispose(); platform = null; client = null
    },
  }
}

export function useFitnessCardAutoSync(accountKey?: string | null) {
  useEffect(() => {
    const coordinator = createFitnessCardAutoSyncCoordinator({ openPlatform: openFitnessPlatform, createClient: createFitnessClient, debounceMs: 350 })
    let day = new Date().toDateString()
    void coordinator.start()
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) void coordinator.trigger() }
    const reconnect = () => { if (document.visibilityState === 'visible') coordinator.schedule('account') }
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    const daily = window.setInterval(() => {
      const next = new Date().toDateString()
      if (next !== day) { day = next; refresh() }
    }, 60_000)
    window.addEventListener('focus', refresh)
    window.addEventListener('online', reconnect)
    document.addEventListener('visibilitychange', visible)
    const stopFitnessData = watchFitnessDataChanged(() => coordinator.schedule('local'))
    return () => {
      window.clearInterval(daily)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', reconnect)
      document.removeEventListener('visibilitychange', visible)
      stopFitnessData()
      coordinator.dispose()
    }
  }, [accountKey])
}

export function FitnessCardAutoSync() {
  useFitnessCardAutoSync(usePathname())
  return null
}
