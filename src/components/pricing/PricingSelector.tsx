'use client'

import { useState } from 'react'
import { Check, Crown } from 'lucide-react'
import { MockCheckoutButton } from '@/components/pricing/MockCheckoutButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  PRO_FEATURES,
  PRO_PRICING_PLANS,
  type BillingInterval,
} from '@/lib/billing/plans'

type Props = {
  isAuthenticated: boolean
  isPro: boolean
}

export function PricingSelector({ isAuthenticated, isPro }: Props) {
  const [interval, setInterval] = useState<BillingInterval>('annual')
  const plan = interval === 'annual' ? PRO_PRICING_PLANS[1] : PRO_PRICING_PLANS[0]
  const annual = interval === 'annual'

  return (
    <section className="mx-auto max-w-xl" aria-label="Elegir plan FitAI Pro">
      <div className="grid grid-cols-2 rounded-xl border border-border/60 bg-muted/20 p-1">
        <Button
          type="button"
          variant="ghost"
          aria-pressed={!annual}
          onClick={() => setInterval('monthly')}
          className={cn(
            'h-12 rounded-lg text-sm hover:bg-background/70',
            !annual && 'bg-background text-foreground shadow-sm hover:bg-background',
          )}
        >
          <span>
            <span className="block font-semibold">Mensual</span>
            <span className="block text-[11px] font-normal text-muted-foreground">USD 9.99/mes</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={annual}
          onClick={() => setInterval('annual')}
          className={cn(
            'h-12 rounded-lg text-sm hover:bg-background/70',
            annual && 'bg-background text-foreground shadow-sm hover:bg-background',
          )}
        >
          <span>
            <span className="flex items-center justify-center gap-2 font-semibold">
              Anual
              <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">-50%</span>
            </span>
            <span className="block text-[11px] font-normal text-muted-foreground">USD 5.00/mes</span>
          </span>
        </Button>
      </div>

      <Card className="mt-4 overflow-hidden border-border/70 bg-card/60 shadow-xl shadow-black/10">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
                <Crown className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">FitAI Pro</p>
                <p className="text-xs text-muted-foreground">Todo incluido</p>
              </div>
            </div>
            {annual && (
              <Badge variant="ghost" className="border border-violet-500/25 bg-violet-500/10 text-violet-200">
                Recomendado
              </Badge>
            )}
          </div>

          <div className="mt-7">
            <div className="flex items-end gap-2">
              <span className="pb-1.5 text-sm font-semibold text-muted-foreground">USD</span>
              <span className="font-display text-5xl font-black tracking-tight text-foreground">{plan.price}</span>
              <span className="pb-1.5 text-sm text-muted-foreground">/{annual ? 'año' : 'mes'}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {annual ? 'Equivale a USD 5.00 al mes · cobro anual' : 'Cobro mensual · cancela cuando quieras'}
            </p>
          </div>

          <div className="mt-7">
            {isAuthenticated ? (
              <MockCheckoutButton plan={plan} isPro={isPro} featured />
            ) : (
              <PendingLink
                href={`/register?plan=${plan.id}`}
                className="inline-flex h-12 w-full items-center justify-center rounded-md bg-violet-500 px-4 text-sm font-bold text-white transition-colors hover:bg-violet-400"
              >
                Empezar con Pro
              </PendingLink>
            )}
          </div>

          <div className="mt-7 border-t border-border/60 pt-6">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Incluye</p>
            <ul className="space-y-3">
              {PRO_FEATURES.map(feature => (
                <li key={feature} className="flex items-start gap-3 text-sm text-foreground/90">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" strokeWidth={2.5} />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
        <p>Sin permanencia. Stripe se conectará en la próxima fase; por ahora no se realizará ningún cargo.</p>
        {!isAuthenticated && (
          <PendingLink href="/register" className="mt-3 inline-flex font-semibold text-foreground underline underline-offset-4 hover:text-violet-300">
            Prefiero continuar gratis
          </PendingLink>
        )}
      </div>
    </section>
  )
}
