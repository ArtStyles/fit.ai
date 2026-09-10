'use client'

import { ArrowRight, Clock3, Copy, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { cancelCompanionInvitation, getCompanionCode, previewCompanionCode, respondCompanionInvitation, sendCompanionInvitation } from '@/app/actions/companions'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Button } from '@/components/ui/button'
import type { CompanionCode, CompanionCodePreview, CompanionSnapshot } from '@/lib/companions/types'
import { CompanionAvatar, CompanionNotice, CompanionSharingScope, companionButton, companionPanel } from './CompanionPresentation'
import type { CompanionTask } from './useCompanionTask'

export function CompanionInvitation({ snapshot, offline, busy, run, onChange }: { snapshot: CompanionSnapshot; offline: boolean; busy: boolean; run: CompanionTask; onChange: (value: CompanionSnapshot) => void }) {
  const { t, language, timeZone } = useI18n()
  const [tab, setTab] = useState<'share' | 'code'>('share')
  const [code, setCode] = useState<CompanionCode | null>(null)
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<CompanionCodePreview | null>(null)
  const [notice, setNotice] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const loaded = useRef(false)
  const mounted = useRef(false)
  const fieldId = useId()
  const person = snapshot.relationship?.other
  const loadCode = () => run(getCompanionCode, setCode, 'No se pudo obtener tu código. Inténtalo de nuevo.')
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (snapshot.status !== 'none' || offline || loaded.current) return
    loaded.current = true
    queueMicrotask(() => { if (mounted.current) void loadCode() })
    // A code is loaded once for this invitation screen, never after every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.status, offline])
  useEffect(() => { if (preview) headingRef.current?.focus({ preventScroll: true }) }, [preview])
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))
  function review(event: FormEvent) {
    event.preventDefault()
    if (offline || !input.trim()) return
    void run(() => previewCompanionCode(input), setPreview, 'Este código no está disponible. Compruébalo o pide uno nuevo.')
  }
  async function copy() {
    if (!code) return
    try { await navigator.clipboard.writeText(code.code); if (mounted.current) setNotice('Código copiado. Compártelo con la persona que quieres invitar.') }
    catch { if (mounted.current) setNotice('No se pudo copiar el código. Puedes seleccionarlo y copiarlo manualmente.') }
  }
  if (snapshot.status === 'pending_outgoing' && person) return <>
    <section className="flex flex-col items-center gap-4 py-3 text-center"><CompanionAvatar person={person} large /><span className="inline-flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200"><Clock3 aria-hidden className="h-4 w-4" />{t('Invitación enviada')}</span><h2 className="break-words font-display text-3xl font-bold">{t('Ahora le toca a {name}', { name: person.fullName })}</h2><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t('Cuando acepte, podrán ver sus avances y darse ánimo.')}</p>{snapshot.relationship?.expiresAt ? <p className="text-xs text-muted-foreground">{t('Válida hasta {date}', { date: date(snapshot.relationship.expiresAt) })}</p> : null}</section>
    <div className={`${companionPanel} flex gap-3`}><LockKeyhole aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><p className="text-xs leading-relaxed text-muted-foreground">{t('Hasta que acepte, tu resumen sigue siendo privado.')}</p></div>
    <Button asChild variant="outline" className={companionButton}><PendingLink href="/dashboard">{t('Volver a Inicio')}</PendingLink></Button>
    <Button variant="ghost" className={companionButton} disabled={busy || offline} onClick={() => void run(() => cancelCompanionInvitation(snapshot.relationship!.id), onChange, 'No se pudo cancelar la invitación. Inténtalo de nuevo.')}>{t('Cancelar invitación')}</Button>
  </>
  if ((snapshot.status === 'pending_incoming' && person) || preview) return <>
    <section className="flex flex-col items-center gap-4 py-3 text-center"><CompanionAvatar person={preview?.person ?? person!} large /><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">{t(preview ? 'Tu invitación es para' : 'Quiere ser tu compañero')}</p><h2 ref={headingRef} tabIndex={-1} className="break-words font-display text-3xl font-bold outline-none">{(preview?.person ?? person!).fullName}</h2><p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{t('Un compañero para reconocer cada paso y celebrar la constancia.')}</p></section>
    <CompanionSharingScope />
    <Button className={companionButton} disabled={busy || offline} onClick={() => void run(() => preview ? sendCompanionInvitation(preview.code) : respondCompanionInvitation(snapshot.relationship!.id, true), onChange, 'No se pudo completar la invitación. Inténtalo de nuevo.')}>
      {busy ? <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> : null}{t(preview ? 'Enviar invitación' : 'Aceptar invitación')}
    </Button>
    <Button variant="outline" className={companionButton} disabled={busy || (!preview && offline)} onClick={() => { if (preview) { setPreview(null); requestAnimationFrame(() => inputRef.current?.focus()) } else void run(() => respondCompanionInvitation(snapshot.relationship!.id, false), onChange, 'No se pudo rechazar la invitación. Inténtalo de nuevo.') }}>{t(preview ? 'Volver' : 'Rechazar invitación')}</Button>
  </>
  return <>
    <section><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">{t('Compañero de constancia')}</p><h2 className="mt-3 font-display text-4xl font-bold leading-tight">{t('Compartir el camino también cuenta.')}</h2><p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t('Invita a una persona. Celebren sus avances, cada uno con su propio plan.')}</p></section>
    <div className="flex gap-1 rounded-xl border border-border/60 bg-card p-1" role="group" aria-label={t('Forma de invitar')}>{(['share', 'code'] as const).map(value => <button key={value} type="button" aria-pressed={tab === value} className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm font-semibold ${tab === value ? 'bg-violet-500/15 text-foreground' : 'text-muted-foreground'}`} onClick={() => { setTab(value); setNotice('') }}>{t(value === 'share' ? 'Mi código' : 'Tengo un código')}</button>)}</div>
    {tab === 'share' ? <section className={`${companionPanel} text-center`}>
      <h3 className="text-sm text-muted-foreground">{t('Tu código de invitación')}</h3>
      {code ? <><p className="my-5 select-all break-all font-mono text-2xl font-bold tracking-wider sm:text-3xl">{code.code}</p><p className="text-xs text-muted-foreground">{t('Válido hasta {date}', { date: date(code.expiresAt) })}</p><Button className={`${companionButton} mt-5`} onClick={() => void copy()}><Copy aria-hidden className="mr-2 h-4 w-4" />{t('Copiar código')}</Button></>
        : <><p className="my-5 text-sm text-muted-foreground">{t(offline ? 'Conéctate para obtener tu código.' : busy ? 'Preparando tu código…' : 'Tu código estará aquí cuando lo solicites.')}</p><Button className={companionButton} disabled={busy || offline} onClick={() => void loadCode()}>{busy ? <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> : null}{t('Obtener código')}</Button></>}
      {notice ? <div className="mt-4"><CompanionNotice>{t(notice)}</CompanionNotice></div> : null}
    </section> : <form onSubmit={review} className={companionPanel}>
      <label htmlFor={fieldId} className="block text-sm font-semibold">{t('Código de tu compañero')}</label><input ref={inputRef} id={fieldId} name="code" value={input} onChange={event => setInput(event.target.value)} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="VKR-XXXXXXXXXXXX" aria-describedby={`${fieldId}-help`} className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-4 text-base uppercase tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      <p id={`${fieldId}-help`} className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('Podrás revisar a quién invitas antes de enviarla.')}</p><Button type="submit" disabled={busy || offline || !input.trim()} className={`${companionButton} mt-5`}>{t('Revisar código')}{busy ? <Loader2 aria-hidden className="ml-2 h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden className="ml-2 h-4 w-4" />}</Button>
    </form>}
    <p className="flex gap-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><span>{t('Ambos deben aceptar. Solo compartirán nombre, foto, constancia semanal y saludos.')}</span></p><p className="text-center text-xs leading-relaxed text-muted-foreground">{t('Un compañero por persona.')}<br />{t('Puedes desvincularte en cualquier momento.')}</p>
  </>
}
