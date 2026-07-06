import { expect, type Page } from '@playwright/test'
import {
  requireE2EConfig,
  seedE2EAccount,
} from '../../../scripts/seed-e2e-account'

function required(name: 'E2E_USER_EMAIL' | 'E2E_USER_PASSWORD'): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export async function signInAsE2EUser(page: Page): Promise<void> {
  const email = required('E2E_USER_EMAIL')
  const password = required('E2E_USER_PASSWORD')

  await page.goto('/login')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/(onboarding|dashboard)$/, { timeout: 30_000 })
}

export async function resetAndSignInAsE2EUser(page: Page): Promise<void> {
  // This executes in Playwright's Node process. The service role key is used
  // only by the seed client and is never passed to browser code or storage.
  await seedE2EAccount(requireE2EConfig(process.env))
  await signInAsE2EUser(page)
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 })
}
