'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Flame, CalendarCheck, Weight, ChevronRight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Sparkline } from '@/components/dashboard/Sparkline'
import { cn } from '@/lib/utils'

// ─── Animated counter hook ────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1000, delay = 0) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target)
      return
    }
    let frame: number
    let startTime: number | null = null

    const timeout = window.setTimeout(() => {
      function step(ts: number) {
        if (startTime === null) startTime = ts
        const progress = Math.min((ts - startTime) / duration, 1)
        const eased = 1 - (1 - progress) ** 3   // ease-out cubic
        setVal(Math.round(eased * target))
        if (progress < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, delay)

    return () => {
      window.clearTimeout(timeout)
      cancelAnimationFrame(frame)
    }
  }, [target, duration, delay])
  return val
}

// ─── Section label helper ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 px-0.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
        {children}
      </span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  streak:               number
  sessionsThisWeek:     number
  scheduledThisWeek:    number
  volumeKg:             number
  volumeSeries:         number[]
  hasCompletedSessions: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickStats({
  streak,
  sessionsThisWeek,
  scheduledThisWeek,
  volumeKg,
  volumeSeries,
  hasCompletedSessions,
}: Props) {
  const reduce         = useReducedMotion()
  const animatedStreak = useCountUp(streak, 900)
  const animatedVolume = useCountUp(volumeKg, 1400, 200)

  const weekPct    = scheduledThisWeek > 0 ? sessionsThisWeek / scheduledThisWeek : 0
  const volumePct  = Math.min(volumeKg / 3000, 1)
  const isOnFire   = streak >= 3
  const streakLabel =
    streak === 0 ? 'Retoma tu racha' :
    streak === 1 ? '¡Vas bien!' : '¡Sigue así!'

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!hasCompletedSessions) {
    return (
      <div>
        <SectionLabel>Tu progreso</SectionLabel>
        <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/10 p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/30">
            <Flame className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">Empieza tu camino</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Tu primera sesión te espera. Cada serie cuenta.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Main state ──────────────────────────────────────────────────────────────
  return (
    <PendingLink href="/history" className="group block focus-visible:outline-none" spinnerClassName="hidden">
      <div className="mb-3 flex items-center gap-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
          Tu progreso
        </span>
        <div className="h-px flex-1 bg-border/40" />
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground/40 transition-colors group-hover:text-violet-400">
          Historial
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">

        {/* ── STREAK — full width ──────────────────────────────────────────── */}
        <div className={cn(
          'relative col-span-2 overflow-hidden rounded-2xl border p-5 transition-colors duration-300',
          isOnFire
            ? 'border-orange-500/30 bg-gradient-to-br from-orange-950/60 via-orange-900/20 to-transparent hover:from-orange-950/70'
            : 'border-border/60 bg-muted/10 hover:bg-muted/15',
        )}>
          {/* Glow orbs when on fire */}
          {isOnFire && (
            <>
              <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-orange-500/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-4 left-1/3 h-20 w-20 rounded-full bg-orange-600/10 blur-xl" />
            </>
          )}

          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">
                Racha activa
              </p>
              <div className="mt-1 flex items-end gap-1.5">
                <span className={cn(
                  'font-display text-6xl font-black leading-none tracking-tighter tabular-nums',
                  isOnFire
                    ? 'text-orange-400 drop-shadow-[0_0_20px_rgba(249,115,22,0.55)]'
                    : 'text-foreground',
                )}>
                  {streak > 0 ? animatedStreak : '—'}
                </span>
                {streak > 0 && (
                  <span className="mb-2 text-base font-medium text-muted-foreground">días</span>
                )}
              </div>
              <p className={cn(
                'mt-1 text-sm font-medium',
                isOnFire ? 'text-orange-400/80' : 'text-muted-foreground',
              )}>
                {streakLabel}
              </p>
            </div>

            <div className={cn(
              'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl transition-all',
              isOnFire
                ? 'bg-orange-500/15 shadow-[0_0_30px_rgba(249,115,22,0.3)]'
                : 'bg-muted/30',
            )}>
              <Flame className={cn(
                'h-8 w-8',
                isOnFire
                  ? 'text-orange-400 drop-shadow-[0_0_14px_rgba(249,115,22,0.7)]'
                  : 'text-muted-foreground/50',
              )} />
            </div>
          </div>
        </div>

        {/* ── SESSIONS THIS WEEK ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/10 p-4 transition-colors hover:bg-muted/15">
          <div className="flex items-center justify-between">
            <CalendarCheck className="h-4 w-4 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/50">
              Semana
            </span>
          </div>
          <div className="flex items-end gap-0.5 leading-none">
            <span className="font-display text-2xl font-bold text-foreground">
              {sessionsThisWeek}
            </span>
            <span className="mb-0.5 text-sm font-medium text-muted-foreground">
              /{scheduledThisWeek}
            </span>
          </div>
          {/* Animated progress bar */}
          <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400"
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${weekPct * 100}%` }}
              transition={reduce ? { duration: 0 } : { duration: 1, ease: 'easeOut', delay: 0.4 }}
            />
          </div>
        </div>

        {/* ── VOLUME ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/10 p-4 transition-colors hover:bg-muted/15">
          <div className="flex items-center justify-between">
            <Weight className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/50">
              Volumen
            </span>
          </div>
          <div className="flex items-end gap-0.5 leading-none">
            <span className="font-display text-2xl font-bold tabular-nums text-foreground">
              {animatedVolume.toLocaleString('es')}
            </span>
            <span className="mb-0.5 text-sm font-medium text-muted-foreground"> kg</span>
          </div>
          {/* Tendencia de volumen (últimas sesiones) o barra de respaldo */}
          {volumeSeries.length >= 3 ? (
            <div className="mt-auto h-9 w-full text-emerald-400">
              <Sparkline data={volumeSeries} />
            </div>
          ) : (
            <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${volumePct * 100}%` }}
                transition={reduce ? { duration: 0 } : { duration: 1.2, ease: 'easeOut', delay: 0.5 }}
              />
            </div>
          )}
        </div>

      </div>
    </PendingLink>
  )
}
