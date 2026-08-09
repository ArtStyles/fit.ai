import { cleanupE2EAccountFromEnvironment } from '../../scripts/seed-e2e-account'
import { createTrainerE2EAdminClient } from './helpers/core-product'
import { assertTrainerSecurityRemoteReady } from './helpers/trainer-marketplace'

export default async function globalTeardown(): Promise<void> {
  if (process.env.E2E_TRAINER_SECURITY_ENABLED === 'true') {
    try {
      await assertTrainerSecurityRemoteReady(createTrainerE2EAdminClient())
    } catch {
      console.log('Trainer security preflight blocked teardown before cleanup; no fixture write was attempted.')
      return
    }
  }
  const deleted = await cleanupE2EAccountFromEnvironment(process.env)
  console.log(deleted
    ? 'E2E account-scoped data reset and auth user removed.'
    : 'No run-specific E2E auth user remained to remove.')
}
