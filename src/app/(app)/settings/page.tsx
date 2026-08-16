import { BellRing, Contact as ContactRound, Dumbbell, Languages, Ruler, ShieldCheck, UserCog, UserRound } from 'lucide-react'
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
        { href: '/settings/perfil', label: t('Perfil'), description: t('Foto, nombre e identidad'), icon: UserRound },
        { href: '/settings/datos', label: t('Datos personales'), description: t('Edad, género y altura'), icon: ContactRound },
        { href: '/medidas?from=settings', label: t('Medidas'), description: t('Peso, perímetros y evolución'), icon: Ruler },
      ],
    },
    {
      title: t('Tu entrenamiento'),
      entries: [{ href: '/settings/entrenamiento', label: t('Entrenamiento'), description: t('Objetivo, agenda y equipo'), icon: Dumbbell }],
    },
    {
      title: t('Aplicación'),
      entries: [
        { href: '/settings/notificaciones', label: t('Notificaciones'), description: t('Recordatorios y avisos'), icon: BellRing },
        { href: '/settings/idioma', label: t('Idioma'), description: t('Idioma de la interfaz'), icon: Languages },
      ],
    },
    {
      title: t('Acceso y seguridad'),
      entries: [{ href: '/settings/cuenta', label: t('Cuenta'), description: t('Sesión, documentos y eliminación'), icon: UserCog }],
    },
  ]

  return (
    <SettingsScreen
      title={t('Ajustes')}
      subtitle={user.email}
      backHref="/dashboard"
      backLabel="Dashboard"
      icon={<UserRound className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {groups.map(group => <SettingsNavGroup key={group.title} {...group} />)}
        {profile.is_admin ? (
          <SettingsNavGroup
            title={t('Administración')}
            entries={[{ href: '/admin', label: t('Administración'), description: t('Gestión de la aplicación'), icon: ShieldCheck }]}
          />
        ) : null}
      </div>
    </SettingsScreen>
  )
}
