import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppShell } from '@/components/navigation/AppShell'
import { getPersonalNavItems, getCoachNavItems } from '@/components/navigation/appNavigation'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ToastProvider } from '@/components/feedback/ToastProvider'
import { ActionNotice } from '@/components/feedback/ActionNotice'
import { NativeAppInit } from '@/components/native/NativeAppInit'
import { AndroidBackHandler } from '@/components/native/AndroidBackHandler'
import { Button } from '@/components/ui/button'
import { getAppStore } from './storage'
import { loadOriginalRoute } from './routes'
import { navigate, RouteRedirect, useLocationKey } from './router'
import type { AppState } from './types'
import { LoginScreen } from './LoginScreen'
import { StorageSettings } from './StorageSettings'
import { LocalActionNotices } from './LocalActionNotices'
import { AppLoadingScreen } from './AppLoadingScreen'
import { installCompanionBackupSync } from './companion-backup'

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <main className="mx-auto max-w-lg space-y-4 px-5 py-12"><h1 className="font-display text-2xl font-bold">No se pudo mostrar esta pantalla</h1><p role="alert" className="text-sm text-muted-foreground">Tus datos guardados siguen en este dispositivo. Puedes volver a Inicio e intentarlo de nuevo.</p><Button onClick={() => navigate('/dashboard')}>Volver a Inicio</Button><Button variant="outline" onClick={() => location.reload()}>Volver a abrir</Button></main> : this.props.children
  }
}

export default function OriginalApp() {
  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    void installCompanionBackupSync().then(stop => { if (disposed) stop(); else cleanup = stop }).catch(() => {})
    return () => { disposed = true; cleanup?.() }
  }, [])
  const locationKey = useLocationKey()
  const [state, setState] = useState<AppState | null>(null)
  const [page, setPage] = useState<ReactNode>(null)
  const [pageRoute, setPageRoute] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [change, setChange] = useState(0)
  const loadedRoute = useRef('')
  useEffect(() => {
    const update = () => setChange(value => value + 1)
    window.addEventListener('vekira:original-state-changed', update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('vekira:original-state-changed', update); window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void (async () => {
      const pathname = location.pathname
      // Signing in must remain available even when local storage cannot open.
      if (pathname === '/login') {
        setState(null)
        setPage(<LoginScreen />)
        setPageRoute(':/login')
        loadedRoute.current = `:${locationKey}`
        return
      }
      const next = await (await getAppStore()).read()
      if (!alive) return
      setState(next)
      if (['/', '/es', '/en'].includes(pathname)) { navigate(next ? '/dashboard' : '/login', true); return }
      const publicRoute = pathname === '/register' || /^\/(es|en)\/(privacidad|terminos|privacy|terms)\/?$/.test(pathname)
      if (!next && !publicRoute) { navigate('/login', true); return }
      const loadKey = `${next?.accountId ?? ''}:${locationKey}`
      // The existing SessionClient owns its live draft. A SQLite commit updates
      // the surrounding account state without reinitializing its exercise props.
      if (pathname.startsWith('/session/') && loadedRoute.current === loadKey) return
      const rendered = pathname === '/settings/almacenamiento' ? <StorageSettings />
          : await loadOriginalRoute(pathname, new URLSearchParams(location.search))
      const current = await (await getAppStore()).read()
      if (current?.accountId !== next?.accountId) return
      if (alive) { setPage(rendered); setPageRoute(`${next?.accountId ?? ''}:${pathname}`); loadedRoute.current = loadKey }
    })().catch(reason => {
      if (!alive) return
      if (reason instanceof RouteRedirect) { navigate(reason.href, true); return }
      if (['/', '/es', '/en'].includes(location.pathname)) { navigate('/login', true); return }
      setError(reason instanceof Error ? reason.message : 'No se pudo abrir esta pantalla.')
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [locationKey, change])
  const profile = state?.tables.profiles.find(row => row.id === state.accountId)
  const language = profile?.language === 'en' ? 'en' : 'es'
  const chrome = state && !/^\/(login|register|onboarding|suspended)(\/|$)/.test(location.pathname)
  const body = error ? <main className="mx-auto max-w-lg space-y-4 px-5 py-12"><h1 className="font-display text-2xl font-bold">No se pudo abrir esta pantalla</h1><p role="alert" className="text-sm text-muted-foreground">{error}</p><Button onClick={() => navigate('/dashboard')}>Volver a Inicio</Button><Button variant="outline" onClick={() => navigate('/settings/almacenamiento')}>Cuenta y almacenamiento</Button></main>
    : (loading && !page) || pageRoute !== `${state?.accountId ?? ''}:${location.pathname}` ? <AppLoadingScreen /> : <ScreenBoundary key={pageRoute}>{page}</ScreenBoundary>
  const trainer = state?.tables.trainer_profiles?.find(row => row.user_id === state.accountId && row.status === 'active')
  return <I18nProvider language={language} timeZone={String(profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)}><ToastProvider><NativeAppInit /><AndroidBackHandler /><LocalActionNotices /><ActionNotice />{chrome ? <AppShell accountWorkspace={{ account: { id: state.accountId, name: String(profile?.full_name || 'Vekira'), email: state.email, avatarUrl: profile?.avatar_url ?? null }, trainerAccess: trainer ? { granted: true } : { granted: false, reason: 'missing_profile' }, preferredWorkspace: location.pathname.startsWith('/coach') && trainer ? 'coach' : 'personal', personalNavItems: getPersonalNavItems({ communityEnabled: false }), coachNavItems: getCoachNavItems() }}>{body}{location.pathname === '/settings' && <div className="mx-auto max-w-lg px-4 pb-24"><Button variant="outline" className="w-full" onClick={() => navigate('/settings/almacenamiento')}>Sin conexión, cuentas y respaldo</Button></div>}</AppShell> : body}</ToastProvider></I18nProvider>
}
