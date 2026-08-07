/**
 * Wait for the final database exposed by the Supabase PostgreSQL image.
 * Container health excludes its temporary initialization server; the probe
 * then confirms the Supabase auth schema and API roles are available.
 *
 * @param {{
 *   inspectHealth: () => string,
 *   probeFinalDatabase: () => { ok: boolean, diagnostic: string },
 *   wait: (milliseconds: number) => void,
 *   now?: () => number,
 *   timeoutMs?: number,
 *   pollIntervalMs?: number,
 * }} options
 * @returns {{ health: string, diagnostic: string }}
 */
export function waitForFinalDatabase({
  inspectHealth,
  probeFinalDatabase,
  wait,
  now = Date.now,
  timeoutMs = 90_000,
  pollIntervalMs = 500,
}) {
  const deadline = now() + timeoutMs
  let lastHealth = 'unknown'
  let lastProbe = 'not attempted while container health is not healthy'

  while (now() < deadline) {
    lastHealth = inspectHealth()

    if (lastHealth === 'healthy') {
      const probe = probeFinalDatabase()
      lastProbe = probe.diagnostic
      if (probe.ok) {
        return { health: lastHealth, diagnostic: lastProbe }
      }
    }

    const remainingMs = deadline - now()
    if (remainingMs > 0) wait(Math.min(pollIntervalMs, remainingMs))
  }

  throw new Error(
    `final PostgreSQL database did not become ready within ${timeoutMs}ms `
    + `(health=${lastHealth}, probe=${lastProbe})`,
  )
}
