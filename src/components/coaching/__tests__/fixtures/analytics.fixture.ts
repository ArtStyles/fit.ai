export async function trackEvent(name: string, properties: Record<string, unknown>): Promise<void> {
  const target = window as Window & { __COACH_ANALYTICS_EVENTS__?: Array<{ name: string; properties: Record<string, unknown> }> }
  target.__COACH_ANALYTICS_EVENTS__ ??= []
  target.__COACH_ANALYTICS_EVENTS__.push({ name, properties })
}
