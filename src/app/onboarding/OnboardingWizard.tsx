'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Dumbbell, Loader2, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { generatePlan } from '@/app/actions/generatePlan'
import { AvailabilityStage } from '@/components/onboarding/AvailabilityStage'
import { ConfirmationStage } from '@/components/onboarding/ConfirmationStage'
import { EquipmentStage } from '@/components/onboarding/EquipmentStage'
import {
  ONBOARDING_STORAGE_KEY,
  canContinueStage,
  hydrateOnboardingState,
  nextStage,
  previousStage,
  requiresProfessionalClearance,
  runManualStart,
  serializeOnboardingState,
  stageProgress,
  type OnboardingStageId,
} from '@/components/onboarding/onboardingStages'
import { ProfileStage } from '@/components/onboarding/ProfileStage'
import { SafetyStage } from '@/components/onboarding/SafetyStage'
import { runAutomaticOnboarding, type AutomaticOnboardingOutcome } from '@/components/onboarding/onboardingWorkflow'
import { cn } from '@/lib/utils'
import { saveOnboardingAnswers } from './actions'
import { defaultAnswers, type OnboardingAnswers } from './types'

const GENERATION_MESSAGES = [
  'Guardando tu perfil…',
  'Seleccionando ejercicios compatibles…',
  'Diseñando tu primera semana…',
  'Preparando tu panel…',
]

type AutomaticFailure = Extract<AutomaticOnboardingOutcome, { phase: 'save_error' | 'generation_error' }>

function GeneratingState({ onFinish }: { onFinish: () => Promise<AutomaticOnboardingOutcome> }) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [failure, setFailure] = useState<AutomaticFailure | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const startedRef = useRef(false)
  const onFinishRef = useRef(onFinish)

  useEffect(() => {
    onFinishRef.current = onFinish
  }, [onFinish])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    setFailure(null)
    setMessageIndex(0)

    let index = 0
    const interval = window.setInterval(() => {
      index += 1
      if (index < GENERATION_MESSAGES.length) setMessageIndex(index)
      else window.clearInterval(interval)
    }, 1600)

    onFinishRef.current()
      .then(outcome => {
        if (outcome.phase !== 'success') {
          window.clearInterval(interval)
          setFailure(outcome)
        }
      })
      .catch(reason => {
        window.clearInterval(interval)
        setFailure({
          phase: 'generation_error',
          error: reason instanceof Error ? reason.message : 'No pudimos generar tu plan ahora.',
        })
      })

    return () => window.clearInterval(interval)
  }, [retryNonce])

  if (failure) {
    const saveFailed = failure.phase === 'save_error'
    return (
      <main className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-3xl border-2 border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-300" aria-hidden="true" />
        </span>
        <h1 className="mt-7 text-3xl font-bold text-foreground">{saveFailed ? 'No pudimos guardar tu perfil' : 'Tu perfil se guardó'}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          {saveFailed
            ? 'Tus respuestas siguen guardadas en este dispositivo. Revisa tu conexión y vuelve a intentarlo.'
            : 'No pudimos generar el plan ahora. Puedes reintentarlo sin perder tus datos.'}
        </p>
        <p role="alert" className="mt-5 w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-base text-foreground">{failure.error}</p>
        <button
          type="button"
          onClick={() => {
            startedRef.current = false
            setRetryNonce(value => value + 1)
          }}
          className="mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-base font-bold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
        >
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          {saveFailed ? 'Reintentar guardado' : 'Reintentar generación'}
        </button>
      </main>
    )
  }

  const progress = ((messageIndex + 1) / GENERATION_MESSAGES.length) * 100

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl flex-col items-center justify-center px-5 py-12 text-center">
      <span className="relative grid h-24 w-24 place-items-center rounded-3xl border-2 border-violet-500/30 bg-violet-500/10">
        <Dumbbell className="h-12 w-12 text-violet-600 dark:text-violet-300" aria-hidden="true" />
        <Loader2 className="absolute -right-2 -top-2 h-8 w-8 animate-spin text-fuchsia-500 motion-reduce:animate-none" aria-hidden="true" />
      </span>
      <p className="mt-8 text-base font-semibold text-primary">Paso 5 de 5 completado</p>
      <h1 className="mt-2 text-3xl font-bold text-foreground">Preparando tu primer plan</h1>
      <p className="mt-3 min-h-7 text-base leading-7 text-muted-foreground" aria-live="polite">{GENERATION_MESSAGES[messageIndex]}</p>
      <div
        className="mt-8 h-2 w-full overflow-hidden rounded-full bg-violet-950/15 dark:bg-violet-100/15"
        role="progressbar"
        aria-label="Progreso de generación del plan"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-4 flex gap-2" aria-hidden="true">
        {GENERATION_MESSAGES.map((_, index) => (
          <span key={index} className={cn('h-2.5 w-2.5 rounded-full', index <= messageIndex ? 'bg-violet-600' : 'bg-border')} />
        ))}
      </div>
    </main>
  )
}

export default function OnboardingWizard() {
  const router = useRouter()
  const [answers, setAnswers] = useState<OnboardingAnswers>(defaultAnswers)
  const [stage, setStage] = useState<OnboardingStageId>('profile')
  const [safetyReviewed, setSafetyReviewed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (raw) {
      const saved = hydrateOnboardingState(raw)
      setAnswers(saved.answers)
      setStage(saved.stage)
      setSafetyReviewed(saved.safetyReviewed)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(ONBOARDING_STORAGE_KEY, serializeOnboardingState(answers, stage, safetyReviewed))
  }, [answers, hydrated, safetyReviewed, stage])

  function update<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) {
    setAnswers(previous => ({ ...previous, [key]: value }))
    if (stage === 'safety') setSafetyReviewed(false)
    setSubmissionError(null)
  }

  function goNext() {
    const next = nextStage(stage)
    if (next) {
      if (stage === 'safety') setSafetyReviewed(true)
      setStage(next)
    }
  }

  function goBack() {
    const previous = previousStage(stage)
    if (previous && previous !== 'generating') setStage(previous)
  }

  function startAutomaticGeneration() {
    if (
      stage !== 'confirmation' ||
      !safetyReviewed ||
      !canContinueStage('confirmation', answers) ||
      requiresProfessionalClearance(answers)
    ) return
    setSubmissionError(null)
    setStage('generating')
  }

  const handleAutomaticFinish = useCallback(async (): Promise<AutomaticOnboardingOutcome> => {
    const outcome = await runAutomaticOnboarding(
      answers,
      saveOnboardingAnswers,
      () => generatePlan({ mode: 'initial' }),
    )

    if (outcome.phase === 'success') {
      localStorage.removeItem(ONBOARDING_STORAGE_KEY)
      window.dispatchEvent(new Event('fitai:navigation-start'))
      router.replace('/dashboard')
      router.refresh()
    }

    return outcome
  }, [answers, router])

  async function handleManualStart() {
    setSubmissionError(null)
    if (!safetyReviewed) {
      setStage('safety')
      return
    }
    try {
      await runManualStart(answers, saveOnboardingAnswers, () => {
        localStorage.removeItem(ONBOARDING_STORAGE_KEY)
        router.replace('/plan')
        router.refresh()
      })
    } catch (reason) {
      console.error('Error saving onboarding:', reason)
      setSubmissionError(reason instanceof Error ? reason.message : 'No pudimos guardar tu perfil.')
    }
  }

  if (!hydrated) return null

  const progress = stageProgress(stage)
  const commonProps = {
    answers,
    update,
    current: progress.current,
    total: progress.total,
    onBack: goBack,
    onNext: goNext,
  }

  switch (stage) {
    case 'profile':
      return <ProfileStage {...commonProps} />
    case 'availability':
      return <AvailabilityStage {...commonProps} />
    case 'equipment':
      return <EquipmentStage {...commonProps} />
    case 'safety':
      return <SafetyStage {...commonProps} />
    case 'confirmation':
      return (
        <ConfirmationStage
          answers={answers}
          update={update}
          current={progress.current}
          total={progress.total}
          onBack={goBack}
          onAutomatic={startAutomaticGeneration}
          onManual={handleManualStart}
          submissionError={submissionError}
        />
      )
    case 'generating':
      return <GeneratingState onFinish={handleAutomaticFinish} />
  }
}
