'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Dumbbell, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveOnboardingAnswers } from './actions'
import { generatePlan, type GeneratePlanResult } from '@/app/actions/generatePlan'
import { type OnboardingAnswers, defaultAnswers } from './types'
import { checkUsernameAvailable, updateUsername } from '@/app/actions/username'
import { validateUsername } from '@/lib/social/username'

// ─── Step sequence ────────────────────────────────────────────────────────────

type StepKey =
  | 'username' | 'goal' | 'level' | 'days' | 'duration'
  | 'location' | 'equipment' | 'injuries' | 'physical'
  | 'generating'

function buildSteps(answers: OnboardingAnswers): StepKey[] {
  const base: StepKey[] = ['username', 'goal', 'level', 'days', 'duration', 'location']
  if (answers.gym_type === 'home_basic' || answers.gym_type === 'full_gym') {
    base.push('equipment')
  }
  return [...base, 'injuries', 'physical', 'generating']
}

const STORAGE_KEY = 'fitai_onboarding_v1'

// ─── Shared step props ────────────────────────────────────────────────────────

interface StepProps {
  answers: OnboardingAnswers
  update: <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) => void
  onNext: () => void
  onBack: () => void
  isFirst: boolean
}

// ─── Reusable UI atoms ────────────────────────────────────────────────────────

function OptionCard({
  selected, onClick, emoji, label, sublabel,
}: {
  selected: boolean; onClick: () => void
  emoji: string; label: string; sublabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border-2 px-5 py-4 transition-all duration-150',
        'flex items-center gap-4 active:scale-[0.98]',
        selected
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-border bg-muted/20 hover:border-border/80',
      )}
    >
      <span className="text-2xl leading-none flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground text-base leading-tight">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
      </div>
      <div className={cn(
        'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
        selected ? 'border-violet-500 bg-violet-500' : 'border-border',
      )}>
        {selected && <Check className="w-3 h-3 text-white" />}
      </div>
    </button>
  )
}

function ChipButton({
  selected, onClick, label,
}: {
  selected: boolean; onClick: () => void; label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 py-4 rounded-xl border-2 font-bold text-lg transition-all duration-150 active:scale-95',
        selected
          ? 'border-violet-500 bg-violet-500 text-white'
          : 'border-border bg-muted/20 text-muted-foreground hover:border-border/80',
      )}
    >
      {label}
    </button>
  )
}

// ─── Step shell (back btn + heading + CTA) ────────────────────────────────────

function StepShell({
  title, subtitle, children,
  onNext, onBack, canProceed, isFirst,
  ctaLabel = 'Continuar',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  onNext: () => void
  onBack: () => void
  canProceed: boolean
  isFirst: boolean
  ctaLabel?: string
}) {
  return (
    <div className="flex flex-col min-h-[calc(100vh-3rem)] px-5 pt-4 pb-10 max-w-md mx-auto w-full">
      {/* Back */}
      <div className="h-9 flex items-center">
        {!isFirst && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Atrás</span>
          </button>
        )}
      </div>

      {/* Heading */}
      <div className="mt-8 mb-7">
        <h2 className="text-[1.6rem] font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-muted-foreground text-sm mt-2 leading-relaxed">{subtitle}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1">{children}</div>

      {/* CTA */}
      <div className="mt-8">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className={cn(
            'w-full py-4 rounded-2xl font-bold text-base transition-all duration-150',
            canProceed
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] shadow-lg shadow-primary/20'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step0Username({ onNext, onBack, isFirst }: StepProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const reqId = useRef(0)

  useEffect(() => {
    setAvailable(null)
    const v = validateUsername(value)
    if (!v.ok) { setError(value ? v.error : null); setChecking(false); return }
    setError(null)
    setChecking(true)
    const id = ++reqId.current
    const t = setTimeout(async () => {
      const res = await checkUsernameAvailable(v.value)
      if (id !== reqId.current) return
      setAvailable(res.available)
      if (!res.available) setError(res.error ?? 'Ese nombre de usuario ya está en uso.')
      setChecking(false)
    }, 350)
    return () => clearTimeout(t)
  }, [value])

  const canProceed = available === true && !checking && !saving

  async function handleNext() {
    setSaving(true)
    const res = await updateUsername(value)
    setSaving(false)
    if (res.ok) onNext()
    else setError(res.error)
  }

  return (
    <StepShell
      title="Elige tu nombre de usuario"
      subtitle="Así te encontrarán y verán tu perfil. Podrás cambiarlo más adelante."
      isFirst={isFirst} onNext={handleNext} onBack={onBack}
      canProceed={canProceed}
      ctaLabel={saving ? 'Guardando…' : 'Continuar'}
    >
      <div className="space-y-2">
        <div className="flex items-center rounded-xl border-2 border-border bg-muted/20 px-4">
          <span className="text-muted-foreground">@</span>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            autoFocus
            autoCapitalize="none"
            maxLength={20}
            placeholder="tu_usuario"
            className="h-12 flex-1 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          {checking && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {!checking && available === true && <Check className="h-4 w-4 text-green-500" />}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && available === true && <p className="text-xs text-green-500">Disponible</p>}
      </div>
    </StepShell>
  )
}

function Step1Goal({ answers, update, onNext, onBack, isFirst }: StepProps) {
  const options = [
    { value: 'lose_weight',       emoji: '🔥', label: 'Perder grasa',   sublabel: 'Reducir grasa corporal' },
    { value: 'build_muscle',      emoji: '💪', label: 'Ganar músculo',  sublabel: 'Hipertrofia y volumen' },
    { value: 'gain_strength',     emoji: '⚡', label: 'Ganar fuerza',   sublabel: 'Levantar más peso' },
    { value: 'stay_active',       emoji: '✨', label: 'Mantenerme',     sublabel: 'Fitness general y salud' },
    { value: 'improve_endurance', emoji: '🏃', label: 'Resistencia',    sublabel: 'Cardio y aguante' },
  ]
  return (
    <StepShell
      title="¿Cuál es tu objetivo principal?"
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={answers.goal !== null}
    >
      <div className="space-y-3">
        {options.map(o => (
          <OptionCard key={o.value} selected={answers.goal === o.value}
            onClick={() => update('goal', o.value)} {...o} />
        ))}
      </div>
    </StepShell>
  )
}

function Step2Level({ answers, update, onNext, onBack, isFirst }: StepProps) {
  const options = [
    { value: 'beginner',     emoji: '🌱', label: 'Principiante', sublabel: 'Menos de 6 meses entrenando' },
    { value: 'intermediate', emoji: '🔄', label: 'Intermedio',   sublabel: 'Entre 6 meses y 2 años' },
    { value: 'advanced',     emoji: '🏆', label: 'Avanzado',     sublabel: 'Más de 2 años' },
  ]
  return (
    <StepShell
      title="¿Cuál es tu nivel de experiencia?"
      subtitle="Esto calibra la intensidad de tus rutinas."
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={answers.fitness_level !== null}
    >
      <div className="space-y-3">
        {options.map(o => (
          <OptionCard key={o.value} selected={answers.fitness_level === o.value}
            onClick={() => update('fitness_level', o.value)} {...o} />
        ))}
      </div>
    </StepShell>
  )
}

function Step3Days({ answers, update, onNext, onBack, isFirst }: StepProps) {
  return (
    <StepShell
      title="¿Cuántos días puedes entrenar?"
      subtitle="Por semana. La consistencia importa más que la frecuencia."
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={answers.days_per_week !== null}
    >
      <div className="flex gap-2.5">
        {[2, 3, 4, 5, 6].map(d => (
          <ChipButton key={d} selected={answers.days_per_week === d}
            onClick={() => update('days_per_week', d)} label={String(d)} />
        ))}
      </div>
      {answers.days_per_week !== null && (
        <p className="text-muted-foreground text-sm text-center mt-4">
          {answers.days_per_week} días por semana
        </p>
      )}
    </StepShell>
  )
}

function Step4Duration({ answers, update, onNext, onBack, isFirst }: StepProps) {
  const options = [
    { value: 30, label: '30 min' },
    { value: 45, label: '45 min' },
    { value: 60, label: '1 hora' },
    { value: 90, label: '1h 30' },
  ]
  return (
    <StepShell
      title="¿Cuánto tiempo tienes por sesión?"
      subtitle="Incluyendo calentamiento y vuelta a la calma."
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={answers.session_duration !== null}
    >
      <div className="grid grid-cols-2 gap-3">
        {options.map(o => (
          <button key={o.value} type="button"
            onClick={() => update('session_duration', o.value)}
            className={cn(
              'py-6 rounded-2xl border-2 font-bold text-xl transition-all duration-150 active:scale-95',
              answers.session_duration === o.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-muted/20 text-muted-foreground hover:border-border/80',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </StepShell>
  )
}

function Step5Location({ answers, update, onNext, onBack, isFirst }: StepProps) {
  const options = [
    { value: 'home_no_equipment', emoji: '🏠', label: 'Casa sin equipo',   sublabel: 'Solo peso corporal' },
    { value: 'home_basic',        emoji: '🏋️', label: 'Casa con básicos',  sublabel: 'Mancuernas, bandas, etc.' },
    { value: 'full_gym',          emoji: '🏟️', label: 'Gimnasio completo', sublabel: 'Acceso a todo el equipo' },
  ]
  return (
    <StepShell
      title="¿Dónde entrenas?"
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={answers.gym_type !== null}
    >
      <div className="space-y-3">
        {options.map(o => (
          <OptionCard key={o.value} selected={answers.gym_type === o.value}
            onClick={() => {
              update('gym_type', o.value)
              if (o.value === 'home_no_equipment') update('equipment', [])
            }}
            {...o}
          />
        ))}
      </div>
    </StepShell>
  )
}

const EQUIPMENT_OPTIONS = [
  { value: 'dumbbells',        label: 'Mancuernas',   emoji: '🏋️' },
  { value: 'barbell',          label: 'Barra',        emoji: '⚖️' },
  { value: 'bench',            label: 'Banco',        emoji: '🪑' },
  { value: 'kettlebell',       label: 'Kettlebell',   emoji: '🫧' },
  { value: 'resistance_bands', label: 'Bandas',       emoji: '🌀' },
  { value: 'cable_machine',    label: 'Polea/Cable',  emoji: '🔗' },
  { value: 'pull_up_bar',      label: 'Dominadas',    emoji: '🏗️' },
  { value: 'trx',              label: 'TRX',          emoji: '🎯' },
]

function Step6Equipment({ answers, update, onNext, onBack, isFirst }: StepProps) {
  const toggle = (v: string) => {
    const next = answers.equipment.includes(v)
      ? answers.equipment.filter(e => e !== v)
      : [...answers.equipment, v]
    update('equipment', next)
  }
  const count = answers.equipment.length
  return (
    <StepShell
      title="¿Qué equipo tienes disponible?"
      subtitle="Selecciona todo lo que tengas. Puedes actualizar esto más adelante."
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={true}
      ctaLabel={count > 0 ? `Continuar (${count} seleccionados)` : 'Continuar sin equipo extra'}
    >
      <div className="grid grid-cols-2 gap-2.5">
        {EQUIPMENT_OPTIONS.map(eq => {
          const sel = answers.equipment.includes(eq.value)
          return (
            <button key={eq.value} type="button" onClick={() => toggle(eq.value)}
              className={cn(
                'py-4 px-3 rounded-xl border-2 transition-all duration-150 active:scale-95',
                'flex flex-col items-center gap-1.5',
                sel ? 'border-primary bg-primary/10' : 'border-border bg-muted/20 hover:border-border/80',
              )}
            >
              <span className="text-2xl">{eq.emoji}</span>
              <span className={cn('text-xs font-medium text-center leading-tight',
                sel ? 'text-primary' : 'text-muted-foreground')}>
                {eq.label}
              </span>
            </button>
          )
        })}
      </div>
    </StepShell>
  )
}

function Step7Injuries({ answers, update, onNext, onBack, isFirst }: StepProps) {
  return (
    <StepShell
      title="¿Tienes alguna lesión o limitación?"
      subtitle="Opcional. Si hay algo que debamos tener en cuenta al diseñar tu plan, cuéntanos."
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={true}
      ctaLabel={answers.injuries.trim() ? 'Continuar' : 'Sin lesiones, continuar'}
    >
      <div className="space-y-3">
        <textarea
          value={answers.injuries}
          onChange={e => update('injuries', e.target.value)}
          placeholder="Ej: Dolor de rodilla izquierda, evitar sentadillas profundas. Lesión de hombro derecho..."
          rows={5}
          className={cn(
            'w-full rounded-xl border-2 border-border bg-muted/20 px-4 py-3',
            'text-foreground placeholder:text-muted-foreground/40 text-sm leading-relaxed resize-none',
            'focus:outline-none focus:border-primary/50 transition-colors',
          )}
        />
        <p className="text-xs text-muted-foreground/50">
          Solo se usa para personalizar tu plan y no se comparte con nadie.
        </p>
      </div>
    </StepShell>
  )
}

function Step8Physical({ answers, update, onNext, onBack, isFirst }: StepProps) {
  const genders = [
    { value: 'male',   label: 'Hombre' },
    { value: 'female', label: 'Mujer' },
    { value: 'other',  label: 'Otro' },
  ]
  const isValid = answers.age !== '' && answers.weight_kg !== '' && answers.height_cm !== '' && answers.gender !== null

  const inputClass = cn(
    'w-full rounded-xl border-2 border-border bg-muted/20 px-4 py-3.5',
    'text-foreground placeholder:text-muted-foreground/40 text-base',
    'focus:outline-none focus:border-primary/50 transition-colors',
  )

  return (
    <StepShell
      title="Tus datos físicos"
      subtitle="Usados solo para personalizar tu plan. No se muestran ni comparten."
      isFirst={isFirst} onNext={onNext} onBack={onBack}
      canProceed={isValid}
    >
      <div className="space-y-5">
        {/* Gender */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Sexo</label>
          <div className="flex gap-2">
            {genders.map(g => (
              <ChipButton key={g.value} selected={answers.gender === g.value}
                onClick={() => update('gender', g.value)} label={g.label} />
            ))}
          </div>
        </div>

        {/* Age */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Edad</label>
          <div className="relative">
            <input type="number" min={13} max={100}
              value={answers.age} onChange={e => update('age', e.target.value)}
              placeholder="25" className={inputClass} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-sm">años</span>
          </div>
        </div>

        {/* Weight + Height */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Peso</label>
            <div className="relative">
              <input type="number" min={30} max={300}
                value={answers.weight_kg} onChange={e => update('weight_kg', e.target.value)}
                placeholder="70" className={cn(inputClass, 'pr-10')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs">kg</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Altura</label>
            <div className="relative">
              <input type="number" min={100} max={250}
                value={answers.height_cm} onChange={e => update('height_cm', e.target.value)}
                placeholder="175" className={cn(inputClass, 'pr-10')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs">cm</span>
            </div>
          </div>
        </div>
      </div>
    </StepShell>
  )
}

const AUTO_GENERATION_MSGS = [
  'Guardando tu perfil...',
  'Seleccionando ejercicios compatibles...',
  'Diseñando tu primera semana...',
  'Preparando tu dashboard...',
]

function Step9GeneratingAuto({ onFinish }: { onFinish: () => Promise<GeneratePlanResult> }) {
  const [msgIdx, setMsgIdx] = useState(0)
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const startedRef = useRef(false)
  const onFinishRef = useRef(onFinish)
  useEffect(() => { onFinishRef.current = onFinish })

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    setStatus('loading')
    setError(null)
    setMsgIdx(0)

    let idx = 0
    const interval = setInterval(() => {
      idx++
      if (idx < AUTO_GENERATION_MSGS.length) {
        setMsgIdx(idx)
      } else {
        clearInterval(interval)
      }
    }, 1600)

    onFinishRef.current()
      .then(result => {
        if (result.success) return
        clearInterval(interval)
        setStatus('error')
        setError(result.error ?? 'No pudimos generar tu plan ahora.')
      })
      .catch(err => {
        clearInterval(interval)
        setStatus('error')
        setError(err instanceof Error ? err.message : 'No pudimos generar tu plan ahora.')
      })

    return () => {
      clearInterval(interval)
    }
  }, [retryNonce])

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-primary/30 bg-primary/10">
          <Dumbbell className="h-10 w-10 text-primary" />
        </div>

        <h2 className="mb-3 text-2xl font-bold text-foreground">Tu perfil se guardó</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          No pudimos generar el plan ahora. Puedes reintentarlo sin perder tus datos.
        </p>

        {error && (
          <p className="mt-4 max-w-sm rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            startedRef.current = false
            setRetryNonce(value => value + 1)
          }}
          className="mt-8 w-full max-w-sm rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 active:scale-[0.98]"
        >
          Reintentar generación
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <motion.div
        animate={{ scale: [1, 1.06, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        className="mb-10"
      >
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-primary/30 bg-primary/10">
          <Dumbbell className="h-12 w-12 text-primary" />
        </div>
      </motion.div>

      <h2 className="mb-3 text-2xl font-bold text-foreground">Preparando tu primer plan</h2>

      <AnimatePresence mode="wait">
        <motion.p
          key={msgIdx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className="text-base text-muted-foreground"
        >
          {AUTO_GENERATION_MSGS[msgIdx]}
        </motion.p>
      </AnimatePresence>

      <div className="mt-10 flex gap-2">
        {AUTO_GENERATION_MSGS.map((_, i) => (
          <motion.div
            key={i}
            animate={{ opacity: i <= msgIdx ? 1 : 0.2, scale: i === msgIdx ? 1.3 : 1 }}
            transition={{ duration: 0.2 }}
            className={cn('h-2 w-2 rounded-full', i <= msgIdx ? 'bg-primary' : 'bg-border')}
          />
        ))}
      </div>
    </div>
  )
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-28%' : '28%', opacity: 0 }),
}

// ─── Wizard controller ────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const router = useRouter()
  const [answers, setAnswers] = useState<OnboardingAnswers>(defaultAnswers)
  const [stepKey, setStepKey] = useState<StepKey>('username')
  const [direction, setDirection] = useState<1 | -1>(1)
  const [hydrated, setHydrated] = useState(false)

  // Rehydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { answers: OnboardingAnswers; step: StepKey }
        if (saved.answers) setAnswers(saved.answers)
        if (saved.step && saved.step !== 'generating') setStepKey(saved.step)
      }
    } catch { /* corrupt data — start fresh */ }
    setHydrated(true)
  }, [])

  // Persist on every change
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, step: stepKey }))
  }, [answers, stepKey, hydrated])

  const steps = buildSteps(answers)
  // slice(0,-1) keeps StepKey[] type (avoids narrowing to Exclude<StepKey,'generating'>[])
  const contentSteps = steps.slice(0, -1) as StepKey[]
  const currentIdx = steps.indexOf(stepKey)
  const contentIdx = contentSteps.indexOf(stepKey)

  const progress = stepKey === 'generating'
    ? 100
    : contentSteps.length > 1
      ? (contentIdx / (contentSteps.length - 1)) * 100
      : 0

  function goNext() {
    const next = steps[currentIdx + 1]
    if (next) { setDirection(1); setStepKey(next) }
  }

  function goBack() {
    const prev = steps[currentIdx - 1]
    if (prev) { setDirection(-1); setStepKey(prev) }
  }

  function update<K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) {
    setAnswers(prev => ({ ...prev, [k]: v }))
  }

  const handleFinish = useCallback(async () => {
    try {
      await saveOnboardingAnswers(answers)
    } catch (err) {
      console.error('Error saving onboarding:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'No pudimos guardar tu perfil.',
      }
    }

    const result = await generatePlan({ mode: 'initial' })

    if (result.success) {
      localStorage.removeItem(STORAGE_KEY)
      window.dispatchEvent(new Event('fitai:navigation-start'))
      router.replace('/dashboard')
      router.refresh()
    }

    return result
  }, [answers, router])

  if (!hydrated) return null

  const stepProps: StepProps = {
    answers, update, onNext: goNext, onBack: goBack,
    isFirst: currentIdx === 0,
  }

  const stepMap: Record<StepKey, React.ReactNode> = {
    username:   <Step0Username  {...stepProps} />,
    goal:       <Step1Goal      {...stepProps} />,
    level:      <Step2Level     {...stepProps} />,
    days:       <Step3Days      {...stepProps} />,
    duration:   <Step4Duration  {...stepProps} />,
    location:   <Step5Location  {...stepProps} />,
    equipment:  <Step6Equipment {...stepProps} />,
    injuries:   <Step7Injuries  {...stepProps} />,
    physical:   <Step8Physical  {...stepProps} />,
    generating: <Step9GeneratingAuto onFinish={handleFinish} />,
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">

      {/* Progress bar — sticky, not fixed (stays part of flow) */}
      {stepKey !== 'generating' && (
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
          <div className="h-0.5 bg-border">
            <motion.div
              className="h-full bg-primary"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-center gap-1.5 px-5 pt-2.5 pb-1.5">
            {contentSteps.map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  width: i === contentIdx ? 20 : 6,
                  opacity: i <= contentIdx ? 1 : 0.25,
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn(
                  'h-1.5 rounded-full',
                  i <= contentIdx ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Step with slide animation */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={stepKey}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        >
          {stepMap[stepKey]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
