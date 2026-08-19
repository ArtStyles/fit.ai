import { AdminOverview } from '@/components/admin/AdminOverview'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { getAdminOverviewData } from '@/lib/auth/adminOverview'
import { requireAppUserContext } from '@/lib/auth/server'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export default async function AdminPage() {
  const { profile } = await requireAppUserContext()
  const timeZone = resolveUserTimeZone(profile.timezone)
  const data = await getAdminOverviewData({ now: new Date().toISOString(), timeZone })

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Resumen" description="Estado general de la plataforma" />
      <AdminOverview data={data} timeZone={timeZone} />
    </main>
  )
}
