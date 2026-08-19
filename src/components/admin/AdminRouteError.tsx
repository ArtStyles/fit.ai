'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type AdminRouteErrorProps = {
  reset: () => void
  title?: string
}

export function AdminRouteError({
  reset,
  title = 'No se pudo cargar esta vista',
}: AdminRouteErrorProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <section
        role="alert"
        className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 text-center"
      >
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto h-8 w-8 text-red-300"
        />
        <h1 className="mt-4 font-display text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tus datos siguen guardados. Intenta nuevamente.
        </p>
        <Button type="button" onClick={reset} className="mt-5 min-h-11">
          Reintentar
        </Button>
      </section>
    </main>
  )
}
