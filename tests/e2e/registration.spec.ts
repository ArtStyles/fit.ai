import { expect, test } from '@playwright/test'
import { mockRegistrationEmailBoundary } from './helpers/acceptance'

test.describe.configure({ mode: 'serial' })

for (const registration of [
  {
    locale: 'es',
    emailLabel: 'Correo electrónico',
    passwordLabel: 'Contraseña',
    submit: 'Crear cuenta',
    verification: 'Verifica tu correo',
    codeLabel: 'Código de verificación',
    terms: { name: 'Términos de uso', href: '/es/terminos' },
    privacy: { name: 'Política de privacidad', href: '/es/privacidad' },
  },
  {
    locale: 'en',
    emailLabel: 'Email address',
    passwordLabel: 'Password',
    submit: 'Create account',
    verification: 'Check your email',
    codeLabel: 'Verification code',
    terms: { name: 'Terms of use', href: '/en/terms' },
    privacy: { name: 'Privacy policy', href: '/en/privacy' },
  },
] as const) {
  test(`${registration.locale} registration keeps the approved two-field verification flow`, async ({ page }) => {
    await mockRegistrationEmailBoundary(page, registration.locale)
    await page.goto(`/register?locale=${registration.locale}`)

    await expect(page.locator('html')).toHaveAttribute('lang', registration.locale)
    await expect(page.locator('form input:not([type="hidden"])')).toHaveCount(2)
    await expect(page.getByLabel(registration.emailLabel, { exact: true })).toHaveAttribute('required', '')
    await expect(page.getByLabel(registration.passwordLabel, { exact: true })).toHaveAttribute('required', '')
    await expect(page.getByRole('link', { name: registration.terms.name, exact: true }))
      .toHaveAttribute('href', registration.terms.href)
    await expect(page.getByRole('link', { name: registration.privacy.name, exact: true }))
      .toHaveAttribute('href', registration.privacy.href)

    await page.getByLabel(registration.emailLabel, { exact: true }).fill(`registration-${registration.locale}@example.test`)
    await page.getByLabel(registration.passwordLabel, { exact: true }).fill('E2E-registration-123!')
    await page.getByRole('button', { name: registration.submit, exact: true }).click()

    await expect(page.getByText(registration.verification, { exact: true })).toBeVisible()
    await expect(page.getByLabel(registration.codeLabel, { exact: true })).toBeVisible()
  })
}
