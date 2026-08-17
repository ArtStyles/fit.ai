'use client'

import { useEffect, useRef, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SettingsStatus } from '@/components/settings/SettingsStatus'
import { SettingsSwitchRow } from '@/components/settings/SettingsSwitchRow'
import {
  applyWorkoutReminderToggle,
  createSingleFlight,
  rescheduleWorkoutReminder,
} from '@/components/settings/notificationPreferenceFeedback'
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

export function WorkoutReminderControls({
  time,
  enabled,
  busy,
  timeLabel,
  toggleLabel,
  onTimeChange,
  onToggle,
}: {
  time: string
  enabled: boolean
  busy: boolean
  timeLabel: string
  toggleLabel: string
  onTimeChange: (value: string) => void
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3" aria-busy={busy}>
      <input
        id="reminder-time"
        aria-label={timeLabel}
        type="time"
        value={time}
        onChange={event => onTimeChange(event.target.value)}
        disabled={busy}
        className="h-11 min-h-11 min-w-11 rounded-md border border-input bg-background px-3 text-sm tabular-nums text-foreground outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-wait disabled:opacity-60"
      />
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={toggleLabel}
        onClick={onToggle}
        disabled={busy}
        className={cn(
          'flex h-11 w-12 min-h-11 min-w-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-wait',
          busy && 'opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative block h-7 w-12 rounded-full transition-colors',
            enabled ? 'bg-violet-500' : 'bg-muted/50',
          )}
        >
          <span
            className={cn(
              'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </span>
      </button>
    </div>
  )
}

export function WorkoutReminders({ preferredWorkoutDays }: Props) {
  const { showToast } = useToast()
  const { language, t } = useI18n()
  const operations = useRef(createSingleFlight()).current
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [time, setTime] = useState(DEFAULT_TIME)
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const days = [...preferredWorkoutDays].sort((a, b) => a - b)
  const hasDays = days.length > 0

  async function runOperation<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (operations.isPending) return undefined
    setBusy(true)
    try {
      const result = await operations.run(task)
      return result.started ? result.value : undefined
    } finally {
      setBusy(false)
    }
  }

  function reportPermissionRequired() {
    const message = t('Permiso necesario')
    setStatusMessage(message)
    showToast({
      title: message,
      description: t('Activa las notificaciones de Vekira en los ajustes del teléfono.'),
      variant: 'error',
    })
  }

  function reportNativeFailure() {
    const message = t('No se pudieron actualizar los recordatorios.')
    setStatusMessage(message)
    showToast({ title: message, variant: 'error' })
  }

  // Hidratar preferencia + detectar plataforma (solo en cliente). Si ya estaba
  // activado, reprograma con los días actuales para captar cambios del perfil.
  useEffect(() => {
    const native = remindersSupported()
    setSupported(native)
    const pref = loadPref()
    setEnabled(pref.enabled)
    setTime(pref.time)
    if (native && pref.enabled && days.length > 0) {
      void runOperation(() => applyWorkoutReminderToggle({
        enable: true,
        schedule: () => scheduleWorkoutReminders(days, parseTime(pref.time), language),
        cancel: cancelWorkoutReminders,
      })).then(outcome => {
        if (outcome !== 'permission-denied') return
        setEnabled(false)
        persist({ enabled: false, time: pref.time })
        reportPermissionRequired()
      }).catch(reportNativeFailure)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleToggle() {
    if (operations.isPending || !hasDays) return
    const next = !enabled
    try {
      const outcome = await runOperation(() => applyWorkoutReminderToggle({
        enable: next,
        schedule: () => scheduleWorkoutReminders(days, parseTime(time), language),
        cancel: cancelWorkoutReminders,
      }))
      if (!outcome) return
      if (outcome === 'permission-denied') {
        reportPermissionRequired()
        return
      }

      setEnabled(next)
      persist({ enabled: next, time })
      if (next) {
        showToast({
          title: t('Recordatorios activados'),
          description: t('Te avisaremos a las {time} en tus días de entrenamiento.', { time }),
          variant: 'success',
        })
        setStatusMessage(t('Recordatorios activados'))
      } else {
        showToast({ title: t('Recordatorios desactivados'), variant: 'success' })
        setStatusMessage(t('Recordatorios desactivados'))
      }
    } catch {
      reportNativeFailure()
    }
  }

  async function handleTimeChange(value: string) {
    if (operations.isPending) return
    const previousTime = time
    setTime(value)
    if (!enabled || !supported) {
      persist({ enabled, time: value })
      return
    }

    try {
      const scheduled = await runOperation(() => rescheduleWorkoutReminder({
        schedule: () => scheduleWorkoutReminders(days, parseTime(value), language),
        onRollback: () => {
          setTime(previousTime)
          persist({ enabled, time: previousTime })
        },
      }))
      if (scheduled) {
        persist({ enabled, time: value })
      } else if (scheduled === false) {
        reportPermissionRequired()
      }
    } catch {
      reportNativeFailure()
    }
  }

  return (
    <SettingsSection
      title={t('Recordatorios de entrenamiento')}
      description={t('Notificación local en tus días preferidos')}
    >
      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>

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
              <WorkoutReminderControls
                time={time}
                enabled={enabled}
                busy={busy}
                timeLabel={t('Hora del aviso')}
                toggleLabel={t(enabled ? 'Desactivar recordatorios' : 'Activar recordatorios')}
                onTimeChange={value => { void handleTimeChange(value) }}
                onToggle={() => { void handleToggle() }}
              />
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
