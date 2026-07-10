import Link from 'next/link'
import { LogOut, UserCog } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { Button } from '@/components/ui/button'
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection'
import { requireAppUserContext } from '@/lib/auth/server'
import { signOut } from '@/app/(auth)/actions'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { localizedPath } from '@/lib/i18n/routing'

export const metadata = { title: 'Cuenta · Vekira' }

export default async function AccountSettingsPage() {
  const { user, profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)
  const t = createTranslator(language)
  const privacyHref = `${localizedPath(language, 'privacy')}?from=settings-account`

  return (
    <SettingsScreen
      title={t('Cuenta')}
      subtitle={user.email}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon={<UserCog className="h-5 w-5" />}
    >
      <form action={signOut}>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full border-border/60 bg-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('Cerrar sesión')}
        </Button>
      </form>

      <div className="mt-8">
        <DeleteAccountSection />
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link href={privacyHref} className="underline transition-colors hover:text-foreground">
          {t('Política de privacidad')}
        </Link>
      </p>
    </SettingsScreen>
  )
}
