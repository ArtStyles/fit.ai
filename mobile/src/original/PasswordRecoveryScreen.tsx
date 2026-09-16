import { AuthShell } from '@/components/auth/AuthShell'
import { PasswordRecoveryForm } from '@/components/auth/PasswordRecoveryForm'
import { useI18n } from '@/components/i18n/I18nProvider'

export default function PasswordRecoveryScreen() {
  const { language } = useI18n()
  return <AuthShell aside={null}><div className="mb-8 space-y-3"><h1 className="font-display text-3xl font-bold">{language === 'en' ? 'Recover password' : 'Recuperar contraseña'}</h1><p className="text-muted-foreground">{language === 'en' ? 'Verify your email to recover access to Vekira.' : 'Verifica tu correo para recuperar el acceso a Vekira.'}</p></div><PasswordRecoveryForm url={import.meta.env.VITE_SUPABASE_URL} publicKey={import.meta.env.VITE_SUPABASE_ANON_KEY} /></AuthShell>
}
