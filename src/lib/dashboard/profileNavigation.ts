export function resolveDashboardProfileHref({
  communityEnabled,
  username,
}: {
  communityEnabled: boolean
  username: string | null
}): `/u/${string}` | null {
  return communityEnabled && username ? `/u/${username}` : null
}
