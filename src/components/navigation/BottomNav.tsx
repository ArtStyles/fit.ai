'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { PendingLink } from './PendingLink'
import { getAppNavIcon, isAppNavItemActive, type AppNavItem } from './appNavigation'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { hapticImpact } from '@/lib/native/haptics'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import type { Workspace } from '@/lib/coaching/workspace'
import { ChevronUp, Trash2 } from 'lucide-react'
import {
  ACTIVE_SESSION_CHANGED_EVENT,
  clearActiveSession,
  loadActiveSession,
  type RestorableSessionSnapshot,
} from '@/lib/session/persistSession'
import { formatActiveWorkoutElapsed, summarizeActiveSession } from '@/components/session/sessionViewModel'
import { useSessionStore } from '@/store/sessionStore'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

// Routes where the bottom bar should be hidden (full-screen flows)
const HIDDEN_PREFIXES = ['/session', '/plans/generate', '/feed/new']

type ActiveWorkoutDockViewProps = {
  workoutId: string
  workoutName: string
  elapsedLabel: string
  completedSets: number
  totalSets: number
  percentage: number
  onDiscard: () => void
}

export function ActiveWorkoutDockView({
  workoutId,
  workoutName,
  elapsedLabel,
  completedSets,
  totalSets,
  percentage,
  onDiscard,
}: ActiveWorkoutDockViewProps) {
  return (
    <aside
      aria-label="Entrenamiento en curso"
      className="fitai-bottom-nav-offset fixed inset-x-3 z-40 mx-auto max-w-lg overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-xl lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0 lg:w-96"
    >
      <div
        role="progressbar"
        aria-label="Progreso del entrenamiento"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        className="h-1 bg-muted"
      >
        <div className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percentage}%` }} />
      </div>
      <div className="flex items-center gap-2 p-2">
        <PendingLink
          href={`/session/${workoutId}`}
          showSpinner={false}
          aria-label={`Continuar ${workoutName}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" aria-hidden="true" />
              En curso · {elapsedLabel}
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{workoutName}</span>
            <span className="block text-[11px] text-muted-foreground">{completedSets} de {totalSets} series</span>
          </span>
        </PendingLink>
        <button
          type="button"
          aria-label="Descartar entrenamiento"
          onClick={onDiscard}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}

export function ActiveWorkoutDock() {
  const pathname = usePathname()
  const [snapshot, setSnapshot] = useState<RestorableSessionSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [discardError, setDiscardError] = useState<string | null>(null)

  useEffect(() => {
    const refresh = () => setSnapshot(loadActiveSession())
    refresh()
    window.addEventListener(ACTIVE_SESSION_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(ACTIVE_SESSION_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  useEffect(() => {
    if (!snapshot) return
    setNow(Date.now())
    const interval = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [snapshot])

  if (!snapshot || pathname.startsWith('/session/')) return null

  const progress = summarizeActiveSession(snapshot.exercises)

  return (
    <>
      <div data-active-workout-spacer aria-hidden="true" className="h-24 shrink-0 lg:h-28" />
      <ActiveWorkoutDockView
        workoutId={snapshot.workoutId}
        workoutName={snapshot.workoutName}
        elapsedLabel={formatActiveWorkoutElapsed(snapshot.startedAt, now)}
        completedSets={progress.completedSets}
        totalSets={progress.totalSets}
        percentage={progress.percentage}
        onDiscard={() => {
          setDiscardError(null)
          setConfirmingDiscard(true)
        }}
      />

      <Dialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard}>
        <DialogContent className="max-w-sm gap-0 rounded-2xl border-border/70 bg-popover p-0">
          <div className="space-y-3 p-5 pr-16">
            <DialogTitle>¿Descartar entrenamiento?</DialogTitle>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Se eliminará el progreso sin guardar de esta sesión.
            </p>
            {discardError ? <p role="alert" className="text-sm text-destructive">{discardError}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
            <button
              type="button"
              onClick={() => setConfirmingDiscard(false)}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-foreground"
            >
              Continuar sesión
            </button>
            <button
              type="button"
              onClick={() => {
                const result = clearActiveSession()
                if (!result.ok) {
                  setDiscardError('No se pudo descartar el entrenamiento. Inténtalo nuevamente.')
                  return
                }
                useSessionStore.getState().clearSession()
                setSnapshot(null)
                setConfirmingDiscard(false)
              }}
              className="min-h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
            >
              Descartar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function BottomNav({ navItems, workspace }: { navItems: readonly AppNavItem[], workspace?: Workspace }) {
  const pathname = usePathname()
  const { t } = useI18n()

  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <nav
      aria-label={t('Navegación principal')}
      className="fitai-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center px-2">
        {navItems.map(({ href, label }) => {
          const Icon = getAppNavIcon(href)
          const isActive = isAppNavItemActive(pathname, href)
          const isTrainAction = href === '/entrenar'

          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              aria-label={t(label)}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => { void hapticImpact('light') }}
              className="group relative flex min-w-0 flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center px-1 py-1.5 outline-none [aria-busy=true]:opacity-100"
            >
              <span
                className={cn(
                  'flex items-center justify-center transition-[color,background-color,transform,box-shadow] duration-200 ease-out group-active:scale-90 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                  isTrainAction
                    ? '-translate-y-2 h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90'
                    : 'h-10 w-10 rounded-xl',
                  !isTrainAction && isActive
                    ? 'fitai-nav-selected text-primary'
                    : !isTrainAction && 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                {isActive && href === '/dashboard' ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-[23px] w-[23px] fill-current"
                  >
                    <path
                      d="M12 2.25 2.75 9.45v10.3A2.25 2.25 0 0 0 5 22h3.75v-7.25a3.25 3.25 0 0 1 6.5 0V22H19a2.25 2.25 0 0 0 2.25-2.25V9.45L12 2.25Z"
                    />
                  </svg>
                ) : (
                  <Icon
                    aria-hidden="true"
                    className={cn('transition-[stroke-width] duration-150', isTrainAction ? 'h-6 w-6' : 'h-[22px] w-[22px]')}
                    strokeWidth={isActive || isTrainAction ? 2.75 : 2}
                  />
                )}
              </span>
              <span className={cn(
                'mt-0.5 max-w-full truncate text-[10px] font-semibold leading-none transition-colors',
                isTrainAction ? '-mt-1 text-primary' : isActive ? 'text-primary' : 'text-muted-foreground',
              )}>
                {t(label)}
              </span>
            </PendingLink>
          )
        })}
        {workspace ? <WorkspaceSwitcher workspace={workspace} variant="mobile" /> : null}
      </div>
    </nav>
  )
}
