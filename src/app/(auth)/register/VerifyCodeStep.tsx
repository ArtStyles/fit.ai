'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import {
  normalizeCode,
  validateCode,
  getVerifyErrorMessage,
  getResendErrorMessage,
} from './verification'

const RESEND_COOLDOWN_SECONDS = 45

export function VerifyCodeStep({ email }: { email: string }) {
  const router = useRouter()
  const { showToast } = useToast()
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
      setError(validationError)
      return
    }

    setVerifying(true)
    const supabase = createClient()
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })

    if (verifyError) {
      const message = getVerifyErrorMessage(verifyError.message)
      setError(message)
      showToast({ title: 'No se pudo verificar', description: message, variant: 'error' })
      setVerifying(false)
      return
    }

    showToast({
      title: 'Cuenta verificada',
      description: 'Completa tu perfil para generar tu primer plan.',
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.push('/onboarding')
    router.refresh()
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return
    setError(null)
    setResending(true)

    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email })

    if (resendError) {
      const message = getResendErrorMessage(resendError.message)
      showToast({ title: 'No se pudo reenviar', description: message, variant: 'error' })
      setResending(false)
      return
    }

    setResending(false)
    setCooldown(RESEND_COOLDOWN_SECONDS)
    showToast({
      title: 'Código reenviado',
      description: `Enviamos un nuevo código a ${email}.`,
      variant: 'success',
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
        <div>
          <p className="text-sm font-semibold text-foreground">Verifica tu correo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enviamos un código de 6 dígitos a <span className="font-medium text-foreground">{email}</span>.
            Caduca en 10 minutos.
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
          <label
            htmlFor="otp_code"
            className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Código de verificación
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
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(normalizeCode(e.target.value))}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'otp-error' : undefined}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-center text-lg font-semibold tracking-[0.5em] text-foreground placeholder:tracking-[0.5em] placeholder:text-muted-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
          />
        </div>

        <button
          type="submit"
          disabled={verifying}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold text-white tracking-wide transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
          {verifying ? 'Verificando...' : 'Verificar y continuar'}
        </button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="font-semibold text-indigo-400 transition-colors hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-muted-foreground/60"
        >
          {cooldown > 0 ? `Reenviar código en ${cooldown}s` : 'Reenviar código'}
        </button>

        <PendingLink
          href="/login"
          className="inline-flex items-center font-semibold text-muted-foreground transition-colors hover:text-foreground"
          spinnerClassName="h-3.5 w-3.5"
        >
          Volver a iniciar sesión
        </PendingLink>
      </div>
    </div>
  )
}
