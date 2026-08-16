'use client'

import { useEffect, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsStatus } from '@/components/settings/SettingsStatus'
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow'
import {
  remindersSupported,
  scheduleWorkoutReminders,
  cancelWorkoutReminders,
} from '@/lib/native/notifications'

const STORAGE_KEY = 'fitai:workout-reminders'
const DEFAULT_TIME = '18:00'

const DAY_KEYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

interface StoredPref {
  enabled: boolean
  time: string // "HH:MM"
}

function loadPref(): StoredPref {
  if (typeof window === 'undefined') return { enabled: false, time: DEFAULT_TIME }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredPref>
      return {
        enabled: Boolean(parsed.enabled),
        time: typeof parsed.time === 'string' ? parsed.time : DEFAULT_TIME,
      }
    }
  } catch {
    /* preferencia corrupta → valores por defecto */
  }
  return { enabled: false, time: DEFAULT_TIME }
}

function persist(pref: StoredPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
  } catch {
    /* almacenamiento no disponible: la programación nativa ya quedó hecha */
  }
}

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map(Number)
  return {
    hour: Number.isFinite(h) ? h : 18,
    minute: Number.isFinite(m) ? m : 0,
  }
}

interface Props {
  preferredWorkoutDays: number[]
}

export function WorkoutReminders({ preferredWorkoutDays }: Props) {
  const { showToast } = useToast()
  const { t } = useI18n()
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState(DEFAULT_TIME)
  const [busy, setBusy] = useState(false)

  const days = [...preferredWorkoutDays].sort((a, b) => a - b)
  const hasDays = days.length > 0

  // Hidratar preferencia + detectar plataforma (solo en cliente). Si ya estaba
  // activado, reprograma con los días actuales para captar cambios del perfil.
  useEffect(() => {
    const native = remindersSupported()
    setSupported(native)
    const pref = loadPref()
    setEnabled(pref.enabled)
    setTime(pref.time)
    if (native && pref.enabled && days.length > 0) {
      void scheduleWorkoutReminders(days, parseTime(pref.time))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleToggle() {
    if (busy || !hasDays) return
    const next = !enabled
    setBusy(true)
    try {
      if (next) {
        const ok = await scheduleWorkoutReminders(days, parseTime(time))
        if (!ok) {
          showToast({
            title: t('Permiso necesario'),
            description: t('Activa las notificaciones de Vekira en los ajustes del teléfono.'),
            variant: 'error',
          })
          return
        }
        setEnabled(true)
        persist({ enabled: true, time })
        showToast({
          title: t('Recordatorios activados'),
          description: t('Te avisaremos a las {time} en tus días de entrenamiento.', { time }),
          variant: 'success',
        })
      } else {
        await cancelWorkoutReminders()
        setEnabled(false)
        persist({ enabled: false, time })
        showToast({ title: t('Recordatorios desactivados'), variant: 'success' })
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleTimeChange(value: string) {
    setTime(value)
    persist({ enabled, time: value })
    if (enabled && supported) {
      await scheduleWorkoutReminders(days, parseTime(value))
    }
  }

  return (
    <SettingsSection
      title={t('Recordatorios de entrenamiento')}
      description={t('Notificación local en tus días preferidos')}
    >

      {/* Web/PWA: las notificaciones locales solo operan en la app instalada */}
      {!supported ? (
        <SettingsStatus tone="info">
          <span className="flex items-start gap-2.5">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('Los recordatorios funcionan en la app instalada en tu teléfono. Ábrela desde tu dispositivo para activarlos.')}
          </span>
        </SettingsStatus>
      ) : !hasDays ? (
        <SettingsStatus tone="warning">
          {t('Elige tus días preferidos en la sección de entrenamiento y guarda para poder activar los recordatorios.')}
        </SettingsStatus>
      ) : (
        <>
          <SettingsSwitchRow
            title={t('Hora del aviso')}
            icon={<BellRing className="h-4 w-4" />}
            control={(
              <div className="flex items-center gap-3">
                <input
                  id="reminder-time"
                  aria-label={t('Hora del aviso')}
                  type="time"
                  value={time}
                  onChange={e => handleTimeChange(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm tabular-nums text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={t(enabled ? 'Desactivar recordatorios' : 'Activar recordatorios')}
                onClick={handleToggle}
                disabled={busy}
                className={cn(
                  'relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                  enabled ? 'bg-violet-500' : 'bg-muted/50',
                  busy && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
                </button>
              </div>
            )}
          />

          <div className="mt-3 flex flex-wrap gap-1.5">
            {days.map(day => (
              <span
                key={day}
                className={cn(
                  'rounded-md px-2 py-1 text-xs font-medium',
                  enabled
                    ? 'bg-violet-500/15 text-violet-200'
                    : 'bg-muted/30 text-muted-foreground',
                )}
              >
                {t(DAY_KEYS[day - 1] ?? '')}
              </span>
            ))}
          </div>
        </>
      )}
    </SettingsSection>
  )
}
