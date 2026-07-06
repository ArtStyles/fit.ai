'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/feedback/ToastProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { AppLanguage } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { VerifyCodeStep } from './VerifyCodeStep'
import { registrationLegalLinks, signupMetadata } from './registerProfile'

type RegisterFieldErrors = {
  email?: string
  password?: string
}

type RegisterCopy = {
  emailLabel: string
  emailPlaceholder: string
  passwordLabel: string
  passwordPlaceholder: string
  passwordRequirements: string
  passwordLength: string
  passwordLetter: string
  passwordNumber: string
  showPassword: string
  hidePassword: string
  emailRequired: string
  emailInvalid: string
  passwordRequired: string
  passwordMissing: string
  existingAccount: string
  passwordRejected: string
  signupDisabled: string
  tooManyAttempts: string
  genericError: string
  reviewFields: string
  incompleteTitle: string
  incompleteDescription: string
  createErrorTitle: string
  existingTitle: string
  checkEmailTitle: string
  checkEmailDescription: string
  createdTitle: string
  createdDescription: string
  creating: string
  createAccount: string
  legalPrefix: string
  terms: string
  legalJoin: string
  privacy: string
  setupHint: string
  accountQuestion: string
  signIn: string
}

const COPY: Record<AppLanguage, RegisterCopy> = {
  es: {
    emailLabel: 'Correo electrónico',
    emailPlaceholder: 'tu@email.com',
    passwordLabel: 'Contraseña',
    passwordPlaceholder: 'Mínimo 8 caracteres',
    passwordRequirements: 'Requisitos de contraseña',
    passwordLength: '8 caracteres',
    passwordLetter: 'Una letra',
    passwordNumber: 'Un número',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
    emailRequired: 'Escribe tu correo.',
    emailInvalid: 'Escribe un correo válido.',
    passwordRequired: 'Crea una contraseña.',
    passwordMissing: 'La contraseña necesita',
    existingAccount: 'Ya existe una cuenta con este correo. Intenta iniciar sesión.',
    passwordRejected: 'La contraseña no cumple los requisitos mínimos.',
    signupDisabled: 'El registro está desactivado temporalmente.',
    tooManyAttempts: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    genericError: 'No se pudo crear la cuenta. Intenta nuevamente.',
    reviewFields: 'Revisa los campos marcados.',
    incompleteTitle: 'Datos incompletos',
    incompleteDescription: 'Corrige el formulario antes de crear la cuenta.',
    createErrorTitle: 'No se pudo crear la cuenta',
    existingTitle: 'Cuenta existente',
    checkEmailTitle: 'Revisa tu correo',
    checkEmailDescription: 'Te enviamos un código de 8 dígitos para confirmar tu cuenta.',
    createdTitle: 'Cuenta creada',
    createdDescription: 'Completa tu perfil para generar tu primer plan.',
    creating: 'Creando cuenta...',
    createAccount: 'Crear cuenta',
    legalPrefix: 'Al crear tu cuenta, aceptas los',
    terms: 'Términos de uso',
    legalJoin: 'y confirmas que has leído la',
    privacy: 'Política de privacidad',
    setupHint: 'Después podrás ajustar objetivo, equipo disponible y días de entrenamiento.',
    accountQuestion: '¿Ya tienes cuenta?',
    signIn: 'Iniciar sesión',
  },
  en: {
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    passwordRequirements: 'Password requirements',
    passwordLength: '8 characters',
    passwordLetter: 'One letter',
    passwordNumber: 'One number',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    emailRequired: 'Enter your email.',
    emailInvalid: 'Enter a valid email.',
    passwordRequired: 'Create a password.',
    passwordMissing: 'Your password needs',
    existingAccount: 'An account already exists for this email. Try signing in.',
    passwordRejected: 'The password does not meet the minimum requirements.',
    signupDisabled: 'Registration is temporarily unavailable.',
    tooManyAttempts: 'Too many attempts. Wait a moment and try again.',
    genericError: 'We could not create the account. Try again.',
    reviewFields: 'Review the highlighted fields.',
    incompleteTitle: 'Incomplete information',
    incompleteDescription: 'Correct the form before creating your account.',
    createErrorTitle: 'Could not create account',
    existingTitle: 'Account already exists',
    checkEmailTitle: 'Check your email',
    checkEmailDescription: 'We sent an 8-digit code to confirm your account.',
    createdTitle: 'Account created',
    createdDescription: 'Complete your profile to generate your first plan.',
    creating: 'Creating account...',
    createAccount: 'Create account',
    legalPrefix: 'By creating your account, you agree to the',
    terms: 'Terms of use',
    legalJoin: 'and acknowledge the',
    privacy: 'Privacy policy',
    setupHint: 'You can set your goal, available equipment, and training days next.',
    accountQuestion: 'Already have an account?',
    signIn: 'Sign in',
  },
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordRules(password: string, copy: RegisterCopy) {
  return [
    { id: 'length', label: copy.passwordLength, valid: password.length >= 8 },
    { id: 'letter', label: copy.passwordLetter, valid: /[A-Za-z]/.test(password) },
    { id: 'number', label: copy.passwordNumber, valid: /[0-9]/.test(password) },
  ]
}

function validateRegister(
  { email, password }: { email: string; password: string },
  copy: RegisterCopy,
): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {}

  if (!email) {
    errors.email = copy.emailRequired
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = copy.emailInvalid
  }

  const missingRules = passwordRules(password, copy).filter(rule => !rule.valid)
  if (!password) {
    errors.password = copy.passwordRequired
  } else if (missingRules.length > 0) {
    errors.password = `${copy.passwordMissing}: ${missingRules.map(rule => rule.label.toLowerCase()).join(', ')}.`
  }

  return errors
}

function getRegisterErrorMessage(message: string, copy: RegisterCopy) {
  const normalized = message.toLowerCase()

  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return copy.existingAccount
  }
  if (normalized.includes('invalid') && normalized.includes('email')) return copy.emailInvalid
  if (normalized.includes('password')) return copy.passwordRejected
  if (normalized.includes('signup') && normalized.includes('disabled')) return copy.signupDisabled
  if (normalized.includes('rate limit') || normalized.includes('too many')) return copy.tooManyAttempts

  return copy.genericError
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null

  return <p id={id} className="text-xs text-red-400">{message}</p>
}

function PasswordChecklist({ password, copy }: { password: string; copy: RegisterCopy }) {
  const rules = passwordRules(password, copy)

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {copy.passwordRequirements}
      </p>
      <ul className="grid gap-1.5">
        {rules.map(rule => (
          <li
            key={rule.id}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              rule.valid ? 'text-green-400' : 'text-muted-foreground',
            )}
          >
            <CheckCircle2 aria-hidden="true" className={cn('h-3.5 w-3.5', !rule.valid && 'opacity-35')} />
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PasswordToggleButton({
  visible,
  disabled,
  onClick,
  copy,
}: {
  visible: boolean
  disabled: boolean
  onClick: () => void
  copy: RegisterCopy
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={visible ? copy.hidePassword : copy.showPassword}
      className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {visible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
    </button>
  )
}

export function RegisterForm({ locale }: { locale: AppLanguage }) {
  const router = useRouter()
  const { showToast } = useToast()
  const copy = COPY[locale]
  const legalLinks = registrationLegalLinks(locale)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({})
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setLoading(true)

    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim().toLowerCase()
    const validationErrors = validateRegister({ email, password }, copy)

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      setError(copy.reviewFields)
      showToast({
        title: copy.incompleteTitle,
        description: copy.incompleteDescription,
        variant: 'error',
      })
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: signupMetadata(locale) },
    })

    if (signupError) {
      const message = getRegisterErrorMessage(signupError.message, copy)
      setError(message)
      showToast({ title: copy.createErrorTitle, description: message, variant: 'error' })
      setLoading(false)
      return
    }

    if (data.user?.identities && data.user.identities.length === 0) {
      setError(copy.existingAccount)
      showToast({ title: copy.existingTitle, description: copy.existingAccount, variant: 'error' })
      setLoading(false)
      return
    }

    if (!data.session) {
      setVerifyEmail(email)
      showToast({
        title: copy.checkEmailTitle,
        description: copy.checkEmailDescription,
        variant: 'success',
      })
      setLoading(false)
      return
    }

    showToast({ title: copy.createdTitle, description: copy.createdDescription, variant: 'success' })
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.push('/onboarding')
    router.refresh()
  }

  if (verifyEmail) {
    return <VerifyCodeStep email={verifyEmail} locale={locale} />
  }

  return (
    <form onSubmit={handleSubmit} method="post" noValidate className="space-y-4">
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {copy.emailLabel}
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
          placeholder={copy.emailPlaceholder}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
          className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
        />
        <FieldError id="register-email-error" message={fieldErrors.email} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {copy.passwordLabel}
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPass ? 'text' : 'password'}
            required
            disabled={loading}
            autoComplete="new-password"
            placeholder={copy.passwordPlaceholder}
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'register-password-error register-password-help' : 'register-password-help'}
            className="flex h-11 w-full rounded-md border border-input bg-muted/30 px-3 py-2 pr-12 text-base text-foreground placeholder:text-muted-foreground/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
          />
          <PasswordToggleButton
            visible={showPass}
            disabled={loading}
            onClick={() => setShowPass(value => !value)}
            copy={copy}
          />
        </div>
        <FieldError id="register-password-error" message={fieldErrors.password} />
        <div id="register-password-help">
          <PasswordChecklist password={password} copy={copy} />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-indigo-600 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
        {loading ? copy.creating : copy.createAccount}
      </button>

      <p className="text-center text-xs leading-6 text-muted-foreground">
        {copy.legalPrefix}{' '}
        <Link
          href={legalLinks.terms}
          className="inline-flex min-h-11 items-center rounded-md font-semibold text-indigo-300 underline decoration-indigo-400/60 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          {copy.terms}
        </Link>{' '}
        {copy.legalJoin}{' '}
        <Link
          href={legalLinks.privacy}
          className="inline-flex min-h-11 items-center rounded-md font-semibold text-indigo-300 underline decoration-indigo-400/60 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        >
          {copy.privacy}
        </Link>.
      </p>

      <p className="text-center text-xs leading-5 text-muted-foreground">
        {copy.setupHint}
      </p>

      <p className="text-center text-sm text-muted-foreground">
        {copy.accountQuestion}{' '}
        <PendingLink
          href="/login"
          className="inline-flex min-h-11 items-center rounded-md font-semibold text-indigo-400 transition-colors hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          spinnerClassName="h-3.5 w-3.5"
        >
          {copy.signIn}
        </PendingLink>
      </p>
    </form>
  )
}
