'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  ArrowLeft, Plus, Scale, Trash2, ChevronDown, ChevronUp,
  TrendingDown, TrendingUp, Minus,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PendingLink } from '@/components/navigation/PendingLink'
import {
  logMeasurement,
  deleteMeasurement,
  type MeasurementRow,
  type LogMeasurementPayload,
} from '@/app/actions/measurements'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number | null, suffix = ''): string {
  if (v === null || v === undefined) return '—'
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${suffix}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

function diff(curr: number | null, prev: number | null): { val: number; label: string } | null {
  if (curr === null || prev === null) return null
  const d = parseFloat((curr - prev).toFixed(1))
  if (d === 0) return null
  return { val: d, label: `${d > 0 ? '+' : ''}${d}` }
}

// ─── Mini SVG chart (weight over time) ──────────────────────────────────────

const PAD = { top: 10, right: 8, bottom: 24, left: 34 }

function WeightChart({ data }: { data: MeasurementRow[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; row: MeasurementRow } | null>(null)

  const pts = [...data].reverse().filter(r => r.weight_kg !== null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(e => { const w = e[0]?.contentRect.width; if (w) setWidth(w) })
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const H      = 160
  const innerW = width  - PAD.left - PAD.right
  const innerH = H      - PAD.top  - PAD.bottom
  const weights = pts.map(p => p.weight_kg as number)
  const minW   = Math.min(...weights)
  const maxW   = Math.max(...weights)
  const range  = maxW - minW || 1

  const toX = (i: number) => PAD.left + (i / (pts.length - 1)) * innerW
  const toY = (w: number) => PAD.top  + innerH - ((w - minW) / range) * innerH
  const coords = pts.map((p, i) => ({ x: toX(i), y: toY(p.weight_kg as number), p }))

  // Hooks must run unconditionally on every render — keep above the early return below.
  const handleMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const mx = e.clientX - rect.left
    if (mx < PAD.left || mx > PAD.left + innerW) { setTooltip(null); return }
    const idx = Math.round(((mx - PAD.left) / innerW) * (pts.length - 1))
    const c = coords[Math.max(0, Math.min(pts.length - 1, idx))]
    if (c) setTooltip({ x: c.x, y: c.y, row: c.p })
  }, [coords, innerW, pts.length])

  if (pts.length < 2) return (
    <div className="flex h-[160px] items-center justify-center rounded-xl border border-dashed border-border/40">
      <p className="text-xs text-muted-foreground">Registra al menos 2 medidas para ver la gráfica</p>
    </div>
  )

  const polyline = coords.map(c => `${c.x},${c.y}`).join(' ')
  const area = `M${coords[0]!.x},${toY(minW)} ${coords.map(c => `L${c.x},${c.y}`).join(' ')} L${coords[coords.length - 1]!.x},${toY(minW)} Z`

  const yTicks = [minW, minW + range / 2, maxW]
  const step = Math.max(1, Math.floor(pts.length / 5))
  const xIdx = Array.from({ length: pts.length }, (_, i) => i)
    .filter(i => i === 0 || i === pts.length - 1 || i % step === 0).slice(0, 6)

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={H} className="overflow-visible"
        onMouseMove={handleMove} onMouseLeave={() => setTooltip(null)}>
        <defs>
          <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgb(139,92,246)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="rgb(139,92,246)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={toY(v)} y2={toY(v)}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 4} y={toY(v) + 4} textAnchor="end"
              fill="rgb(107,114,128)" fontSize={10}>
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#wGrad)" />
        <polyline points={polyline} fill="none" stroke="rgb(139,92,246)"
          strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={3}
            fill="rgb(17,24,39)" stroke="rgb(167,139,250)" strokeWidth={2} />
        ))}

        {xIdx.map(i => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
            fill="rgb(107,114,128)" fontSize={10}>
            {new Date(pts[i]!.recorded_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </text>
        ))}

        {tooltip && (
          <>
            <line x1={tooltip.x} x2={tooltip.x} y1={PAD.top} y2={PAD.top + innerH}
              stroke="rgba(167,139,250,0.4)" strokeWidth={1} strokeDasharray="4 3" />
            <circle cx={tooltip.x} cy={tooltip.y} r={5}
              fill="rgb(139,92,246)" stroke="white" strokeWidth={2} />
            {(() => {
              const bw = 110; const bh = 42
              const bx = Math.min(Math.max(tooltip.x - bw / 2, PAD.left), PAD.left + innerW - bw)
              const by = tooltip.y < PAD.top + innerH / 2 ? tooltip.y + 8 : tooltip.y - bh - 8
              return (
                <g>
                  <rect x={bx} y={by} width={bw} height={bh} rx={6}
                    fill="rgb(24,24,27)" stroke="rgba(139,92,246,0.4)" strokeWidth={1} />
                  <text x={bx + 7} y={by + 14} fill="rgb(167,139,250)" fontSize={9} fontWeight="600">
                    {fmtDate(tooltip.row.recorded_at).toUpperCase()}
                  </text>
                  <text x={bx + 7} y={by + 32} fill="white" fontSize={13} fontWeight="700">
                    {fmt(tooltip.row.weight_kg, ' kg')}
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

// ─── Form de registro ────────────────────────────────────────────────────────

function LogForm({
  onSaved,
  onClose,
}: { onSaved: (row: MeasurementRow) => void; onClose: () => void }) {
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [extra, setExtra]     = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const fd  = new FormData(e.currentTarget)
    const num = (k: string) => { const v = fd.get(k); return v ? parseFloat(String(v)) || null : null }

    const payload: LogMeasurementPayload = {
      weight_kg:           num('weight_kg'),
      body_fat_percentage: num('body_fat_percentage'),
      muscle_mass_kg:      num('muscle_mass_kg'),
      waist_cm:            num('waist_cm'),
      chest_cm:            num('chest_cm'),
      hips_cm:             num('hips_cm'),
      arms_cm:             num('arms_cm'),
      legs_cm:             num('legs_cm'),
      notes:               String(fd.get('notes') ?? '').trim() || null,
    }

    const result = await logMeasurement(payload)
    setSaving(false)

    if (!result.success) { setError(result.error ?? 'Error al guardar'); return }

    onSaved({
      id: result.id!,
      recorded_at: new Date().toISOString(),
      ...payload,
    } as MeasurementRow)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <InputField name="weight_kg"           label="Peso (kg)"       step="0.1" />
        <InputField name="body_fat_percentage" label="Grasa corporal (%)" step="0.1" />
        <InputField name="waist_cm"            label="Cintura (cm)"    step="0.5" />
        <InputField name="muscle_mass_kg"      label="Masa muscular (kg)" step="0.1" />
      </div>

      <button type="button" onClick={() => setExtra(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        {extra ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {extra ? 'Menos campos' : 'Más perímetros'}
      </button>

      {extra && (
        <div className="grid grid-cols-2 gap-3">
          <InputField name="chest_cm" label="Pecho (cm)"  step="0.5" />
          <InputField name="hips_cm"  label="Cadera (cm)" step="0.5" />
          <InputField name="arms_cm"  label="Brazos (cm)" step="0.5" />
          <InputField name="legs_cm"  label="Piernas (cm)" step="0.5" />
        </div>
      )}

      <textarea name="notes" rows={2} placeholder="Notas opcionales..."
        className="w-full resize-none rounded-lg border border-border/50 bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/60" />

      <div className="flex gap-2">
        <button type="button" onClick={onClose}
          className="flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function InputField({ name, label, step }: { name: string; label: string; step?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input type="number" name={name} step={step ?? '1'} min="0" placeholder="—"
        className="h-9 w-full rounded-lg border border-border/50 bg-white/5 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-500/60" />
    </label>
  )
}

// ─── Tarjeta de resumen ──────────────────────────────────────────────────────

function SummaryCard({ label, value, prev, suffix }: {
  label: string; value: number | null; prev: number | null; suffix: string
}) {
  const d = diff(value, prev)
  return (
    <div className="rounded-xl border border-border/50 bg-white/5 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold text-foreground">{fmt(value, suffix)}</p>
      {d && (
        <p className={`flex items-center gap-0.5 text-[11px] font-medium ${d.val < 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
          {d.val < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
          {d.label}{suffix} vs anterior
        </p>
      )}
      {!d && prev !== null && (
        <p className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
          <Minus className="h-3 w-3" /> Sin cambio
        </p>
      )}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

interface Props {
  initialMeasurements: MeasurementRow[]
}

export function MeasurementsClient({ initialMeasurements }: Props) {
  const [measurements, setMeasurements] = useState<MeasurementRow[]>(initialMeasurements)
  const [showForm, setShowForm]         = useState(false)
  const [showAll, setShowAll]           = useState(false)

  const latest = measurements[0] ?? null
  const prev   = measurements[1] ?? null

  function handleSaved(row: MeasurementRow) {
    setMeasurements(m => [row, ...m])
  }

  async function handleDelete(id: string) {
    setMeasurements(m => m.filter(r => r.id !== id))
    await deleteMeasurement(id)
  }

  const visible = showAll ? measurements : measurements.slice(0, 5)

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-2.5">
            <PendingLink href="/dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </PendingLink>
            <h1 className="text-base font-semibold text-white">Medidas corporales</h1>
          </div>
          <button type="button" onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 active:bg-violet-700">
            <Plus className="h-4 w-4" />
            Registrar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-6">

        {/* Empty state */}
        {measurements.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
              <Scale className="h-8 w-8" />
            </div>
            <div>
              <p className="font-semibold text-white">Sin medidas registradas</p>
              <p className="mt-1 text-sm text-gray-400">Registra tu peso y medidas para ver tu evolución</p>
            </div>
            <button type="button" onClick={() => setShowForm(true)}
              className="mt-2 flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500">
              <Plus className="h-4 w-4" />
              Primera medida
            </button>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <section>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Última medida · {latest ? fmtDate(latest.recorded_at) : ''}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <SummaryCard label="Peso"          value={latest?.weight_kg ?? null}           prev={prev?.weight_kg ?? null}           suffix=" kg" />
                <SummaryCard label="Grasa corporal" value={latest?.body_fat_percentage ?? null} prev={prev?.body_fat_percentage ?? null} suffix="%" />
                <SummaryCard label="Masa muscular"  value={latest?.muscle_mass_kg ?? null}      prev={prev?.muscle_mass_kg ?? null}      suffix=" kg" />
                <SummaryCard label="Cintura"        value={latest?.waist_cm ?? null}            prev={prev?.waist_cm ?? null}            suffix=" cm" />
              </div>
            </section>

            {/* Weight chart */}
            {measurements.filter(m => m.weight_kg !== null).length >= 1 && (
              <section className="mt-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Evolución del peso</p>
                <div className="rounded-2xl border border-border/40 bg-white/5 p-4">
                  <WeightChart data={measurements} />
                </div>
              </section>
            )}

            {/* History list */}
            <section className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Historial</p>
              <ul className="flex flex-col gap-2">
                {visible.map((row, i) => (
                  <HistoryRow key={row.id} row={row} isLatest={i === 0} onDelete={handleDelete} />
                ))}
              </ul>
              {measurements.length > 5 && (
                <button type="button" onClick={() => setShowAll(v => !v)}
                  className="mt-3 w-full rounded-xl border border-border/40 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {showAll ? 'Ver menos' : `Ver todas (${measurements.length})`}
                </button>
              )}
            </section>
          </>
        )}
      </main>

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="mx-4 max-w-sm gap-0 rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="text-base text-white">Registrar medidas</DialogTitle>
          </DialogHeader>
          <LogForm onSaved={handleSaved} onClose={() => setShowForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function HistoryRow({
  row, isLatest, onDelete,
}: { row: MeasurementRow; isLatest: boolean; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const extras = [
    row.chest_cm  !== null && `Pecho: ${fmt(row.chest_cm, ' cm')}`,
    row.hips_cm   !== null && `Cadera: ${fmt(row.hips_cm, ' cm')}`,
    row.arms_cm   !== null && `Brazos: ${fmt(row.arms_cm, ' cm')}`,
    row.legs_cm   !== null && `Piernas: ${fmt(row.legs_cm, ' cm')}`,
  ].filter(Boolean) as string[]

  return (
    <li className="group rounded-xl border border-border/40 bg-white/5 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setExpanded(v => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-white">{fmtDate(row.recorded_at)}</p>
              {isLatest && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-semibold text-violet-300">Última</span>}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              {[
                row.weight_kg           !== null && `${fmt(row.weight_kg, ' kg')}`,
                row.body_fat_percentage !== null && `${fmt(row.body_fat_percentage, '% grasa')}`,
                row.waist_cm            !== null && `${fmt(row.waist_cm, ' cm cintura')}`,
              ].filter(Boolean).join(' · ') || 'Sin datos principales'}
            </p>
          </div>
          {extras.length > 0 && (
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </button>
        <button type="button" onClick={() => onDelete(row.id)}
          className="shrink-0 rounded-lg p-1.5 text-gray-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
          aria-label="Eliminar">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && extras.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2 border-t border-border/30 pt-2.5">
          {extras.map(e => (
            <span key={e} className="rounded-md bg-white/5 px-2 py-1 text-xs text-gray-400">{e}</span>
          ))}
          {row.notes && <p className="mt-1 w-full text-xs text-gray-500 italic">"{row.notes}"</p>}
        </div>
      )}
    </li>
  )
}
