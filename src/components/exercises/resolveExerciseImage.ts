export type ResolvedExerciseImage =
  | { kind: 'image'; src: string }
  | { kind: 'placeholder' }

/** Decide si renderizar la imagen real o el placeholder. */
export function resolveExerciseImage(src: string | null | undefined): ResolvedExerciseImage {
  const trimmed = typeof src === 'string' ? src.trim() : ''
  if (trimmed.length > 0) {
    return { kind: 'image', src: trimmed }
  }
  return { kind: 'placeholder' }
}
