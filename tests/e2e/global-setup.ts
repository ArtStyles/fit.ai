import { requireE2EConfig } from '../../scripts/seed-e2e-account'

export default function globalSetup(): void {
  requireE2EConfig(process.env)
}
