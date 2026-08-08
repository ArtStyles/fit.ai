import Link from 'next/link'
import type { DirectoryFilters, PublicTrainerDirectoryRow } from '@/lib/coaching/directory'

const modalityLabels: Record<PublicTrainerDirectoryRow['modalities'][number], string> = {
  online: 'En línea',
  in_person: 'Presencial',
  hybrid: 'Híbrida',
}

function queryString(filters: DirectoryFilters, cursor: string) {
  const parameters = new URLSearchParams()
  if (filters.text) parameters.set('q', filters.text)
  if (filters.specialty) parameters.set('especialidad', filters.specialty)
  if (filters.modality) parameters.set('modalidad', filters.modality)
  if (filters.language) parameters.set('idioma', filters.language)
  if (filters.location) parameters.set('ubicacion', filters.location)
  parameters.set('cursor', cursor)
  return parameters.toString()
}

export function TrainerDirectory({
  trainers,
  filters,
  nextCursor,
}: {
  trainers: PublicTrainerDirectoryRow[]
  filters: DirectoryFilters
  nextCursor: string | null
}) {
  return (
    <section aria-labelledby="trainer-directory-title" className="space-y-6">
      <div>
        <h1 id="trainer-directory-title" className="text-2xl font-bold text-foreground">Entrenadores verificados</h1>
        <p className="mt-1 text-sm text-muted-foreground">Explora perfiles profesionales activos.</p>
      </div>

      <form action="/trainers" method="get" className="grid gap-3 rounded-2xl border border-border/70 bg-muted/10 p-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-foreground sm:col-span-2">
          Buscar
          <input name="q" defaultValue={filters.text ?? ''} placeholder="Nombre o experiencia" className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-foreground">
          Especialidad
          <input name="especialidad" defaultValue={filters.specialty ?? ''} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-foreground">
          Modalidad
          <select name="modalidad" defaultValue={filters.modality ?? ''} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
            <option value="">Todas</option>
            <option value="online">En línea</option>
            <option value="in_person">Presencial</option>
            <option value="hybrid">Híbrida</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-foreground">
          Idioma
          <input name="idioma" defaultValue={filters.language ?? ''} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
        </label>
        <label className="text-sm font-semibold text-foreground">
          Ubicación general
          <input name="ubicacion" defaultValue={filters.location ?? ''} className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
        </label>
        <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:col-span-2">Aplicar filtros</button>
      </form>

      {trainers.length ? (
        <ul className="space-y-3">
          {trainers.map(trainer => (
            <li key={trainer.userId}>
              <Link href={`/trainers/${trainer.slug}`} className="block rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-foreground">{trainer.professionalName}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{trainer.specialties.join(' · ') || 'Entrenador verificado'}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Verificado</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{trainer.bio}</p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">{trainer.modalities.map(modality => modalityLabels[modality]).join(' · ')}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-2xl border border-border/70 p-5 text-sm text-muted-foreground">No hay entrenadores activos que coincidan con los filtros.</p>}

      {nextCursor ? (
        <Link href={`/trainers?${queryString(filters, nextCursor)}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground">
          Ver más entrenadores
        </Link>
      ) : null}
    </section>
  )
}
