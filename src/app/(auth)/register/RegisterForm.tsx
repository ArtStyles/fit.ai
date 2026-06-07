'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import { VerifyCodeStep } from './VerifyCodeStep'

type RegisterFieldErrors = {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordRules(password: string) {
  return [
    { id: 'length', label: '8 caracteres', valid: password.length >= 8 },
    { id: 'letter', label: 'Una letra', valid: /[A-Za-z]/.test(password) },
    { id: 'number', label: 'Un número', valid: /[0-9]/.test(password) },
  ]
}

function validateRegister({
  fullName,
  email,
  password,
  confirmPassword,
}: {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {}

  if (!fullName) {
    errors.fullName = 'Escribe tu nombre.'
  } else if (fullName.length < 2) {
    errors.fullName = 'El nombre debe tener al menos 2 caracteres.'
  }

  if (!email) {
    errors.email = 'Escribe tu correo.'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Escribe un correo válido.'
  }

  const missingRules = passwordRules(password).filter(rule => !rule.valid)
  if (!password) {
    errors.password = 'Crea una contraseña.'
  } else if (missingRules.length > 0) {
    errors.password = `La contraseña necesita: ${missingRules.map(rule => rule.label.toLowerCase()).join(', ')}.`
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Confirma tu contraseña.'
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.'
  }

  return errors
}

function getRegisterErrorMessage(message: string) {
  const normalized = message.toLowerCase()

  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return 'Ya existe una cuenta con este correo. Intenta iniciar sesión.'
  }

  if (normalized.includes('invalid') && normalized.includes('email')) {
    return 'Escribe un correo válido.'
  }

  if (normalized.includes('password')) {
    return 'La contraseña no cumple los requisitos mínimos.'
  }

  if (normalized.includes('signup') && normalized.includes('disabled')) {
    return 'El registro está desactivado temporalmente.'
  }

  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
  }

  return 'No se pudo crear la cuenta. Intenta nuevamente.'
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null

  return (
    <p id={id} className="text-xs text-red-400">
      {message}
    </p>
  )
}

function PasswordChecklist({ password }: { password: string }) {
  const rules = passwordRules(password)

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        Requisitos de contraseña
      </p>
      <div className="grid gap-1.5">
        {rules.map(rule => (
          <div
            key={rule.id}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              rule.valid ? 'text-green-400' : 'text-muted-foreground',
            )}
          >
            <CheckCircle2 className={cn('h-3.5 w-3.5', !rule.valid && 'opacity-35')} />
            {rule.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function PasswordToggleButton({
  visible,
  disabled,
  onClick,
}: {
  visible: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )
}

export function RegisterForm() {
  const router = useRouter()
  const { showToast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const fullName = String(fd.get('full_name') ?? '').trim().replace(/\s+/g, ' ')
    const email = String(fd.get('email') ?? '').trim().toLowerCase()
    const validationErrors = validateRegister({
      fullName,
      email,
      password,
      confirmPassword,
    })

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setError('Revisa los campos marcados.')
      showToast({
        title: 'Datos incompletos',
        description: 'Corrige el formulario antes de crear la cuenta.',
        variant: 'error',
      })
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    })

    if (error) {
      const message = getRegisterErrorMessage(error.message)
      setError(message)
      showToast({
        title: 'No se pudo crear la cuenta',
        description: message,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    if (data.user?.identities && data.user.identities.length === 0) {
      const message = 'Ya existe una cuenta con este correo. Intenta iniciar sesión.'
      setError(message)
      showToast({
        title: 'Cuenta existente',
        description: message,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    if (!data.session) {
      setVerifyEmail(email)
      showToast({
        title: 'Revisa tu correo',
        description: 'Te enviamos un código de 8 dígitos para confirmar tu cuenta.',
        variant: 'success',
      })
      setLoading(false)
      return
    }

    showToast({
      title: 'Cuenta creada',
      description: 'Completa tu perfil para generar tu primer plan.',
      variant: 'success',
    })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.push('/onboarding')
    router.refresh()
  }

  if (verifyEmail) {
    return <VerifyCodeStep email={verifyEmail} />
  }

  return (
    <form onSubmit={handleSubmit} method="post" noValidate className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="full_name"
          className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Nombre completo
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          disabled={loading}
          autoComplete="name"
          placeholder="Juan García"
          aria-invalid={Boolean(fieldErrors.fullName)}
          aria-describedby={fieldErrors.fullName ? 'register-name-error' : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
        />
        <FieldError id="register-name-error" message={fieldErrors.fullName} />
      </div>

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
          aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
        />
        <FieldError id="register-email-error" message={fieldErrors.email} />
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
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'register-password-error' : 'register-password-help'}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
          />
          <PasswordToggleButton
            visible={showPass}
            disabled={loading}
            onClick={() => setShowPass(v => !v)}
          />
        </div>
        <FieldError id="register-password-error" message={fieldErrors.password} />
        <div id="register-password-help">
          <PasswordChecklist password={password} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirm_password"
          className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Confirmar contraseña
        </label>
        <div className="relative">
          <input
            id="confirm_password"
            name="confirm_password"
            type={showConfirm ? 'text' : 'password'}
            required
            disabled={loading}
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-error' : undefined}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
          />
          <PasswordToggleButton
            visible={showConfirm}
            disabled={loading}
            onClick={() => setShowConfirm(v => !v)}
          />
        </div>
        <FieldError id="register-confirm-error" message={fieldErrors.confirmPassword} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold text-white tracking-wide transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>

      <p className="text-center text-xs text-muted-foreground/70">
        Después podrás ajustar objetivo, equipo disponible y días de entrenamiento.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <PendingLink
          href="/login"
          className="inline-flex items-center font-semibold text-indigo-400 transition-colors hover:text-indigo-300"
          spinnerClassName="h-3.5 w-3.5"
        >
          Iniciar sesión
        </PendingLink>
      </p>
    </form>
  )
}
