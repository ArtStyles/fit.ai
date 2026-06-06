export type ResolvedExerciseImage =
  | { kind: 'image'; src: string }
  | { kind: 'placeholder' }

/** Decide si renderizar la imagen real o el placeholder. */
export function resolveExerciseImage(src: string | null | undefined): ResolvedExerciseImage {
  if (typeof src === 'string' && src.trim().length > 0) {
    return { kind: 'image', src: src.trim() }
  }
  return { kind: 'placeholder' }
}
