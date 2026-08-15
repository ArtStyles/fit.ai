import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  Languages,
  MapPin,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { DirectoryFilters, PublicTrainerDirectoryRow } from '@/lib/coaching/directory'

const modalityLabels: Record<PublicTrainerDirectoryRow['modalities'][number], string> = {
  online: 'En línea',
  in_person: 'Presencial',
  hybrid: 'Híbrida',
}

function queryString(filters: DirectoryFilters, cursor?: string) {
  const parameters = new URLSearchParams()
  if (filters.text) parameters.set('q', filters.text)
  if (filters.specialty) parameters.set('especialidad', filters.specialty)
  if (filters.modality) parameters.set('modalidad', filters.modality)
  if (filters.language) parameters.set('idioma', filters.language)
  if (filters.location) parameters.set('ubicacion', filters.location)
  if (cursor) parameters.set('cursor', cursor)
  return parameters.toString()
}

function trainerInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase()
}

function activeFilters(filters: DirectoryFilters) {
  const values: Array<{ key: keyof DirectoryFilters; label: string }> = []
  if (filters.text) values.push({ key: 'text', label: `Búsqueda: ${filters.text}` })
  if (filters.specialty) values.push({ key: 'specialty', label: `Especialidad: ${filters.specialty}` })
  if (filters.modality) {
    const modality = filters.modality as keyof typeof modalityLabels
    values.push({ key: 'modality', label: `Modalidad: ${modalityLabels[modality] ?? filters.modality}` })
  }
  if (filters.language) values.push({ key: 'language', label: `Idioma: ${filters.language}` })
  if (filters.location) values.push({ key: 'location', label: `Ubicación: ${filters.location}` })
  return values
}

function hrefWithoutFilter(filters: DirectoryFilters, key: keyof DirectoryFilters) {
  const next = { ...filters, [key]: undefined }
  const query = queryString(next)
  return query ? `/trainers?${query}` : '/trainers'
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
  const appliedFilters = activeFilters(filters)
  const advancedFilterCount = appliedFilters.filter(filter => filter.key !== 'text').length
  const advancedFilterLabel = advancedFilterCount === 1
    ? '1 filtro activo'
    : `${advancedFilterCount} filtros activos`
  const resultLabel = trainers.length === 1
    ? 'Mostrando 1 perfil'
    : `Mostrando ${trainers.length} perfiles`

  return (
    <section aria-labelledby="trainer-directory-title" className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Profesionales</p>
        <h1 id="trainer-directory-title" className="mt-1 text-3xl font-bold tracking-tight text-foreground">
          Encuentra tu entrenador
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Explora profesionales verificados y encuentra el acompañamiento que encaja contigo.
        </p>
      </header>

      <form action="/trainers" method="get" className="rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar entrenadores</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              name="q"
              type="search"
              defaultValue={filters.text ?? ''}
              placeholder="Buscar por nombre o experiencia"
              className="h-12 w-full rounded-xl border border-input bg-background pl-11 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button type="submit" className="min-h-12 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-md shadow-violet-950/20 hover:bg-violet-500">
            Buscar
          </button>
        </div>

        <details className="group mt-3 rounded-xl border border-border/60 bg-muted/15" open={advancedFilterCount > 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              Filtros avanzados
            </span>
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {advancedFilterCount > 0 ? advancedFilterLabel : 'Especialidad, modalidad y más'}
              <span className="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
            </span>
          </summary>

          <div className="grid gap-3 border-t border-border/60 p-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Especialidad
              <input name="especialidad" defaultValue={filters.specialty ?? ''} placeholder="Fuerza, movilidad…" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Modalidad
              <select name="modalidad" defaultValue={filters.modality ?? ''} className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Todas</option>
                <option value="online">En línea</option>
                <option value="in_person">Presencial</option>
                <option value="hybrid">Híbrida</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Idioma
              <input name="idioma" defaultValue={filters.language ?? ''} placeholder="Español, inglés…" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Ubicación
              <input name="ubicacion" defaultValue={filters.location ?? ''} placeholder="Ciudad o región" className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            <button type="submit" className="min-h-11 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary sm:col-span-2">
              Aplicar filtros
            </button>
          </div>
        </details>
      </form>

      {appliedFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
          {appliedFilters.map(filter => (
            <Link
              key={filter.key}
              href={hrefWithoutFilter(filters, filter.key)}
              aria-label={`Quitar ${filter.label}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 text-xs font-semibold capitalize text-primary"
            >
              {filter.label}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ))}
          <Link href="/trainers" className="inline-flex min-h-9 items-center px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
            Limpiar filtros
          </Link>
        </div>
      ) : null}

      {trainers.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">{resultLabel}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {trainers.map(trainer => (
              <li key={trainer.userId}>
                <Link
                  href={`/trainers/${trainer.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transform-none"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-14 w-14 border border-border/70 bg-muted">
                      {trainer.professionalPhotoUrl ? <AvatarImage src={trainer.professionalPhotoUrl} alt={trainer.professionalName} className="object-cover" /> : null}
                      <AvatarFallback className="bg-violet-100 text-sm font-bold text-violet-800 dark:bg-violet-950/70 dark:text-violet-200">{trainerInitials(trainer.professionalName) || <UserRound className="h-5 w-5" />}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-base font-bold text-foreground">{trainer.professionalName}</h2>
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Verificado
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(trainer.specialties.length > 0 ? trainer.specialties : ['Entrenamiento']).slice(0, 3).map(specialty => (
                          <span key={specialty} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{specialty}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{trainer.bio || trainer.experienceSummary}</p>

                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    {trainer.generalLocation ? (
                      <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{trainer.generalLocation}</p>
                    ) : null}
                    {trainer.languages.length > 0 ? (
                      <p className="flex items-center gap-2"><Languages className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{trainer.languages.join(' · ')}</p>
                    ) : null}
                    <p className="font-medium">{trainer.modalities.map(modality => modalityLabels[modality]).join(' · ')}</p>
                  </div>

                  <span className="mt-4 flex min-h-11 items-center justify-between border-t border-border/50 pt-3 text-sm font-semibold text-violet-700 dark:text-violet-300">
                    Ver perfil
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-6 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Search className="h-5 w-5" aria-hidden="true" /></span>
          <h2 className="mt-4 font-bold text-foreground">No encontramos entrenadores con esos filtros</h2>
          <p className="mt-1 text-sm text-muted-foreground">Prueba ampliando la ubicación o quitando algún filtro.</p>
          <Link href="/trainers" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Limpiar filtros
          </Link>
        </div>
      )}

      {nextCursor ? (
        <Link href={`/trainers?${queryString(filters, nextCursor)}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted/30">
          Ver más entrenadores
        </Link>
      ) : null}
    </section>
  )
}
