import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('registration experience', () => {
  it('asks only for email and password before verification', () => {
    const form = source('../RegisterForm.tsx')
    const authFlow = source('../authFlow.ts')

    expect(form).not.toContain('name="full_name"')
    expect(form).not.toContain('name="confirm_password"')
    expect(form).toContain("fd.get('email')")
    expect(authFlow).toContain('signupMetadata(locale)')
  })

  it('has one page heading and replaces proof claims with product benefits', () => {
    const page = source('../page.tsx')

    const forbiddenClaims = [
      ['10', 'K+'].join(''),
      ['98', '%'].join(''),
      ['200', '+'].join(''),
      ['limited', ' seats'].join(''),
      ['plazas', ' limitadas'].join(''),
    ]

    expect(page.match(/<h1/g)).toHaveLength(1)
    expect(page).toContain('Semana adaptable')
    expect(page).toContain('Registro guiado')
    expect(page).toContain('Progresión visible')
    for (const claim of forbiddenClaims) expect(page.toLowerCase()).not.toContain(claim.toLowerCase())
  })

  it('keeps selected-plan early-access copy informational in both languages', () => {
    const page = source('../page.tsx')
    const earlyAccessBodies = Array.from(
      page.matchAll(/earlyAccessBody: '([^']+)'/g),
      match => match[1],
    )

    expect(earlyAccessBodies).toEqual([
      'Esta opción es informativa y no cambia el proceso de registro.',
      'This option is informational and does not change the registration process.',
    ])
    for (const body of earlyAccessBodies) {
      expect(body).not.toMatch(/registramos tu interés|recorded your interest|reserv(?:a|e|ed)|notific(?:a|ation|ied)/i)
    }
  })

  it('accepts the Pro beta interest plan from pricing', () => {
    const page = source('../page.tsx')

    expect(page).toContain("'pro-early-access'")
    expect(page).toContain('EARLY_ACCESS_PLANS.has(searchParams.plan)')
  })

  it('renders keyboard-accessible locale-aware legal links', () => {
    const form = source('../RegisterForm.tsx')

    expect(form).toContain('registrationLegalLinks(locale)')
    expect(form).toContain('href={legalLinks.privacy}')
    expect(form).toContain('href={legalLinks.terms}')
    expect(form).toContain('focus-visible:ring-2')
  })

  it('retains email verification and onboarding redirect behavior', () => {
    const form = source('../RegisterForm.tsx')
    const verification = source('../VerifyCodeStep.tsx')

    expect(form).toContain('setVerifyEmail(email)')
    expect(form).toContain('<VerifyCodeStep')
    expect(form).toContain('signUpForRegistration')
    expect(verification).toContain('verifyRegistrationCode')
    expect(verification).toContain('resendRegistrationCode')
  })
})

describe('localized legal routes', () => {
  it.each([
    ['../../../[locale]/privacidad/page.tsx', "expectedLocale=\"es\"", 'privacy'],
    ['../../../[locale]/privacy/page.tsx', "expectedLocale=\"en\"", 'privacy'],
    ['../../../[locale]/terminos/page.tsx', "expectedLocale=\"es\"", 'terms'],
    ['../../../[locale]/terms/page.tsx', "expectedLocale=\"en\"", 'terms'],
  ])('defines %s for its intended locale', (path, localeMarker, documentMarker) => {
    const page = source(path)

    expect(page).toContain(localeMarker)
    expect(page).toContain(`document="${documentMarker}"`)
  })

  it('documents the required public support-email setting', () => {
    expect(source('../../../../../.env.example')).toContain('NEXT_PUBLIC_SUPPORT_EMAIL=')
  })

  it('redirects the obsolete unlocalized privacy route', () => {
    expect(source('../../../privacy/page.tsx')).toContain("permanentRedirect('/es/privacidad')")
  })
})
