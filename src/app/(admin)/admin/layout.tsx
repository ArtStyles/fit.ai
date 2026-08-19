import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin/AdminShell'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { requireAdminUserContext } from '@/lib/auth/admin'
import { requireAppUserContext } from '@/lib/auth/server'
import { normalizeLanguage } from '@/lib/i18n'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata: Metadata = { title: { default: 'Administración', template: '%s | Administración' } }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [adminContext, appContext] = await Promise.all([
    requireAdminUserContext(),
    requireAppUserContext(),
  ])
  const language = normalizeLanguage(appContext.profile.language)
  const timeZone = resolveUserTimeZone(appContext.profile.timezone)

  return (
    <I18nProvider language={language} timeZone={timeZone}>
      <AdminShell adminLabel={adminContext.user.email ?? 'Administrador'}>{children}</AdminShell>
    </I18nProvider>
  )
}
