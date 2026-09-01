import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

import type {
  MusicPlaybackSnapshot,
  MusicSessionAdapter,
  MusicSessionAuthorization,
} from '../../musicSession'
import { useNowPlayingSession } from '../../useNowPlayingSession'

type AppStateListener = (state: { isActive: boolean }) => void

type LifecycleWindow = Window & {
  __appStateAddCalls: number
  __appStateRemoveCalls: number
  __appStateListeners: Set<AppStateListener>
  __emitAppForeground(): void
  __hookAuthorizationReads: number
  __hookLifecycleReady: boolean
  __hookUnhandledRejections: number
  __rejectAppStateRegistration: boolean
  __rejectAppStateRemoval: boolean
  __unmountHookFixture(): void
}

const fixture = window as unknown as LifecycleWindow
const query = new URLSearchParams(window.location.search)
const authorization = (query.get('authorization') ?? 'unsupported') as MusicSessionAuthorization
fixture.__appStateAddCalls = 0
fixture.__appStateRemoveCalls = 0
fixture.__appStateListeners = new Set()
fixture.__hookAuthorizationReads = 0
fixture.__hookLifecycleReady = false
fixture.__hookUnhandledRejections = 0
fixture.__rejectAppStateRegistration = query.get('rejectRegistration') === 'true'
fixture.__rejectAppStateRemoval = query.get('rejectRemoval') === 'true'
fixture.__emitAppForeground = () => {
  fixture.__appStateListeners.forEach(listener => listener({ isActive: true }))
}
window.addEventListener('unhandledrejection', event => {
  fixture.__hookUnhandledRejections += 1
  event.preventDefault()
})

const adapter: MusicSessionAdapter = {
  async getAuthorizationStatus() {
    fixture.__hookAuthorizationReads += 1
    return authorization
  },
  async openNotificationListenerSettings() {},
  async getCurrentSession(): Promise<MusicPlaybackSnapshot | null> {
    return null
  },
  async play() {},
  async pause() {},
  async addListener() {
    return { remove: async () => undefined }
  },
}

function HookProbe() {
  const session = useNowPlayingSession(adapter)
  useEffect(() => {
    if (session.status === authorization) fixture.__hookLifecycleReady = true
  }, [session.status])
  return <output data-hook-status>{session.status}</output>
}

const container = document.getElementById('root')
if (!container) throw new Error('Missing hook fixture root.')
const root = createRoot(container)
fixture.__unmountHookFixture = () => root.unmount()
root.render(<StrictMode><HookProbe /></StrictMode>)
