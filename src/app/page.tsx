import { Dumbbell } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 bg-background p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
        <Dumbbell className="h-7 w-7" />
      </div>
      <div className="space-y-3">
        <h1 className="text-5xl font-black tracking-tight text-foreground">FitAI</h1>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          Entrenamiento personalizado que se adapta semana a semana con IA.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <PendingLink
          href="/register"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Empezar gratis
        </PendingLink>
        <PendingLink
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-6 text-sm font-semibold transition-colors hover:bg-accent/50"
        >
          Iniciar sesión
        </PendingLink>
      </div>
    </main>
  )
}
