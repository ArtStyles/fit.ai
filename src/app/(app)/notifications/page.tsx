import { listProductNotifications } from '@/app/actions/notifications'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'
import { SettingsScreen } from '@/components/settings/SettingsScreen'

export const metadata = { title: 'Notificaciones · Vekira' }

export default async function NotificationsPage() {
  const initialPage = await listProductNotifications()

  return (
    <SettingsScreen
      title="Notificaciones"
      subtitle="Novedades de tu entrenamiento"
      backHref="/dashboard"
      backLabel="Dashboard"
      icon="bell-ring"
    >
      <NotificationCenter initialPage={initialPage} />
    </SettingsScreen>
  )
}
