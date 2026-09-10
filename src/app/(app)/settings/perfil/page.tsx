import Link from 'next/link'
import { Mail, PencilLine } from 'lucide-react'
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

  const displayName = profile.full_name?.trim() || t('Sin nombre')
  const initials = (profile.full_name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || user.email?.slice(0, 2) || '?').toUpperCase()

  return (
    <SettingsScreen
      title={t('Perfil personal')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="user-round"
    >
      <div className="space-y-5">
        <section aria-label={t('Identidad')} className="overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-card to-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-5">
            <div className="shrink-0">
              <AvatarUploader
                avatarUrl={profile?.avatar_url ?? null}
                initials={initials}
                size="lg"
                showRemove
              />
            </div>
            <div className="min-w-0 flex-1 py-2">
              <h2 className="break-words font-display text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">{displayName}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('Así te reconoce Vekira en tu cuenta.')}</p>
            </div>
          </div>
          {user.email ? <p className="mt-5 flex items-start gap-2 border-t border-border/60 pt-4 text-sm leading-6 text-muted-foreground">
            <Mail aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-all">{user.email}</span>
          </p> : null}
        </section>

        <section aria-labelledby="edit-profile-title" className="rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-300"><PencilLine aria-hidden="true" className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h2 id="edit-profile-title" className="text-base font-semibold text-foreground">{t('Editar perfil')}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('Elige cómo quieres que aparezca tu nombre.')}</p>
            </div>
          </div>
          <ProfileNameForm initialName={profile?.full_name ?? ''} />
        </section>

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
