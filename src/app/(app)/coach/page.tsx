import Link from 'next/link'
import { Briefcase, ClipboardList, Dumbbell, UserRound, UsersRound } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Espacio profesional · Vekira' }

const destinations = [
  { href: '/coach/clients', label: 'Clientes', description: 'Gestiona tus relaciones profesionales.', icon: UsersRound },
  { href: '/coach/programs', label: 'Rutinas', description: 'Prepara programas cuando tengas clientes.', icon: Dumbbell },
  { href: '/coach/requests', label: 'Solicitudes', description: 'Revisa nuevas solicitudes de clientes.', icon: ClipboardList },
  { href: '/coach/profile', label: 'Perfil', description: 'Mantén actualizada tu información profesional.', icon: UserRound },
] as const

export default async function CoachPage() {
  const { trainerProfile } = await requireActiveTrainerContext()

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Resumen profesional" subtitle="Tu espacio de entrenador" icon={<Briefcase className="h-5 w-5" />} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-3xl border border-border/60 bg-muted/10 p-6">
          <p className="text-sm font-medium text-violet-300">Perfil activo</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">{trainerProfile.professional_name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tu espacio está listo. Los clientes, rutinas y solicitudes aparecerán cuando existan relaciones reales.
          </p>
        </section>
        <nav aria-label="Espacio profesional" className="mt-6 grid gap-4 sm:grid-cols-2">
          {destinations.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className="rounded-2xl border border-border/60 bg-muted/10 p-5 transition-colors hover:border-violet-500/40">
              <Icon className="h-5 w-5 text-violet-300" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-foreground">{label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  )
}
