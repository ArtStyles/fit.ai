import type { Metadata } from 'next'
import { Crown, Search, ShieldCheck, UserRoundCheck, UsersRound, UserRoundSearch } from 'lucide-react'
import { AdminUserActions } from '@/components/admin/AdminUserActions'
import { DashboardBannerEditor } from '@/components/admin/DashboardBannerEditor'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getAdminDashboardBanner, listAdminUsers } from '@/lib/auth/admin'

export const metadata: Metadata = { title: 'Administración' }

function formatDate(value: string | null): string {
  if (!value) return 'Nunca'
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value))
}

function initials(name: string | null, email: string): string {
  const source = name?.trim() || email
  return source.slice(0, 2).toUpperCase()
}

export default async function AdminPage({ searchParams }: { searchParams?: { q?: string } }) {
  const [userData, bannerData] = await Promise.all([
    listAdminUsers(),
    getAdminDashboardBanner(),
  ])
  const { users, suspensionEnabled } = userData
  const query = searchParams?.q?.trim().toLowerCase() ?? ''
  const visibleUsers = query
    ? users.filter(user => [user.email, user.fullName, user.username].some(value => value?.toLowerCase().includes(query)))
    : users

  const proCount = users.filter(user => user.subscriptionTier === 'pro').length
  const suspendedCount = users.filter(user => user.accountStatus === 'suspended').length

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar
        title="Administración"
        subtitle="Usuarios, suscripciones y acceso"
        backHref="/settings"
        backLabel="Ajustes"
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="mt-8" aria-label="Herramientas administrativas">
          <PendingLink href="/admin/trainers" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
            <Card className="border-violet-500/20 bg-violet-500/5 transition-colors hover:bg-violet-500/10">
              <CardContent className="flex items-center gap-3 p-4">
                <UserRoundSearch className="h-5 w-5 text-violet-300" />
                <div>
                  <p className="font-semibold">Entrenadores</p>
                  <p className="text-xs text-muted-foreground">Revisar solicitudes y expedientes profesionales</p>
                </div>
              </CardContent>
            </Card>
          </PendingLink>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Resumen de cuentas">
          <Card className="border-border/60 bg-muted/10">
            <CardContent className="flex items-center gap-3 p-4">
              <UsersRound className="h-5 w-5 text-muted-foreground" />
              <div><p className="text-2xl font-bold">{users.length}</p><p className="text-xs text-muted-foreground">Cuentas</p></div>
            </CardContent>
          </Card>
          <Card className="border-violet-500/20 bg-violet-500/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Crown className="h-5 w-5 text-violet-300" />
              <div><p className="text-2xl font-bold">{proCount}</p><p className="text-xs text-muted-foreground">Usuarios Pro</p></div>
            </CardContent>
          </Card>
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="flex items-center gap-3 p-4">
              <UserRoundCheck className="h-5 w-5 text-red-300" />
              <div><p className="text-2xl font-bold">{suspendedCount}</p><p className="text-xs text-muted-foreground">Suspendidas</p></div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6" aria-label="Contenido del dashboard">
          <DashboardBannerEditor initialBanner={bannerData.banner} enabled={bannerData.enabled} />
        </section>

        <form method="get" className="relative mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={searchParams?.q ?? ''}
            placeholder="Buscar por correo, nombre o usuario"
            className="h-11 w-full rounded-xl border border-input bg-muted/10 pl-10 pr-24 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-violet-500"
          />
          <Button type="submit" size="sm" className="absolute right-1.5 top-1.5 h-8 bg-violet-500 text-white hover:bg-violet-400">
            Buscar
          </Button>
        </form>

        <section className="mt-5 space-y-3" aria-label="Cuentas de usuario">
          {!suspensionEnabled && (
            <Card className="border-amber-500/25 bg-amber-500/5">
              <CardContent className="p-4 text-sm text-amber-100/80">
                La gestión de suspensiones estará disponible al aplicar la migración 029. La administración de planes ya está activa.
              </CardContent>
            </Card>
          )}
          {visibleUsers.length === 0 ? (
            <Card className="border-border/60 bg-muted/10">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">No se encontraron cuentas.</CardContent>
            </Card>
          ) : visibleUsers.map(account => (
            <Card key={account.id} className="border-border/60 bg-card/50">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-11 w-11 border border-border/60">
                      <AvatarImage src={account.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-xs font-bold">{initials(account.fullName, account.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{account.fullName || account.email}</p>
                        {account.isOwner && <Badge className="bg-violet-500 text-white hover:bg-violet-500">Propietario</Badge>}
                        <Badge variant="outline" className={account.subscriptionTier === 'pro' ? 'border-violet-500/30 text-violet-200' : 'border-border/60 text-muted-foreground'}>
                          {account.subscriptionTier === 'pro' ? 'Pro' : 'Free'}
                        </Badge>
                        <Badge variant="outline" className={account.accountStatus === 'suspended' ? 'border-red-500/30 text-red-300' : 'border-emerald-500/25 text-emerald-300'}>
                          {account.accountStatus === 'suspended' ? 'Suspendida' : 'Activa'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{account.email}{account.username ? ` · @${account.username}` : ''}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        Alta: {formatDate(account.createdAt)} · Último acceso: {formatDate(account.lastSignInAt)}
                      </p>
                    </div>
                  </div>

                  {account.accountStatus === 'suspended' && account.suspensionReason && (
                    <div className="rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 text-xs text-red-200/80 lg:max-w-xs">
                      <p className="font-semibold">Motivo: {account.suspensionReason}</p>
                      <p className="mt-0.5 opacity-70">Hasta: {account.suspendedUntil ? formatDate(account.suspendedUntil) : 'sin fecha'}</p>
                    </div>
                  )}

                  <AdminUserActions account={account} suspensionEnabled={suspensionEnabled} />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  )
}
