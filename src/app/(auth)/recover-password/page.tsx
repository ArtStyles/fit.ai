import { AuthShell } from '@/components/auth/AuthShell'
import { PasswordRecoveryForm } from '@/components/auth/PasswordRecoveryForm'
import { cookies } from 'next/headers'

export const metadata = { title: 'Recuperar contraseña | Recover password', robots: { index: false, follow: true } }
export default async function PasswordRecoveryPage() {
  const en = (await cookies()).get('fitai-language')?.value === 'en'
  return <AuthShell aside={null}><div className="mb-8 space-y-3"><h1 className="font-display text-3xl font-bold">{en ? 'Recover password' : 'Recuperar contraseña'}</h1><p className="text-muted-foreground">{en ? 'Verify your email to recover access to Vekira.' : 'Verifica tu correo para recuperar el acceso a Vekira.'}</p></div><PasswordRecoveryForm url={process.env.NEXT_PUBLIC_SUPABASE_URL} publicKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY} /></AuthShell>
}
