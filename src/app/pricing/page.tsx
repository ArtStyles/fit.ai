import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { getAppUserContext } from '@/lib/auth/server'
import { PricingSelector } from '@/components/pricing/PricingSelector'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Badge } from '@/components/ui/badge'
import { VekiraLogo } from '@/components/branding/VekiraLogo'

export const metadata: Metadata = {
  title: 'Precios',
  description: 'Elige Vekira Pro mensual o anual y desbloquea una experiencia de entrenamiento sin límites.',
}

export default async function PricingPage() {
  const { user, profile } = await getAppUserContext()
  const isAuthenticated = Boolean(user)
  const isPro = profile?.subscription_tier === 'pro'

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-4xl">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <PendingLink
            href={isAuthenticated ? '/dashboard' : '/'}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{isAuthenticated ? 'Dashboard' : 'Inicio'}</span>
          </PendingLink>

          <VekiraLogo markClassName="h-9 w-9" />

          <div className="flex justify-end">
            {isAuthenticated ? (
              <Badge variant="ghost" className="border border-border/60 bg-card/60 text-muted-foreground">
                {isPro ? 'Plan Pro' : 'Plan Free'}
              </Badge>
            ) : (
              <PendingLink href="/login" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
                Iniciar sesión
              </PendingLink>
            )}
          </div>
        </header>

        <section className="mx-auto max-w-xl pb-8 pt-14 text-center sm:pt-20">
          <p className="text-sm font-semibold text-violet-300">Vekira Pro</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-foreground sm:text-5xl">
            Elige tu ritmo.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Todas las herramientas para crear, ajustar y seguir tu entrenamiento en un único plan.
          </p>
        </section>

        <PricingSelector isAuthenticated={isAuthenticated} isPro={isPro} />
      </div>
    </main>
  )
}
