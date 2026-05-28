import type { Metadata } from 'next'
import { Dumbbell, TrendingUp, Users, Award } from 'lucide-react'
import { RegisterForm } from './RegisterForm'

export const metadata: Metadata = { title: 'Crear cuenta' }

const STATS = [
  { value: '10K+', label: 'Usuarios activos' },
  { value: '200+', label: 'Rutinas en biblioteca' },
  { value: '98%',  label: 'Satisfacción' },
]

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen">

      {/* ── Left: Form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12 bg-background">

        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">FitAI</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7 space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Crea tu cuenta.
            </h2>
            <p className="text-sm text-muted-foreground">
              Empieza gratis. Sin tarjeta de crédito.
            </p>
          </div>

          <RegisterForm />
        </div>
      </div>

      {/* ── Right: Branding panel ── */}
      <div className="relative hidden lg:flex lg:w-[45%] flex-col justify-between p-12 bg-gradient-to-br from-violet-950 via-indigo-950 to-violet-900 overflow-hidden">

        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">FitAI</span>
        </div>

        {/* Main copy */}
        <div className="relative space-y-10">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-400">
              Únete hoy
            </p>
            <h2 className="text-4xl font-bold leading-tight text-white">
              Transforma
              <br />
              <span className="bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">
                tu cuerpo.
              </span>
            </h2>
            <p className="text-base text-violet-200/70 leading-relaxed max-w-xs">
              Únete a miles de personas que ya usan FitAI para alcanzar
              sus objetivos de forma más inteligente.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {STATS.map(({ value, label }) => (
              <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="mt-0.5 text-xs text-violet-300/60">{label}</p>
              </div>
            ))}
          </div>

          {/* Icons row */}
          <div className="flex items-center gap-4">
            {[TrendingUp, Users, Award].map((Icon, i) => (
              <div
                key={i}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10"
              >
                <Icon className="h-4.5 w-4.5 text-violet-300" />
              </div>
            ))}
            <p className="text-sm text-violet-300/60">
              Progreso real, resultados reales.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-violet-400/50">
          © {new Date().getFullYear()} FitAI. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}
