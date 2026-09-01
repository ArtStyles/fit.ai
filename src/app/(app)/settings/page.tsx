import { SettingsNavGroup } from '@/components/settings/SettingsNavGroup'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'
import { getTrainerAccess } from '@/lib/coaching/access'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Ajustes \u00b7 Vekira' }

export default async function SettingsPage() {
  const { user, profile, supabase } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const trainerAccess = await getTrainerAccess(user.id, supabase)
  const professionalEntry = trainerAccess.granted
    ? {
      href: '/coach',
      label: t('Espacio de entrenador'),
      description: t('Clientes, rutinas y servicios'),
      icon: 'briefcase' as const,
    }
    : {
      href: '/coach/apply?from=settings',
      label: t('Convertirme en entrenador'),
      description: t('Solicitud y perfil profesional'),
      icon: 'briefcase' as const,
    }
  const groups = [
    {
      title: t('Tu perfil'),
      entries: [
        { href: '/settings/perfil', label: t('Perfil'), description: t('Foto, nombre e identidad'), icon: 'user-round' as const },
        { href: '/settings/datos', label: t('Datos personales'), description: t('Edad, g\u00e9nero y altura'), icon: 'contact-round' as const },
        { href: '/medidas?from=settings', label: t('Medidas'), description: t('Peso, per\u00edmetros y evoluci\u00f3n'), icon: 'ruler' as const },
      ],
    },
    {
      title: t('Tu entrenamiento'),
      entries: [
        { href: '/settings/entrenamiento', label: t('Entrenamiento'), description: t('Objetivo, agenda y equipo'), icon: 'dumbbell' as const },
        professionalEntry,
      ],
    },
    {
      title: t('Aplicaci\u00f3n'),
      entries: [
        { href: '/settings/notificaciones', label: t('Notificaciones'), description: t('Recordatorios y avisos'), icon: 'bell-ring' as const },
        { href: '/settings/musica', label: t('Integraci\u00f3n musical'), description: t('Reproductor del sistema Android'), icon: 'music-2' as const },
        { href: '/settings/idioma', label: t('Idioma'), description: t('Idioma de la interfaz'), icon: 'languages' as const },
      ],
    },
    {
      title: t('Acceso y seguridad'),
      entries: [{ href: '/settings/cuenta', label: t('Cuenta'), description: t('Sesi\u00f3n, documentos y eliminaci\u00f3n'), icon: 'user-cog' as const }],
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
            title={t('Administraci\u00f3n')}
            entries={[{ href: '/admin', label: t('Administraci\u00f3n'), description: t('Gesti\u00f3n de la aplicaci\u00f3n'), icon: 'shield-check' }]}
          />
        ) : null}
      </div>
    </SettingsScreen>
  )
}
