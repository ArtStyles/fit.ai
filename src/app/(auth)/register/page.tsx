import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { CalendarRange, ClipboardCheck, Sparkles, TrendingUp } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import type { AppLanguage } from '@/lib/i18n'
import { RegisterForm } from './RegisterForm'
import { registrationLocale } from './registerProfile'

export const metadata: Metadata = {
  title: 'Crear cuenta | Sign up',
  robots: { index: false, follow: true },
}

const EARLY_ACCESS_PLANS = new Set(['pro-early-access', 'pro-monthly', 'pro-annual'])

const PAGE_COPY: Record<AppLanguage, {
  title: string
  subtitle: string
  earlyAccessLabel: string
  earlyAccessBody: string
  panelEyebrow: string
  panelTitle: string
  panelBody: string
}> = {
  es: {
    title: 'Crea tu cuenta.',
    subtitle: 'Empieza con tu correo y una contraseña.',
    earlyAccessLabel: 'Preferencia de acceso anticipado',
    earlyAccessBody: 'Esta opción es informativa y no cambia el proceso de registro.',
    panelEyebrow: 'Tu entrenamiento, conectado',
    panelTitle: 'Tu próxima semana empieza aquí.',
    panelBody: 'Vekira reúne planificación, seguimiento y progresión en un mismo lugar.',
  },
  en: {
    title: 'Create your account.',
    subtitle: 'Start with your email and a password.',
    earlyAccessLabel: 'Early-access preference',
    earlyAccessBody: 'This option is informational and does not change the registration process.',
    panelEyebrow: 'Your training, connected',
    panelTitle: 'Your next week starts here.',
    panelBody: 'Vekira brings planning, tracking, and progression together in one place.',
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
  searchParams?: Promise<{ plan?: string; locale?: string }>
}

export default async function RegisterPage({ searchParams: searchParamsPromise }: RegisterPageProps) {
  const searchParams = await searchParamsPromise
  const locale = registrationLocale(
    searchParams?.locale,
    (await cookies()).get('fitai-language')?.value,
  )
  const selectedPlan = searchParams?.plan && EARLY_ACCESS_PLANS.has(searchParams.plan)
    ? searchParams.plan
    : null
  const copy = PAGE_COPY[locale]

  return (
    <AuthShell
      homeHref={`/${locale}`}
      homeLabel={locale === 'es' ? 'Ir al inicio' : 'Go to home'}
      aside={(
        <div className="space-y-9">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{copy.panelEyebrow}</p>
            <h2 className="font-display text-4xl font-bold leading-tight text-foreground xl:text-5xl">{copy.panelTitle}</h2>
            <p className="text-base leading-7 text-muted-foreground">{copy.panelBody}</p>
          </div>
          <ul className="space-y-6">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <li key={title.es} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{title[locale]}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{body[locale]}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    >
      <div className="mb-8 space-y-3">
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground">{copy.title}</h1>
        <p className="text-base leading-7 text-muted-foreground">{copy.subtitle}</p>
      </div>
      {selectedPlan && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
          <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-violet-200">{copy.earlyAccessLabel}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.earlyAccessBody}</p>
          </div>
        </div>
      )}
      <RegisterForm locale={locale} />
    </AuthShell>
  )
}
