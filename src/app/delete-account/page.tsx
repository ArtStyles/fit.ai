import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection'
import { cookies } from 'next/headers'

export const metadata = { title: 'Eliminar cuenta de Vekira', description: 'Solicita la eliminación de tu cuenta y datos de Vekira desde la web.' }
export default async function DeleteAccountPage() {
  const en = (await cookies()).get('fitai-language')?.value === 'en'
  const copy = (es: string, english: string) => en ? english : es
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  return <main id="app-main-content" tabIndex={-1} className="mx-auto max-w-lg space-y-6 px-5 py-12">
    <h1 className="font-display text-3xl font-bold">{copy('Eliminar cuenta de Vekira', 'Delete Vekira account')}</h1>
    <p className="leading-7 text-muted-foreground">{copy('Puedes eliminar tu cuenta desde esta página o desde Ajustes → Cuenta en Vekira. La eliminación es permanente: se borran tu perfil y las rutinas, historial, medidas, conversaciones, respaldos en la nube y archivos de tu cuenta, con las excepciones indicadas abajo.', 'You can delete your account from this page or from Settings → Account in Vekira. Deletion is permanent: your profile and your account’s plans, history, measurements, conversations, cloud backups and files are removed, with the exceptions below.')}</p>
    <p className="text-sm leading-6 text-muted-foreground">{copy('Si eres entrenador, las rutinas ya entregadas a tus clientes y su historial permanecen en las cuentas de esos clientes; las rutinas quedan archivadas y sin relación profesional activa. Se conservan registros de auditoría profesional con identificadores de cuenta y datos de la actividad registrada.', 'If you are a trainer, plans already delivered to your clients and their history remain in those clients’ accounts; the plans are archived without an active professional relationship. Professional audit records retain account identifiers and recorded activity data.')}</p>
    <p className="text-sm leading-6 text-muted-foreground">{copy('Los archivos que hayas exportado y las copias guardadas en otros dispositivos permanecen allí hasta que los elimines. Si falla la conexión durante el proceso, comprueba el resultado antes de intentarlo nuevamente.', 'Files you exported and copies saved on other devices remain there until you remove them. If the connection fails during deletion, check the outcome before trying again.')}</p>
    {user ? <><p className="text-sm">{copy('Cuenta', 'Account')}: <strong>{user.email}</strong></p><DeleteAccountSection /></> : <div className="space-y-4"><p>{copy('Inicia sesión para verificar qué cuenta quieres eliminar. Después volverás a esta página para confirmar la eliminación.', 'Sign in to verify the account you want to delete. You will return to this page to confirm deletion.')}</p><Link className="flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 font-semibold text-white" href="/login?intent=delete-account">{copy('Iniciar sesión para eliminar mi cuenta', 'Sign in to delete my account')}</Link><Link className="flex min-h-11 items-center justify-center rounded-lg underline" href="/recover-password">{copy('Recuperar mi contraseña', 'Recover my password')}</Link></div>}
    <Link className="inline-flex min-h-11 items-center rounded-lg underline" href={en ? '/en/privacy' : '/es/privacidad'}>{copy('Política de privacidad', 'Privacy policy')}</Link>
  </main>
}
