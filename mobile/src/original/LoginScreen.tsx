import Link from 'next/link'
import { CalendarRange, ClipboardCheck, TrendingUp } from 'lucide-react'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/app/(auth)/login/LoginForm'

const FEATURES = [
  { icon: CalendarRange, title: 'Tu semana, organizada', text: 'Consulta tu rutina y retoma donde lo dejaste.' },
  { icon: ClipboardCheck, title: 'Cada sesión cuenta', text: 'Registra tus series, repeticiones y sensaciones.' },
  { icon: TrendingUp, title: 'Tu progreso, a la vista', text: 'Revisa cómo evolucionas con el tiempo.' },
]

export function LoginScreen() {
  return (
    <AuthShell aside={(
      <div className="space-y-9">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Tu entrenamiento, conectado</p>
          <h2 className="font-display text-4xl font-bold leading-tight text-foreground xl:text-5xl">Vuelve a tu ritmo.</h2>
          <p className="text-base leading-7 text-muted-foreground">Tu planificación, tus sesiones y tu progreso. Todo listo para seguir avanzando.</p>
        </div>
        <ul className="space-y-6">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}>
      <div className="mb-8 space-y-3">
        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground">Bienvenido de vuelta.</h1>
        <p className="text-base leading-7 text-muted-foreground">Accede a tu panel y continúa tu progreso.</p>
      </div>
      <LoginForm />
      <p className="mt-7 text-center text-xs leading-6 text-muted-foreground">
        Al continuar aceptas nuestra{' '}
        <Link href="/es/privacidad?from=/login" className="rounded-sm underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">Política de privacidad</Link>.
      </p>
    </AuthShell>
  )
}
