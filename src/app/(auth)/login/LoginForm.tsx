'use client'

import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { VerifyCodeStep } from '../register/VerifyCodeStep'
import { isEmailNotConfirmedError } from './authError'

type LoginFieldErrors = {
  email?: string
  password?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateLogin(email: string, password: string): LoginFieldErrors {
  const errors: LoginFieldErrors = {}

  if (!email) {
    errors.email = 'Escribe tu correo.'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Escribe un correo válido.'
  }

  if (!password) {
    errors.password = 'Escribe tu contraseña.'
  }

  return errors
}

function getLoginErrorMessage(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesión.'
  }

  if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }

  return 'No se pudo iniciar sesión. Revisa tus datos e intenta nuevamente.'
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null

  return (
    <p id={id} className="text-xs text-red-400">
      {message}
    </p>
  )
}

export function LoginForm() {
  const { showToast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim().toLowerCase()
    const password = String(fd.get('password') ?? '')
    const validationErrors = validateLogin(email, password)

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setError('Revisa los campos marcados.')
      showToast({
        title: 'Datos incompletos',
        description: 'Corrige el formulario antes de continuar.',
        variant: 'error',
      })
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error && isEmailNotConfirmedError(error)) {
      setLoading(false)
      setVerifyEmail(email)
      showToast({
        title: 'Verificación pendiente',
        description: 'Ingresa el código enviado a tu correo para activar tu cuenta.',
        variant: 'info',
      })
      return
    }

    if (error) {
      const message = getLoginErrorMessage(error.message)
      setError(message)
      showToast({
        title: 'No se pudo iniciar sesión',
        description: message,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    showToast({
      title: 'Sesión iniciada',
      description: 'Cargando tu panel.',
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    window.location.assign('/dashboard')
  }

  if (verifyEmail) {
    return <VerifyCodeStep email={verifyEmail} />
  }

  return (
    <form onSubmit={handleSubmit} method="post" noValidate className="space-y-5">
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          disabled={loading}
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="tu@email.com"
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
        />
        <FieldError id="login-email-error" message={fieldErrors.email} />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Contraseña
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPass ? 'text' : 'password'}
            required
            disabled={loading}
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            disabled={loading}
            aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <FieldError id="login-password-error" message={fieldErrors.password} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold text-white tracking-wide transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <PendingLink
          href="/register"
          className="inline-flex items-center font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
          spinnerClassName="h-3.5 w-3.5"
        >
          Crear cuenta
        </PendingLink>
      </p>
    </form>
  )
}
