'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter }     from 'next/navigation'
import {
  Sparkles, Loader2, CheckCircle2, AlertCircle,
  Dumbbell, Target, Clock, CalendarDays,
} from 'lucide-react'
import { Button }        from '@/components/ui/button'
import { cn }            from '@/lib/utils'
import { generatePlan }  from '@/app/actions/generatePlan'
import { useToast }      from '@/components/feedback/ToastProvider'
import type { GeneratePlanResult } from '@/app/actions/generatePlan'

// ─── Mensajes de carga rotativos ─────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Analizando tu perfil…',
  'Seleccionando ejercicios…',
  'Diseñando tu plan…',
  'Calculando cargas y series…',
  'Ajustando los descansos…',
  'Casi listo…',
]

// ─── Tarjeta de dato del perfil ───────────────────────────────────────────────

function ProfileChip({
  icon, label,
}: {
  icon:  React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm text-foreground">{label}</span>
    </div>
  )
}

// ─── Mapeos legibles ──────────────────────────────────────────────────────────

const GOAL_LABELS: Record<string, string> = {
  build_muscle:      'Ganar músculo',
  gain_strength:     'Ganar fuerza',
  lose_weight:       'Perder peso',
  improve_endurance: 'Mejorar resistencia',
  stay_active:       'Mantenerse activo',
}

const LEVEL_LABELS: Record<string, string> = {
  beginner:     'Principiante',
  intermediate: 'Intermedio',
  advanced:     'Avanzado',
}

const GYM_LABELS: Record<string, string> = {
  home_no_equipment: 'Casa sin equipo',
  home_basic:        'Casa con equipo básico',
  full_gym:          'Gimnasio completo',
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ProfileSummary {
  fitnessLevel:    string
  primaryGoal:     string
  daysPerWeek:     number
  sessionMinutes:  number
  gymType:         string
}

interface Props {
  profile: ProfileSummary
  autoStart?: boolean
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function GeneratePlanClient({ profile, autoStart = false }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const autoStartedRef = useRef(false)

  const [status,  setStatus]  = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result,  setResult]  = useState<GeneratePlanResult | null>(null)
  const [msgIdx,  setMsgIdx]  = useState(0)

  const loadingMessage = LOADING_MESSAGES[msgIdx]

  const handleGenerate = useCallback(async () => {
    setStatus('loading')
    setResult(null)

    // Rotar mensajes mientras carga
    const interval = setInterval(() => {
      setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length)
    }, 1800)

    try {
      const res = await generatePlan()
      clearInterval(interval)
      setResult(res)
      setStatus(res.success ? 'success' : 'error')
      showToast({
        title: res.success ? 'Plan generado' : 'No se pudo generar',
        description: res.success
          ? 'Tu plan está listo para revisar.'
          : res.error ?? 'Inténtalo de nuevo.',
        variant: res.success ? 'success' : 'error',
      })
      if (res.success && autoStart) {
        window.dispatchEvent(new Event('fitai:navigation-start'))
        router.replace('/dashboard')
        router.refresh()
      }
    } catch {
      clearInterval(interval)
      setResult({ success: false, error: 'Error inesperado. Inténtalo de nuevo.' })
      setStatus('error')
      showToast({
        title: 'Error inesperado',
        description: 'No se pudo completar la generación.',
        variant: 'error',
      })
    }
  }, [autoStart, router, showToast])

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return
    autoStartedRef.current = true
    handleGenerate()
  }, [autoStart, handleGenerate])

  function goToDashboard() {
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.replace('/dashboard')
  }

  // ── Estado: éxito ──────────────────────────────────────────────────────────
  if (status === 'success' && result?.success) {
    return (
      <div className="flex flex-col items-center text-center gap-5 py-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2 className="h-8 w-8 text-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">¡Tu plan está listo!</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.planName} · {result.daysCount} días/semana
          </p>
          {result.isMock && (
            <p className="mt-1 text-xs text-amber-400">
              Generado en modo desarrollo (mock)
            </p>
          )}
        </div>
        <Button
          className="w-full h-12 bg-indigo-500 hover:bg-indigo-600 text-white font-bold"
          onClick={goToDashboard}
        >
          Ir al dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Resumen del perfil ─────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
          Basado en tu perfil
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ProfileChip
            icon={<Target className="h-4 w-4" />}
            label={GOAL_LABELS[profile.primaryGoal] ?? profile.primaryGoal}
          />
          <ProfileChip
            icon={<Dumbbell className="h-4 w-4" />}
            label={LEVEL_LABELS[profile.fitnessLevel] ?? profile.fitnessLevel}
          />
          <ProfileChip
            icon={<CalendarDays className="h-4 w-4" />}
            label={`${profile.daysPerWeek} días/semana`}
          />
          <ProfileChip
            icon={<Clock className="h-4 w-4" />}
            label={`${profile.sessionMinutes} min/sesión`}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground px-0.5">
          Gimnasio: {GYM_LABELS[profile.gymType] ?? profile.gymType}
        </p>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {status === 'error' && result && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{result.error}</p>
        </div>
      )}

      {/* ── Botón principal ────────────────────────────────────────────────── */}
      <Button
        className={cn(
          'w-full h-14 font-bold text-base gap-2',
          status === 'loading'
            ? 'bg-indigo-500/70 text-white cursor-not-allowed'
            : 'bg-indigo-500 hover:bg-indigo-600 text-white',
        )}
        disabled={status === 'loading'}
        onClick={handleGenerate}
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {loadingMessage}
          </>
        ) : status === 'error' ? (
          <>
            <Sparkles className="h-5 w-5" />
            Reintentar
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            Generar mi plan
          </>
        )}
      </Button>

      {status === 'idle' && (
        <p className="text-center text-xs text-muted-foreground">
          El proceso tarda unos segundos. No cierres la pantalla.
        </p>
      )}
    </div>
  )
}
