'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { TrendingUp, ChevronDown } from 'lucide-react'
import { getExerciseProgressionData, type ProgressionPoint } from '@/app/actions/progression'
import type { TrackedExercise } from '@/app/actions/progression'

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type Timeframe = '30d' | '3m' | 'all'

interface Props {
  exercises: TrackedExercise[]
}

// ─── Helpers de datos ──────────────────────────────────────────────────────────

function filterByTimeframe(data: ProgressionPoint[], tf: Timeframe): ProgressionPoint[] {
  if (tf === 'all') return data
  const now = Date.now()
  const ms  = tf === '30d' ? 30 * 86400_000 : 90 * 86400_000
  return data.filter(p => now - new Date(p.date).getTime() <= ms)
}

function formatDate(iso: string, all: boolean): string {
  const d = new Date(iso)
  if (all) return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : kg.toFixed(1)
}

// ─── Mini chart SVG ────────────────────────────────────────────────────────────

const PAD = { top: 12, right: 12, bottom: 28, left: 38 }

function ProgressionChart({ data, timeframe }: { data: ProgressionPoint[]; timeframe: Timeframe }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth]         = useState(320)
  const [tooltip, setTooltip]     = useState<{ x: number; y: number; point: ProgressionPoint } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const HEIGHT   = 180
  const innerW   = width  - PAD.left - PAD.right
  const innerH   = HEIGHT - PAD.top  - PAD.bottom

  const weights  = data.map(p => p.maxWeightKg)
  const minW     = Math.min(...weights)
  const maxW     = Math.max(...weights)
  const range    = maxW - minW || 1

  function toX(i: number) {
    return PAD.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2)
  }
  function toY(w: number) {
    return PAD.top + innerH - ((w - minW) / range) * innerH
  }

  const points = data.map((p, i) => ({ x: toX(i), y: toY(p.maxWeightKg), p }))
  const polyline = points.map(pt => `${pt.x},${pt.y}`).join(' ')
  const areaPath = points.length > 0
    ? `M${points[0]!.x},${toY(minW)} L${polyline.replace(/(\d+\.?\d*),(\d+\.?\d*)/g, 'L$1,$2').slice(1)} L${points[points.length - 1]!.x},${toY(minW)} Z`
    : ''

  // Y axis ticks (3 labels)
  const yTicks = [minW, minW + range / 2, maxW].map(v => ({ v, y: toY(v) }))

  // X axis ticks (max 5)
  const step     = Math.max(1, Math.floor(data.length / 5))
  const xIndices = Array.from({ length: data.length }, (_, i) => i).filter(
    i => i === 0 || i === data.length - 1 || i % step === 0,
  ).slice(0, 6)

  const handleMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const mx   = e.clientX - rect.left
    if (mx < PAD.left || mx > PAD.left + innerW) { setTooltip(null); return }
    const ratio  = (mx - PAD.left) / innerW
    const idx    = Math.round(ratio * (data.length - 1))
    const clamped = Math.max(0, Math.min(data.length - 1, idx))
    const pt     = points[clamped]
    if (pt) setTooltip({ x: pt.x, y: pt.y, point: pt.p })
  }, [data, innerW, points])

  if (data.length === 0) return null

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={HEIGHT}
        className="overflow-visible"
        onMouseMove={handleMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgb(139,92,246)"  stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(139,92,246)"  stopOpacity="0.02" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yTicks.map(({ y }, i) => (
          <line key={i} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
            stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        ))}

        {/* Area under line */}
        {points.length > 1 && (
          <path d={areaPath} fill="url(#areaGrad)" />
        )}

        {/* Main line */}
        {points.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="rgb(139,92,246)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Dots */}
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={3}
            fill="rgb(17,24,39)"
            stroke="rgb(167,139,250)"
            strokeWidth={2}
          />
        ))}

        {/* Y axis labels */}
        {yTicks.map(({ v, y }, i) => (
          <text key={i} x={PAD.left - 5} y={y + 4} textAnchor="end"
            className="text-[10px]" fill="rgb(107,114,128)" fontSize={10}>
            {formatWeight(v)}
          </text>
        ))}

        {/* X axis labels */}
        {xIndices.map(i => (
          <text key={i} x={toX(i)} y={HEIGHT - 4} textAnchor="middle"
            fill="rgb(107,114,128)" fontSize={10}>
            {formatDate(data[i]!.date, timeframe === 'all')}
          </text>
        ))}

        {/* Tooltip crosshair + popup */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} x2={tooltip.x}
              y1={PAD.top} y2={PAD.top + innerH}
              stroke="rgba(167,139,250,0.4)" strokeWidth={1} strokeDasharray="4 3"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r={5}
              fill="rgb(139,92,246)" stroke="white" strokeWidth={2}
              filter="url(#glow)"
            />
            {/* Tooltip box */}
            {(() => {
              const bw   = 118
              const bh   = 54
              const bx   = Math.min(Math.max(tooltip.x - bw / 2, PAD.left), PAD.left + innerW - bw)
              const by   = tooltip.y < PAD.top + innerH / 2 ? tooltip.y + 10 : tooltip.y - bh - 10
              return (
                <g>
                  <rect x={bx} y={by} width={bw} height={bh} rx={6}
                    fill="rgb(24,24,27)" stroke="rgba(139,92,246,0.4)" strokeWidth={1} />
                  <text x={bx + 8} y={by + 16} fill="rgb(167,139,250)" fontSize={9} fontWeight="600">
                    {formatDate(tooltip.point.date, true).toUpperCase()}
                  </text>
                  <text x={bx + 8} y={by + 31} fill="white" fontSize={13} fontWeight="700">
                    {formatWeight(tooltip.point.maxWeightKg)} kg
                  </text>
                  <text x={bx + 8} y={by + 46} fill="rgb(156,163,175)" fontSize={10}>
                    {tooltip.point.repsAtMax} reps · {tooltip.point.totalVolume} kg vol
                  </text>
                </g>
              )
            })()}
          </>
        )}
      </svg>
    </div>
  )
}

// ─── Sección principal ─────────────────────────────────────────────────────────

export function ExerciseProgressionSection({ exercises }: Props) {
  const [selectedId, setSelectedId]   = useState<string>(exercises[0]?.id ?? '')
  const [timeframe, setTimeframe]     = useState<Timeframe>('3m')
  const [allData, setAllData]         = useState<ProgressionPoint[]>([])
  const [loading, setLoading]         = useState(false)
  const [open, setOpen]               = useState(false)

  const selected = exercises.find(e => e.id === selectedId)

  const fetchData = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    const data = await getExerciseProgressionData(id)
    setAllData(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedId) fetchData(selectedId)
  }, [selectedId, fetchData])

  const displayed = filterByTimeframe(allData, timeframe)

  const TIMEFRAMES: { key: Timeframe; label: string }[] = [
    { key: '30d', label: '30d' },
    { key: '3m',  label: '3m'  },
    { key: 'all', label: 'Todo' },
  ]

  if (exercises.length === 0) return null

  const improvement = displayed.length >= 2
    ? displayed[displayed.length - 1]!.maxWeightKg - displayed[0]!.maxWeightKg
    : 0

  return (
    <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Evolución</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Progresión de peso por ejercicio
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <TrendingUp className="h-[18px] w-[18px]" />
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {/* Exercise selector */}
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-violet-500/40"
          >
            <span className="truncate">{selected?.name ?? 'Seleccionar ejercicio'}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-52 overflow-y-auto rounded-xl border border-border/60 bg-popover shadow-xl shadow-black/40">
              {exercises.map(ex => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => { setSelectedId(ex.id); setOpen(false) }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-violet-500/10 ${
                    ex.id === selectedId ? 'bg-violet-500/10 text-violet-300' : 'text-foreground'
                  }`}
                >
                  <span className="truncate">{ex.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{ex.sessionCount}x</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeframe buttons */}
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border/40 bg-background/40 p-1">
          {TIMEFRAMES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimeframe(key)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                timeframe === key
                  ? 'bg-violet-600 text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="mt-4">
        {loading ? (
          <div className="flex h-[180px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : displayed.length < 2 ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 text-center">
            <TrendingUp className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {allData.length < 2
                ? 'Registra más sesiones para ver la evolución'
                : 'Sin datos en este período'}
            </p>
          </div>
        ) : (
          <div>
            <ProgressionChart data={displayed} timeframe={timeframe} />
            {improvement !== 0 && (
              <p className={`mt-1 text-right text-xs font-medium ${improvement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {improvement > 0 ? '+' : ''}{formatWeight(improvement)} kg en este período
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
