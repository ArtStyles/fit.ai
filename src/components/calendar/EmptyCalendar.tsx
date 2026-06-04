import { CalendarRange } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'

export function EmptyCalendar() {
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
        <CalendarRange className="h-6 w-6 text-violet-400" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-foreground">Aún no hay constancia que mostrar</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Cuando completes entrenamientos verás aquí tu mapa de constancia mes a mes.
      </p>
      <PendingLink
        href="/dashboard"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-600"
      >
        Ir al dashboard
      </PendingLink>
    </section>
  )
}
