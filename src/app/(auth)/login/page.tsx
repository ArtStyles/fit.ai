import type { Metadata } from 'next'
import Link from 'next/link'
import { Dumbbell, Zap, BarChart3, Brain } from 'lucide-react'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Iniciar sesión' }

const FEATURES = [
  { icon: Brain,     text: 'Rutinas generadas por IA adaptadas a ti' },
  { icon: BarChart3, text: 'Seguimiento real de tu progreso' },
  { icon: Zap,       text: 'Planes que evolucionan cada semana' },
]

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">

      {/* ── Left: Branding panel ── */}
      <div className="relative hidden lg:flex lg:w-[45%] flex-col justify-between p-12 bg-gradient-to-br from-indigo-950 via-violet-950 to-indigo-900 overflow-hidden">

        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">FitAI</span>
        </div>

        {/* Main copy */}
        <div className="relative space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-400">
              Tu entrenador personal
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white">
              Entrena más
              <br />
              <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
                inteligente.
              </span>
            </h1>
            <p className="text-base text-indigo-200/70 leading-relaxed max-w-xs">
              La IA analiza tu progreso y adapta tus rutinas semana a semana
              para que nunca pares de avanzar.
            </p>
          </div>

          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/20">
                  <Icon className="h-3.5 w-3.5 text-indigo-300" />
                </div>
                <span className="text-sm text-indigo-200/80">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative text-xs text-indigo-400/50">
          © {new Date().getFullYear()} FitAI. Todos los derechos reservados.
        </p>
      </div>

      {/* ── Right: Form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12 bg-background">

        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
            <Dumbbell className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">FitAI</span>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8 space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Bienvenido de vuelta.
            </h2>
            <p className="text-sm text-muted-foreground">
              Accede a tu panel y continúa tu progreso.
            </p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
