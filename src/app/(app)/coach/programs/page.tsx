import { Dumbbell } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Rutinas profesionales · Vekira' }

export default async function CoachProgramsPage() {
  await requireActiveTrainerContext()

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Rutinas" subtitle="Programación para clientes" backHref="/coach" backLabel="Resumen" icon={<Dumbbell className="h-5 w-5" />} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Todavía no tienes rutinas</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Podrás crear programación profesional cuando exista un cliente activo.</p>
        </section>
      </main>
    </div>
  )
}
