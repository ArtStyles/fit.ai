'use client'

import { useId, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, LockKeyhole } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FitnessAccess, FitnessAccessAction } from '@/lib/fitness-card/types'
import styles from './fitness-card.module.css'

export function FitnessCardAccess({ viewerId, items, busy, onAction }: { viewerId: string; items: FitnessAccess[]; busy: boolean; onAction: (action: FitnessAccessAction, handle?: string, requestId?: string) => Promise<void> }) {
  const { language } = useI18n()
  const es = language === 'es'
  const id = useId()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const active = items.filter(item => item.status === 'accepted' || item.status === 'pending')
  const disabled = busy || working
  const act = async (action: FitnessAccessAction, requestId?: string) => { setWorking(true); setError(''); setMessage(''); try { await onAction(action, requestId ? undefined : handle.trim(), requestId); if (!requestId) setHandle(''); setMessage(es ? 'Acceso actualizado.' : 'Access updated.') } catch { setError(es ? 'No se pudo actualizar el acceso. Revisa el @usuario y tu conexión.' : 'Could not update access. Check the @username and your connection.') } finally { setWorking(false) } }
  return <div><div className={styles.accessForm}><div className="flex items-center gap-3"><LockKeyhole size={20} className="text-violet-500" /><h3 className="font-semibold">{es ? 'Tú eliges quién entra.' : 'You choose who gets in.'}</h3></div><p className={styles.note}>{es ? 'Compartir da acceso a tu tarjeta. Solicitar pide ver la de otra persona; ella decide si acepta. Puedes retirar el acceso cuando quieras.' : 'Sharing grants access to your card. Requesting asks to view someone else’s; they decide whether to accept. You can withdraw access anytime.'}</p>
    <label htmlFor={`${id}-handle`} className={styles.field}>{es ? '@usuario de tu compañero' : 'Your companion’s @username'}<Input id={`${id}-handle`} value={handle} maxLength={32} onChange={event => setHandle(event.target.value)} placeholder="@usuario" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={disabled} /></label>
    <div className={styles.actions}><Button type="button" disabled={disabled || !handle.trim()} onClick={() => void act('share')}><ArrowUpRight size={16} className="mr-2" />{es ? 'Compartir la mía' : 'Share mine'}</Button><Button type="button" variant="outline" disabled={disabled || !handle.trim()} onClick={() => void act('request')}><ArrowDownLeft size={16} className="mr-2" />{es ? 'Solicitar la suya' : 'Request theirs'}</Button></div></div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}{message && <p role="status" className={`${styles.note} mt-3`}>{message}</p>}
    <div className={styles.accessRows}>{active.length ? active.map(item => { const own = item.owner.userId === viewerId; const person = own ? item.viewer : item.owner; const actions: {action: FitnessAccessAction; text: string}[] = item.status === 'pending' ? (own ? [{action:'accept',text:es ? 'Aceptar' : 'Accept'},{action:'reject',text:es ? 'Rechazar' : 'Reject'}] : [{action:'cancel',text:es ? 'Cancelar solicitud' : 'Cancel request'}]) : [{action:own ? 'revoke' : 'leave',text:own ? (es ? 'Retirar acceso' : 'Revoke access') : (es ? 'Salir de esta tarjeta' : 'Leave this card')}]; return <article key={item.id} className={styles.accessRow}><div className={styles.accessIdentity}><div className={styles.avatar}>{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.name.slice(0,1).toUpperCase()}</div><div className="min-w-0"><h4 className="break-words text-sm font-semibold">{person.name}</h4><p className={`${styles.note} break-all`}>{person.username ? `@${person.username}` : (es ? 'Sin @usuario' : 'No @username')}</p></div></div><p className={styles.note}>{item.status === 'pending' ? (own ? (es ? 'Quiere ver tu tarjeta · Pendiente de tu respuesta' : 'Wants to view your card · Awaiting your response') : (es ? 'Solicitaste su tarjeta · Esperando respuesta' : 'You requested their card · Awaiting response')) : (own ? (es ? 'Puede ver tu tarjeta' : 'Can view your card') : (es ? 'Puedes ver su tarjeta' : 'You can view their card'))}</p><div className={styles.actions}>{actions.map(action => <Button key={action.action} type="button" variant={action.action === 'accept' ? 'default' : 'outline'} disabled={disabled} onClick={() => void act(action.action,item.id)}>{action.text}</Button>)}</div></article> }) : <div className={styles.empty}><LockKeyhole size={28} strokeWidth={1.4} /><strong>{es ? 'Tu círculo empieza aquí.' : 'Your circle starts here.'}</strong><p className={styles.note}>{es ? 'Todavía no hay solicitudes ni accesos activos.' : 'No requests or active access yet.'}</p></div>}</div>
  </div>
}
