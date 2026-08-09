import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

type SignupRequest = {
  method(): string
  postDataJSON(): unknown
}

type ExpectedSignup = {
  locale: 'es' | 'en'
  email: string
  password: string
}

export function assertRegistrationSignupRequest(
  request: SignupRequest,
  expected: ExpectedSignup,
): void {
  assert.equal(request.method(), 'POST', 'Supabase signup must use POST')
  const body = request.postDataJSON() as Record<string, unknown>
  assert.deepEqual(Object.keys(body).sort(), [
    'code_challenge',
    'code_challenge_method',
    'data',
    'email',
    'gotrue_meta_security',
    'password',
  ])
  assert.equal(body.email, expected.email)
  assert.equal(body.password, expected.password)
  assert.deepEqual(body.data, { preferred_language: expected.locale })
  assert.deepEqual(body.gotrue_meta_security, {})
  assert.match(String(body.code_challenge), /^[A-Za-z0-9_-]{32,128}$/)
  assert.equal(body.code_challenge_method, 's256')
}

export async function mockRegistrationEmailBoundary(
  page: Page,
  expected: ExpectedSignup,
): Promise<{ assertRequest(): Promise<void> }> {
  // Supabase email delivery is external and its OTP cannot be observed by the
  // browser test. Intercept only the signup boundary and return the normal
  // unconfirmed-user shape; all form and verification UI behavior stays real.
  let requestFailure: unknown
  let markRequestHandled!: () => void
  const requestHandled = new Promise<void>(resolve => { markRequestHandled = resolve })

  await page.route('**/auth/v1/signup**', async route => {
    const now = new Date().toISOString()
    try {
      assertRegistrationSignupRequest(route.request(), expected)
    } catch (error) {
      requestFailure = error
      markRequestHandled()
      await route.abort('failed')
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-4000-8000-000000000006',
          aud: 'authenticated',
          role: 'authenticated',
          email: expected.email,
          phone: '',
          confirmation_sent_at: now,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { preferred_language: expected.locale },
          identities: [{
            identity_id: '00000000-0000-4000-8000-000000000006',
            id: '00000000-0000-4000-8000-000000000006',
            user_id: '00000000-0000-4000-8000-000000000006',
            identity_data: { email: expected.email },
            provider: 'email',
            created_at: now,
            updated_at: now,
          }],
          created_at: now,
          updated_at: now,
        },
      }),
    })
    markRequestHandled()
  })

  return {
    async assertRequest() {
      await requestHandled
      if (requestFailure) throw requestFailure
    },
  }
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
}

/** Verifies the customer sees a professional prescription as read-only. */
export async function expectProfessionalPlanReadOnly(page: Page): Promise<void> {
  await expect(page.getByText('Asignada por entrenador', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Acciones del plan')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajustar plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Regenerar semana', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compartir rutina', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Editar estructura', exact: true })).toHaveCount(0)
  await expect(page.getByText('Agregar ejercicio', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Empezar entrenamiento', exact: true })).toBeVisible()
  await expect(page.getByText(/solo lectura/i)).toBeVisible()
}

export async function expectLandingContract(
  page: Page,
  landing: { locale: 'es' | 'en'; h1: string; cta: string },
): Promise<void> {
  const h1 = page.locator('h1')
  await expect(h1).toHaveCount(1)
  await expect(h1).toHaveText(landing.h1)
  await expect(page.getByRole('link', { name: landing.cta, exact: true }).first())
    .toHaveAttribute('href', `/register?locale=${landing.locale}`)
  await expect(page.locator('link[rel="canonical"]'))
    .toHaveAttribute('href', new RegExp(`/${landing.locale}$`))
}
