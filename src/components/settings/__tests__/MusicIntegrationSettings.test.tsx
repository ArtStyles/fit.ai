import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { NowPlayingState } from '@/lib/native/musicSessionState'

import {
  createAndroidSettingsOpenController,
  MusicIntegrationSettingsView,
  openMusicNotificationListenerSettings,
  refreshMusicIntegration,
} from '../MusicIntegrationSettings'

const { mockRequireAppUserContext } = vi.hoisted(() => ({
  mockRequireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: mockRequireAppUserContext,
}))

import MusicSettingsPage from '@/app/(app)/settings/musica/page'

const ACTIVE_SNAPSHOT = {
  sessionId: 'session-1',
  packageName: 'com.example.player',
  sourceLabel: 'YouTube Music',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  album: 'After Hours',
  artworkDataUrl: null,
  state: 'playing' as const,
  positionMs: 30_000,
  durationMs: 180_000,
  playbackSpeed: 1,
  updatedAtMs: 1_000,
  canPlay: true,
  canPause: true,
}

function state(status: NowPlayingState['status']): NowPlayingState {
  return {
    status,
    snapshot: status === 'active' ? ACTIVE_SNAPSHOT : null,
    error: status === 'error' ? 'native provider details must stay private' : null,
  }
}

function renderView(
  status: NowPlayingState['status'],
  language: 'es' | 'en' = 'es',
  overrides: { busy?: boolean; openFailed?: boolean } = {},
) {
  return renderToStaticMarkup(
    <I18nProvider language={language} syncDocumentLanguage={false}>
      <MusicIntegrationSettingsView
        state={state(status)}
        busy={overrides.busy ?? false}
        openFailed={overrides.openFailed ?? false}
        onOpenSettings={vi.fn()}
        onRetry={vi.fn()}
      />
    </I18nProvider>,
  )
}

describe('MusicIntegrationSettingsView', () => {
  it.each([
    ['checking', 'Consultando Android…'],
    ['unsupported', 'Disponible solo en la app Android'],
    ['not_granted', 'Habilitar en Android'],
    ['granted_idle', 'Conectado · esperando música'],
    ['active', 'Integración activa'],
    ['error', 'No se pudo consultar Android'],
  ] as const)('renders %s without inventing a local permission switch', (status, copy) => {
    const html = renderView(status)

    expect(html).toContain(copy)
    expect(html).not.toContain('role="switch"')
  })

  it('keeps unsupported informational and buttonless', () => {
    const html = renderView('unsupported')

    expect(html).toContain('Esta integración necesita la aplicación de Vekira para Android.')
    expect(html).not.toContain('<button')
  })

  it('explains Android notification access before the user opts in', () => {
    const html = renderView('not_granted')

    expect(html).toContain('Android concede acceso amplio a las notificaciones.')
    expect(html).toContain('Vekira solo consulta sesiones multimedia')
    expect(html).toContain('no lee ni almacena el contenido de tus notificaciones')
    expect(html).toContain('Habilitar en Android')
    expect(html).not.toContain('Conectado · esperando música')
  })

  it('shows confirmed idle and active details with a manual Android management action', () => {
    const idle = renderView('granted_idle')
    const active = renderView('active')

    expect(idle).toContain('Conectado · esperando música')
    expect(idle).toContain('Gestionar en Android')
    expect(active).toContain('Blinding Lights')
    expect(active).toContain('YouTube Music')
    expect(active).toContain('Gestionar en Android')
  })

  it('offers a real retry and manual Android recovery without leaking native errors', () => {
    const html = renderView('error')

    expect(html).toContain('No se pudo consultar Android')
    expect(html).toContain('Reintentar')
    expect(html).toContain('Abrir ajustes de Android')
    expect(html).not.toContain('native provider details')
  })

  it('disables Android access while opening and reports a local failure without changing permission copy', () => {
    const busy = renderView('not_granted', 'es', { busy: true })
    const failed = renderView('not_granted', 'es', { openFailed: true })

    expect(busy).toContain('aria-busy="true"')
    expect(busy).toContain('disabled=""')
    expect(busy).toContain('Abriendo Android…')
    expect(failed).toContain('No se pudieron abrir los ajustes de Android.')
    expect(failed).toContain('Habilitar en Android')
    expect(failed).not.toContain('Conectado · esperando música')
  })

  it.each([
    ['checking', 'Checking Android…'],
    ['unsupported', 'Available only in the Android app'],
    ['not_granted', 'Enable in Android'],
    ['granted_idle', 'Connected · waiting for music'],
    ['active', 'Integration active'],
    ['error', 'Could not check Android'],
  ] as const)('renders localized English copy for %s', (status, copy) => {
    const html = renderView(status, 'en')

    expect(html).toContain(copy)
    expect(html).not.toMatch(/Acceso del sistema|Controla la sesión|Consultando Android|Disponible solo|Esta integración necesita|Acceso pendiente|Android concede acceso|Vekira solo consulta|Habilitar en Android|Conectado · esperando música|Integración activa|Gestionar en Android|No se pudo consultar Android|Abrir ajustes de Android/)
  })
})

describe('Android settings interaction', () => {
  it('delegates system access only to the music-session Android settings method', async () => {
    const openNotificationListenerSettings = vi.fn(async () => undefined)

    await openMusicNotificationListenerSettings({ openNotificationListenerSettings })

    expect(openNotificationListenerSettings).toHaveBeenCalledOnce()
  })

  it('opens only once while pending and reports busy until the real Android promise settles', async () => {
    let resolveOpen: () => void = () => undefined
    const openSettings = vi.fn(() => new Promise<void>(resolve => { resolveOpen = resolve }))
    const busyChanges: boolean[] = []
    const failureChanges: boolean[] = []
    const controller = createAndroidSettingsOpenController({
      openSettings,
      onBusyChange: value => busyChanges.push(value),
      onFailureChange: value => failureChanges.push(value),
    })

    const first = controller.open()
    const second = controller.open()

    expect(openSettings).toHaveBeenCalledOnce()
    expect(controller.isBusy()).toBe(true)
    expect(busyChanges).toEqual([true])
    expect(failureChanges).toEqual([false])

    resolveOpen()
    await Promise.all([first, second])

    expect(controller.isBusy()).toBe(false)
    expect(busyChanges).toEqual([true, false])
  })

  it('contains a rejected Android launch and exposes only a local failure signal', async () => {
    const busyChanges: boolean[] = []
    const failureChanges: boolean[] = []
    const controller = createAndroidSettingsOpenController({
      openSettings: async () => { throw new Error('sensitive platform details') },
      onBusyChange: value => busyChanges.push(value),
      onFailureChange: value => failureChanges.push(value),
    })

    await expect(controller.open()).resolves.toBeUndefined()

    expect(controller.isBusy()).toBe(false)
    expect(busyChanges).toEqual([true, false])
    expect(failureChanges).toEqual([false, true])
  })

  it('suppresses late state updates after the settings view is disposed', async () => {
    let rejectOpen: (error: Error) => void = () => undefined
    const busyChanges: boolean[] = []
    const failureChanges: boolean[] = []
    const controller = createAndroidSettingsOpenController({
      openSettings: () => new Promise<void>((_resolve, reject) => { rejectOpen = reject }),
      onBusyChange: value => busyChanges.push(value),
      onFailureChange: value => failureChanges.push(value),
    })

    const opening = controller.open()
    controller.dispose()
    rejectOpen(new Error('late Android failure'))
    await opening

    expect(busyChanges).toEqual([true])
    expect(failureChanges).toEqual([false])
  })

  it('routes retry to the real session refresh action', async () => {
    const refresh = vi.fn(async () => undefined)

    await refreshMusicIntegration({ refresh })

    expect(refresh).toHaveBeenCalledOnce()
  })
})

describe('/settings/musica', () => {
  it('uses only the authenticated language context and renders the localized settings shell', async () => {
    mockRequireAppUserContext.mockResolvedValue({ profile: { language: 'en' } })

    const html = renderToStaticMarkup(
      <I18nProvider language="en" syncDocumentLanguage={false}>
        {await MusicSettingsPage()}
      </I18nProvider>,
    )

    expect(mockRequireAppUserContext).toHaveBeenCalledOnce()
    expect(html).toContain('Music integration')
    expect(html).toContain('Android system player')
    expect(html).toContain('href="/settings"')
    expect(html).not.toContain('Integración musical')
  })
})
