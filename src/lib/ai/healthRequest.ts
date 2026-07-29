const HEALTH_PATTERN =
  /dolor|duele|dol[ií]a|lesi[oó]n|molestia|mareo|desmayo|cirug|m[eé]dic|pain|injury/i

export function isHealthChangeRequest(request: string): boolean {
  return HEALTH_PATTERN.test(request)
}
