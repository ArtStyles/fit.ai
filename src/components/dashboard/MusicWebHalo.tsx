import { buildMusicWebGeometry } from './musicVisuals'

type MusicWebHaloProps = {
  seed: number
}

export function MusicWebHalo({ seed }: MusicWebHaloProps) {
  const geometry = buildMusicWebGeometry(seed)

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 760 143"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
    >
      <g fill="none" stroke="rgb(255 255 255)" strokeLinecap="round">
        {geometry.spokes.map((spoke, index) => (
          <line
            key={`spoke-${index}`}
            data-music-web-spoke="true"
            x1={spoke.x1}
            y1={spoke.y1}
            x2={spoke.x2}
            y2={spoke.y2}
            opacity={spoke.opacity}
            strokeWidth="0.65"
          />
        ))}
      </g>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {geometry.rings.map((ring, index) => (
          <path
            key={`ring-${index}`}
            data-music-web-ring="true"
            d={ring.d}
            opacity={ring.opacity}
            stroke={ring.accent ? 'rgb(167 139 250)' : 'rgb(255 255 255)'}
            strokeWidth={ring.width}
            className={ring.accent ? 'vekira-music-web-accent' : undefined}
          />
        ))}
      </g>
    </svg>
  )
}
