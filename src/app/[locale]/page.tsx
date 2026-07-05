import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { PublicLocale } from '@/lib/i18n/routing'

const COPY = {
  es: {
    eyebrow: 'Tu entrenamiento, con dirección',
    title: 'Avanza con un plan que aprende de ti.',
    description: 'Vekira convierte tus objetivos, tu nivel y tu progreso en una rutina clara que evoluciona contigo semana a semana.',
    primaryAction: 'Crear mi plan gratis',
    secondaryAction: 'Iniciar sesión',
  },
  en: {
    eyebrow: 'Your training, with direction',
    title: 'Move forward with a plan that learns from you.',
    description: 'Vekira turns your goals, level, and progress into a clear routine that evolves with you week after week.',
    primaryAction: 'Create my free plan',
    secondaryAction: 'Sign in',
  },
} satisfies Record<PublicLocale, Record<string, string>>

export default function LocalizedHome({ params }: { params: { locale: PublicLocale } }) {
  const copy = COPY[params.locale]

  return (
    <main
      id="app-main-content"
      className="relative flex min-h-screen items-center overflow-hidden bg-[#09090d] px-5 py-16 text-white sm:px-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(124,58,237,0.28),transparent_42%)]"
      />
      <section className="relative mx-auto w-full max-w-5xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-violet-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {copy.eyebrow}
        </div>
        <h1 className="mt-6 max-w-4xl font-display text-5xl font-black leading-[0.95] tracking-[-0.035em] sm:text-7xl">
          {copy.title}
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
          {copy.description}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-7 font-bold shadow-[0_18px_45px_-18px_rgba(139,92,246,0.95)] transition-colors hover:bg-violet-500"
          >
            {copy.primaryAction}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-6 font-semibold text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
          >
            {copy.secondaryAction}
          </Link>
        </div>
      </section>
    </main>
  )
}
