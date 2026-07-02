import Link from 'next/link'
import { Save, UserRound } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { AvatarUploader } from '@/components/profile/AvatarUploader'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { UsernameField } from '@/components/settings/UsernameField'
import { PrivacyToggle } from '@/components/settings/PrivacyToggle'
import { requireAppUserContext } from '@/lib/auth/server'
import { updateProfileName } from '@/app/actions/settings'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Perfil · FitAI' }

export default async function ProfilePage() {
  const { user, profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))

  const firstName = profile?.full_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? '?'
  const initials = firstName.slice(0, 2).toUpperCase()

  return (
    <SettingsScreen
      title={t('Perfil')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon={<UserRound className="h-5 w-5" />}
    >
      <section className="flex flex-col items-center rounded-2xl border border-border/60 bg-muted/10 p-6">
        <AvatarUploader
          avatarUrl={profile?.avatar_url ?? null}
          initials={initials}
          size="lg"
          showRemove
        />
      </section>

      <div className="mt-6">
        <UsernameField initialUsername={profile?.username ?? ''} />
      </div>
      <div className="mt-4">
        <PrivacyToggle initialPrivate={profile?.is_private ?? false} />
      </div>
      {profile?.username && (
        <Link
          href={`/u/${profile.username}`}
          className="mt-3 flex h-10 items-center justify-center rounded-md border border-border/60 text-sm font-medium text-foreground"
        >
          {t('Ver mi perfil')}
        </Link>
      )}

      <form action={updateProfileName} className="mt-6 space-y-6">
        <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t('Nombre')}</span>
            <input
              name="fullName"
              defaultValue={profile?.full_name ?? ''}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
            />
          </label>
        </section>

        <SubmitButton
          label={t('Guardar')}
          pendingLabel={t('Guardando')}
          className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
        >
          <Save className="mr-2 h-4 w-4" />
          {t('Guardar')}
        </SubmitButton>
      </form>
    </SettingsScreen>
  )
}
