import type { Metadata } from 'next'
import { Crown } from 'lucide-react'
import { getAppUserContext } from '@/lib/auth/server'
import { EarlyAccessPlans } from '@/components/pricing/EarlyAccessPlans'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Badge } from '@/components/ui/badge'
import { PageTopBar } from '@/components/navigation/PageTopBar'

export const metadata: Metadata = {
  title: 'Planes',
  description: 'Compara las funciones disponibles en los planes Free y Pro de Vekira durante el acceso anticipado.',
  robots: { index: false, follow: true },
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

      <div className="mx-auto max-w-5xl px-4 pb-4 pt-14 sm:px-6 sm:pt-20">
        <EarlyAccessPlans isAuthenticated={isAuthenticated} />
      </div>
    </main>
  )
}
