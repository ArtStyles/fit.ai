type SupportEnvironment = Record<string, string | undefined>

export function requiredSupportEmail(
  environment: SupportEnvironment = process.env,
): string {
  const email = environment.NEXT_PUBLIC_SUPPORT_EMAIL?.trim()

  if (!email) {
    throw new Error('NEXT_PUBLIC_SUPPORT_EMAIL is required')
  }

  return email
}
