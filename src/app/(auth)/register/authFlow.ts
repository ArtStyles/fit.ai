import type { AppLanguage } from '@/lib/i18n'
import { signupMetadata } from './registerProfile'

type AuthError = { message: string }
type OnboardingPath = '/onboarding'

type SignUpCredentials = {
  email: string
  password: string
  options: { data: { preferred_language: AppLanguage } }
}

type SignUpResponse = {
  data: {
    user: { identities?: unknown[] } | null
    session: unknown | null
  }
  error: AuthError | null
}

type AuthResult =
  | { kind: 'error'; message: string }
  | { kind: 'duplicate' }
  | { kind: 'verification-required' }
  | { kind: 'authenticated' }

export async function signUpForRegistration({
  signUp,
  email,
  password,
  locale,
  onAuthenticated,
}: {
  signUp: (credentials: SignUpCredentials) => Promise<SignUpResponse>
  email: string
  password: string
  locale: AppLanguage
  onAuthenticated: (path: OnboardingPath) => void
}): Promise<AuthResult> {
  const { data, error } = await signUp({
    email,
    password,
    options: { data: signupMetadata(locale) },
  })

  if (error) return { kind: 'error', message: error.message }
  if (data.user?.identities && data.user.identities.length === 0) return { kind: 'duplicate' }
  if (!data.session) return { kind: 'verification-required' }

  onAuthenticated('/onboarding')
  return { kind: 'authenticated' }
}

type VerifyOtpInput = {
  email: string
  token: string
  type: 'signup'
}

export async function verifyRegistrationCode({
  verifyOtp,
  email,
  code,
  onVerified,
}: {
  verifyOtp: (input: VerifyOtpInput) => Promise<{ error: AuthError | null }>
  email: string
  code: string
  onVerified: (path: OnboardingPath) => void
}) {
  const { error } = await verifyOtp({ email, token: code, type: 'signup' })

  if (error) return { kind: 'error' as const, message: error.message }

  onVerified('/onboarding')
  return { kind: 'verified' as const }
}

type ResendInput = {
  type: 'signup'
  email: string
}

export async function resendRegistrationCode({
  resend,
  email,
}: {
  resend: (input: ResendInput) => Promise<{ error: AuthError | null }>
  email: string
}) {
  const { error } = await resend({ type: 'signup', email })

  return error
    ? { kind: 'error' as const, message: error.message }
    : { kind: 'resent' as const }
}
