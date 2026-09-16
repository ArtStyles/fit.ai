export const WEB_HANDOFF_PATHS = ['/coach/apply', '/coach/profile', '/chat', '/admin'] as const
export type WebHandoffPath = typeof WEB_HANDOFF_PATHS[number]

export function createWebHandoffUrl(path: string, origin?: string): string | null {
  if (!origin?.trim() || !WEB_HANDOFF_PATHS.includes(path as WebHandoffPath)) return null
  try {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return new URL(path, url).href
  } catch { return null }
}

export function configuredWebHandoff(path: WebHandoffPath): string | null {
  return createWebHandoffUrl(path, import.meta.env.VITE_WEB_APP_URL || import.meta.env.VITE_ACCOUNT_API_URL)
}
