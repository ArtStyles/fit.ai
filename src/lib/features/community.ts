export type CommunityEnvironment = { COMMUNITY_ENABLED?: string }

export function isCommunityEnabled(
  env: CommunityEnvironment = process.env as CommunityEnvironment,
): boolean {
  return env.COMMUNITY_ENABLED === 'true'
}

export function communityUnavailableResult(): { ok: false; error: 'Comunidad no esta disponible.' } {
  return { ok: false, error: 'Comunidad no esta disponible.' }
}
