import { SettingsNavGroup } from '@/components/settings/SettingsNavGroup'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Ajustes · Vekira' }

export default async function SettingsPage() {
  const { user, profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const groups = [
    {
      title: t('Tu perfil'),
      entries: [
        { href: '/settings/perfil', label: t('Perfil'), description: t('Foto, nombre e identidad'), icon: 'user-round' as const },
        { href: '/settings/datos', label: t('Datos personales'), description: t('Edad, género y altura'), icon: 'contact-round' as const },
        { href: '/medidas?from=settings', label: t('Medidas'), description: t('Peso, perímetros y evolución'), icon: 'ruler' as const },
      ],
    },
    {
      title: t('Tu entrenamiento'),
      entries: [{ href: '/settings/entrenamiento', label: t('Entrenamiento'), description: t('Objetivo, agenda y equipo'), icon: 'dumbbell' as const }],
    },
    {
      title: t('Aplicación'),
      entries: [
        { href: '/settings/notificaciones', label: t('Notificaciones'), description: t('Recordatorios y avisos'), icon: 'bell-ring' as const },
        { href: '/settings/idioma', label: t('Idioma'), description: t('Idioma de la interfaz'), icon: 'languages' as const },
      ],
    },
    {
      title: t('Acceso y seguridad'),
      entries: [{ href: '/settings/cuenta', label: t('Cuenta'), description: t('Sesión, documentos y eliminación'), icon: 'user-cog' as const }],
    },
  ]

  return (
    <SettingsScreen
      title={t('Ajustes')}
      subtitle={user.email}
      backHref="/dashboard"
      backLabel="Dashboard"
      icon="user-round"
    >
      <div className="space-y-6">
        {groups.map(group => <SettingsNavGroup key={group.title} {...group} />)}
        {profile.is_admin ? (
          <SettingsNavGroup
            title={t('Administración')}
            entries={[{ href: '/admin', label: t('Administración'), description: t('Gestión de la aplicación'), icon: 'shield-check' }]}
          />
        ) : null}
      </div>
    </SettingsScreen>
  )
}
