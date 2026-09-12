'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, IdCard, Loader2, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { openFitnessPlatform } from '@/lib/fitness-card/platform'
import type { FitnessPlatform } from '@/lib/fitness-card/platform-types'
import { createFitnessClient, createPrivateCardLease, fitnessError } from '@/lib/fitness-card/client'
import { prepareFitnessPhoto } from '@/lib/fitness-card/photos'
import { fitnessEvidenceFingerprint } from '@/lib/fitness-card/fingerprint'
import type { FitnessAccessAction, FitnessCard, FitnessEvidence, FitnessHubState, FitnessPhotoUrls } from '@/lib/fitness-card/types'
import { FitnessCardDetail } from './FitnessCardDetail'
import { FitnessCardEditor } from './FitnessCardEditor'
import { FitnessCardCollection } from './FitnessCardCollection'
import { FitnessCardAccess } from './FitnessCardAccess'

type Client = ReturnType<typeof createFitnessClient>

function useOwnPhotos(client: Client, card: FitnessCard | null, enabled: boolean) {
  const [photos, setPhotos] = useState<FitnessPhotoUrls>({})
  const [failed, setFailed] = useState(false)
  const signature = card ? `${card.owner.userId}:${card.revision}:${JSON.stringify(card.photos)}` : ''
  useEffect(() => {
    let alive = true
    const urls: string[] = []
    setPhotos({}); setFailed(false)
    if (enabled && card) void Promise.all(card.photos.map(async photo => {
      const blob = await client.photo(photo.path)
      if (!alive) return null
      const url = URL.createObjectURL(blob); urls.push(url)
      return [photo.slot, url] as const
    })).then(items => { if (alive) setPhotos(Object.fromEntries(items.filter(item => item !== null))) }).catch(() => { if (alive) { setPhotos({}); setFailed(true) } })
    return () => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)) }
    // A revision invalidates every photo URL, including in-place replacement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, signature, enabled])
  return { photos, failed }
}

function FitnessWorkspace({ platform }: { platform: FitnessPlatform }) {
  const { language } = useI18n()
  const es = language === 'es'
  const client = useMemo(() => createFitnessClient(platform), [platform])
  const [hub, setHub] = useState<FitnessHubState | null>(null)
  const [local, setLocal] = useState<FitnessEvidence | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invalidAccount, setInvalidAccount] = useState(false)
  const [tab, setTab] = useState('mine')
  const [selected, setSelected] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const [viewer, setViewer] = useState<{ card: FitnessCard; photos: FitnessPhotoUrls } | null>(null)
  const viewerRef = useRef<typeof viewer>(null)
  const alive = useRef(true)
  const refreshEpoch = useRef(0)
  const writing = useRef(false)
  const viewerUrls = useRef<string[]>([])
  const lease = useMemo(() => createPrivateCardLease<NonNullable<typeof viewer>>(value => {
    if (!value) { viewerUrls.current.forEach(url => URL.revokeObjectURL(url)); viewerUrls.current = [] }
    viewerRef.current = value; setViewer(value)
  }), [])
  const replaceHub = useCallback((next: FitnessHubState) => { setHub(next) }, [])
  const clearViewer = useCallback(() => lease.invalidate(), [lease])
  const own = hub?.own ?? (local ? { owner: platform.identity, artisticName: '', theme: 'violet' as const, revision: 0, photos: [], evidence: local, updatedAt: local.updatedAt } : null)
  const { photos: ownPhotos, failed: photoFailed } = useOwnPhotos(client, hub?.own ?? null, online && !invalidAccount)

  const readViewer = useCallback(async (ownerId: string) => {
    const token = lease.beginRead()
    const created: string[] = []
    try {
      const card = await client.read(ownerId)
      if (!alive.current || selectedRef.current !== ownerId || !navigator.onLine || document.hidden) return
      const prior = viewerRef.current
      if (prior?.card.owner.userId === ownerId && prior.card.revision === card.revision) { lease.commit(token, { ...prior, card }); return }
      const downloads = await Promise.allSettled(card.photos.map(photo => client.photo(photo.path)))
      const entries = downloads.map((result, index) => {
        if (result.status === 'rejected') throw result.reason
        const url = URL.createObjectURL(result.value); created.push(url)
        return [card.photos[index].slot, url] as const
      })
      const fresh = card.photos.length ? await client.read(ownerId) : card
      if (fresh.revision !== card.revision || !alive.current || selectedRef.current !== ownerId || !navigator.onLine || document.hidden) return
      const previousUrls = viewerUrls.current
      if (lease.commit(token, { card: fresh, photos: Object.fromEntries(entries) })) {
        viewerUrls.current = created.splice(0); previousUrls.forEach(url => URL.revokeObjectURL(url))
      }
    } catch (reason) {
      if (alive.current && selectedRef.current === ownerId) { clearViewer(); setError(fitnessError(reason)) }
    } finally { created.forEach(url => URL.revokeObjectURL(url)) }
  }, [client, clearViewer, lease])

  const refresh = useCallback(async () => {
    const epoch = ++refreshEpoch.current
    if (!navigator.onLine || document.hidden) { clearViewer(); return }
    try {
      if (!platform.linked) return
      const next = await client.hub()
      if (!alive.current || epoch !== refreshEpoch.current) return
      replaceHub(next); setError('')
      const ownerId = selectedRef.current
      if (ownerId) {
        if (next.received.some(item => item.owner.userId === ownerId)) await readViewer(ownerId)
        else { clearViewer(); setError(es ? 'Ya no tienes acceso a esta tarjeta.' : 'You no longer have access to this card.') }
      }
    } catch (reason) {
      if (alive.current && epoch === refreshEpoch.current) { clearViewer(); setError(fitnessError(reason)); setHub(current => current ? { ...current, received: [], access: [] } : null) }
    } finally { if (alive.current) setLoading(false) }
  }, [client, clearViewer, es, platform.linked, readViewer, replaceHub])

  useEffect(() => {
    alive.current = true
    const requestGeneration = refreshEpoch
    const localRead = () => { void platform.evidence().then(value => { if (alive.current) setLocal(value) }).catch(reason => { if (alive.current) setError(fitnessError(reason)) }) }
    localRead(); void refresh()
    if (!platform.linked) setLoading(false)
    const stop = platform.watch(kind => {
      if (!alive.current) return
      if (kind === 'account') { refreshEpoch.current++; clearViewer(); setHub(null); setLocal(null); setInvalidAccount(true); return }
      if (kind === 'local') localRead()
      if (kind === 'remote') clearViewer()
      void refresh()
    })
    const connection = () => { setOnline(navigator.onLine); clearViewer(); if (navigator.onLine) { localRead(); void refresh() } }
    const visibility = () => { clearViewer(); if (!document.hidden) void refresh() }
    window.addEventListener('online', connection); window.addEventListener('offline', connection)
    window.addEventListener('focus', visibility); document.addEventListener('visibilitychange', visibility)
    const interval = setInterval(() => { if (!writing.current) void refresh() }, 5000)
    return () => { alive.current = false; requestGeneration.current++; clearInterval(interval); stop(); clearViewer(); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('focus', visibility); document.removeEventListener('visibilitychange', visibility) }
  }, [platform, refresh, clearViewer])

  const run = async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (writing.current) throw new Error(es ? 'Espera a que termine la operación.' : 'Wait for the current operation.')
    writing.current = true; setBusy(true); setError(''); refreshEpoch.current++
    try { await platform.assertCurrent(); const result = await operation(); await platform.assertCurrent(); if (alive.current) await refresh(); return result }
    catch (reason) { if (alive.current) setError(fitnessError(reason)); throw reason }
    finally { writing.current = false; if (alive.current) setBusy(false) }
  }
  const create = () => run(async () => {
    const card = await client.save('', 'violet', 0)
    const evidence = await platform.sharedEvidence()
    if (fitnessEvidenceFingerprint(evidence) !== fitnessEvidenceFingerprint(card.evidence)) await client.publish(evidence, card.revision)
  })
  const manualRefresh = () => run(async () => {
    if (!hub?.own) return
    const current = await client.read(platform.identity.userId)
    const evidence = await platform.sharedEvidence()
    if (fitnessEvidenceFingerprint(evidence) !== fitnessEvidenceFingerprint(current.evidence)) await client.publish(evidence, current.revision)
  })
  const access = (action: FitnessAccessAction, handle?: string, requestId?: string) => run(async () => { const next = await client.access(action, handle, requestId); if (alive.current) replaceHub(next) })
  const openCard = (ownerId: string) => { clearViewer(); setError(''); selectedRef.current = ownerId; setSelected(ownerId); void readViewer(ownerId) }
  const closeCard = () => { selectedRef.current = null; setSelected(null); clearViewer() }

  if (invalidAccount) return <p role="alert" className="p-6">{es ? 'La cuenta cambió. Vuelve a abrir Fitness Card desde tu perfil.' : 'Your account changed. Reopen Fitness Card from your profile.'}</p>
  return <>
    <PageTopBar title="Fitness Card" backHref="/progress" backLabel={es ? 'Volver a Progreso' : 'Back to Progress'} icon={<IdCard className="h-5 w-5" />} />
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6" data-fitness-card-hub>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-violet-600 dark:text-violet-300">Vekira · Fitness Card</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{es ? 'Tu esfuerzo tiene identidad.' : 'Give your effort an identity.'}</h2></div><Button variant="ghost" size="icon" disabled={busy || loading || !online} aria-label={es ? 'Actualizar tarjetas' : 'Refresh cards'} onClick={() => { void manualRefresh().catch(() => {}) }}><RefreshCw className="h-4 w-4" /></Button></div>
      <Tabs value={tab} onValueChange={setTab}><TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl p-1" aria-label={es ? 'Vistas de Fitness Card' : 'Fitness Card views'}>{['mine', 'collection', 'access'].map((value, index) => <TabsTrigger key={value} value={value} className="min-h-11 min-w-0 rounded-xl px-1 text-xs sm:text-sm">{(es ? ['Mi tarjeta', 'Colección', 'Accesos'] : ['My card', 'Collection', 'Access'])[index]}</TabsTrigger>)}</TabsList>
      {!online && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-muted p-3 text-sm"><WifiOff size={16} />{es ? 'Sin conexión. Las tarjetas compartidas se abrirán al reconectar.' : 'Offline. Shared cards will reopen when you reconnect.'}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{es ? error : 'We could not verify or save this card. Check your connection and refresh. If the server update is pending, it must be activated first.'}</p>}
      <TabsContent value="mine" className="mt-5 space-y-4">{own ? <>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} />{es ? 'Tú decides quién puede verla.' : 'You decide who can see it.'}</p>{hub?.own && online && <FitnessCardEditor card={hub.own} photoUrls={ownPhotos} busy={busy} onSave={(name, theme, revision) => run(async () => { await client.save(name, theme, revision) })} onUpload={(slot, file) => run(async () => { const blob = await prepareFitnessPhoto(file); await client.upload(slot, blob); return client.read(platform.identity.userId) })} onRemove={slot => run(async () => { await client.remove(slot); return client.read(platform.identity.userId) })} />}</div>
        {!hub?.own && <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4"><p className="mb-3 text-sm text-muted-foreground">{es ? 'Esta es tu vista previa. Crea tu tarjeta para elegir el estilo, añadir fotos y compartirla con tu círculo.' : 'This is your preview. Create your card to choose a style, add photos and share with your circle.'}</p>{!platform.linked ? <PendingLink href="/settings/almacenamiento" className="inline-flex min-h-11 items-center gap-2 font-semibold">{es ? 'Conectar mi cuenta' : 'Connect my account'}<ArrowUpRight size={16} /></PendingLink> : !platform.identity.username ? <PendingLink href="/settings/perfil" className="inline-flex min-h-11 items-center gap-2 font-semibold">{es ? 'Elegir mi @usuario' : 'Choose my @username'}<ArrowUpRight size={16} /></PendingLink> : <Button disabled={busy || !online || loading || !!error} onClick={() => { void create().catch(() => {}) }}>{busy ? (es ? 'Creando…' : 'Creating…') : (es ? 'Crear mi Fitness Card' : 'Create my Fitness Card')}</Button>}</div>}
        {photoFailed && <p role="status" className="text-sm text-muted-foreground">{es ? 'No se pudieron abrir tus fotos. Actualiza cuando tengas conexión.' : 'Your photos could not load. Refresh when connected.'}</p>}
        <FitnessCardDetail card={own} photoUrls={ownPhotos} />
      </> : <div role="status" className="flex justify-center gap-2 py-16"><Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />{es ? 'Preparando tu tarjeta…' : 'Preparing your card…'}</div>}</TabsContent>
      <TabsContent value="collection" className="mt-5"><p className="mb-4 text-sm text-muted-foreground">{es ? 'Las tarjetas que comparten contigo se actualizan cuando sus dueños hacen cambios.' : 'Cards shared with you update when their owners make changes.'}</p>{online ? <FitnessCardCollection cards={hub?.received ?? []} onOpen={openCard} /> : null}</TabsContent>
      <TabsContent value="access" className="mt-5">{platform.linked ? <FitnessCardAccess viewerId={platform.identity.userId} items={online ? hub?.access ?? [] : []} busy={busy || !online || !hub} onAction={access} /> : <p className="py-8 text-sm text-muted-foreground">{es ? 'Conecta tu cuenta para compartir y solicitar tarjetas mediante el @usuario.' : 'Connect your account to share and request cards by @username.'}</p>}</TabsContent></Tabs>
      <p className="pb-4 text-xs leading-relaxed text-muted-foreground">{es ? 'Solo se comparte lo que aparece en tu tarjeta. Tus rutinas completas y medidas personales siguen siendo privadas.' : 'Only your card content is shared. Your complete routines and personal measurements stay private.'}</p>
    </main>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) closeCard() }}><DialogContent className="max-w-3xl" closeLabel={es ? 'Cerrar tarjeta' : 'Close card'}><DialogTitle>Fitness Card</DialogTitle><DialogDescription>{es ? 'Acceso personal. Los cambios se actualizan mientras tengas permiso.' : 'Personal access. Changes update while you have permission.'}</DialogDescription>{viewer ? <FitnessCardDetail card={viewer.card} photoUrls={viewer.photos} /> : <p role="status" className="py-12 text-center text-sm text-muted-foreground">{error || (es ? 'Comprobando acceso…' : 'Checking access…')}</p>}</DialogContent></Dialog>
  </>
}

export function FitnessCardHub() {
  const [platform, setPlatform] = useState<FitnessPlatform | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true, opened: FitnessPlatform | null = null
    void openFitnessPlatform().then(value => { opened = value; if (active) setPlatform(value); else value.dispose() }).catch(reason => { if (active) setError(fitnessError(reason)) })
    return () => { active = false; opened?.dispose() }
  }, [])
  return platform ? <FitnessWorkspace platform={platform} /> : <main className="p-6" role="status">{error || 'Fitness Card…'}</main>
}
