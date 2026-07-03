import type { Metadata } from 'next'
import Link from 'next/link'
import { Zap, BarChart3, Brain } from 'lucide-react'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { LoginForm } from './LoginForm'
import { BrandTopBar } from '@/components/navigation/BrandTopBar'

export const metadata: Metadata = { title: 'Iniciar sesión' }

const FEATURES = [
  { icon: Brain,     text: 'Rutinas generadas por IA adaptadas a ti' },
  { icon: BarChart3, text: 'Seguimiento real de tu progreso' },
  { icon: Zap,       text: 'Planes que evolucionan cada semana' },
]

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background">
      <BrandTopBar
        right={(
          <Link href="/register" className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200">
            Crear cuenta
          </Link>
        )}
      />

      <div className="flex min-h-[calc(100dvh-4.25rem)]">

      {/* ── Left: Branding panel ── */}
      <div className="relative hidden lg:flex lg:w-[45%] flex-col justify-between p-12 bg-gradient-to-br from-indigo-950 via-violet-950 to-indigo-900 overflow-hidden">

        {/* Grid pattern */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0
            bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),
                linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)]
            bg-[size:40px_40px]
            [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]"
        />

        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-violet-600/25 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-2xl" />
        </div>

        {/* Logo */}
        <VekiraLogo className="relative" markClassName="h-9 w-9" wordmarkClassName="text-white" />

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
          © {new Date().getFullYear()} Vekira. Todos los derechos reservados.
        </p>
      </div>

      {/* ── Right: Form panel ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12 bg-background">

        {/* Mobile logo */}
        <VekiraLogo className="mb-10 lg:hidden" markClassName="h-9 w-9" />

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

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Al continuar aceptas nuestra{' '}
            <Link href="/privacy" className="underline transition-colors hover:text-foreground">
              Política de privacidad
            </Link>
            .
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}
