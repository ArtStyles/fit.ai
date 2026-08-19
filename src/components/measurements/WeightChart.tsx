'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { MeasurementRow } from '@/app/actions/measurements'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale } from '@/lib/i18n'

const PAD = { top: 10, right: 8, bottom: 24, left: 34 }

function formatDate(iso: string, locale: string, timeZone: string, full = true): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(full ? { year: 'numeric' } : {}),
    timeZone,
  }).format(new Date(iso))
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
}

export function WeightChart({ data }: { data: MeasurementRow[] }) {
  const { language, timeZone, t } = useI18n()
  const locale = dateLocale(language)
  const gradientId = useId().replaceAll(':', '')
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: MeasurementRow } | null>(null)
  const points = [...data].reverse().filter(row => row.weight_kg !== null)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect.width
      if (nextWidth) setWidth(nextWidth)
    })
    observer.observe(element)
    setWidth(element.clientWidth || 320)
    return () => observer.disconnect()
  }, [])

  const height = 160
  const innerWidth = Math.max(1, width - PAD.left - PAD.right)
  const innerHeight = height - PAD.top - PAD.bottom
  const weights = points.map(point => point.weight_kg as number)
  const minimumWeight = weights.length ? Math.min(...weights) : 0
  const maximumWeight = weights.length ? Math.max(...weights) : 0
  const range = maximumWeight - minimumWeight || 1
  const denominator = Math.max(1, points.length - 1)
  const toX = (index: number) => PAD.left + (index / denominator) * innerWidth
  const toY = (weight: number) => PAD.top + innerHeight - ((weight - minimumWeight) / range) * innerHeight
  const coordinates = points.map((point, index) => ({
    x: toX(index),
    y: toY(point.weight_kg as number),
    point,
  }))

  const handleMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    if (mouseX < PAD.left || mouseX > PAD.left + innerWidth) {
      setTooltip(null)
      return
    }
    const index = Math.round(((mouseX - PAD.left) / innerWidth) * denominator)
    const coordinate = coordinates[Math.max(0, Math.min(points.length - 1, index))]
    if (coordinate) setTooltip({ x: coordinate.x, y: coordinate.y, row: coordinate.point })
  }, [coordinates, denominator, innerWidth, points.length])

  if (points.length < 2) {
    return (
      <div ref={ref} className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 px-6 text-center">
        <p className="text-xs text-muted-foreground">{t('Registra al menos 2 medidas para ver la gráfica')}</p>
      </div>
    )
  }

  const polyline = coordinates.map(coordinate => `${coordinate.x},${coordinate.y}`).join(' ')
  const area = `M${coordinates[0]!.x},${toY(minimumWeight)} ${coordinates.map(coordinate => `L${coordinate.x},${coordinate.y}`).join(' ')} L${coordinates.at(-1)!.x},${toY(minimumWeight)} Z`
  const yTicks = [minimumWeight, minimumWeight + range / 2, maximumWeight]
  const step = Math.max(1, Math.floor(points.length / 5))
  const xIndexes = Array.from({ length: points.length }, (_, index) => index)
    .filter(index => index === 0 || index === points.length - 1 || index % step === 0)
    .slice(0, 6)

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        role="img"
        aria-label={t('Evolución del peso')}
        onMouseMove={handleMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="text-violet-400" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" className="text-violet-400" stopColor="currentColor" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((value, index) => (
          <g key={index}>
            <line x1={PAD.left} x2={PAD.left + innerWidth} y1={toY(value)} y2={toY(value)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 4} y={toY(value) + 4} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
              {formatNumber(value, locale)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <polyline points={polyline} fill="none" className="stroke-violet-400" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {coordinates.map(coordinate => (
          <circle key={coordinate.point.id} cx={coordinate.x} cy={coordinate.y} r={3} className="fill-background stroke-violet-300" strokeWidth={2} />
        ))}

        {xIndexes.map(index => (
          <text key={points[index]!.id} x={toX(index)} y={height - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
            {formatDate(points[index]!.recorded_at, locale, timeZone, false)}
          </text>
        ))}

        {tooltip ? (
          <g>
            <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + innerHeight} className="stroke-violet-300" strokeWidth={1} strokeDasharray="4 3" />
            <circle cx={tooltip.x} cy={tooltip.y} r={5} className="fill-violet-500 stroke-foreground" strokeWidth={2} />
            <text x={Math.min(tooltip.x + 8, width - 90)} y={Math.max(tooltip.y - 8, 14)} className="fill-foreground" fontSize={11} fontWeight={600}>
              {formatNumber(tooltip.row.weight_kg as number, locale)} kg
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  )
}
