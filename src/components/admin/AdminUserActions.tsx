'use client'

import { Ban, CheckCircle2, Crown, RotateCcw } from 'lucide-react'
import {
  reactivateUser,
  setUserSubscription,
  suspendUser,
} from '@/app/actions/admin'
import { SubmitButton } from '@/components/feedback/SubmitButton'
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
import type { AdminUserRecord } from '@/lib/auth/admin'

export function AdminUserActions({
  account,
  suspensionEnabled,
}: {
  account: AdminUserRecord
  suspensionEnabled: boolean
}) {
  if (account.isOwner) {
    return <p className="text-xs font-medium text-muted-foreground">Cuenta protegida</p>
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {account.subscriptionTier === 'free' ? (
        <form action={setUserSubscription}>
          <input type="hidden" name="targetUserId" value={account.id} />
          <input type="hidden" name="tier" value="pro" />
          <SubmitButton
            label="Activar Pro"
            pendingLabel="Activando"
            size="sm"
            className="min-h-11 min-w-11 bg-violet-500 text-white hover:bg-violet-400"
          >
            <Crown className="h-3.5 w-3.5" />
            Activar Pro
          </SubmitButton>
        </form>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="min-h-11 min-w-11 border-border/60">
              Cancelar Pro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Cancelar suscripción Pro</DialogTitle>
              <DialogDescription>
                {account.email} volverá al plan Free. Su historial y sus datos no se eliminarán.
              </DialogDescription>
            </DialogHeader>
            <form action={setUserSubscription}>
              <input type="hidden" name="targetUserId" value={account.id} />
              <input type="hidden" name="tier" value="free" />
              <DialogFooter className="gap-2 sm:gap-0">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className="min-h-11 min-w-11">Volver</Button>
                </DialogClose>
                <SubmitButton
                  label="Confirmar cancelación"
                  pendingLabel="Cancelando"
                  variant="destructive"
                  className="min-h-11 min-w-11"
                />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {!suspensionEnabled ? null : account.accountStatus === 'suspended' ? (
        <form action={reactivateUser}>
          <input type="hidden" name="targetUserId" value={account.id} />
          <SubmitButton
            label="Reactivar"
            pendingLabel="Reactivando"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reactivar
          </SubmitButton>
        </form>
      ) : (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 min-w-11 border-red-500/25 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Suspender
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>Suspender cuenta</DialogTitle>
              <DialogDescription>
                El usuario perderá el acceso inmediatamente, pero sus datos permanecerán guardados.
              </DialogDescription>
            </DialogHeader>
            <form action={suspendUser} className="space-y-4">
              <input type="hidden" name="targetUserId" value={account.id} />
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Motivo</span>
                <textarea
                  name="reason"
                  required
                  minLength={4}
                  maxLength={500}
                  rows={3}
                  placeholder="Ej. incumplimiento de las normas de la comunidad"
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Duración</span>
                <select
                  name="duration"
                  defaultValue="7"
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="7">7 días</option>
                  <option value="30">30 días</option>
                  <option value="indefinite">Indefinida</option>
                </select>
              </label>
              <DialogFooter className="gap-2 sm:gap-0">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className="min-h-11 min-w-11">Cancelar</Button>
                </DialogClose>
                <SubmitButton
                  label="Suspender cuenta"
                  pendingLabel="Suspendiendo"
                  variant="destructive"
                  className="min-h-11 min-w-11"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Suspender cuenta
                </SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
