import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { shareBackup } from '../ui/backup'
import { BackupRestoreError, getAppStore } from './storage'
import { authenticatedBackupRestore, backupErrorMessage } from './backup-restore'
import { ORIGINAL_STATE_CHANGED, type BackupRecoverySummary, type BackupRestorePreview } from './types'
import { synchronize } from './sync'
import { navigate } from './router'
import { recoverOriginalDrafts } from './legacyRecovery'

export function StorageSettings() {
  const { language } = useI18n(), en = language === 'en'
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [linked, setLinked] = useState(false)
  const [preview, setPreview] = useState<BackupRestorePreview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [recovery, setRecovery] = useState<BackupRecoverySummary | null>(null)
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      try {
        const store = await getAppStore(), state = await store.read(), saved = await store.readBackupRecovery()
        if (disposed) return
        setLinked(!!state?.remoteUserId)
        setRecovery(saved?.accountId === state?.accountId ? saved : null)
        setPreview(previous => previous?.accountId === state?.accountId ? previous : null)
      } catch { if (!disposed) setMessage(backupErrorMessage(null, language)) }
    }
    void refresh()
    window.addEventListener(ORIGINAL_STATE_CHANGED, refresh)
    return () => { disposed = true; window.removeEventListener(ORIGINAL_STATE_CHANGED, refresh) }
  }, [language])
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await action() } catch (reason) { setMessage(backupErrorMessage(reason, language)) } finally { setBusy(false) }
  }
  async function openPreview(file?: File) {
    if (preview) (await getAppStore()).cancelBackupRestore(preview.token)
    setPreview(null); setConfirmed(false)
    if (file && file.size > 100 * 1024 * 1024) throw new BackupRestoreError('large')
    const controller = await authenticatedBackupRestore()
    setPreview(file ? await controller.preview(await file.text()) : await controller.recovery())
  }
  function cancelPreview() {
    if (preview) void getAppStore().then(store => store.cancelBackupRestore(preview.token))
    setPreview(null); setConfirmed(false)
    setMessage(en ? 'Restore cancelled. Your data is unchanged.' : 'Restauración cancelada. Tus datos siguen igual.')
  }
  async function restore() {
    if (!preview) return
    await (await authenticatedBackupRestore()).restore(preview, confirmed)
    setPreview(null); setConfirmed(false)
    setRecovery(await (await getAppStore()).readBackupRecovery())
    setMessage(en ? 'Backup restored on this device. The previous data is saved below for recovery. Synchronization is pending.' : 'Respaldo restaurado en este dispositivo. Los datos anteriores están guardados abajo para recuperarlos. La sincronización queda pendiente.')
  }
  return <SettingsScreen title={en ? 'Offline storage and backup' : 'Sin conexión y respaldo'} description={en ? 'Your screens and data available on this device.' : 'Tus pantallas y datos disponibles en este dispositivo.'} backHref="/settings" backLabel={en ? 'Settings' : 'Ajustes'} icon="user-cog"><div className="space-y-4">
    {message && <p role="status" className="rounded-xl border border-border p-4 text-sm">{message}</p>}
    <SettingsSection title={en ? 'Saved on this device' : 'Guardado en el dispositivo'} description={en ? 'Routines, history, complete sets and measurements are saved locally.' : 'Rutinas, historial, series completas y medidas se guardan localmente.'}>
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">{en ? 'Exported files contain personal and health data. Store them safely. Android system backup is not used: export or synchronize before changing devices.' : 'Los archivos exportados contienen datos personales y de salud. Guárdalos en un lugar seguro. No se usa el respaldo del sistema Android: exporta o sincroniza antes de cambiar de dispositivo.'}</p>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void run(async () => { await shareBackup(await (await getAppStore()).exportBackup()); setMessage(en ? 'Backup prepared.' : 'Respaldo preparado.') })}>{en ? 'Export backup' : 'Exportar respaldo'}</Button>
        <label className="block text-sm font-medium">{en ? 'Import backup' : 'Importar respaldo'}<input className="mt-2 block w-full text-xs" type="file" accept="application/json,.json" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(() => openPreview(file)) }} /></label>
        <p className="text-xs leading-5 text-muted-foreground">{en ? 'Connect to the internet and sign in with the account that exported the backup. You will see a preview before replacing anything.' : 'Conecta a internet e inicia sesión con la cuenta que exportó el respaldo. Verás una vista previa antes de reemplazar datos.'}</p>
        <p className="text-xs leading-5 text-muted-foreground">{en ? 'The file contains saved account records. Login tokens, unfinished drafts and connected-service caches are not included.' : 'El archivo contiene los registros guardados de la cuenta. No incluye credenciales de sesión, borradores sin terminar ni cachés de servicios conectados.'}</p>
      </div>
    </SettingsSection>
    {preview && <BackupRestoreReview preview={preview} language={language} busy={busy} confirmed={confirmed} onConfirmed={setConfirmed} onCancel={cancelPreview} onRestore={() => void run(restore)} />}
    {recovery && <SettingsSection title={en ? 'Previous data recovery' : 'Recuperar los datos anteriores'} description={en ? 'The saved account records before the latest restore are kept on this device. A new restore replaces this recovery copy.' : 'Los registros guardados de la cuenta anteriores a la última restauración se conservan en este dispositivo. Otra restauración reemplaza esta copia de recuperación.'}>
      <div className="space-y-3">
        <p className="text-sm">{en ? 'Saved' : 'Guardado'}: {new Date(recovery.savedAt).toLocaleString(language)} · {recovery.counts.sessions} {en ? 'sessions' : 'sesiones'} · {recovery.counts.measurements} {en ? 'measurements' : 'medidas'}</p>
        <Button variant="outline" className="w-full" disabled={busy} onClick={() => void run(async () => { await shareBackup(await (await getAppStore()).exportRecoveryBackup()); setMessage(en ? 'Recovery backup prepared.' : 'Copia de recuperación preparada.') })}>{en ? 'Export previous data' : 'Exportar datos anteriores'}</Button>
        <Button variant="outline" className="w-full" disabled={busy || !linked} onClick={() => void run(() => openPreview())}>{en ? 'Preview previous data' : 'Revisar datos anteriores'}</Button>
      </div>
    </SettingsSection>}
    <SettingsSection title={en ? 'Account and synchronization' : 'Cuenta y sincronización'} description={en ? 'Coaches and connected services require internet access.' : 'Entrenadores y servicios conectados requieren internet.'}><div className="space-y-3">
      <p className="text-sm text-muted-foreground">{en ? 'Mobile backup preserves your data across Android installations. New records do not appear in web history yet.' : 'El respaldo móvil conserva tus datos entre instalaciones Android. Los registros nuevos todavía no aparecen en el historial web.'}</p>
      <Button className="w-full" disabled={busy || !linked} onClick={() => void run(async () => {
        const result = await synchronize()
        setMessage(!en ? result.message : result.pending
          ? 'Some changes are still pending. If account backup is unavailable, export a file to keep your Android records safe.'
          : result.message.includes('actualizar') || result.message.includes('actualizaron')
            ? 'Synchronization finished, but some coach details could not be updated. Reconnect and try again.'
            : 'Android backup is up to date and web routines have been downloaded. Android progress is kept in its separate backup.')
      })}>{en ? 'Synchronize and download' : 'Sincronizar y descargar'}</Button>
      <Button variant="outline" className="w-full" disabled={busy} onClick={() => navigate('/login')}>{en ? 'Connect or switch profile' : 'Conectar o cambiar de perfil'}</Button>
    </div></SettingsSection>
    {linked && Capacitor.isNativePlatform() && <SettingsSection title={en ? 'Sessions from the previous version' : 'Sesiones de la versión anterior'} description={en ? 'Recover this account’s drafts after downloading its routines.' : 'Recupera los borradores de esta cuenta después de descargar sus rutinas.'}><div className="space-y-3">
      <Button variant="outline" className="w-full" disabled={busy} onClick={() => void run(async () => { const result = await recoverOriginalDrafts(); setMessage(en ? `${result.recovered} drafts recovered and ${result.skipped} skipped. Originals are preserved. An expired authorization may prevent finishing an old session.` : `${result.recovered} borradores recuperados y ${result.skipped} omitidos. Los originales se conservan. Una autorización vencida puede impedir finalizar una sesión antigua.`) })}>{en ? 'Recover a previous session' : 'Recuperar sesión de la versión anterior'}</Button>
      <p className="text-xs leading-5 text-muted-foreground">{en ? 'A complete copy is preserved. Old sessions may require reviewing their authorization before finishing.' : 'Se conserva una copia completa. Las sesiones antiguas pueden necesitar revisar su autorización antes de finalizarlas.'}</p>
    </div></SettingsSection>}
  </div></SettingsScreen>
}

export function BackupRestoreReview({ preview, language, busy, confirmed, onConfirmed, onCancel, onRestore }: {
  preview: BackupRestorePreview; language: 'es' | 'en'; busy: boolean; confirmed: boolean
  onConfirmed(value: boolean): void; onCancel(): void; onRestore(): void
}) {
  const en = language === 'en'
  const rows = [['plans', en ? 'Plans' : 'Planes'], ['workouts', en ? 'Routines' : 'Rutinas'], ['sessions', en ? 'Sessions' : 'Sesiones'], ['sets', en ? 'Recorded sets' : 'Series registradas'], ['measurements', en ? 'Measurements' : 'Medidas'], ['other', en ? 'Other records' : 'Otros registros']] as const
  return <SettingsSection title={en ? 'Review before restoring' : 'Revisar antes de restaurar'} description={en ? 'All local data for this account will be replaced by this copy, including routines, history, profile and settings. Other accounts are preserved.' : 'Esta copia reemplazará todos los datos locales de esta cuenta, incluidas rutinas, historial, perfil y ajustes. Las otras cuentas se conservan.'}>
    <div className="space-y-4">
      <p className="break-all text-sm font-medium">{preview.email || preview.accountId}</p>
      {preview.exportedAt && <p className="text-xs text-muted-foreground">{en ? 'Copy date' : 'Fecha de la copia'}: {new Date(preview.exportedAt).toLocaleString(language)}</p>}
      <table className="w-full text-sm tabular-nums"><caption className="mb-2 text-left font-medium">{en ? 'Data comparison' : 'Comparación de datos'}</caption><thead><tr><th scope="col" className="py-2 text-left">{en ? 'Data' : 'Datos'}</th><th scope="col" className="p-2 text-right">{en ? 'Now' : 'Ahora'}</th><th scope="col" className="py-2 text-right">{en ? 'Copy' : 'Copia'}</th></tr></thead><tbody>{rows.map(([key, label]) => <tr key={key} className="border-t border-border"><th scope="row" className="py-2 text-left font-normal">{label}</th><td className="p-2 text-right">{preview.current[key]}</td><td className="py-2 text-right">{preview.incoming[key]}</td></tr>)}</tbody></table>
      <p className="text-sm leading-6 text-muted-foreground">{en ? 'Before replacement, the current state will be saved on this device so you can recover or export it. Restoring does not upload data to the cloud. Export the current data too if you need a copy outside this device.' : 'Antes de reemplazar, se guardará el estado actual en este dispositivo para recuperarlo o exportarlo. Restaurar no envía datos a la nube. Exporta también los datos actuales si necesitas una copia fuera de este dispositivo.'}</p>
      <label className="flex min-h-12 cursor-pointer items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={confirmed} disabled={busy} onChange={event => onConfirmed(event.target.checked)} /><span>{en ? 'I understand that this copy replaces the current data for this account.' : 'Entiendo que esta copia reemplaza los datos actuales de esta cuenta.'}</span></label>
      <Button className="w-full" disabled={busy || !confirmed} onClick={onRestore}>{en ? 'Replace with this backup' : 'Reemplazar con este respaldo'}</Button>
      <Button variant="outline" className="w-full" disabled={busy} onClick={onCancel}>{en ? 'Cancel' : 'Cancelar'}</Button>
    </div>
  </SettingsSection>
}
