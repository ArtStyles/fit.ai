import Link from 'next/link'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { AvatarUploader } from '@/components/profile/AvatarUploader'
import { UsernameField } from '@/components/settings/UsernameField'
import { PrivacyToggle } from '@/components/settings/PrivacyToggle'
import { ProfileNameForm } from '@/components/settings/ProfileNameForm'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { isCommunityEnabled } from '@/lib/features/community'

export const metadata = { title: 'Perfil · Vekira' }

export default async function ProfilePage() {
  const { user, profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))
  const communityEnabled = isCommunityEnabled()

  const firstName = profile?.full_name?.split(' ')[0] ?? user.email?.split('@')[0] ?? '?'
  const initials = firstName.slice(0, 2).toUpperCase()

  return (
    <SettingsScreen
      title={t('Perfil')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="user-round"
    >
      <div className="space-y-6">
        <SettingsSection title={t('Identidad')} description={t('Así te reconoce Vekira en tu cuenta.')}>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:text-left">
            <AvatarUploader
              avatarUrl={profile?.avatar_url ?? null}
              initials={initials}
              size="lg"
              showRemove
            />
            <div className="min-w-0 text-center sm:text-left">
              <p className="font-semibold text-foreground">{profile.full_name || t('Sin nombre')}</p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('Nombre')}>
          <ProfileNameForm initialName={profile?.full_name ?? ''} />
        </SettingsSection>

        {communityEnabled ? (
          <SettingsSection title={t('Perfil en Comunidad')}>
            <div className="space-y-4">
              <UsernameField initialUsername={profile?.username ?? ''} />
              <PrivacyToggle initialPrivate={profile?.is_private ?? false} />
              {profile?.username ? (
                <Link
                  href={`/u/${profile.username}`}
                  className="flex min-h-11 items-center justify-center rounded-md border border-border/60 px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                >
                  {t('Ver mi perfil')}
                </Link>
              ) : null}
            </div>
          </SettingsSection>
        ) : null}
      </div>
    </SettingsScreen>
  )
}
