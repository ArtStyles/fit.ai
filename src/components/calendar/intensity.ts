import { intensityLevel, type IntensityThresholds } from '@/lib/calendar/aggregate'

export type CellLevel = 0 | 1 | 2 | 3 | 4

const LEVEL_CLASS: Record<CellLevel, string> = {
  0: 'border border-border/40 bg-transparent',
  1: 'bg-violet-500/20',
  2: 'bg-violet-500/40',
  3: 'bg-violet-500/65',
  4: 'bg-violet-500/90 shadow-[0_0_8px_rgba(139,92,246,0.45)]',
}

/** Nivel 0 cuando no hay registro (volumeKg === null); 1..4 para días entrenados. */
export function levelFor(volumeKg: number | null, thresholds: IntensityThresholds): CellLevel {
  if (volumeKg === null) return 0
  return intensityLevel(volumeKg, thresholds)
}

export function intensityClass(level: CellLevel): string {
  return LEVEL_CLASS[level]
}
