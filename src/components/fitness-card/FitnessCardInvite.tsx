'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, ShieldCheck } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PendingLink } from '@/components/navigation/PendingLink'
import { fitnessError, type createFitnessClient } from '@/lib/fitness-card/client'
import type { FitnessInvite } from '@/lib/fitness-card/types'
import { buildFitnessCardLink, storePendingFitnessInvite } from '@/lib/fitness-card/sharing'

type Props = {
  ownerId: string | null; client: ReturnType<typeof createFitnessClient>; online: boolean; linked: boolean; busy: boolean; accessVersion: string
  onClose: () => void; onRequest: (ownerId: string) => Promise<void>; onOpen: (ownerId: string, self: boolean) => void
}

export function FitnessCardInvite({ ownerId, client, online, linked, busy, accessVersion, onClose, onRequest, onOpen }: Props) {
  const { language } = useI18n()
  const es = language === 'es'
  const [invite, setInvite] = useState<FitnessInvite | null>(null)
  const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(() => {
    let active = true
    const requestGeneration = generation
    const read = async () => {
      const epoch = ++generation.current
      setInvite(null); setError('')
      if (!ownerId || !online || !linked || document.hidden) return
      try { const next = await client.invite(ownerId); if (active && epoch === generation.current && !document.hidden) setInvite(next) }
      catch (reason) { if (active && epoch === generation.current) setError(es ? fitnessError(reason) : 'This card could not be verified. Check your connection and try again.') }
    }
    void read()
    const visibility = () => { void read() }
    document.addEventListener('visibilitychange', visibility)
    return () => { active = false; requestGeneration.current++; document.removeEventListener('visibilitychange', visibility) }
  }, [ownerId, client, online, linked, es, accessVersion])
  const request = async () => {
    if (!ownerId || !invite || busy) return
    const epoch = generation.current
    try {
      await onRequest(ownerId)
      if (epoch !== generation.current) return
      const result = await client.invite(ownerId)
      if (epoch === generation.current) setInvite(result)
    } catch (reason) { if (epoch === generation.current) setError(es ? fitnessError(reason) : 'The request could not be sent. Try again.') }
  }
  const rememberInvite = () => { if (ownerId) storePendingFitnessInvite(buildFitnessCardLink(ownerId)) }
  return <Dialog open={ownerId !== null} onOpenChange={open => { if (!open) onClose() }}><DialogContent className="max-w-sm rounded-3xl" closeLabel={es ? 'Cerrar invitación' : 'Close invitation'}>
    <DialogHeader><DialogTitle>{es ? 'Conecta con su progreso.' : 'Connect with their progress.'}</DialogTitle><DialogDescription>{es ? 'Un QR, una nueva conexión en Vekira.' : 'One QR. A new connection on Vekira.'}</DialogDescription></DialogHeader>
    {!online ? <p role="status" className="py-6 text-sm text-muted-foreground">{es ? 'Conéctate para comprobar esta tarjeta.' : 'Connect to verify this card.'}</p> : !linked ? <div className="space-y-4 py-4"><p className="text-sm text-muted-foreground">{es ? 'Conecta tu cuenta para solicitar acceso.' : 'Connect your account to request access.'}</p><PendingLink href="/settings/almacenamiento" onClick={rememberInvite} className="inline-flex min-h-11 items-center font-semibold">{es ? 'Conectar mi cuenta' : 'Connect my account'}</PendingLink></div> : invite ? <div className="space-y-5 py-2">
      <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-500/30 bg-violet-500/10 text-xl font-semibold">{invite.owner.avatarUrl ? <img src={invite.owner.avatarUrl} alt="" className="h-full w-full object-cover" /> : invite.owner.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="break-words font-semibold">{invite.owner.name}</p><p className="break-all text-sm text-muted-foreground">@{invite.owner.username}</p></div></div>
      {invite.status === 'pending' ? <p role="status" className="flex items-start gap-2 text-sm leading-relaxed"><Check size={18} className="mt-0.5 shrink-0 text-violet-500" />{es ? 'Solicitud enviada. Su dueño debe aceptarla; después aparecerá en tu Colección.' : 'Request sent. Once the owner accepts, the card will appear in your Collection.'}</p> : invite.status === 'self' || invite.status === 'accepted' ? <Button className="min-h-11 w-full" onClick={() => onOpen(invite.owner.userId, invite.status === 'self')}>{invite.status === 'self' ? (es ? 'Ver mi tarjeta' : 'View my card') : (es ? 'Abrir tarjeta' : 'Open card')}</Button> : <><p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"><ShieldCheck size={18} className="mt-0.5 shrink-0" />{es ? 'Su tarjeta es privada. Envía una solicitud para que decida si comparte contigo.' : 'This card is private. Send a request so the owner can choose to share it with you.'}</p><Button className="min-h-11 w-full" disabled={busy} onClick={() => void request()}>{busy ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Solicitar acceso' : 'Request access')}</Button></>}
    </div> : !error ? <p role="status" className="flex justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 size={18} className="animate-spin motion-reduce:animate-none" />{es ? 'Comprobando tarjeta…' : 'Checking card…'}</p> : null}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </DialogContent></Dialog>
}
