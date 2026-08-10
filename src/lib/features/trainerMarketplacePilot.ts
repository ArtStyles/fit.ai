export type TrainerMarketplacePilotEnvironment = Record<string, string | undefined>

/** Exact fail-closed gate shared by the synthetic admin UI, E2E-only routes,
 * and the destructive browser fixture. Pilot exclusions are part of the gate:
 * widening the product surface must disable the fixture until the journey and
 * its safety contract are deliberately revised. */
export function isTrainerMarketplacePilotGateEnabled(
  env: TrainerMarketplacePilotEnvironment,
): boolean {
  return env.NODE_ENV !== 'production'
    && env.E2E_TRAINER_RELATIONSHIPS_ENABLED === 'true'
    && env.E2E_TRAINER_PROGRAMMING_ENABLED === 'true'
    && env.E2E_TRAINER_PROGRAMMING_RETENTION_ACK === 'dedicated-project-reset'
    && env.E2E_TRAINER_INSIGHTS_ENABLED === 'true'
    && env.E2E_TRAINER_SECURITY_ENABLED === 'true'
    && env.E2E_TRAINER_MARKETPLACE_ENABLED === 'true'
    && env.COMMUNITY_ENABLED === 'false'
    && env.TRAINER_PAYMENTS_ENABLED === 'false'
    && env.TRAINER_MESSAGING_ENABLED === 'false'
    && env.TRAINER_REVIEWS_ENABLED === 'false'
    && !env.STRIPE_SECRET_KEY
    && !env.STRIPE_WEBHOOK_SECRET
    && !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    && typeof env.E2E_RUN_ID === 'string'
    && env.E2E_RUN_ID.length > 0
}
