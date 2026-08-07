import { Bell } from 'lucide-react'
import { AppLoadingShell, BackHeader, RowSkeletons } from '@/components/feedback/RouteLoading'

export default function Loading() {
  return (
    <AppLoadingShell>
      <BackHeader
        backLabel="Dashboard"
        title="Notificaciones"
        subtitle="Novedades de tu entrenamiento"
        icon={Bell}
      />
      <RowSkeletons count={5} avatar={false} className="mt-8" />
    </AppLoadingShell>
  )
}
