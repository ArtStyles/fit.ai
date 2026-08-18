import { BellRing, Briefcase, ChevronRight, Dumbbell, Languages, Ruler, ShieldCheck, UserCog, UserRound } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { PendingLink } from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { getTrainerAccess } from '@/lib/coaching/access'
import { cn } from '@/lib/utils'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Ajustes · Vekira' }

const SECTIONS = [
  { href: '/settings/perfil',         label: 'Perfil',           icon: UserRound },
  { href: '/settings/datos',          label: 'Datos personales', icon: UserRound },
  { href: '/settings/entrenamiento',  label: 'Entrenamiento',    icon: Dumbbell  },
  { href: '/medidas',                 label: 'Medidas',          icon: Ruler     },
  { href: '/settings/notificaciones', label: 'Notificaciones',   icon: BellRing  },
  { href: '/settings/idioma',         label: 'Idioma',           icon: Languages },
  { href: '/settings/cuenta',         label: 'Cuenta',           icon: UserCog   },
]

export default async function SettingsPage() {
  const { user, profile, supabase } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const trainerAccess = await getTrainerAccess(user.id, supabase)
  const professionalSection = trainerAccess.granted
    ? { href: '/coach', label: 'Espacio de entrenador', icon: Briefcase }
    : { href: '/coach/apply?from=settings', label: 'Convertirme en entrenador', icon: Briefcase }
  const baseSections = profile.is_admin
    ? [{ href: '/admin', label: 'Administración', icon: ShieldCheck }, ...SECTIONS]
    : SECTIONS
  const professionalIndex = baseSections.findIndex(({ href }) => href === '/settings/entrenamiento') + 1
  const sections = [
    ...baseSections.slice(0, professionalIndex),
    professionalSection,
    ...baseSections.slice(professionalIndex),
  ]

  return (
    <SettingsScreen
      title={t('Ajustes')}
      subtitle={user.email}
      backHref="/dashboard"
      backLabel="Dashboard"
      icon={<UserRound className="h-5 w-5" />}
    >
      <nav className="overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
        {sections.map(({ href, label, icon: Icon }, i) => (
          <PendingLink
            key={href}
            href={href}
            showSpinner={false}
            className={cn(
              'flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20',
              i > 0 && 'border-t border-border/40',
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm font-medium text-foreground">{t(label)}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </PendingLink>
        ))}
      </nav>
    </SettingsScreen>
  )
}
