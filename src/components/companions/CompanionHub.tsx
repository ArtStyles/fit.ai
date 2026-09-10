'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, MoreHorizontal, RefreshCw } from 'lucide-react'
import { loadCompanion, leaveCompanion } from '@/app/actions/companions'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { CompanionResult, CompanionSnapshot } from '@/lib/companions/types'
import { CompanionNotice, companionButton, companionPanel } from './CompanionPresentation'
import { CompanionInvitation } from './CompanionInvitation'
import { CompanionOverview } from './CompanionOverview'
import { CompanionMessage } from './CompanionMessage'
import { useCompanionConnection, useCompanionQuota } from './useCompanionConnection'
import { useCompanionTask } from './useCompanionTask'

type Initial = CompanionResult<CompanionSnapshot>
type HubState = { source: Initial; owner: string | null; result: Initial }
const transientCodes = new Set(['stale_result', 'unavailable', 'connection_required', 'offline', 'busy'])

function reconcileInitial(initial: Initial, owner: string | null, previous?: HubState): Initial {
  if (initial.ok && owner && initial.value.viewerId !== owner) return { ok: false, code: 'unauthenticated', error: 'Inicia sesión para continuar.' }
  if (!initial.ok && transientCodes.has(initial.code) && owner && previous?.owner === owner && previous.result.ok) {
    return { ok: true, value: { ...previous.result.value, offline: true } }
  }
  return initial
}

export function CompanionHub({ initial, viewerId }: { initial: Initial; viewerId?: string }) {
  const owner = viewerId ?? (initial.ok ? initial.value.viewerId : null)
  const [state, setState] = useState<HubState>(() => ({ source: initial, owner, result: reconcileInitial(initial, owner) }))
  const changed = state.source !== initial || state.owner !== owner
  const result = changed ? reconcileInitial(initial, owner, state) : state.result
  if (changed) setState({ source: initial, owner, result })
  const identity = `${owner ?? 'unknown'}:${result.ok ? result.value.relationship?.id ?? 'none' : 'unavailable'}`
  const currentIdentity = useRef(identity)
  currentIdentity.current = identity
  function update(result: Initial) {
    // An acknowledged operation survives a harmless refresh of this same link,
    // but cannot apply to another account, relationship or discarded session.
    if (currentIdentity.current !== identity || (result.ok && result.value.viewerId !== owner)) return
    setState(current => ({ ...current, result }))
  }
  const snapshot = result.ok ? result.value : null
  // A different account or relationship gets a fresh, private draft lifecycle.
  return <CompanionHubContent key={identity} snapshot={snapshot} onChange={update} />
}

function CompanionHubContent({ snapshot, onChange }: { snapshot: CompanionSnapshot | null; onChange: (value: Initial) => void }) {
  const { t } = useI18n()
  const requestedView = useSearchParams().get('view')
  const [view, setView] = useState(requestedView === 'message' ? 'message' : 'overview')
  const [draft, setDraft] = useState('')
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const draftRequest = useRef<{ message: string; id: string } | null>(null)
  const composeTrigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  const online = useCompanionConnection()
  const offline = !online || !!snapshot?.offline
  const quotaUsed = useCompanionQuota(snapshot?.nextGreetingAt ?? null)
  const { run, busy, error, clearError } = useCompanionTask(onChange)
  const active = snapshot?.status === 'active' && !!snapshot.relationship
  const composing = active && !!snapshot?.partner && view === 'message' && !quotaUsed
  const update = (value: CompanionSnapshot) => onChange({ ok: true, value })
  const refresh = () => run(loadCompanion, update, 'No se pudo actualizar tu compañero. Inténtalo de nuevo.', { ignoreErrors: ['stale_result', 'busy'] })
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => { setView(requestedView === 'message' ? 'message' : 'overview') }, [requestedView])
  useEffect(() => {
    if (!composing && returnFocus.current) { returnFocus.current = false; composeTrigger.current?.focus({ preventScroll: true }) }
  }, [composing])
  useEffect(() => {
    const reconnect = () => { void refreshRef.current() }
    window.addEventListener('online', reconnect)
    return () => { window.removeEventListener('online', reconnect); draftRequest.current = null }
  }, [])
  function cancelMessage() { clearError(); returnFocus.current = true; setView('overview') }
  const options = active && !composing ? <Dialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
    <DialogTrigger asChild><button type="button" aria-label={t('Opciones de compañero')} className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:bg-muted/30"><MoreHorizontal aria-hidden className="h-5 w-5" /></button></DialogTrigger>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-3xl border-border bg-card">
      <DialogHeader><DialogTitle className="font-display text-2xl">{t('¿Dejar de compartir?')}</DialogTitle><DialogDescription className="pt-3 leading-relaxed">{t('{name} y tú dejarán de ver sus resúmenes y de enviarse saludos. Tus entrenamientos guardados se conservan.', { name: snapshot!.relationship!.other.fullName })}</DialogDescription></DialogHeader>
      <div className="mt-6 space-y-3">{error ? <CompanionNotice error>{t(error)}</CompanionNotice> : null}
        <Button variant="outline" className={companionButton} onClick={() => setUnlinkOpen(false)}>{t('Conservar compañero')}</Button>
        <Button disabled={busy || offline} className={`${companionButton} border border-rose-400/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20`} onClick={() => void run(() => leaveCompanion(snapshot!.relationship!.id), value => { setDraft(''); draftRequest.current = null; setUnlinkOpen(false); update(value) }, 'No se pudo dejar de compartir. Inténtalo de nuevo.')}>{t('Sí, dejar de compartir')}</Button>
      </div>
    </DialogContent>
  </Dialog> : undefined
  return <>
    <PageTopBar title={t(composing ? 'Enviar un saludo' : snapshot?.status === 'none' ? 'Invitar a un compañero' : snapshot?.status === 'pending_incoming' ? 'Revisar invitación' : 'Compañero de constancia')} subtitle={t('Un paso a la vez, acompañados')} backHref={composing ? undefined : '/dashboard'} backLabel={composing ? undefined : t('Volver a Inicio')} icon={composing ? <button type="button" aria-label={t('Volver a mi compañero')} className="grid h-11 w-11 place-items-center" onClick={cancelMessage}><ArrowLeft aria-hidden className="h-5 w-5" /></button> : undefined} right={options} />
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6 sm:py-8" aria-busy={busy || undefined}>
      {offline ? <CompanionNotice offline>{t(snapshot ? 'Sin conexión · Mostrando el último resumen.' : 'Conéctate para consultar a tu compañero.')}</CompanionNotice> : null}
      {notice ? <CompanionNotice>{t(notice)}</CompanionNotice> : null}
      {!snapshot ? <section className={`${companionPanel} space-y-5 text-center`}><h2 className="font-display text-2xl font-bold">{t('Tu compañero, en un momento')}</h2><p className="text-sm leading-relaxed text-muted-foreground">{t('No se pudo cargar tu compañero. Comprueba tu conexión y vuelve a intentarlo.')}</p><Button disabled={busy || !online} className={companionButton} onClick={() => void refresh()}>{t('Reintentar')}</Button></section>
        : composing ? <CompanionMessage snapshot={snapshot} draft={draft} onDraft={setDraft} request={draftRequest} offline={offline} busy={busy} error={error} run={run} onCancel={cancelMessage} onSent={value => { setDraft(''); draftRequest.current = null; setView('overview'); setNotice('Tu saludo está enviado.'); update(value) }} />
          : active ? <CompanionOverview snapshot={snapshot} offline={offline} quotaUsed={quotaUsed} triggerRef={composeTrigger} onCompose={() => { clearError(); setNotice(''); setView('message') }} />
            : <CompanionInvitation snapshot={snapshot} offline={offline} busy={busy} run={run} onChange={update} />}
      {error && !composing && !unlinkOpen ? <CompanionNotice error>{t(error)}</CompanionNotice> : null}
      {snapshot ? <button type="button" disabled={busy || !online} onClick={() => void refresh()} className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"><RefreshCw aria-hidden className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />{t('Actualizar')}</button> : null}
    </div>
  </>
}
