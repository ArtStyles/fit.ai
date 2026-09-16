import { BackupRestoreError, getAppStore } from './storage'
import type { AppStore, BackupRestorePreview } from './types'

export function createBackupRestoreController(store: AppStore, verifiedIdentity: () => Promise<string>) {
  async function verify(expectedAccountId?: string) {
    const session = store.sessionVersion(), before = await store.read()
    if (!before?.remoteUserId || before.accountId !== before.remoteUserId || (expectedAccountId && expectedAccountId !== before.accountId)) throw new BackupRestoreError('session')
    let owner: string
    try { owner = await verifiedIdentity() } catch { throw new BackupRestoreError('session') }
    const after = await store.read()
    if (store.sessionVersion() !== session || owner !== before.accountId || after?.accountId !== owner || after.remoteUserId !== owner) throw new BackupRestoreError('session')
  }
  return {
    async preview(json: string) { await verify(); return store.previewBackupRestore(json) },
    async recovery() { await verify(); return store.previewRecoveryRestore() },
    async restore(preview: BackupRestorePreview, confirmed: boolean) {
      if (!confirmed) throw new BackupRestoreError('confirmation')
      await verify(preview.accountId)
      await store.restoreBackup(preview.token, true)
    },
  }
}

export async function authenticatedBackupRestore() {
  const store = await getAppStore()
  return createBackupRestoreController(store, async () => {
    const { remote } = await import('./bridge-client')
    if (!remote) throw new BackupRestoreError('session')
    const session = await remote.auth.getSession()
    const token = session.data.session?.access_token, owner = session.data.session?.user.id
    if (session.error || !token || !owner) throw new BackupRestoreError('session')
    const verified = await remote.auth.getUser(token)
    const current = await remote.auth.getSession()
    if (verified.error || verified.data.user?.id !== owner || current.error || current.data.session?.user.id !== owner) throw new BackupRestoreError('session')
    return owner
  })
}

export function backupErrorMessage(reason: unknown, language: 'es' | 'en'): string {
  const messages: Record<BackupRestoreError['code'], [string, string]> = {
    session: ['Conecta a internet e inicia sesión con la cuenta del respaldo. Si cambiaste de cuenta, abre otra vista previa.', 'Connect to the internet and sign in with the backup account. If you changed accounts, open a new preview.'],
    owner: ['Este respaldo pertenece a otra cuenta. Inicia sesión con la cuenta que lo exportó.', 'This backup belongs to another account. Sign in with the account that exported it.'],
    invalid: ['El archivo no es un respaldo válido de Vekira o contiene datos incoherentes. Selecciona otra copia.', 'This file is not a valid Vekira backup or contains inconsistent data. Choose another copy.'],
    large: ['El respaldo supera el límite de 100 MB. Selecciona otra copia.', 'This backup exceeds the 100 MB limit. Choose another copy.'],
    confirmation: ['Confirma que quieres reemplazar los datos de esta cuenta antes de restaurar.', 'Confirm that you want to replace this account’s data before restoring.'],
    preview: ['La vista previa se cerró o cambió. Abre una nueva para continuar.', 'The preview was closed or changed. Open a new preview to continue.'],
    stale: ['Los datos cambiaron después de la vista previa. Conservamos esos cambios; abre otra vista previa.', 'Data changed after the preview. Those changes are preserved; open a new preview.'],
    'missing-recovery': ['Esta cuenta todavía no tiene una copia anterior para recuperar.', 'This account does not have a previous recovery copy yet.'],
  }
  if (reason instanceof BackupRestoreError) return messages[reason.code][language === 'en' ? 1 : 0]
  return language === 'en'
    ? 'The operation could not be completed. Check the connection and available storage, then try again. Your saved data is preserved.'
    : 'No se pudo completar la operación. Revisa la conexión y el espacio disponible e inténtalo de nuevo. Tus datos guardados se conservan.'
}
