import type { AdminActivityItem } from '@/lib/admin/overview'
import { PendingLink } from '@/components/navigation/PendingLink'

type AdminActivityListProps = {
  items: AdminActivityItem[]
  timeZone: string
}

function formatActivityTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}

export function AdminActivityList({ items, timeZone }: AdminActivityListProps) {
  return (
    <section className="mt-8" aria-labelledby="actividad-reciente">
      <h2 id="actividad-reciente" className="font-display text-xl font-bold text-foreground">Actividad reciente</h2>
      {items.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
          No hay actividad reciente disponible
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {items.map(item => (
            <li key={item.id}>
              <PendingLink
                href={item.href}
                className="block rounded-2xl border border-border/60 bg-card/60 p-4 transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.occurredAt}>
                  {formatActivityTime(item.occurredAt, timeZone)}
                </time>
              </PendingLink>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
