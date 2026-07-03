'use client'

import { useEffect, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/feedback/ToastProvider'
import {
  remindersSupported,
  scheduleWorkoutReminders,
  cancelWorkoutReminders,
} from '@/lib/native/notifications'

const STORAGE_KEY = 'fitai:workout-reminders'
const DEFAULT_TIME = '18:00'

const DAY_LABELS: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom',
}

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
            title: 'Permiso necesario',
            description: 'Activa las notificaciones de Vekira en los ajustes del teléfono.',
            variant: 'error',
          })
          return
        }
        setEnabled(true)
        persist({ enabled: true, time })
        showToast({
          title: 'Recordatorios activados',
          description: `Te avisaremos a las ${time} en tus días de entrenamiento.`,
          variant: 'success',
        })
      } else {
        await cancelWorkoutReminders()
        setEnabled(false)
        persist({ enabled: false, time })
        showToast({ title: 'Recordatorios desactivados', variant: 'success' })
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
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
          <BellRing className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Recordatorios de entrenamiento</p>
          <p className="text-xs text-muted-foreground">Notificación local en tus días preferidos</p>
        </div>
      </div>

      {/* Web/PWA: las notificaciones locales solo operan en la app instalada */}
      {!supported ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border/50 bg-background/60 px-3.5 py-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Los recordatorios funcionan en la <span className="font-medium text-foreground">app instalada</span> en tu
            teléfono. Ábrela desde tu dispositivo para activarlos.
          </p>
        </div>
      ) : !hasDays ? (
        <p className="mt-4 rounded-xl border border-border/50 bg-background/60 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
          Elige tus <span className="font-medium text-foreground">días preferidos</span> en la sección de
          entrenamiento y guarda para poder activar los recordatorios.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-4">
            <label htmlFor="reminder-time" className="text-sm text-foreground">
              Hora del aviso
            </label>
            <div className="flex items-center gap-3">
              <input
                id="reminder-time"
                type="time"
                value={time}
                onChange={e => handleTimeChange(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm tabular-nums text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={enabled ? 'Desactivar recordatorios' : 'Activar recordatorios'}
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
          </div>

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
                {DAY_LABELS[day]}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
