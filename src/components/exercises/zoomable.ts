import type { ResolvedExerciseImage } from './resolveExerciseImage'

/**
 * Decide si una imagen debe ser ampliable (mostrar botón de zoom + overlay).
 * Solo cuando se pidió zoomable, hay imagen real y no falló la carga.
 */
export function canZoom(opts: {
  zoomable: boolean | undefined
  kind: ResolvedExerciseImage['kind']
  errored: boolean
}): boolean {
  return opts.zoomable === true && opts.kind === 'image' && !opts.errored
}
