import Link from 'next/link'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Verificar cuenta', robots: { index: false, follow: false } }
export default function LoginPage() {
  return <AuthShell aside={<p className="text-lg leading-8 text-muted-foreground">Gestiona tu cuenta y tus datos. Para registrar tus entrenamientos, descarga la aplicación de Vekira para Android.</p>}><div className="mb-8 space-y-3"><h1 className="font-display text-3xl font-bold">Verifica tu cuenta</h1><p className="leading-7 text-muted-foreground">Inicia sesión para gestionar la eliminación de tu cuenta. Tu entrenamiento y progreso están en la aplicación móvil.</p></div><LoginForm destination="/delete-account" /><Link href="/recover-password" className="mt-5 flex min-h-11 items-center justify-center underline">Recuperar contraseña</Link><Link href="/es#descargar" className="mt-3 flex min-h-11 items-center justify-center underline">Descargar Vekira</Link></AuthShell>
}
