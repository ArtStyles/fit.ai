import { Dumbbell, Brain, BarChart3, Zap, ChevronRight, Flame, Trophy, Users } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'

const FEATURES = [
  { icon: Brain,     label: 'IA que aprende de ti'         },
  { icon: BarChart3, label: 'Progreso semana a semana'      },
  { icon: Zap,       label: 'Planes que evolucionan solos'  },
]

const STATS = [
  { icon: Users,  value: '10K+', label: 'usuarios activos' },
  { icon: Trophy, value: '98%',  label: 'satisfacción'     },
  { icon: Flame,  value: '5×',   label: 'más consistencia' },
]

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 text-center">

      {/* ── Grid background ──────────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10
          bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),
              linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)]
          bg-[size:48px_48px]
          [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,#000_60%,transparent_100%)]"
      />

      {/* ── Glow orbs ────────────────────────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="absolute -right-32 bottom-1/4 h-80 w-80 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      {/* ── Eyebrow badge ────────────────────────────────────────────────────── */}
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 mb-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-violet-300">
          <Zap className="h-3 w-3" />
          Entrenamiento con IA
        </span>
      </div>

      {/* ── Logo icon ────────────────────────────────────────────────────────── */}
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:60ms] mb-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-xl shadow-violet-500/30">
          <Dumbbell className="h-8 w-8 text-white" />
        </div>
      </div>

      {/* ── Heading ──────────────────────────────────────────────────────────── */}
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:120ms] space-y-3 mb-5">
        <h1 className="text-5xl font-black tracking-tight text-foreground sm:text-6xl">
          FitAI
        </h1>
        <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground sm:max-w-sm sm:text-lg">
          Entrenamiento personalizado que se adapta{' '}
          <span className="font-semibold text-violet-300">semana a semana</span>{' '}
          con inteligencia artificial.
        </p>
      </div>

      {/* ── Feature pills ────────────────────────────────────────────────────── */}
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:180ms] mb-8 flex flex-wrap justify-center gap-2">
        {FEATURES.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5 text-violet-400" />
            {label}
          </span>
        ))}
      </div>

      {/* ── CTAs ─────────────────────────────────────────────────────────────── */}
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:240ms] flex flex-col gap-3 sm:flex-row mb-10">
        <PendingLink
          href="/register"
          className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-sm font-bold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-500/40 hover:-translate-y-0.5"
        >
          Empezar gratis
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </PendingLink>
        <PendingLink
          href="/login"
          className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-7 text-sm font-semibold text-foreground transition-all hover:bg-muted/30 hover:-translate-y-0.5"
        >
          Iniciar sesión
        </PendingLink>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:300ms] flex items-center gap-6 sm:gap-10">
        {STATS.map(({ icon: Icon, value, label }, i) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            {i > 0 && (
              <div className="absolute -left-3 top-1/2 h-5 w-px -translate-y-1/2 bg-border/50" />
            )}
            <p className="text-2xl font-black text-foreground">{value}</p>
            <p className="text-[11px] text-muted-foreground/70">{label}</p>
          </div>
        ))}
      </div>

    </main>
  )
}
