'use client'

import { useEffect, useRef } from 'react'
import { AccountWorkspaceMenu } from '@/components/navigation/AccountWorkspaceMenu'
import type { PublicTrainerDirectoryRow } from '@/lib/coaching/directory'

const modalityLabels: Record<PublicTrainerDirectoryRow['modalities'][number], string> = {
  online: 'En línea',
  in_person: 'Presencial',
  hybrid: 'Híbrida',
}

export function TrainerPublicProfile({ trainer }: { trainer: PublicTrainerDirectoryRow }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <article className="space-y-6" aria-labelledby="trainer-name">
      <header className="rounded-3xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 ref={headingRef} tabIndex={-1} id="trainer-name" className="text-2xl font-bold text-foreground">{trainer.professionalName}</h1>
            <span className="mt-2 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Perfil verificado</span>
          </div>
          {trainer.professionalPhotoUrl ? <img src={trainer.professionalPhotoUrl} alt="" className="h-16 w-16 rounded-full object-cover" /> : null}
          <AccountWorkspaceMenu surface="topbar" />
        </div>
        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">{trainer.bio}</p>
      </header>

      <section className="rounded-3xl border border-border/70 p-5 sm:p-6" aria-labelledby="experience-title">
        <h2 id="experience-title" className="font-bold text-foreground">Experiencia declarada</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{trainer.experienceSummary}</p>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold text-foreground">Especialidades</dt><dd className="mt-1 text-muted-foreground">{trainer.specialties.join(' · ') || 'No especificadas'}</dd></div>
          <div><dt className="font-semibold text-foreground">Modalidades</dt><dd className="mt-1 text-muted-foreground">{trainer.modalities.map(modality => modalityLabels[modality]).join(' · ') || 'No especificadas'}</dd></div>
          <div><dt className="font-semibold text-foreground">Ubicación general</dt><dd className="mt-1 text-muted-foreground">{trainer.generalLocation || 'No especificada'}</dd></div>
          <div><dt className="font-semibold text-foreground">Idiomas</dt><dd className="mt-1 text-muted-foreground">{trainer.languages.join(' · ') || 'No especificados'}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="services-title">
        <h2 id="services-title" className="text-lg font-bold text-foreground">Servicios activos</h2>
        {trainer.services.length ? (
          <ul className="mt-3 space-y-3">
            {trainer.services.map(service => (
              <li key={`${service.name}-${service.modality}-${service.durationMinutes}`} className="rounded-2xl border border-border/70 p-4">
                <h3 className="font-semibold text-foreground">{service.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">{modalityLabels[service.modality]} · {service.durationMinutes} min</p>
                {service.content ? <p className="mt-2 text-sm text-muted-foreground">{service.content}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 rounded-2xl border border-border/70 p-4 text-sm text-muted-foreground">Aún no ha publicado servicios activos.</p>}
      </section>
    </article>
  )
}
