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
}

type NativeSessionEvent = { snapshot: MusicPlaybackSnapshot | null }

interface NativeMusicSessionPlugin {
  getAuthorizationStatus(): Promise<{ status: MusicSessionAuthorization }>
  openNotificationListenerSettings(): Promise<void>
  getCurrentSession(): Promise<NativeSessionEvent>
  play(): Promise<void>
  pause(): Promise<void>
  addListener(
    eventName: 'sessionChanged',
    listener: (event: NativeSessionEvent) => void,
  ): Promise<PluginListenerHandle>
}

export interface MusicSessionAdapter {
  getAuthorizationStatus(): Promise<MusicSessionAuthorization>
  openNotificationListenerSettings(): Promise<void>
  getCurrentSession(): Promise<MusicPlaybackSnapshot | null>
  play(): Promise<void>
  pause(): Promise<void>
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

  async play() {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.play()
  },

  async pause() {
    if (!isSupportedAndroid()) return
    await NativeMusicSession.pause()
  },

  async addListener(eventName, listener) {
    if (!isSupportedAndroid()) return EMPTY_HANDLE
    return NativeMusicSession.addListener(eventName, event => listener(event.snapshot))
  },
}
