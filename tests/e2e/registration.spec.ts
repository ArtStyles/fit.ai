import { expect, test } from './fixtures'
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
    const email = `registration-${registration.locale}@example.test`
    const password = 'E2E-registration-123!'
    const signupBoundary = await mockRegistrationEmailBoundary(page, {
      locale: registration.locale,
      email,
      password,
    })
    await page.goto(`/register?locale=${registration.locale}`)

    await expect(page.locator('html')).toHaveAttribute('lang', registration.locale)
    const visibleControls = page.locator('form input:visible, form select:visible, form textarea:visible')
    await expect(visibleControls).toHaveCount(2)
    expect(await visibleControls.evaluateAll(controls => controls.map(control => ({
      tag: control.tagName.toLowerCase(),
      name: control.getAttribute('name'),
      type: control.getAttribute('type'),
      required: control.hasAttribute('required'),
    })))).toEqual([
      { tag: 'input', name: 'email', type: 'email', required: true },
      { tag: 'input', name: 'password', type: 'password', required: true },
    ])
    await expect(page.getByLabel(registration.emailLabel, { exact: true })).toHaveAttribute('required', '')
    await expect(page.getByLabel(registration.passwordLabel, { exact: true })).toHaveAttribute('required', '')
    await expect(page.getByRole('link', { name: registration.terms.name, exact: true }))
      .toHaveAttribute('href', registration.terms.href)
    await expect(page.getByRole('link', { name: registration.privacy.name, exact: true }))
      .toHaveAttribute('href', registration.privacy.href)

    await page.getByLabel(registration.emailLabel, { exact: true }).fill(email)
    await page.getByLabel(registration.passwordLabel, { exact: true }).fill(password)
    await page.getByRole('button', { name: registration.submit, exact: true }).click()
    await signupBoundary.assertRequest()

    await expect(page.getByText(registration.verification, { exact: true })).toBeVisible()
    await expect(page.getByLabel(registration.codeLabel, { exact: true })).toBeVisible()
  })
}
