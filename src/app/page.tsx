import Link from 'next/link'
import { Languages } from 'lucide-react'
import { VekiraLogo } from '@/components/branding/VekiraLogo'

const LANGUAGE_OPTIONS = [
  {
    href: '/es',
    language: 'Español',
    prompt: 'Continuar en español',
  },
  {
    href: '/en',
    language: 'English',
    prompt: 'Continue in English',
  },
] as const

export default function Home() {
  return (
    <main
      id="app-main-content"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090d] px-5 py-12 text-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.22),transparent_48%)]"
      />
      <section className="relative w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 text-center shadow-2xl backdrop-blur-xl sm:p-10">
        <VekiraLogo className="mx-auto justify-center" />
        <span className="mx-auto mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20">
          <Languages className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-3xl font-black tracking-tight sm:text-4xl">
          Elige tu idioma · Choose your language
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/55 sm:text-base">
          Selecciona cómo quieres explorar Vekira. Select how you want to explore Vekira.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {LANGUAGE_OPTIONS.map(option => (
            <Link
              key={option.href}
              href={option.href}
              hrefLang={option.href.slice(1)}
              className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-violet-400/40 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span className="block text-lg font-bold text-white">{option.language}</span>
              <span className="mt-1 block text-sm text-white/50 transition-colors group-hover:text-white/70">
                {option.prompt}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
