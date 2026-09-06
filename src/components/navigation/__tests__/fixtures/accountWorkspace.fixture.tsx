import '@/styles/globals.css'

import { createRoot } from 'react-dom/client'
import { Bell, PlusCircle, Search } from 'lucide-react'
import { AppShell } from '@/components/navigation/AppShell'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { AccountWorkspaceMenu } from '@/components/navigation/AccountWorkspaceMenu'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { getCoachNavItems, getPersonalNavItems } from '@/components/navigation/appNavigation'
import { dismissOpenRadixOverlay } from '@/lib/native/androidBackOverlay'
import { WORKSPACE_NAVIGATION_COMMIT } from '@/components/navigation/WorkspaceNavigationGuard'
import { saveBackup, type SessionSnapshot } from '@/lib/session/persistSession'
import type { AccountWorkspaceModel } from '@/components/navigation/AccountWorkspaceContext'

const query = new URLSearchParams(window.location.search)
const surface = query.get('surface') ?? 'shell'
const preferred = query.get('preferred') ?? 'personal'
const access = query.get('access') ?? 'granted'
const language = query.get('language') ?? 'es'

const personalNavItems = getPersonalNavItems({ communityEnabled: false })
const coachNavItems = getCoachNavItems()
const model: AccountWorkspaceModel = {
  account: {
    name: 'Ana P\u00e9rez Entrenamiento de Rendimiento',
    email: 'ana.entrenamiento.muy.largo@example.com',
    avatarUrl: null,
  },
  trainerAccess: access === 'denied'
    ? { granted: false, reason: 'inactive' }
    : { granted: true },
  preferredWorkspace: preferred === 'coach' ? 'coach' : 'personal',
  personalNavItems,
  coachNavItems,
}

document.documentElement.lang = language === 'en' ? 'en' : 'es'
document.documentElement.classList.add('dark')

const content = (() => {
  if (surface === 'dashboard') {
    return (
      <DashboardHeader
        greeting="Buenos días"
        firstName="Ana"
        dateLabel="sábado, 5 de septiembre"
        profileHref={null}
      />
    )
  }
  if (surface === 'immersive') {
    return (
      <FixedTopBar accountSlot="hidden">
        <h1>Flujo inmersivo</h1>
      </FixedTopBar>
    )
  }
  if (surface === 'menu') {
    return <div className="flex justify-end"><AccountWorkspaceMenu surface="topbar" /></div>
  }
  if (surface === 'feed') {
    return (
      <FixedTopBar
        actions={(
          <div aria-label="Acciones de comunidad" className="flex items-center gap-1">
            <button aria-label="Solicitudes" className="h-11 w-11"><Bell /></button>
            <button aria-label="Buscar" className="h-11 w-11"><Search /></button>
            <button aria-label="Publicar" className="h-11 w-11"><PlusCircle /></button>
          </div>
        )}
      >
        <h1 data-fixture-title className="min-w-0 flex-1 truncate font-display text-lg font-bold">Comunidad</h1>
      </FixedTopBar>
    )
  }
  if (surface === 'toolbar') {
    return (
      <FixedTopBar
        accountSlot="custom"
        contentClassName="mx-auto block max-w-7xl px-4 py-3"
        initialHeight={156}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h1 data-fixture-title className="min-w-0 truncate text-xl font-bold">
            Biblioteca de ejercicios
          </h1>
          <AccountWorkspaceMenu surface="topbar" />
        </div>
        <div data-fixture-stats className="mt-2 flex min-h-11 items-center justify-end gap-4">
          <span>124 ejercicios</span><span>Página 1 de 8</span>
        </div>
        <div data-fixture-filters className="mt-2 flex min-h-11 gap-2 overflow-hidden">
          <button className="min-h-11 px-3">Buscar</button>
          <button className="min-h-11 px-3">Filtros</button>
        </div>
      </FixedTopBar>
    )
  }
  return (
    <PageTopBar
      title="Notificaciones profesionales pendientes"
      right={<button className="h-11 px-3">Filtrar</button>}
    />
  )
})()

Object.assign(window, {
  __WORKSPACE_ACTIONS__: [] as string[],
  __WORKSPACE_COMMITS__: [] as string[],
  __WORKSPACE_REPLACES__: [] as string[],
  __WORKSPACE_REFRESHES__: 0,
  __SIGN_OUTS__: 0,
  __ANDROID_BACK__: () => dismissOpenRadixOverlay(),
})
window.addEventListener(WORKSPACE_NAVIGATION_COMMIT, event => {
  const detail = (event as CustomEvent<{ workspace: string }>).detail
  const state = window as unknown as Window & { __WORKSPACE_COMMITS__: string[] }
  state.__WORKSPACE_COMMITS__.push(detail.workspace)
})

createRoot(document.getElementById('root')!).render(
  <I18nProvider
    language={language === 'en' ? 'en' : 'es'}
    timeZone="America/Havana"
    syncDocumentLanguage={false}
  >
    <AppShell accountWorkspace={model}>
      <main className="min-h-screen px-4 py-6">{content}</main>
    </AppShell>
  </I18nProvider>,
)

const activeSnapshot: SessionSnapshot = {
  clientSessionId: 'session-1',
  workoutId: 'workout-1',
  workoutName: 'Fuerza de prueba',
  startedAt: Date.now(),
  exercises: [],
}
const readSessionBytes = () => ({
  pointer: localStorage.getItem('fitai_active_session'),
  backup: localStorage.getItem('fitai_session_workout-1'),
})
Object.assign(window, {
  __SEED_ACTIVE_SESSION__: () => {
    const result = saveBackup(activeSnapshot)
    if (!result.ok) throw new Error(result.error)
    return readSessionBytes()
  },
  __READ_ACTIVE_SESSION_BYTES__: readSessionBytes,
})
requestAnimationFrame(() => requestAnimationFrame(() => {
  const state = window as Window & { __ACCOUNT_WORKSPACE_READY__?: boolean }
  state.__ACCOUNT_WORKSPACE_READY__ = true
}))
