import type { Metadata } from 'next'
import { ShieldAlert } from 'lucide-react'
import { redirect } from 'next/navigation'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAppUserContext } from '@/lib/auth/server'
import { isSuspensionActive } from '@/lib/auth/access'

export const metadata: Metadata = { title: 'Cuenta suspendida' }

function formatUntil(value: string | null): string {
  if (!value) return 'Hasta nueva revisión'
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default async function SuspendedPage() {
  const { user, profile } = await getAppUserContext()
  if (!user) redirect('/login')
  if (!isSuspensionActive(profile)) redirect('/dashboard')

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-red-500/25 bg-card/70">
        <CardContent className="p-6 text-center sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-300">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold text-foreground">Cuenta suspendida</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tu acceso a Vekira está temporalmente restringido. Tus datos permanecen guardados.
          </p>

          <div className="mt-6 space-y-4 rounded-xl border border-border/60 bg-background/50 p-4 text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivo</p>
              <p className="mt-1 text-sm text-foreground">{profile?.suspension_reason ?? 'Revisión administrativa'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duración</p>
              <p className="mt-1 text-sm text-foreground">{formatUntil(profile?.suspended_until ?? null)}</p>
            </div>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Si consideras que se trata de un error, contacta al equipo de soporte indicando el correo de tu cuenta.
          </p>

          <form action={signOut} className="mt-6">
            <Button type="submit" variant="outline" className="w-full">Cerrar sesión</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
