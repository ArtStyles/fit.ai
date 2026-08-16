import Link from 'next/link'
import { LogOut, UserCog } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection'
import { requireAppUserContext } from '@/lib/auth/server'
import { signOut } from '@/app/(auth)/actions'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Cuenta · Vekira' }

export default async function AccountSettingsPage() {
  const { user, profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)
  const t = createTranslator(language)
  const legal = language === 'en'
    ? { privacy: '/en/privacy', terms: '/en/terms' }
    : { privacy: '/es/privacidad', terms: '/es/terminos' }

  return (
    <SettingsScreen
      title={t('Cuenta')}
      subtitle={user.email}
      eyebrow={t('Acceso y seguridad')}
      description={t('Gestiona tu acceso, sesión y documentos.')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon={<UserCog className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <SettingsSection title={t('Cuenta de acceso')} description={t('La dirección que usas para acceder a Vekira.')}>
          <p className="rounded-xl border border-border/50 bg-background/40 px-4 py-3 text-sm text-foreground">{user.email}</p>
        </SettingsSection>

        <SettingsSection title={t('Sesión')} description={t('Controla la sesión activa de este dispositivo.')}>
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
        </SettingsSection>

        <SettingsSection title={t('Documentos')} description={t('Consulta las condiciones y cómo tratamos tus datos.')}>
          <nav aria-label={t('Documentos')} className="space-y-2">
            <Link href={legal.privacy} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-violet-300 underline-offset-4 transition-colors hover:bg-muted/20 hover:text-violet-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t('Política de privacidad')}
            </Link>
            <Link href={legal.terms} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-violet-300 underline-offset-4 transition-colors hover:bg-muted/20 hover:text-violet-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {t('Términos y condiciones')}
            </Link>
          </nav>
        </SettingsSection>

        <SettingsSection title={t('Zona peligrosa')} description={t('Estas acciones eliminan tu cuenta de forma permanente.')}>
          <DeleteAccountSection />
        </SettingsSection>
      </div>
    </SettingsScreen>
  )
}
