'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { trackEvent } from '@/lib/analytics/events'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { AppLanguage } from '@/lib/i18n'
import {
  normalizeCode,
  validateCode,
  getVerifyErrorMessage,
  getResendErrorMessage,
} from './verification'
import { resendRegistrationCode, verifyRegistrationCode } from './authFlow'

const RESEND_COOLDOWN_SECONDS = 45

const COPY = {
  es: {
    title: 'Verifica tu correo',
    sent: 'Enviamos un código de 8 dígitos a',
    expiry: 'Caduca en 10 minutos.',
    label: 'Código de verificación',
    verifying: 'Verificando...',
    verify: 'Verificar y continuar',
    verifyErrorTitle: 'No se pudo verificar',
    verifiedTitle: 'Cuenta verificada',
    verifiedDescription: 'Completa tu perfil para generar tu primer plan.',
    resendErrorTitle: 'No se pudo reenviar',
    resentTitle: 'Código reenviado',
    resentDescription: 'Enviamos un nuevo código a',
    resendIn: 'Reenviar código en',
    resend: 'Reenviar código',
    back: 'Volver a iniciar sesión',
  },
  en: {
    title: 'Verify your email',
    sent: 'We sent an 8-digit code to',
    expiry: 'It expires in 10 minutes.',
    label: 'Verification code',
    verifying: 'Verifying...',
    verify: 'Verify and continue',
    verifyErrorTitle: 'Could not verify',
    verifiedTitle: 'Account verified',
    verifiedDescription: 'Complete your profile to generate your first plan.',
    resendErrorTitle: 'Could not resend',
    resentTitle: 'Code resent',
    resentDescription: 'We sent a new code to',
    resendIn: 'Resend code in',
    resend: 'Resend code',
    back: 'Back to sign in',
  },
} as const

export function VerifyCodeStep({ email, locale = 'es' }: { email: string; locale?: AppLanguage }) {
  const router = useRouter()
  const { showToast } = useToast()
  const copy = COPY[locale]
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown(current => (current <= 1 ? 0 : current - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const validationError = validateCode(code)
    if (validationError) {
      setError(locale === 'es' ? validationError : 'Enter the 8-digit code.')
      return
    }

    setVerifying(true)
    const supabase = createClient()
    const result = await verifyRegistrationCode({
      verifyOtp: input => supabase.auth.verifyOtp(input),
      email,
      code,
      onVerified: href => {
        void trackEvent('signup_completed', {
          locale,
          screen: 'register',
          authenticated: true,
        })
        showToast({
          title: copy.verifiedTitle,
          description: copy.verifiedDescription,
          variant: 'success',
        })
        window.dispatchEvent(new Event('fitai:navigation-start'))
        router.push(href)
        router.refresh()
      },
    })

    if (result.kind === 'error') {
      const spanishMessage = getVerifyErrorMessage(result.message)
      const message = locale === 'es' ? spanishMessage : 'The code is invalid or expired. Request a new one and try again.'
      setError(message)
      showToast({ title: copy.verifyErrorTitle, description: message, variant: 'error' })
      setVerifying(false)
      return
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setError(null)
    setResending(true)

    const supabase = createClient()
    const result = await resendRegistrationCode({
      resend: input => supabase.auth.resend(input),
      email,
    })

    if (result.kind === 'error') {
      const spanishMessage = getResendErrorMessage(result.message)
      const message = locale === 'es' ? spanishMessage : 'Wait a moment before requesting another code.'
      setError(message)
      showToast({ title: copy.resendErrorTitle, description: message, variant: 'error' })
      setResending(false)
      return
    }

    setResending(false)
    setCooldown(RESEND_COOLDOWN_SECONDS)
    showToast({
      title: copy.resentTitle,
      description: `${copy.resentDescription} ${email}.`,
      variant: 'success',
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <MailCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {copy.sent}{' '}
            <span className="break-all font-medium text-foreground">{email}</span>. {copy.expiry}
          </p>
        </div>
      </div>

      <form onSubmit={handleVerify} noValidate className="space-y-4">
        {error && (
          <div id="otp-error" role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="otp_code" className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {copy.label}
          </label>
          <input
            id="otp_code"
            name="otp_code"
            type="text"
            required
            autoFocus
            disabled={verifying}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="00000000"
            value={code}
            onChange={event => setCode(normalizeCode(event.target.value))}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'otp-error' : undefined}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-center text-lg font-semibold tracking-[0.35em] text-foreground placeholder:tracking-[0.35em] placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70 sm:tracking-[0.5em] sm:placeholder:tracking-[0.5em]"
          />
        </div>

        <button
          type="submit"
          disabled={verifying}
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {verifying ? copy.verifying : copy.verify}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-md font-semibold text-indigo-400 transition-colors hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:text-muted-foreground/60"
        >
          {cooldown > 0 ? `${copy.resendIn} ${cooldown}s` : copy.resend}
        </button>

        <PendingLink
          href="/login"
          className="inline-flex min-h-11 items-center rounded-md font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          spinnerClassName="h-3.5 w-3.5"
        >
          {copy.back}
        </PendingLink>
      </div>
    </div>
  )
}
