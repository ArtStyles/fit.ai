'use client'

import { useEffect, useId, useRef, type FormEvent, type RefObject } from 'react'
import { Loader2, LockKeyhole, Send } from 'lucide-react'
import { sendCompanionGreeting } from '@/app/actions/companions'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import type { CompanionSnapshot } from '@/lib/companions/types'
import { measureCompanionMessage, validateCompanionMessage } from '@/lib/companions/validation'
import { CompanionAvatar, CompanionNotice, companionButton, companionPanel } from './CompanionPresentation'
import type { CompanionTask } from './useCompanionTask'

export function CompanionMessage({ snapshot, draft, onDraft, request, offline, busy, error, run, onCancel, onSent }: { snapshot: CompanionSnapshot; draft: string; onDraft: (text: string) => void; request: RefObject<{ message: string; id: string } | null>; offline: boolean; busy: boolean; error: string; run: CompanionTask; onCancel: () => void; onSent: (value: CompanionSnapshot) => void }) {
  const { t } = useI18n()
  const fieldId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const person = snapshot.relationship!.other
  const length = measureCompanionMessage(draft.trim())
  const validation = validateCompanionMessage(draft)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  function send(event: FormEvent) {
    event.preventDefault()
    if (busy || offline || !snapshot.partner || !validation.ok) return
    if (request.current?.message !== validation.value) request.current = { message: validation.value, id: crypto.randomUUID() }
    const attempt = request.current
    void run(() => sendCompanionGreeting(snapshot.relationship!.id, attempt.message, attempt.id), onSent, 'No se pudo enviar tu saludo. Tu texto sigue aquí para reintentarlo.')
  }
  return <form className="space-y-5" onSubmit={send}>
    <section><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-300">{t('Un gesto que acompaña')}</p><div className="mt-5 flex items-center gap-4"><CompanionAvatar person={person} /><div className="min-w-0"><h2 ref={heading} tabIndex={-1} className="break-words font-display text-3xl font-bold outline-none">{t('Un saludo para {name}', { name: person.fullName })}</h2><p className="mt-1 text-xs text-muted-foreground">{t('Tu compañero de constancia')}</p></div></div></section>
    <section className={companionPanel}>
      <label htmlFor={fieldId} className="block text-sm font-semibold">{t('Tu mensaje')} <span className="font-normal text-muted-foreground">· {t('Opcional')}</span></label>
      <textarea id={fieldId} value={draft} onChange={event => onDraft(event.target.value)} rows={5} disabled={busy} placeholder={t('Unas palabras para seguir adelante…')} aria-invalid={!validation.ok} aria-describedby={`${fieldId}-count ${fieldId}-help${!validation.ok ? ` ${fieldId}-error` : ''}`} className="mt-3 block min-h-40 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-relaxed outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60" />
      <p id={`${fieldId}-count`} className={`mt-2 text-right text-xs tabular-nums ${validation.ok ? 'text-muted-foreground' : 'text-rose-200'}`}>{length} / 120</p>
      <p id={`${fieldId}-help`} className="mt-3 text-xs leading-relaxed text-muted-foreground">{t('Si lo dejas vacío, enviarás 👏 ¡Bien hecho!')}</p>
      {!validation.ok ? <p id={`${fieldId}-error`} role="alert" className="mt-3 text-sm text-rose-200">{t(length > 120 ? 'Tu mensaje puede tener hasta 120 caracteres.' : 'Escribe un mensaje de texto válido.')}</p> : null}
      {error ? <div className="mt-4"><CompanionNotice error>{t(error)}</CompanionNotice></div> : null}
    </section>
    <p className="flex gap-3 text-xs leading-relaxed text-muted-foreground"><LockKeyhole aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><span>{t('Solo {name} recibirá este saludo.', { name: person.fullName })}<br />{t('Un envío al día, cuando tengas conexión.')}</span></p>
    <Button type="submit" disabled={busy || offline || !validation.ok} className={companionButton}>{busy ? <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" /> : <Send aria-hidden className="mr-2 h-4 w-4" />}{t(error && request.current ? 'Reintentar envío' : 'Enviar saludo')}</Button>
    {offline ? <p className="text-center text-xs leading-relaxed text-muted-foreground">{t('Conéctate para enviar. Tu borrador se conserva mientras sigues aquí.')}</p> : null}
    <Button type="button" variant="outline" className={companionButton} onClick={onCancel}>{t('Volver sin enviar')}</Button>
  </form>
}
