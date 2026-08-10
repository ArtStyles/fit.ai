import { cleanupE2EAccountFromEnvironment } from '../../scripts/seed-e2e-account'
import { createTrainerE2EAdminClient } from './helpers/core-product'
import { assertTrainerSecurityRemoteReady } from './helpers/trainer-marketplace'

type GlobalTeardownDependencies = {
  cleanupGeneral: () => Promise<boolean>
  preflightSecurity: () => Promise<void>
  log: (message: string) => void
}

export async function runGlobalTeardown(
  dependencies: GlobalTeardownDependencies,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  if (env.E2E_TRAINER_SECURITY_ENABLED === 'true') {
    try {
      await dependencies.preflightSecurity()
    } catch {
      dependencies.log('Trainer security preflight blocked security-fixture cleanup; general E2E cleanup will continue.')
    }
  }
  const deleted = await dependencies.cleanupGeneral()
  dependencies.log(deleted
    ? 'E2E account-scoped data reset and auth user removed.'
    : 'No run-specific E2E auth user remained to remove.')
}

export default async function globalTeardown(): Promise<void> {
  await runGlobalTeardown({
    cleanupGeneral: () => cleanupE2EAccountFromEnvironment(process.env),
    preflightSecurity: () => assertTrainerSecurityRemoteReady(createTrainerE2EAdminClient()),
    log: console.log,
  }, process.env)
}
