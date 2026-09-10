'use client'

import { Check } from 'lucide-react'
import type { Ref } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import type { CompanionSnapshot } from '@/lib/companions/types'
import { CompanionAvatar, CompanionPrivacyNote, CompanionWeekProgress, companionButton, companionPanel } from './CompanionPresentation'
import { CompanionSharedAchievement } from './CompanionSharedAchievement'

export function CompanionOverview({ snapshot, offline, quotaUsed, onCompose, triggerRef }: { snapshot: CompanionSnapshot; offline: boolean; quotaUsed: boolean; onCompose: () => void; triggerRef: Ref<HTMLButtonElement> }) {
  const { t, language, timeZone } = useI18n()
  const person = snapshot.relationship!.other
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
  return <>
    <section className="flex items-center gap-4 py-2"><CompanionAvatar person={person} large /><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">{t('Tu compañero')}</p><h2 className="mt-1 break-words font-display text-3xl font-bold">{person.fullName}</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t('Compartiendo constancia contigo')}</p></div></section>
    <section className={companionPanel}><h2 className="font-display text-2xl font-bold">{t('Esta semana')}</h2><div className="divide-y divide-border/60"><CompanionWeekProgress name={person.fullName} week={snapshot.partner} offline={offline} /><CompanionWeekProgress name={t('Tú')} week={snapshot.self} self offline={offline} /></div><p className="text-xs leading-relaxed text-muted-foreground">{t('Cada uno, al ritmo de su propio plan.')}</p><CompanionSharedAchievement snapshot={snapshot} /></section>
    {snapshot.receivedGreeting ? <section aria-label={t('Un saludo de {name}', { name: person.fullName })} className={companionPanel}>
      <h2 className="break-words text-sm font-semibold">{t('Un saludo de {name}', { name: person.fullName })}</h2>
      <time dateTime={snapshot.receivedGreeting.sentAt} className="mt-1 block text-xs leading-relaxed text-muted-foreground">{date(snapshot.receivedGreeting.sentAt)}</time>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{snapshot.receivedGreeting.message}</p>
    </section> : null}
    <section className="rounded-3xl border border-violet-300/20 bg-violet-500/[0.06] p-5 sm:p-6"><div className="flex items-center gap-3"><span aria-hidden className="text-3xl">👏</span><div><h2 className="text-sm font-semibold">{t('Un gesto que acompaña')}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('Acompaña a {name} con tus propias palabras.', { name: person.fullName })}</p></div></div>
      <Button ref={triggerRef} disabled={quotaUsed || !snapshot.partner} className={`${companionButton} mt-5`} onClick={onCompose}>{quotaUsed ? <Check aria-hidden className="mr-2 h-4 w-4" /> : null}{t(!snapshot.partner ? 'Saludo no disponible' : quotaUsed ? snapshot.greeting ? 'Saludo enviado hoy' : 'Ya enviaste tu saludo de hoy' : 'Escribir saludo')}</Button>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">{!snapshot.partner ? t('No puedes enviar saludos a este compañero en este momento.') : quotaUsed && snapshot.nextGreetingAt ? t('Podrás enviar otro a partir de {date}.', { date: date(snapshot.nextGreetingAt) }) : offline ? t('Puedes escribir ahora y enviar al conectarte.') : t('Un saludo al día, con un mensaje opcional.')}</p>
      {snapshot.greeting ? <section aria-label={t('Tu último saludo')} className="mt-4 rounded-xl bg-violet-500/10 px-4 py-3"><h3 className="text-xs font-semibold text-violet-200">{t('Tu último saludo')}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{snapshot.greeting.message}</p></section> : null}
    </section>
    <p className="text-center text-xs leading-relaxed text-muted-foreground">{t('El progreso refleja las sesiones sincronizadas.')}<br />{t('Última actualización: {date}', { date: date(snapshot.fetchedAt) })}</p><CompanionPrivacyNote />
  </>
}
