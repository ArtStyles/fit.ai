import { useEffect, useState } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/app/(auth)/login/LoginForm'
import { Button } from '@/components/ui/button'
import { getAppStore } from './storage'
import { newLocalState } from './defaults'
import { navigate } from './router'
import type { AppState } from './types'
import { hasPreviousLocalProfiles, recoverPreviousLocalProfiles } from './previousLocalProfiles'

export function LoginScreen() {
  const [spaces, setSpaces] = useState<AppState[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [previous, setPrevious] = useState(false)
  useEffect(() => { void getAppStore().then(store => store.list()).then(setSpaces).catch(reason => setError(String(reason))) }, [])
  useEffect(() => { void hasPreviousLocalProfiles().then(setPrevious).catch(() => setPrevious(false)) }, [])
  async function local() {
    setBusy(true); setError('')
    try { const store = await getAppStore(); const state = await newLocalState(); await store.create(state); await store.activate(state.accountId); navigate('/onboarding') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo crear el perfil local.'); setBusy(false) }
  }
  return <AuthShell aside={<div className="space-y-4"><h2 className="font-display text-4xl font-bold">Tu entrenamiento, contigo.</h2><p className="text-muted-foreground">Tus rutinas, tus series y tu progreso, también sin conexión.</p></div>}><div className="mb-8 space-y-3"><h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground">Bienvenido de vuelta.</h1><p className="text-base leading-7 text-muted-foreground">Tu aplicación de siempre, también sin conexión.</p></div>
    {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
    {spaces.length > 0 && <section className="mb-6 space-y-2"><h2 className="text-sm font-semibold">Perfiles guardados en este dispositivo</h2>{spaces.map(space => <Button key={space.accountId} variant="outline" className="w-full justify-start" onClick={() => void getAppStore().then(async store => { await store.activate(space.accountId); navigate('/dashboard') })}>{space.tables.profiles[0]?.full_name || 'Perfil local'}</Button>)}</section>}
    <Button className="mb-3 h-12 w-full" disabled={busy} onClick={() => void local()}>{busy ? 'Preparando…' : 'Usar sin conexión'}</Button>
    <p className="mb-6 text-xs leading-5 text-muted-foreground">Crea un perfil en este teléfono. Puedes conectar una cuenta cuando tengas internet.</p>
    {previous && <Button className="mb-6 min-h-12 w-full whitespace-normal" variant="outline" disabled={busy} onClick={() => { setBusy(true); setError(''); void recoverPreviousLocalProfiles().then(async () => { setSpaces(await (await getAppStore()).list()); setPrevious(false) }).catch(reason => setError(reason instanceof Error ? reason.message : 'No se pudieron recuperar los perfiles anteriores.')).finally(() => setBusy(false)) }}>Recuperar perfiles del APK anterior</Button>}
    <details className="border-t border-border pt-5"><summary className="mb-5 cursor-pointer text-sm font-semibold">Conectar mi cuenta existente</summary><LoginForm /></details>
  </AuthShell>
}
