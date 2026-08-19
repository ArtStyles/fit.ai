import type { AdminOverviewData } from '@/lib/admin/overview'
import { PendingLink } from '@/components/navigation/PendingLink'
import { AdminActivityList } from '@/components/admin/AdminActivityList'
import { AdminMetricCard } from '@/components/admin/AdminMetricCard'

type AdminOverviewProps = {
  data: AdminOverviewData
  timeZone: string
}

const shortcuts = [
  {
    href: '/admin/users',
    title: 'Usuarios',
    description: 'Gestionar cuentas, planes y acceso.',
  },
  {
    href: '/admin/trainers',
    title: 'Entrenadores',
    description: 'Revisar solicitudes y expedientes profesionales.',
  },
  {
    href: '/admin/content',
    title: 'Contenido',
    description: 'Administrar el banner del dashboard.',
  },
] as const

export function AdminOverview({ data, timeZone }: AdminOverviewProps) {
  const { metrics } = data
  const pendingApplications = metrics.pendingApplications

  return (
    <div className="mt-8">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de la plataforma">
        <AdminMetricCard
          label="Usuarios"
          value={metrics.totalUsers}
          detail={metrics.newUsersThisMonth === null ? 'No disponible' : `+${metrics.newUsersThisMonth} este mes`}
        />
        <AdminMetricCard label="Usuarios Pro" value={metrics.proUsers} tone="violet" />
        <AdminMetricCard label="Solicitudes" value={metrics.totalApplications} tone="warning" />
        <AdminMetricCard label="Suspendidas" value={metrics.suspendedUsers} tone="danger" />
      </section>

      {typeof pendingApplications === 'number' && pendingApplications > 0 ? (
        <PendingLink
          href="/admin/trainers"
          className="mt-4 block min-h-11 min-w-11 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 transition-colors hover:bg-amber-500/10 focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <p className="text-sm font-semibold text-amber-100">Atención requerida</p>
          <p className="mt-1 text-sm text-amber-100/80">
            {pendingApplications} expediente{pendingApplications === 1 ? '' : 's'} requiere{pendingApplications === 1 ? '' : 'n'} atención
          </p>
        </PendingLink>
      ) : null}

      <AdminActivityList items={data.activity} timeZone={timeZone} />

      <section className="mt-8" aria-labelledby="accesos-directos">
        <h2 id="accesos-directos" className="font-display text-xl font-bold text-foreground">Accesos directos</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {shortcuts.map(shortcut => (
            <PendingLink
              key={shortcut.href}
              href={shortcut.href}
              className="min-h-11 min-w-11 rounded-2xl border border-border/60 bg-card/60 p-4 transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <p className="font-semibold text-foreground">{shortcut.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{shortcut.description}</p>
            </PendingLink>
          ))}
        </div>
      </section>
    </div>
  )
}
