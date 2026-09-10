'use client'

import { CalendarCheck, HandHeart, LockKeyhole, UserRound, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { CompanionPerson, CompanionWeek } from '@/lib/companions/types'
import { cn } from '@/lib/utils'

export const companionPanel = 'rounded-3xl border border-border/60 bg-card p-5 sm:p-6'
export const companionButton = 'min-h-12 h-auto w-full whitespace-normal rounded-xl px-4 py-3 text-sm font-semibold'

export function CompanionAvatar({ person, large = false }: { person: CompanionPerson; large?: boolean }) {
  const initials = person.fullName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase()
  return <Avatar className={cn('h-11 w-11 border border-violet-300/20', large && 'h-20 w-20')}>
    {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" className="object-cover" /> : null}
    <AvatarFallback className={cn('bg-violet-500/15 font-display text-xl font-bold text-violet-200', large && 'text-3xl')}>{initials || <UserRound aria-hidden className="h-6 w-6" />}</AvatarFallback>
  </Avatar>
}

export function CompanionNotice({ children, error = false, offline = false }: { children: ReactNode; error?: boolean; offline?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className={cn('rounded-xl border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm leading-relaxed text-violet-200', error && 'border-rose-400/25 bg-rose-400/10 text-rose-200', offline && 'border-amber-400/20 bg-amber-400/10 text-amber-200')}>
    {offline ? <WifiOff aria-hidden className="mr-2 inline h-4 w-4" /> : null}{children}
  </div>
}

export function CompanionSharingScope() {
  const { t } = useI18n()
  return <>
    <section className={companionPanel}>
      <h2 className="font-display text-2xl font-bold">{t('Lo que compartirán')}</h2>
      <ul className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
        {([{ Icon: UserRound, text: 'Su nombre y foto de perfil.' }, { Icon: CalendarCheck, text: 'Sesiones completadas esta semana y la meta de cada uno.' }, { Icon: HandHeart, text: 'Un saludo al día, con un mensaje opcional.' }]).map(({ Icon, text }) => {
          return <li key={text} className="flex gap-3"><Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><span>{t(text)}</span></li>
        })}
      </ul>
    </section>
    <p className="text-center text-xs leading-relaxed text-muted-foreground">{t('Tus medidas, datos de salud y ejercicios no se comparten.')}<br />{t('Puedes dejar de compartir cuando quieras.')}</p>
  </>
}

export function CompanionPrivacyNote() {
  const { t } = useI18n()
  return <p className="flex gap-3 text-xs leading-relaxed text-muted-foreground"><LockKeyhole aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><span>{t('Comparten su resumen semanal y sus saludos.')}<br />{t('Tus datos de salud y tu rutina siguen siendo privados.')}</span></p>
}

export function CompanionWeekProgress({ name, week, self = false, offline = false }: { name: string; week: CompanionWeek | null; self?: boolean; offline?: boolean }) {
  const { t, language } = useI18n()
  if (!week) return <div className="py-5"><p className="font-semibold">{name}</p><p className="mt-1 text-sm text-muted-foreground">{t('Resumen no disponible.')}</p></div>
  const date = (value: string) => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  const hasGoal = week.goal !== null && week.goal > 0
  const value = hasGoal ? Math.min(100, week.completedSessions / week.goal! * 100) : 0
  return <div className="space-y-3 py-5">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{name}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{date(week.weekStart)} – {date(week.weekEnd)}</p></div>
      <p className="shrink-0 font-display text-3xl font-bold tabular-nums">{week.completedSessions}<span className="ml-1 font-sans text-xs font-normal text-muted-foreground">{hasGoal ? `/ ${week.goal}` : t('sesiones')}</span></p>
    </div>
    {hasGoal ? <div role="progressbar" aria-label={t('{name}, {completed} de {goal} sesiones semanales', { name, completed: week.completedSessions, goal: week.goal! })} aria-valuemin={0} aria-valuemax={Math.max(week.goal!, week.completedSessions)} aria-valuenow={week.completedSessions} className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full bg-violet-400', self && 'bg-muted-foreground')} style={{ width: `${value}%` }} />
    </div> : <p className="text-xs text-muted-foreground">{t('Sin meta semanal definida.')}</p>}
    {offline ? <p className="text-xs text-muted-foreground">{t('Último resumen guardado')}</p> : null}
  </div>
}

export function companionErrorMessage(code: string, fallback: string) {
  if (code === 'daily_limit') return 'Ya enviaste tu saludo de hoy. Actualiza la vista para ver cuándo puedes enviar otro.'
  if (code === 'conflict') return 'Este vínculo o invitación ha cambiado. Actualiza la vista para continuar.'
  if (code === 'unauthenticated') return 'Inicia sesión para continuar.'
  if (code === 'connection_required' || code === 'offline') return 'Comprueba tu conexión e inténtalo de nuevo.'
  return fallback
}
