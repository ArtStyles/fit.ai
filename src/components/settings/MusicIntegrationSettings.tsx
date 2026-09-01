'use client'

import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { musicSessionAdapter, type MusicSessionAdapter } from '@/lib/native/musicSession'
import type { NowPlayingState } from '@/lib/native/musicSessionState'
import { useNowPlayingSession } from '@/lib/native/useNowPlayingSession'

import { SettingsSection } from './SettingsSection'
import { SettingsStatus } from './SettingsStatus'

type AndroidSettingsOpenController = {
  open(): Promise<void>
  isBusy(): boolean
  dispose(): void
}

export function createAndroidSettingsOpenController({
  openSettings,
  onBusyChange,
  onFailureChange,
}: {
  openSettings(): Promise<void>
  onBusyChange(busy: boolean): void
  onFailureChange(failed: boolean): void
}): AndroidSettingsOpenController {
  let disposed = false
  let pending: Promise<void> | null = null

  return {
    open() {
      if (disposed) return Promise.resolve()
      if (pending) return pending

      onFailureChange(false)
      onBusyChange(true)
      let openResult: Promise<void>
      try {
        openResult = openSettings()
      } catch (error) {
        openResult = Promise.reject(error)
      }
      const operation = openResult
        .catch(() => {
          if (!disposed) onFailureChange(true)
        })
        .finally(() => {
          if (pending === operation) pending = null
          if (!disposed) onBusyChange(false)
        })
      pending = operation
      return operation
    },
    isBusy: () => pending !== null,
    dispose() {
      disposed = true
    },
  }
}

export function refreshMusicIntegration(session: { refresh(): Promise<void> }): Promise<void> {
  return session.refresh()
}

export function openMusicNotificationListenerSettings(
  adapter: Pick<MusicSessionAdapter, 'openNotificationListenerSettings'> = musicSessionAdapter,
): Promise<void> {
  return adapter.openNotificationListenerSettings()
}

type MusicIntegrationSettingsViewProps = {
  state: NowPlayingState
  busy: boolean
  openFailed: boolean
  onOpenSettings(): void
  onRetry(): void
}

function AndroidSettingsButton({
  busy,
  label,
  onClick,
}: {
  busy: boolean
  label: string
  onClick(): void
}) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      aria-busy={busy ? 'true' : undefined}
      disabled={busy}
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.24)] transition-colors hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? t('Abriendo Android…') : label}
    </button>
  )
}

export function MusicIntegrationSettingsView({
  state,
  busy,
  openFailed,
  onOpenSettings,
  onRetry,
}: MusicIntegrationSettingsViewProps) {
  const { t } = useI18n()
  const privacyCopy = (
    <div className="space-y-1 text-sm leading-6 text-muted-foreground">
      <p>{t('Android concede acceso amplio a las notificaciones.')}</p>
      <p>{t('Vekira solo consulta sesiones multimedia y no lee ni almacena el contenido de tus notificaciones.')}</p>
    </div>
  )

  return (
    <SettingsSection
      title={t('Acceso del sistema')}
      description={t('Controla la sesión multimedia activa de Android desde Vekira.')}
    >
      <div className="space-y-4">
        {state.status === 'checking' ? (
          <SettingsStatus>{t('Consultando Android…')}</SettingsStatus>
        ) : null}

        {state.status === 'unsupported' ? (
          <div className="space-y-3">
            <SettingsStatus>{t('Disponible solo en la app Android')}</SettingsStatus>
            <p className="text-sm leading-6 text-muted-foreground">
              {t('Esta integración necesita la aplicación de Vekira para Android.')}
            </p>
          </div>
        ) : null}

        {state.status === 'not_granted' ? (
          <div className="space-y-4">
            <SettingsStatus tone="warning">{t('Acceso pendiente en Android')}</SettingsStatus>
            {privacyCopy}
            <AndroidSettingsButton busy={busy} label={t('Habilitar en Android')} onClick={onOpenSettings} />
          </div>
        ) : null}

        {state.status === 'granted_idle' ? (
          <div className="space-y-4">
            <SettingsStatus tone="success">{t('Conectado · esperando música')}</SettingsStatus>
            <AndroidSettingsButton busy={busy} label={t('Gestionar en Android')} onClick={onOpenSettings} />
          </div>
        ) : null}

        {state.status === 'active' && state.snapshot ? (
          <div className="space-y-4">
            <SettingsStatus tone="success">{t('Integración activa')}</SettingsStatus>
            <div className="min-w-0 rounded-xl bg-muted/10 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-foreground">{state.snapshot.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{state.snapshot.sourceLabel}</p>
            </div>
            <AndroidSettingsButton busy={busy} label={t('Gestionar en Android')} onClick={onOpenSettings} />
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="space-y-4">
            <SettingsStatus tone="error">{t('No se pudo consultar Android')}</SettingsStatus>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              >
                {t('Reintentar')}
              </button>
              <AndroidSettingsButton busy={busy} label={t('Abrir ajustes de Android')} onClick={onOpenSettings} />
            </div>
          </div>
        ) : null}

        {openFailed ? (
          <SettingsStatus tone="error">{t('No se pudieron abrir los ajustes de Android.')}</SettingsStatus>
        ) : null}
      </div>
    </SettingsSection>
  )
}

export function MusicIntegrationSettings() {
  const session = useNowPlayingSession()
  const [busy, setBusy] = useState(false)
  const [openFailed, setOpenFailed] = useState(false)
  const openController = useMemo(() => createAndroidSettingsOpenController({
    openSettings: () => openMusicNotificationListenerSettings(),
    onBusyChange: setBusy,
    onFailureChange: setOpenFailed,
  }), [])

  useEffect(() => () => openController.dispose(), [openController])

  return (
    <MusicIntegrationSettingsView
      state={session}
      busy={busy}
      openFailed={openFailed}
      onOpenSettings={() => { void openController.open() }}
      onRetry={() => { void refreshMusicIntegration(session) }}
    />
  )
}
