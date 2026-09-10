import type { SupabaseClient } from '@supabase/supabase-js'
import { bundledExercises } from './defaults'
import { getAppStore, validateAppState } from './storage'
import type { AppRow, AppState, AppStore } from './types'

export type CloudSnapshot = { revision: string; state: AppState }
type Identity = { id: string; email: string }
export interface OriginalCloudGateway {
  identity(): Promise<Identity>
  signIn(email: string, password: string): Promise<void>
  downloadWeb(owner: string): Promise<{ tables: AppState['tables']; warnings: string[] }>
  readBackup(): Promise<CloudSnapshot | null>
  pushBackup(state: AppState, expectedRevision: string | null, operationId: string): Promise<string>
}

const BACKUP_WARNING = 'El respaldo de Android necesita habilitarse en el servidor. Las rutinas de la web se descargaron y tus cambios permanecen en este dispositivo. Exporta un respaldo desde Ajustes.'
export class BackupUnavailableError extends Error { constructor() { super(BACKUP_WARNING) } }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value)
}
function snapshotPayload(state: AppState): AppState {
  return { ...clone(state), remoteRevision: null, lastSyncedRevision: 0 }
}
function sameSnapshot(left: AppState, right: AppState): boolean {
  return stable(snapshotPayload(left)) === stable(snapshotPayload(right))
}
async function operationId(state: AppState, expected: string | null): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable({ state, expected })))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function catalogIdentity(row: AppRow): string | null {
  return typeof row.source === 'string' && typeof row.external_id === 'string' && row.source && row.external_id
    ? JSON.stringify([row.source, row.external_id]) : null
}

/** Keep web IDs and prescriptions; only exact reviewed catalog entries have bundled media. */
function withBundledMedia(tables: AppState['tables'], catalog: AppRow[]): AppState['tables'] {
  const known = new Map(catalog.map(row => [catalogIdentity(row), row]))
  return { ...tables, exercises: (tables.exercises ?? []).map(row => {
    const identity = catalogIdentity(row)
    const bundled = identity && row.is_public === true ? known.get(identity) : undefined
    if (!bundled) return row
    const normalized = { ...row }
    for (const field of ['image_url', 'motion_preview_url']) {
      const asset = bundled[field]
      if (typeof asset !== 'string' || !asset.startsWith('/exercises/catalog/')) continue
      if (row[field] !== asset) normalized[`mobile_remote_${field}`] = row[field] ?? null
      normalized[field] = asset
    }
    return normalized
  }) }
}

/** Field-level three-way refresh keeps offline edits and deletions intact. */
function mergeCanonical(state: AppState, incoming: AppState['tables']): AppState['tables'] {
  const tables = clone(state.tables)
  const base = (tables.mobile_web_base?.[0]?.tables ?? {}) as AppState['tables']
  const selectedLocally = (tables.workout_plans ?? []).filter(row => row.is_active).map(row => row.id).sort()
  const selectedBefore = (base.workout_plans ?? []).filter(row => row.is_active).map(row => row.id).sort()
  const preserveSelection = Object.hasOwn(base, 'workout_plans') && stable(selectedLocally) !== stable(selectedBefore)
  for (const [table, remoteRows] of Object.entries(incoming)) {
    const before = new Map((base[table] ?? []).map(row => [row.id, row]))
    const remote = new Map(remoteRows.map(row => [row.id, row]))
    const present = new Set((tables[table] ?? []).map(row => row.id))
    const result = (tables[table] ?? []).flatMap(local => {
      const previous = before.get(local.id)
      const next = remote.get(local.id)
      if (!next) return previous && stable(previous) === stable(local) ? [] : [local]
      if (!previous) return [local]
      const merged = { ...local }
      for (const field of new Set([...Object.keys(previous), ...Object.keys(next)])) {
        if (stable(local[field]) !== stable(previous[field])) continue
        if (Object.hasOwn(next, field)) merged[field] = next[field]
        else delete merged[field]
      }
      return [merged]
    })
    for (const row of remoteRows) {
      // An ID present in the last web snapshot but absent locally was deleted locally.
      if (!present.has(row.id) && !before.has(row.id)) result.push(row)
    }
    tables[table] = result
  }
  if (preserveSelection) {
    tables.workout_plans = (tables.workout_plans ?? []).map(row => ({ ...row, is_active: selectedLocally.includes(row.id) }))
  }
  tables.mobile_web_base = [{ id: 'canonical', tables: clone(incoming) }]
  return tables
}

export function createOriginalSynchronizer(
  store: AppStore,
  gateway: OriginalCloudGateway,
  localCatalog: () => Promise<AppRow[]> = bundledExercises,
) {
  let inFlight: Promise<{ pending: boolean; message: string }> | null = null
  async function current(owner: string): Promise<AppState> {
    const state = await store.read()
    if (!state || state.accountId !== owner || state.remoteUserId !== owner) throw new Error('La cuenta activa cambió. Sus datos se conservaron; vuelve a sincronizar desde la cuenta correcta.')
    return state
  }
  async function backup(): Promise<{ snapshot: CloudSnapshot | null; unavailable: boolean }> {
    try { return { snapshot: await gateway.readBackup(), unavailable: false } }
    catch (error) { if (error instanceof BackupUnavailableError) return { snapshot: null, unavailable: true }; throw error }
  }
  function checkSnapshot(snapshot: CloudSnapshot, owner: string): CloudSnapshot {
    const state = validateAppState(snapshot.state)
    if (!snapshot.revision || state.accountId !== owner || state.remoteUserId !== owner) throw new Error('El respaldo remoto no pertenece a la cuenta conectada.')
    return { revision: snapshot.revision, state }
  }
  async function download(owner: string): Promise<string[]> {
    const [downloaded, catalog] = await Promise.all([gateway.downloadWeb(owner), localCatalog()])
    const incoming = withBundledMedia(downloaded.tables, catalog)
    await current(owner)
    const previous = await current(owner)
    if (stable(mergeCanonical(previous, incoming)) !== stable(previous.tables)) {
      await store.mutate(draft => {
        if (draft.accountId !== owner || draft.remoteUserId !== owner) throw new Error('La cuenta activa cambió durante la descarga.')
        draft.tables = mergeCanonical(draft, incoming)
      })
    }
    return downloaded.warnings
  }
  async function synchronizeNow(): Promise<{ pending: boolean; message: string }> {
    const local = await store.read()
    if (!local?.remoteUserId) return { pending: false, message: 'Este perfil está guardado en el dispositivo. Inicia sesión para usar el respaldo de cuenta.' }
    const identity = await gateway.identity()
    if (identity.id !== local.remoteUserId) throw new Error('La sesión conectada no corresponde al perfil local. Inicia sesión con esa cuenta antes de sincronizar.')
    const owner = identity.id
    const remote = await backup()
    if (remote.snapshot) {
      const snapshot = checkSnapshot(remote.snapshot, owner)
      const active = await current(owner)
      if (snapshot.revision !== active.remoteRevision) {
        if (sameSnapshot(active, snapshot.state)) {
          await store.markSynced(owner, active.revision, snapshot.revision)
        } else if (active.revision === active.lastSyncedRevision) {
          await store.replaceFromCloud({ ...snapshot.state, remoteRevision: snapshot.revision }, active.revision)
        } else {
          throw new Error('Hay un conflicto con cambios de otro dispositivo. Conservamos los datos locales y el respaldo remoto. Exporta el respaldo local antes de resolverlo.')
        }
      }
    }
    const warnings = await download(owner)
    if (remote.unavailable) return { pending: true, message: BACKUP_WARNING }
    const active = await current(owner)
    if (active.revision !== active.lastSyncedRevision || !active.remoteRevision) {
      const payload = snapshotPayload(active)
      const revision = await gateway.pushBackup(payload, active.remoteRevision, await operationId(payload, active.remoteRevision))
      await store.markSynced(owner, active.revision, revision)
    }
    const finished = await current(owner)
    const pending = finished.revision !== finished.lastSyncedRevision
    return { pending, message: warnings.length ? warnings.join(' ') : pending
      ? 'El respaldo enviado está confirmado. Hay cambios nuevos en este dispositivo pendientes de la próxima sincronización.'
      : 'Respaldo de Android actualizado. Las rutinas de la web están descargadas; el progreso de Android se conserva en su respaldo independiente.' }
  }
  return {
    async connectAccount(email: string, password: string): Promise<void> {
      const expectedSessionVersion = store.sessionVersion()
      await gateway.signIn(email, password)
      await this.prepareSignedInAccount(expectedSessionVersion)
    },
    async prepareSignedInAccount(expectedSessionVersion = store.sessionVersion()): Promise<void> {
      const identity = await gateway.identity()
      const accounts = await store.list()
      const existing = accounts.find(account => account.accountId === identity.id)
      if (existing) {
        if (existing.remoteUserId !== identity.id) throw new Error('Existe un perfil local con una identidad distinta; se conservó sin modificar.')
        await store.activate(existing.accountId, expectedSessionVersion)
        // Reauthentication never replaces dirty local data with a server copy.
        const remote = await backup()
        if (remote.snapshot) {
          const saved = checkSnapshot(remote.snapshot, identity.id)
          const active = await current(identity.id)
          if (saved.revision !== active.remoteRevision) {
            if (sameSnapshot(active, saved.state)) await store.markSynced(identity.id, active.revision, saved.revision)
            else if (active.revision === active.lastSyncedRevision) {
              await store.replaceFromCloud({ ...saved.state, remoteRevision: saved.revision }, active.revision)
            }
          }
        }
        await download(identity.id)
        return
      }
      const [remote, downloaded, catalog] = await Promise.all([backup(), gateway.downloadWeb(identity.id), localCatalog()])
      const incoming = withBundledMedia(downloaded.tables, catalog)
      let initial: AppState
      if (remote.snapshot) {
        const saved = checkSnapshot(remote.snapshot, identity.id)
        initial = { ...saved.state, email: identity.email, remoteRevision: saved.revision, lastSyncedRevision: saved.state.revision }
        const merged = mergeCanonical(initial, incoming)
        if (stable(merged) !== stable(initial.tables)) initial = { ...initial, tables: merged, revision: initial.revision + 1 }
      } else {
        const exercises = [...(incoming.exercises ?? [])]
        const catalogIds = new Set(exercises.filter(row => row.is_public === true).map(catalogIdentity).filter(Boolean))
        for (const exercise of catalog) if (!catalogIds.has(catalogIdentity(exercise)) && !exercises.some(row => row.id === exercise.id)) exercises.push(exercise)
        initial = { version: 1, accountId: identity.id, remoteUserId: identity.id, email: identity.email, revision: 1, lastSyncedRevision: 0, remoteRevision: null,
          tables: { ...incoming, exercises, mobile_web_base: [{ id: 'canonical', tables: incoming }] } }
      }
      await store.create(validateAppState(initial), expectedSessionVersion)
    },
    synchronize(): Promise<{ pending: boolean; message: string }> {
      inFlight ??= synchronizeNow().finally(() => { inFlight = null })
      return inFlight
    },
  }
}

type RemoteError = { code?: string; message?: string } | null
function assertRemote(error: RemoteError, backupOperation = false): void {
  if (!error) return
  if (backupOperation && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')) throw new BackupUnavailableError()
  if (error.message?.includes('ORIGINAL_SNAPSHOT_CONFLICT')) throw new Error('Hay un conflicto con el respaldo de otro dispositivo. Conservamos todos los cambios locales.')
  throw new Error(error.message ?? 'No se pudo completar la conexión con tu cuenta.')
}

export function createOriginalGateway(client: SupabaseClient): OriginalCloudGateway {
  async function pages(table: string, configure: (query: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => ReturnType<ReturnType<SupabaseClient['from']>['select']>): Promise<AppRow[]> {
    const rows: AppRow[] = []
    for (let offset = 0; ; offset += 500) {
      const result = await configure(client.from(table).select('*')).order('id').range(offset, offset + 499)
      assertRemote(result.error)
      const page = (result.data ?? []) as AppRow[]
      rows.push(...page)
      if (page.length < 500) return rows
    }
  }
  async function children(table: string, key: string, ids: unknown[]): Promise<AppRow[]> {
    const rows: AppRow[] = []
    const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
    for (let offset = 0; offset < unique.length; offset += 100) rows.push(...await pages(table, query => query.in(key, unique.slice(offset, offset + 100))))
    return rows
  }
  return {
    async identity() {
      const result = await client.auth.getUser(); assertRemote(result.error)
      if (!result.data.user) throw new Error('Inicia sesión para conectar tu cuenta.')
      return { id: result.data.user.id, email: result.data.user.email ?? '' }
    },
    async signIn(email, password) {
      const { resumeLocalAuthentication } = await import('./bridge-client')
      resumeLocalAuthentication()
      const result = await client.auth.signInWithPassword({ email: email.trim(), password }); assertRemote(result.error)
    },
    async downloadWeb(owner) {
      const tables: AppState['tables'] = {}
      const warnings: string[] = []
      const required = ['workout_plans', 'workouts', 'progress_logs', 'measurements']
      const results = await Promise.all([
        pages('profiles', query => query.eq('id', owner)),
        ...required.map(table => pages(table, query => query.eq('user_id', owner))),
        pages('exercises', query => query.eq('is_public', true)),
      ])
      tables.profiles = results[0]
      if (tables.profiles.length !== 1 || tables.profiles[0].id !== owner) throw new Error('No se pudo descargar el perfil de esta cuenta.')
      required.forEach((table, index) => { tables[table] = results[index + 1] })
      tables.exercises = results[results.length - 1]
      const [workoutExercises, exerciseLogs] = await Promise.all([
        children('workout_exercises', 'workout_id', tables.workouts.map(row => row.id)),
        children('exercise_logs', 'progress_log_id', tables.progress_logs.map(row => row.id)),
      ])
      tables.workout_exercises = workoutExercises; tables.exercise_logs = exerciseLogs
      const referencedExercises = await children('exercises', 'id', [...workoutExercises, ...exerciseLogs].flatMap(row => [row.exercise_id, row.original_exercise_id]))
      tables.exercises = [...new Map([...tables.exercises, ...referencedExercises].map(row => [row.id, row])).values()]
      // Cache only the account's own trainer access; remote RPCs still authorize professional actions.
      try { tables.trainer_profiles = await pages('trainer_profiles', query => query.eq('user_id', owner)) }
      catch { warnings.push('No se pudo actualizar el acceso profesional; reintenta con conexión.') }
      try {
        tables.coaching_relationships = await pages('coaching_relationships', query => query.eq('client_user_id', owner))
        tables.trainer_plan_assignments = await pages('trainer_plan_assignments', query => query.eq('client_user_id', owner))
        tables.trainer_assignment_versions = await children('trainer_assignment_versions', 'assignment_id', tables.trainer_plan_assignments.map(row => row.id))
        tables.public_profiles = await children('public_profiles', 'id', tables.coaching_relationships.map(row => row.trainer_user_id))
      } catch { warnings.push('Algunos detalles del entrenador no se actualizaron. Las rutinas descargadas se conservan.') }
      return { tables, warnings }
    },
    async readBackup() {
      const result = await client.rpc('original_app_snapshot_read_v1'); assertRemote(result.error, true)
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      return row ? { revision: row.revision, state: validateAppState(row.payload) } : null
    },
    async pushBackup(state, expectedRevision, id) {
      const result = await client.rpc('original_app_snapshot_push_v1', { p_expected_revision: expectedRevision, p_operation_id: id, p_payload: state }); assertRemote(result.error, true)
      const row = Array.isArray(result.data) ? result.data[0] : result.data
      if (typeof row?.revision !== 'string' || !row.revision) throw new Error('No se confirmó el respaldo remoto. Los datos locales se conservaron.')
      return row.revision
    },
  }
}

let defaultSynchronizer: ReturnType<typeof createOriginalSynchronizer> | null = null
async function defaultSync() {
  if (defaultSynchronizer) return defaultSynchronizer
  const { remote } = await import('./bridge-client')
  if (!remote) throw new Error('Esta versión no tiene configurada la conexión de cuenta.')
  defaultSynchronizer = createOriginalSynchronizer(await getAppStore(), createOriginalGateway(remote))
  return defaultSynchronizer
}
export async function connectAccount(email: string, password: string): Promise<void> {
  await (await defaultSync()).connectAccount(email, password)
  const { remote } = await import('./bridge-client')
  await remote?.auth.startAutoRefresh()
}
export async function prepareSignedInAccount(expectedSessionVersion?: number): Promise<void> { await (await defaultSync()).prepareSignedInAccount(expectedSessionVersion) }
export async function synchronize(): Promise<{ pending: boolean; message: string }> { return (await defaultSync()).synchronize() }
