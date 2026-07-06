import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('privacy-safe funnel instrumentation', () => {
  it('keeps the localized landing server-rendered and delegates approved CTA tracking', () => {
    const page = source('../../../app/[locale]/page.tsx')
    const tracker = source('../TrackPageView.tsx')

    expect(page.startsWith("'use client'")).toBe(false)
    expect(page).toContain("import { TrackPageView } from '@/components/analytics/TrackPageView'")
    expect(page).toContain('<TrackPageView locale={locale} />')
    expect(tracker).toContain("'use client'")
    expect(tracker).toContain("trackEvent('landing_view', { locale, screen: 'landing' })")
    expect(tracker).toContain("trackEvent('primary_cta_clicked', {")
    expect(tracker).toContain("source: 'landing'")
    expect(tracker).toContain("closest('a[href^=\"/register\"]')")
  })

  it('tracks signup completion for immediate sessions but not before required OTP', () => {
    const register = source('../../../app/(auth)/register/RegisterForm.tsx')
    const started = register.indexOf("trackEvent('signup_started', { locale, screen: 'register' })")
    const signup = register.indexOf('signUpForRegistration({')
    const completed = register.indexOf("trackEvent('signup_completed', {")
    const verificationBranch = register.slice(
      register.indexOf("if (result.kind === 'verification-required')"),
      register.indexOf('\n  }\n\n  if (verifyEmail)'),
    )

    expect(started).toBeGreaterThan(register.indexOf('if (Object.keys(validationErrors).length > 0)'))
    expect(signup).toBeGreaterThan(started)
    expect(completed).toBeGreaterThan(signup)
    expect(verificationBranch).not.toContain("trackEvent('signup_completed'")
    const payloads = Array.from(register.matchAll(/trackEvent\('[^']+', \{([\s\S]*?)\}\)/g))
      .map(match => match[1])
      .join('\n')
    expect(payloads).not.toMatch(/\bemail\b|\bpassword\b/)
  })

  it('wires signup completion only into the successful OTP callback', () => {
    const verify = source('../../../app/(auth)/register/VerifyCodeStep.tsx')
    const verifiedCallback = verify.slice(
      verify.indexOf('onVerified: href => {'),
      verify.indexOf('\n      },', verify.indexOf('onVerified: href => {')),
    )
    const resendHandler = verify.slice(
      verify.indexOf('async function handleResend()'),
      verify.indexOf('\n  return (', verify.indexOf('async function handleResend()')),
    )

    expect(verify).toContain("import { trackEvent } from '@/lib/analytics/events'")
    expect(verifiedCallback).toContain("trackEvent('signup_completed', {")
    expect(verifiedCallback).toContain("screen: 'register'")
    expect(verifiedCallback).toContain('authenticated: true')
    expect(resendHandler).not.toContain("trackEvent('signup_completed'")
  })

  it('tracks all five stage completions using stage identifiers only', () => {
    const wizard = source('../../../app/onboarding/OnboardingWizard.tsx')

    expect(wizard).toContain("trackEvent('onboarding_step_completed', {")
    expect(wizard).toContain('stage,')
    expect(wizard).toContain("stage: 'confirmation'")
    const payloads = Array.from(wizard.matchAll(/trackEvent\('[^']+', \{([\s\S]*?)\}\)/g))
      .map(match => match[1])
      .join('\n')
    expect(payloads).not.toMatch(/\banswers\b|\binjur(?:y|ies)\b|\bweight(?:_kg)?\b|\bheight(?:_cm)?\b|\bage\b|\bfull_name\b|\busername\b|\bselected_plan\b/)
  })

  it('tracks abandonment only on a hidden visibility transition while incomplete', () => {
    const wizard = source('../../../app/onboarding/OnboardingWizard.tsx')

    expect(wizard).toContain("document.addEventListener('visibilitychange'")
    expect(wizard).toContain("document.visibilityState !== 'hidden'")
    expect(wizard).toContain('completedRef.current')
    expect(wizard).not.toContain("addEventListener('beforeunload'")
    expect(wizard).not.toContain("addEventListener('pagehide'")
    expect(wizard).toContain("trackEvent('onboarding_abandoned', {")
  })

  it('tracks generated plans only inside the successful generation branch', () => {
    const wizard = source('../../../app/onboarding/OnboardingWizard.tsx')
    const success = wizard.indexOf("if (outcome.phase === 'success')")
    const generated = wizard.indexOf("trackEvent('plan_generated', {")
    const branchEnd = wizard.indexOf('\n    }', success)

    expect(success).toBeGreaterThan(-1)
    expect(generated).toBeGreaterThan(success)
    expect(generated).toBeLessThan(branchEnd)
  })
})
