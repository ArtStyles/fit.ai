import { DashboardBannerEditor } from '@/components/admin/DashboardBannerEditor'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { getAdminDashboardBanner } from '@/lib/auth/admin'

export default async function AdminContentPage() {
  const data = await getAdminDashboardBanner()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Contenido" description="Banner y programación del dashboard" />
      <section className="mt-8" aria-label="Contenido del dashboard">
        <DashboardBannerEditor initialBanner={data.banner} enabled={data.enabled} />
      </section>
    </main>
  )
}
