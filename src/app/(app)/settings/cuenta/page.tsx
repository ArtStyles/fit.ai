import Link from 'next/link'
import { LogOut, UserCog } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { Button } from '@/components/ui/button'
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection'
import { requireAppUserContext } from '@/lib/auth/server'
import { signOut } from '@/app/(auth)/actions'

export const metadata = { title: 'Cuenta · FitAI' }

export default async function AccountSettingsPage() {
  const { user } = await requireAppUserContext()

  return (
    <SettingsScreen
      title="Cuenta"
      subtitle={user.email}
      backHref="/settings"
      backLabel="Ajustes"
      icon={<UserCog className="h-5 w-5" />}
    >
      <form action={signOut}>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full border-border/60 bg-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </form>

      <div className="mt-8">
        <DeleteAccountSection />
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link href="/privacy" className="underline transition-colors hover:text-foreground">
          Política de privacidad
        </Link>
      </p>
    </SettingsScreen>
  )
}
