import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'

export type MusicSessionAuthorization = 'unsupported' | 'not_granted' | 'granted'
export type MusicPlaybackState = 'playing' | 'paused' | 'stopped'

export type MusicPlaybackSnapshot = {
  sessionId: string
  packageName: string
  sourceLabel: string
  title: string
  artist: string | null
  album: string | null
  artworkDataUrl: string | null
  state: MusicPlaybackState
  positionMs: number | null
  durationMs: number | null
  playbackSpeed: number
  updatedAtMs: number
  canPlay: boolean
  canPause: boolean
  canSkipPrevious: boolean
  canSkipNext: boolean
  canSeek: boolean
}

type NativeSessionEvent = { snapshot: MusicPlaybackSnapshot | null }

interface NativeMusicSessionPlugin {
  getAuthorizationStatus(): Promise<{ status: MusicSessionAuthorization }>
  openNotificationListenerSettings(): Promise<void>
  getCurrentSession(): Promise<NativeSessionEvent>
  play(options: { sessionId: string }): Promise<void>
  pause(options: { sessionId: string }): Promise<void>
  previous(options: { sessionId: string }): Promise<void>
  next(options: { sessionId: string }): Promise<void>
  seekTo(options: { sessionId: string; positionMs: number }): Promise<void>
  addListener(
    eventName: 'sessionChanged',
    listener: (event: NativeSessionEvent) => void,
  ): Promise<PluginListenerHandle>
}

export interface MusicSessionAdapter {
  getAuthorizationStatus(): Promise<MusicSessionAuthorization>
  openNotificationListenerSettings(): Promise<void>
  getCurrentSession(): Promise<MusicPlaybackSnapshot | null>
  play(sessionId: string): Promise<void>
  pause(sessionId: string): Promise<void>
  previous(sessionId: string): Promise<void>
  next(sessionId: string): Promise<void>
  seekTo(sessionId: string, positionMs: number): Promise<void>
  addListener(
    eventName: 'sessionChanged',
    listener: (snapshot: MusicPlaybackSnapshot | null) => void,
  ): Promise<PluginListenerHandle>
}

const NativeMusicSession = registerPlugin<NativeMusicSessionPlugin>('MusicSession')
const EMPTY_HANDLE: PluginListenerHandle = { remove: async () => undefined }

function isSupportedAndroid(): boolean {
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
    && Capacitor.isPluginAvailable('MusicSession')
}

export const musicSessionAdapter: MusicSessionAdapter = {
  async getAuthorizationStatus() {
    if (!isSupportedAndroid()) return 'unsupported'
    const { status } = await NativeMusicSession.getAuthorizationStatus()
    return status
  },

  async openNotificationListenerSettings() {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.openNotificationListenerSettings()
  },

  async getCurrentSession() {
    if (!isSupportedAndroid()) return null
    const { snapshot } = await NativeMusicSession.getCurrentSession()
    return snapshot
  },

  async play(sessionId) {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.play({ sessionId })
  },

  async pause(sessionId) {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.pause({ sessionId })
  },

  async previous(sessionId) {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.previous({ sessionId })
  },

  async next(sessionId) {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.next({ sessionId })
  },

  async seekTo(sessionId, positionMs) {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.seekTo({ sessionId, positionMs })
  },

  async addListener(eventName, listener) {
    if (!isSupportedAndroid()) return EMPTY_HANDLE
    return NativeMusicSession.addListener(eventName, event => listener(event.snapshot))
  },
}
