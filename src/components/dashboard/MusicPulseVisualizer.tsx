import type { CSSProperties } from 'react'

import { buildMusicBarPhases } from './musicVisuals'

type MusicPulseVisualizerProps = {
  playing: boolean
  positionMs: number | null
  seed: number
}

type MusicBarStyle = CSSProperties & {
  '--vekira-music-bar-level': number
  '--vekira-music-bar-delay': string
}

function pausedBarLevel(phase: number, positionMs: number): number {
  const wave = (Math.sin(positionMs / 310 + phase * Math.PI * 2) + 1) / 2
  return Number((0.24 + wave * 0.7).toFixed(3))
}

function finitePositionMs(positionMs: number | null): number {
  return positionMs !== null && Number.isFinite(positionMs)
    ? Math.max(0, positionMs)
    : 0
}

export function MusicPulseVisualizer({ playing, positionMs, seed }: MusicPulseVisualizerProps) {
  const phases = buildMusicBarPhases(seed)
  const safePositionMs = finitePositionMs(positionMs)

  return (
    <div
      aria-hidden="true"
      data-music-visualizer="true"
      data-playing={playing ? 'true' : 'false'}
      className="flex h-3.5 items-end gap-[3px]"
    >
      {phases.map((phase, index) => {
        const level = pausedBarLevel(phase, safePositionMs)
        const delayMs = -Math.round((phase * 760 + safePositionMs) % 760)
        const style: MusicBarStyle = {
          '--vekira-music-bar-level': level,
          '--vekira-music-bar-delay': `${delayMs}ms`,
        }

        return (
          <span
            key={index}
            data-music-bar="true"
            data-bar-level={level}
            data-playing={playing ? 'true' : 'false'}
            className="vekira-music-bar h-full w-[3px] origin-bottom rounded-full bg-violet-300"
            style={style}
          />
        )
      })}
    </div>
  )
}
