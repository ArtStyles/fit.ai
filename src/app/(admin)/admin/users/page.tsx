import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminUserDirectory } from '@/components/admin/AdminUserDirectory'
import {
  normalizeAdminUserFilters,
  type AdminUserFilterParams,
} from '@/lib/admin/users'
import { listAdminUsers } from '@/lib/auth/admin'
import { requireAppUserContext } from '@/lib/auth/server'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

type AdminUsersPageProps = {
  searchParams?: AdminUserFilterParams
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const [data, { profile }] = await Promise.all([
    listAdminUsers(),
    requireAppUserContext(),
  ])
  const filters = normalizeAdminUserFilters(searchParams ?? {})
  const timeZone = resolveUserTimeZone(profile.timezone)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Usuarios" description="Cuentas, suscripciones y acceso" />
      <AdminUserDirectory {...data} filters={filters} timeZone={timeZone} />
    </main>
  )
}
