import { cleanupE2EAccountFromEnvironment } from '../../scripts/seed-e2e-account'

export default async function globalTeardown(): Promise<void> {
  const deleted = await cleanupE2EAccountFromEnvironment(process.env)
  console.log(deleted
    ? 'E2E account-scoped data reset and auth user removed.'
    : 'No run-specific E2E auth user remained to remove.')
}
