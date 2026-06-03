'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SparklineProps {
  /** Valores en orden cronológico (más antiguo → más reciente). Necesita ≥ 2 puntos. */
  data:         number[]
  width?:       number
  height?:      number
  strokeWidth?: number
  className?:   string
}

/**
 * Sparkline de área suave, sin dependencias (SVG inline).
 * El color sigue a `currentColor`: basta con poner una clase de texto en
 * `className` (p. ej. `text-emerald-400`) y tanto la línea como el relleno la heredan.
 */
export function Sparkline({
  data,
  width = 120,
  height = 34,
  strokeWidth = 2,
  className,
}: SparklineProps) {
  const gradientId = useId()
  if (data.length < 2) return null

  const pad   = strokeWidth + 1
  const min   = Math.min(...data)
  const max   = Math.max(...data)
  const span  = max - min || 1
  const stepX = (width - pad * 2) / (data.length - 1)

  const pts = data.map((value, i) => ({
    x: pad + i * stepX,
    y: pad + (height - pad * 2) * (1 - (value - min) / span),
  }))

  // Catmull-Rom → curva de Bézier cúbica para un trazo suave
  const line = pts.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x.toFixed(2)},${p.y.toFixed(2)}`
    const p0    = arr[i - 1]
    const pPrev = arr[i - 2] ?? p0
    const pNext = arr[i + 1] ?? p
    const c1x = p0.x + (p.x - pPrev.x) / 6
    const c1y = p0.y + (p.y - pPrev.y) / 6
    const c2x = p.x - (pNext.x - p0.x) / 6
    const c2y = p.y - (pNext.y - p0.y) / 6
    return `${acc} C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }, '')

  const area = `${line} L ${pts[pts.length - 1].x.toFixed(2)},${height - pad} L ${pts[0].x.toFixed(2)},${height - pad} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-full w-full overflow-visible', className)}
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={line}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
