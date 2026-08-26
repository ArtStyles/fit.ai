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
    expect(nativeMocks.getAuthorizationStatus).not.toHaveBeenCalled()
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
})
