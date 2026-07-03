'use client'

import { CreditCard, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ProPricingPlan } from '@/lib/billing/plans'

type Props = {
  plan: ProPricingPlan
  isPro: boolean
  featured?: boolean
}

export function MockCheckoutButton({ plan, isPro, featured = false }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          className={featured
            ? 'h-12 w-full bg-violet-500 font-bold text-white hover:bg-violet-400'
            : 'h-12 w-full font-bold'}
          variant={featured ? 'default' : 'outline'}
        >
          {isPro ? 'Gestionar suscripción' : `Elegir ${plan.name}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl border-border/70">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
            <CreditCard className="h-5 w-5" />
          </div>
          <DialogTitle>
            {isPro ? 'Gestión de suscripción en preparación' : `${plan.name} seleccionado`}
          </DialogTitle>
          <DialogDescription className="pt-1 leading-relaxed">
            {isPro
              ? 'Tu cuenta ya figura como Pro. La gestión del ciclo de cobro estará disponible cuando conectemos Stripe.'
              : `El checkout de Stripe todavía es un mock. No realizamos ningún cobro ni cambiamos tu plan al seleccionar ${plan.name}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-foreground">Sin cargos por ahora</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              La futura integración creará una sesión segura de Stripe y confirmará el plan mediante webhook.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" className="w-full sm:w-auto">Entendido</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
