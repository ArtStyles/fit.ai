import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { CalendarRange, ClipboardCheck, Sparkles, TrendingUp } from 'lucide-react'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { BrandTopBar } from '@/components/navigation/BrandTopBar'
import type { AppLanguage } from '@/lib/i18n'
import { RegisterForm } from './RegisterForm'
import { registrationLocale } from './registerProfile'

export const metadata: Metadata = {
  title: 'Crear cuenta | Sign up',
  robots: { index: false, follow: true },
}

const EARLY_ACCESS_PLANS = new Set(['pro-early-access', 'pro-monthly', 'pro-annual'])

const PAGE_COPY: Record<AppLanguage, {
  signIn: string
  title: string
  subtitle: string
  earlyAccessLabel: string
  earlyAccessBody: string
  panelEyebrow: string
  panelTitle: string
  panelBody: string
  copyright: string
}> = {
  es: {
    signIn: 'Iniciar sesión',
    title: 'Crea tu cuenta.',
    subtitle: 'Empieza con tu correo y una contraseña.',
    earlyAccessLabel: 'Preferencia de acceso anticipado',
    earlyAccessBody: 'Esta opción es informativa y no cambia el proceso de registro.',
    panelEyebrow: 'Tu entrenamiento, conectado',
    panelTitle: 'Convierte cada registro en contexto para tu próxima semana.',
    panelBody: 'Vekira reúne planificación, seguimiento y progresión en un mismo lugar.',
    copyright: 'Todos los derechos reservados.',
  },
  en: {
    signIn: 'Sign in',
    title: 'Create your account.',
    subtitle: 'Start with your email and a password.',
    earlyAccessLabel: 'Early-access preference',
    earlyAccessBody: 'This option is informational and does not change the registration process.',
    panelEyebrow: 'Your training, connected',
    panelTitle: 'Turn every log into context for your next week.',
    panelBody: 'Vekira brings planning, tracking, and progression together in one place.',
    copyright: 'All rights reserved.',
  },
}

const BENEFITS = [
  {
    icon: CalendarRange,
    title: { es: 'Semana adaptable', en: 'Adaptive week' },
    body: {
      es: 'Tu planificación puede ajustarse según tus sesiones y tu disponibilidad.',
      en: 'Your plan can adjust based on your sessions and availability.',
    },
  },
  {
    icon: ClipboardCheck,
    title: { es: 'Registro guiado', en: 'Guided logging' },
    body: {
      es: 'Anota series, repeticiones, carga y esfuerzo mientras entrenas.',
      en: 'Log sets, repetitions, load, and effort while you train.',
    },
  },
  {
    icon: TrendingUp,
    title: { es: 'Progresión visible', en: 'Visible progression' },
    body: {
      es: 'Consulta tu historial y la evolución de cada ejercicio.',
      en: 'Review your history and how each exercise changes over time.',
    },
  },
] as const

type RegisterPageProps = {
  searchParams?: { plan?: string; locale?: string }
}

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const locale = registrationLocale(
    searchParams?.locale,
    cookies().get('fitai-language')?.value,
  )
  const selectedPlan = searchParams?.plan && EARLY_ACCESS_PLANS.has(searchParams.plan)
    ? searchParams.plan
    : null
  const copy = PAGE_COPY[locale]

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <BrandTopBar
        homeHref={`/${locale}`}
        right={(
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {copy.signIn}
          </Link>
        )}
      />

      <div className="flex min-h-[calc(100dvh-4.25rem)]">
        <main id="app-main-content" className="flex flex-1 flex-col items-center justify-center bg-background px-5 py-10 sm:px-12 sm:py-12">
          <div className="w-full max-w-sm">
            <div className="mb-7 space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {copy.title}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.subtitle}
              </p>
            </div>

            {selectedPlan && (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
                <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                <div>
                  <p className="text-xs font-semibold text-violet-200">{copy.earlyAccessLabel}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.earlyAccessBody}</p>
                </div>
              </div>
            )}

            <RegisterForm locale={locale} />
          </div>
        </main>

        <aside className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-950 via-indigo-950 to-violet-900 p-12 lg:flex" aria-label={copy.panelEyebrow}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-violet-600/25 blur-3xl" />
            <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
          </div>

          <VekiraLogo className="relative" markClassName="h-9 w-9" wordmarkClassName="text-white" />

          <div className="relative max-w-md space-y-8">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
                {copy.panelEyebrow}
              </p>
              <h2 className="text-3xl font-bold leading-tight text-white xl:text-4xl">
                {copy.panelTitle}
              </h2>
              <p className="text-base leading-7 text-violet-100/75">
                {copy.panelBody}
              </p>
            </div>

            <ul className="space-y-4">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <li key={title.es} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-200">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{title[locale]}</h3>
                    <p className="mt-1 text-sm leading-6 text-violet-100/70">{body[locale]}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-violet-200/55">
            © {new Date().getFullYear()} Vekira. {copy.copyright}
          </p>
        </aside>
      </div>
    </div>
  )
}
