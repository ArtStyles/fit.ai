export const FITNESS_DATA_CHANGED = 'vekira:fitness-data-changed'

export function notifyFitnessDataChanged(target: EventTarget | null = typeof window === 'undefined' ? null : window) {
  target?.dispatchEvent(new Event(FITNESS_DATA_CHANGED))
}

export function watchFitnessDataChanged(listener: () => void, target: EventTarget | null = typeof window === 'undefined' ? null : window): () => void {
  if (!target) return () => {}
  target.addEventListener(FITNESS_DATA_CHANGED, listener)
  return () => target.removeEventListener(FITNESS_DATA_CHANGED, listener)
}
