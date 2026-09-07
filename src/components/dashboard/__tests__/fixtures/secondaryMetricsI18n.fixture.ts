export function useI18n() {
  return {
    language: 'es' as const,
    t: (source: string) => source,
  }
}
