import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  isPluginAvailable: vi.fn(),
}))

const nativeMocks = vi.hoisted(() => ({
  getAuthorizationStatus: vi.fn(),
  openNotificationListenerSettings: vi.fn(),
  getCurrentSession: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  previous: vi.fn(),
  next: vi.fn(),
  seekTo: vi.fn(),
  addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: capacitorMocks,
  registerPlugin: vi.fn(() => nativeMocks),
}))

import { musicSessionAdapter } from '../musicSession'

const PLAYING_SNAPSHOT = {
  sessionId: 'session-1',
  packageName: 'com.example.player',
  sourceLabel: 'Example Player',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  artworkDataUrl: null,
  state: 'playing' as const,
  positionMs: 10_000,
  durationMs: 180_000,
  playbackSpeed: 1,
  updatedAtMs: 1_726_000_000_000,
  canPlay: false,
  canPause: true,
  canSkipPrevious: true,
  canSkipNext: true,
  canSeek: true,
}

describe('music session adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capacitorMocks.isNativePlatform.mockReturnValue(true)
    capacitorMocks.getPlatform.mockReturnValue('android')
    capacitorMocks.isPluginAvailable.mockReturnValue(true)
  })

  it('returns unsupported without invoking the native plugin on web', async () => {
    capacitorMocks.isNativePlatform.mockReturnValue(false)

    await expect(musicSessionAdapter.getAuthorizationStatus()).resolves.toBe('unsupported')
    await expect(musicSessionAdapter.getCurrentSession()).resolves.toBeNull()
    await expect(musicSessionAdapter.previous('session-1')).resolves.toBeUndefined()
    await expect(musicSessionAdapter.next('session-1')).resolves.toBeUndefined()
    await expect(musicSessionAdapter.seekTo('session-1', 42_000)).resolves.toBeUndefined()
    expect(nativeMocks.getAuthorizationStatus).not.toHaveBeenCalled()
    expect(nativeMocks.previous).not.toHaveBeenCalled()
    expect(nativeMocks.next).not.toHaveBeenCalled()
    expect(nativeMocks.seekTo).not.toHaveBeenCalled()
  })

  it('unwraps native snapshots and listener events on supported Android', async () => {
    nativeMocks.getCurrentSession.mockResolvedValue({ snapshot: PLAYING_SNAPSHOT })
    nativeMocks.addListener.mockImplementation(async (_name, listener) => {
      listener({ snapshot: PLAYING_SNAPSHOT })
      return { remove: vi.fn() }
    })
    const listener = vi.fn()

    await expect(musicSessionAdapter.getCurrentSession()).resolves.toEqual(PLAYING_SNAPSHOT)
    await musicSessionAdapter.addListener('sessionChanged', listener)
    expect(listener).toHaveBeenCalledWith(PLAYING_SNAPSHOT)
  })

  it('forwards previous, next and seek controls to the supported Android plugin', async () => {
    await musicSessionAdapter.play('session-1')
    await musicSessionAdapter.pause('session-1')
    await musicSessionAdapter.previous('session-1')
    await musicSessionAdapter.next('session-1')
    await musicSessionAdapter.seekTo('session-1', 42_000)

    expect(nativeMocks.play).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(nativeMocks.pause).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(nativeMocks.previous).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(nativeMocks.next).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(nativeMocks.seekTo).toHaveBeenCalledWith({ sessionId: 'session-1', positionMs: 42_000 })
  })
})
