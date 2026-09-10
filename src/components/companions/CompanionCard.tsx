'use client'

import { ArrowRight, Check, ChevronRight, Handshake } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import type { CompanionResult, CompanionSnapshot } from '@/lib/companions/types'
import { CompanionAvatar } from './CompanionPresentation'
import { CompanionSharedAchievement } from './CompanionSharedAchievement'
import { useCompanionConnection, useCompanionQuota } from './useCompanionConnection'

export function CompanionCard({ initial }: { initial: CompanionResult<CompanionSnapshot> }) {
  const { t } = useI18n()
  const online = useCompanionConnection()
  const snapshot = initial.ok ? initial.value : null
  const quotaUsed = useCompanionQuota(snapshot?.nextGreetingAt ?? null)
  const person = snapshot?.relationship?.other
  const offline = snapshot?.offline || !online
  const active = snapshot?.status === 'active' && person
  const summary = snapshot?.partner
  const status = !snapshot ? t('No se pudo cargar tu compañero.')
    : snapshot.status === 'pending_outgoing' ? t('Esperando su respuesta')
      : snapshot.status === 'pending_incoming' ? t('Revisar invitación')
        : summary ? summary.goal ? t('{completed} de {goal} sesiones esta semana', { completed: summary.completedSessions, goal: summary.goal }) : t('{completed} sesiones esta semana', { completed: summary.completedSessions })
            : t('Resumen no disponible.')
  return <section aria-label={t('Compañero de constancia')} className="rounded-2xl border border-violet-300/15 bg-violet-500/[0.04] p-4">
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{t('Compañero de constancia')}</p>
    {snapshot?.status === 'none' ? <>
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-500/10 text-violet-300"><Handshake aria-hidden className="h-5 w-5" /></span><div><p className="text-sm font-semibold">{t('La constancia se comparte')}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('Celebra tus avances con alguien.')}</p></div></div>
      <PendingLink href="/companion?view=invite" className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-violet-300">{t('Invitar a un compañero')}<ArrowRight aria-hidden className="h-4 w-4" /></PendingLink>
    </> : <div className="flex items-center gap-3">
      <PendingLink href="/companion" showSpinner={false} aria-label={person ? t('Ver a tu compañero {name}', { name: person.fullName }) : t('Revisar compañero')} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {person ? <CompanionAvatar person={person} /> : <Handshake aria-hidden className="h-6 w-6 shrink-0 text-violet-300" />}
        <span className="min-w-0"><strong className="block break-words text-sm font-semibold">{person?.fullName ?? t('Compañero de constancia')}</strong><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{status}</span></span>
        {!active ? <ChevronRight aria-hidden className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      </PendingLink>
      {active && snapshot.partner ? quotaUsed ? <span role="img" aria-label={t('Ya enviaste tu saludo de hoy')} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-violet-300"><Check aria-hidden className="h-5 w-5" /></span>
        : <PendingLink href="/companion?view=message" showSpinner={false} aria-label={t('Escribir un saludo a {name}', { name: person.fullName })} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-500/10 text-xl hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span aria-hidden>👏</span></PendingLink> : null}
    </div>}
    <CompanionSharedAchievement snapshot={snapshot} compact />
    {offline && snapshot ? <p className="mt-3 text-xs leading-relaxed text-amber-200">{t('Sin conexión · Mostrando el último resumen.')}</p> : null}
  </section>
}
