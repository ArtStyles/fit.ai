import { AdminUserActions } from '@/components/admin/AdminUserActions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AdminUserRecord } from '@/lib/auth/admin'
import {
  filterAdminUsers,
  type AdminUserFilters,
} from '@/lib/admin/users'

type AdminUserDirectoryProps = {
  users: AdminUserRecord[]
  suspensionEnabled: boolean
  filters: AdminUserFilters
  timeZone: string
}

type AdminUserRowProps = {
  account: AdminUserRecord
  suspensionEnabled: boolean
  timeZone: string
}

function SuspensionUnavailableNotice() {
  return (
    <p
      role="status"
      className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-100"
    >
      El estado de suspensión no está disponible en este momento.
    </p>
  )
}

function AdminUsersEmptyState() {
  return (
    <p className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
      No se encontraron cuentas
    </p>
  )
}

function formatAdminUserDate(value: string | null, timeZone: string): string {
  if (!value) return 'Sin actividad'

  return new Intl.DateTimeFormat('es-CU', { dateStyle: 'medium', timeZone })
    .format(new Date(value))
}

function AdminUserRow({ account, suspensionEnabled, timeZone }: AdminUserRowProps) {
  const displayName = account.fullName ?? account.username ?? account.email
  const statusLabel = !suspensionEnabled
    ? 'No disponible'
    : account.accountStatus === 'suspended' ? 'Suspendida' : 'Activa'

  return (
    <article className="grid gap-4 border-b border-border/50 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_8rem_10rem_minmax(15rem,auto)] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar>
          <AvatarImage src={account.avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{displayName.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{displayName}</h2>
          <p className="truncate text-sm text-muted-foreground">{account.email}</p>
        </div>
      </div>
      <Badge variant="outline">{account.subscriptionTier === 'pro' ? 'Pro' : 'Free'}</Badge>
      <div>
        <Badge variant="outline">{statusLabel}</Badge>
        <p className="mt-1 text-xs text-muted-foreground">
          Último acceso: {formatAdminUserDate(account.lastSignInAt, timeZone)}
        </p>
      </div>
      <AdminUserActions account={account} suspensionEnabled={suspensionEnabled} />
    </article>
  )
}

export function AdminUserDirectory({
  users,
  suspensionEnabled,
  filters,
  timeZone,
}: AdminUserDirectoryProps) {
  const visibleUsers = filterAdminUsers(users, filters)
  const summary = {
    total: users.length,
    pro: users.filter(account => account.subscriptionTier === 'pro').length,
    suspended: suspensionEnabled
      ? users.filter(account => account.accountStatus === 'suspended').length
      : null,
  }

  return (
    <div className="mt-8 space-y-5">
      <dl aria-label="Resumen de cuentas" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 p-4">
          <dt className="text-xs text-muted-foreground">Usuarios</dt>
          <dd className="mt-1 text-2xl font-bold">{summary.total}</dd>
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <dt className="text-xs text-muted-foreground">Usuarios Pro</dt>
          <dd className="mt-1 text-2xl font-bold">{summary.pro}</dd>
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <dt className="text-xs text-muted-foreground">Suspendidas</dt>
          <dd className="mt-1 text-2xl font-bold">{summary.suspended ?? 'No disponible'}</dd>
        </div>
      </dl>

      <form
        method="get"
        className="grid gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 md:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]"
      >
        <input
          name="q"
          defaultValue={filters.query}
          aria-label="Buscar usuarios"
          className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-violet-500"
        />
        <select
          name="status"
          defaultValue={filters.status}
          aria-label="Estado de cuenta"
          className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="suspended">Suspendidas</option>
        </select>
        <select
          name="tier"
          defaultValue={filters.tier}
          aria-label="Plan"
          className="min-h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="all">Todos los planes</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <Button type="submit" className="min-h-11">Filtrar</Button>
      </form>

      {!suspensionEnabled ? <SuspensionUnavailableNotice /> : null}

      <section aria-label="Cuentas de usuario">
        {visibleUsers.length === 0 ? <AdminUsersEmptyState /> : visibleUsers.map(account => (
          <AdminUserRow
            key={account.id}
            account={account}
            timeZone={timeZone}
            suspensionEnabled={suspensionEnabled}
          />
        ))}
      </section>
    </div>
  )
}
