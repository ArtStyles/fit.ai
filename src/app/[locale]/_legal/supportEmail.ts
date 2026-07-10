type SupportEnvironment = Record<string, string | undefined>

const FALLBACK_SUPPORT_EMAIL = 'soporte@vekira.app'

export function requiredSupportEmail(
  environment: SupportEnvironment = process.env,
): string {
  const email = environment.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()

  return email || FALLBACK_SUPPORT_EMAIL
}
