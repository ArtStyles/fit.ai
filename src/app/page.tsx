import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Check,
  Clock3,
  Dumbbell,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { VekiraLogo, VekiraMark } from '@/components/branding/VekiraLogo'
import { PendingLink } from '@/components/navigation/PendingLink'

const BENEFITS = [
  { icon: BrainCircuit, label: 'Se adapta a tu progreso' },
  { icon: CalendarDays, label: 'Organiza tu semana' },
  { icon: BarChart3, label: 'Te muestra lo que avanzas' },
]

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090d] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,#000_0%,transparent_82%)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-36 top-[-8rem] h-[30rem] w-[30rem] rounded-full bg-violet-700/20 blur-[110px]" />
        <div className="absolute -right-40 bottom-[-10rem] h-[32rem] w-[32rem] rounded-full bg-indigo-700/15 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
        <header className="flex h-20 items-center justify-between border-b border-white/[0.07]">
          <VekiraLogo wordmarkClassName="text-white" />
          <PendingLink
            href="/login"
            className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white"
          >
            Iniciar sesión
          </PendingLink>
        </header>

        <section className="grid flex-1 items-center gap-14 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20 lg:py-16">
          <div className="max-w-xl">
            <div className="animate-in fade-in slide-in-from-bottom-3 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-violet-200 duration-500">
              <Sparkles className="h-3.5 w-3.5" />
              Tu entrenamiento, con dirección
            </div>

            <h1 className="animate-in fade-in slide-in-from-bottom-4 mt-6 font-display text-[3.35rem] font-black leading-[0.92] tracking-[-0.035em] duration-500 [animation-delay:70ms] sm:text-7xl">
              Avanza con un plan que
              <span className="block bg-gradient-to-r from-violet-300 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
                aprende de ti.
              </span>
            </h1>

            <p className="animate-in fade-in slide-in-from-bottom-4 mt-6 max-w-lg text-base leading-relaxed text-white/55 duration-500 [animation-delay:140ms] sm:text-lg">
              Vekira convierte tus objetivos, tu nivel y tu progreso en una rutina clara que evoluciona contigo semana a semana.
            </p>

            <div className="animate-in fade-in slide-in-from-bottom-4 mt-8 flex flex-col gap-3 duration-500 [animation-delay:210ms] sm:flex-row">
              <PendingLink
                href="/register"
                className="group inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-7 text-base font-bold text-white shadow-[0_18px_45px_-18px_rgba(139,92,246,0.95)] transition-all hover:-translate-y-0.5 hover:bg-violet-500"
              >
                Crear mi plan gratis
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </PendingLink>
              <PendingLink
                href="/pricing"
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-6 text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
              >
                Ver Vekira Pro
              </PendingLink>
            </div>

            <div className="animate-in fade-in mt-9 grid max-w-lg gap-3 duration-700 [animation-delay:280ms] sm:grid-cols-3">
              {BENEFITS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2.5 text-sm text-white/55">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-violet-300 ring-1 ring-white/[0.07]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-in fade-in zoom-in-95 relative mx-auto w-full max-w-[29rem] duration-700 [animation-delay:140ms]">
            <div aria-hidden className="absolute -inset-10 rounded-full bg-violet-600/15 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#111116]/95 p-4 shadow-[0_35px_90px_-35px_rgba(0,0,0,0.9)] ring-1 ring-black/30 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between px-1 pb-5">
                <div>
                  <p className="text-xs font-medium text-white/40">Hoy tienes</p>
                  <p className="mt-0.5 font-display text-xl font-bold">Una sesión lista</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-400/15">
                  <VekiraMark className="h-6 w-6" />
                </span>
              </div>

              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-800 via-violet-700 to-indigo-950 p-5 shadow-[0_20px_50px_-24px_rgba(124,58,237,0.95)] ring-1 ring-white/10">
                <div aria-hidden className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-fuchsia-400/25 blur-3xl" />
                <VekiraMark className="pointer-events-none absolute -bottom-8 -right-6 h-40 w-40 opacity-[0.07]" />
                <div className="relative flex items-start justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] ring-1 ring-white/10">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Hoy
                  </span>
                  <span className="text-xs font-semibold text-violet-100/75">3 de 4 esta semana</span>
                </div>

                <div className="relative mt-12">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200/70">Fuerza · Torso</p>
                  <h2 className="mt-1 font-display text-3xl font-black tracking-tight">Empuje superior</h2>
                  <div className="mt-4 flex items-center gap-4 text-sm font-semibold text-white/75">
                    <span className="inline-flex items-center gap-1.5"><Dumbbell className="h-4 w-4 text-violet-200" />7 ejercicios</span>
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-violet-200" />48 min</span>
                  </div>
                </div>

                <div className="relative mt-6 flex h-14 items-center justify-between rounded-2xl bg-white px-4 text-sm font-bold text-violet-800 shadow-lg">
                  Empezar entrenamiento
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-700 text-white"><ArrowRight className="h-4 w-4" /></span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><TrendingUp className="h-4 w-4" /></span>
                  <p className="mt-3 text-xs text-white/40">Progreso semanal</p>
                  <p className="mt-0.5 text-lg font-bold">+12% volumen</p>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><Check className="h-4 w-4" /></span>
                  <p className="mt-3 text-xs text-white/40">Constancia</p>
                  <p className="mt-0.5 text-lg font-bold">3 sesiones</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex min-h-16 items-center justify-center border-t border-white/[0.06] py-4 text-center text-xs text-white/30 sm:justify-between sm:text-left">
          <p>© {new Date().getFullYear()} Vekira</p>
          <p className="hidden sm:block">Entrenamiento inteligente. Progreso real.</p>
        </footer>
      </div>
    </main>
  )
}
