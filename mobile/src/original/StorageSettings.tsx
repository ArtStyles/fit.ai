import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { shareBackup } from '../ui/backup'
import { getAppStore } from './storage'
import { synchronize } from './sync'
import { navigate } from './router'
import { recoverOriginalDrafts } from './legacyRecovery'

export function StorageSettings() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [linked, setLinked] = useState(false)
  useEffect(() => { void getAppStore().then(store => store.read()).then(state => setLinked(!!state?.remoteUserId)) }, [])
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(''); try { await action() } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)) } finally { setBusy(false) } }
  return <SettingsScreen title="Sin conexión y respaldo" description="Tus pantallas y datos disponibles en este dispositivo." backHref="/settings" backLabel="Ajustes" icon="user-cog"><div className="space-y-4">
    {message && <p role="status" className="rounded-xl border border-border p-4 text-sm">{message}</p>}
    <SettingsSection title="Guardado en el dispositivo" description="Rutinas, historial, series completas y medidas se guardan localmente."><div className="space-y-3"><Button variant="outline" className="w-full" disabled={busy} onClick={() => void run(async () => { await shareBackup(await (await getAppStore()).exportBackup()); setMessage('Respaldo preparado.') })}>Exportar respaldo</Button><label className="block text-sm font-medium">Importar respaldo<input className="mt-2 block w-full text-xs" type="file" accept="application/json,.json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { await (await getAppStore()).importBackup(await file.text()); setMessage('Respaldo importado.') }) }} /></label></div></SettingsSection>
    <SettingsSection title="Cuenta y sincronización" description="Entrenadores y servicios conectados requieren internet."><div className="space-y-3"><p className="text-sm text-muted-foreground">El respaldo móvil conserva tus datos entre instalaciones Android. Los registros nuevos todavía no aparecen en el historial web.</p><Button className="w-full" disabled={busy || !linked} onClick={() => void run(async () => { const result = await synchronize(); setMessage(result.message) })}>Sincronizar y descargar</Button><Button variant="outline" className="w-full" disabled={busy} onClick={() => navigate('/login')}>Conectar o cambiar de perfil</Button></div></SettingsSection>
    {linked && Capacitor.isNativePlatform() && <SettingsSection title="Sesiones de la versión anterior" description="Recupera los borradores de esta cuenta después de descargar sus rutinas."><div className="space-y-3"><Button variant="outline" className="w-full" disabled={busy} onClick={() => void run(async () => { const result = await recoverOriginalDrafts(); setMessage(`${result.recovered} borradores recuperados y ${result.skipped} omitidos. Los originales se conservan. Una autorización vencida puede impedir finalizar una sesión antigua.`) })}>Recuperar sesión de la versión anterior</Button><p className="text-xs leading-5 text-muted-foreground">Se conserva una copia completa. Las sesiones antiguas pueden necesitar revisar su autorización antes de finalizarlas.</p></div></SettingsSection>}
  </div></SettingsScreen>
}
