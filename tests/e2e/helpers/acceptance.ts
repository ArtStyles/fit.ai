import { expect, type Page } from '@playwright/test'

export async function mockRegistrationEmailBoundary(
  page: Page,
  locale: 'es' | 'en',
): Promise<void> {
  // Supabase email delivery is external and its OTP cannot be observed by the
  // browser test. Intercept only the signup boundary and return the normal
  // unconfirmed-user shape; all form and verification UI behavior stays real.
  await page.route('**/auth/v1/signup**', async route => {
    const now = new Date().toISOString()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-4000-8000-000000000006',
          aud: 'authenticated',
          role: 'authenticated',
          email: `registration-${locale}@example.test`,
          phone: '',
          confirmation_sent_at: now,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { preferred_language: locale },
          identities: [{
            identity_id: '00000000-0000-4000-8000-000000000006',
            id: '00000000-0000-4000-8000-000000000006',
            user_id: '00000000-0000-4000-8000-000000000006',
            identity_data: { email: `registration-${locale}@example.test` },
            provider: 'email',
            created_at: now,
            updated_at: now,
          }],
          created_at: now,
          updated_at: now,
        },
      }),
    })
  })
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
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
