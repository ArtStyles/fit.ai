import type { Metadata } from 'next'
import { Crown } from 'lucide-react'
import { getAppUserContext } from '@/lib/auth/server'
import { PricingSelector } from '@/components/pricing/PricingSelector'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Badge } from '@/components/ui/badge'
import { PageTopBar } from '@/components/navigation/PageTopBar'

export const metadata: Metadata = {
  title: 'Precios',
  description: 'Elige Vekira Pro mensual o anual y desbloquea una experiencia de entrenamiento sin límites.',
}

export default async function PricingPage() {
  const { user, profile } = await getAppUserContext()
  const isAuthenticated = Boolean(user)
  const isPro = profile?.subscription_tier === 'pro'

  return (
    <main className="min-h-screen bg-background pb-16">
      <PageTopBar
        title="Vekira Pro"
        subtitle="Planes y suscripción"
        backHref={isAuthenticated ? '/dashboard' : '/'}
        backLabel={isAuthenticated ? 'Dashboard' : 'Inicio'}
        icon={<Crown className="h-5 w-5" />}
        right={isAuthenticated ? (
          <Badge variant="ghost" className="border border-border/60 bg-card/60 text-muted-foreground">
            {isPro ? 'Plan Pro' : 'Plan Free'}
          </Badge>
        ) : (
          <PendingLink href="/login" className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground">
            Entrar
          </PendingLink>
        )}
      />

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
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
