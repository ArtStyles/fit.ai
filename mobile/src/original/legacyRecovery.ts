import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  ACTIVE_SESSION_CHANGED_EVENT,
  loadBackup,
  normalizeSessionSnapshot,
  saveBackup,
  type SessionSnapshot,
} from '@/lib/session/persistSession'
import { getAppStore, type AppStore, type AppState } from './storage'
import { MAX_SESSION_AGE_MS } from '@/lib/session/limits'

interface LegacyRecoveryPlugin {
  readSessions(options: { userId: string }): Promise<{ snapshots: unknown[] }>
}
const LegacyRecovery = registerPlugin<LegacyRecoveryPlugin>('LegacyRecovery')
export interface OriginalDraftRecoveryOptions {
  store?: AppStore
  isNative?: () => boolean
  readSessions?: (userId: string) => Promise<{ snapshots: unknown[] }>
}
export interface OriginalDraftRecoveryResult { recovered: number; skipped: number }
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const draftKey = (userId: string, workoutId: string) => `fitai_session_v2_${encodeURIComponent(userId)}_${encodeURIComponent(workoutId)}`
const pointerKey = (userId: string) => `fitai_active_session_v2_${encodeURIComponent(userId)}`

async function stableMissingSessionId(userId: string, workoutId: string, startedAt: number): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vekira:legacy-session:${userId}:${workoutId}:${startedAt}`))).slice(0, 16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function originalSnapshot(value: unknown, state: AppState): Promise<{ snapshot: SessionSnapshot; archiveOnly: boolean } | null> {
  if (!state.remoteUserId || state.remoteUserId !== state.accountId || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.version !== 2 || raw.userId !== state.remoteUserId || typeof raw.workoutId !== 'string') return null
  if (!(state.tables.workouts ?? []).some(row => row.id === raw.workoutId && row.user_id === state.remoteUserId)) return null
  const archiveOnly = typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) && raw.startedAt < Date.now() - MAX_SESSION_AGE_MS
  // Reuse the original structural validator for expired open drafts. The
  // temporary clock value is never persisted: retain the original start time,
  // and only archive these drafts, without activating or renewing authorization.
  const expiredOpen = archiveOnly && (raw.finishedAt === undefined || raw.finishedAt === 0)
  const normalized = normalizeSessionSnapshot(expiredOpen ? { ...raw, startedAt: Date.now() } : raw, raw.workoutId, state.remoteUserId)
  if (!normalized || normalized.exercises.length === 0) return null
  if (expiredOpen) normalized.startedAt = raw.startedAt as number
  // An existing client ID must never be rotated: the server may have accepted it.
  if (normalized.clientSessionId !== undefined && !isUuid(normalized.clientSessionId)) return null
  const clientSessionId = normalized.clientSessionId ?? await stableMissingSessionId(state.remoteUserId, normalized.workoutId, normalized.startedAt)
  return { snapshot: { ...normalized, clientSessionId }, archiveOnly }
}

/**
 * Copies full original drafts from the prior WebView origin. The plugin never
 * loads the website or deletes its data. SQLite archives are committed first;
 * the original localStorage helpers then expose compatible drafts to SessionClient.
 * This does not claim a session authorization or mark progress as synchronized.
 */
export async function recoverOriginalDrafts(options: OriginalDraftRecoveryOptions = {}): Promise<OriginalDraftRecoveryResult> {
  if (!(options.isNative ?? (() => Capacitor.isNativePlatform()))()) throw new Error('La recuperación de la versión anterior está disponible en Android.')
  const store = options.store ?? await getAppStore()
  const captured = await store.read()
  if (!captured?.remoteUserId || captured.accountId !== captured.remoteUserId) throw new Error('Conecta la cuenta original y descarga sus rutinas antes de recuperar las sesiones.')
  const userId = captured.remoteUserId
  const readSessions = options.readSessions ?? ((owner: string) => LegacyRecovery.readSessions({ userId: owner }))
  const extracted = await readSessions(userId)
  if (!Array.isArray(extracted.snapshots) || extracted.snapshots.length > 100) throw new Error('La versión anterior devolvió un respaldo de sesiones inválido.')

  const prepared = await store.mutate(async state => {
    if (state.accountId !== captured.accountId || state.remoteUserId !== userId) throw new Error('La cuenta cambió durante la recuperación. Vuelve a intentarlo desde la cuenta original.')
    let skipped = 0; let archived = 0
    const candidates: Array<{ snapshot: SessionSnapshot; archiveId: string }> = []
    for (const raw of extracted.snapshots) {
      const validated = await originalSnapshot(raw, state)
      if (!validated) { skipped++; continue }
      const { snapshot, archiveOnly } = validated
      if ((state.tables.progress_logs ?? []).some(row => row.user_id === userId && row.client_session_id === snapshot.clientSessionId)) { skipped++; continue }
      const drafts = state.tables.session_drafts ??= []
      let archive = drafts.find(row => row.id === snapshot.clientSessionId)
      if (archive && (archive.user_id !== userId || archive.workout_id !== snapshot.workoutId || archive.source !== 'legacy_webview' || archive.published_at || archive.archived_only)) { skipped++; continue }
      if (!archive) {
        archive = { id: snapshot.clientSessionId, user_id: userId, workout_id: snapshot.workoutId, client_session_id: snapshot.clientSessionId, source: 'legacy_webview', snapshot: structuredClone(snapshot), original_snapshot: structuredClone(raw), recovered_at: new Date().toISOString(), published_at: null, archived_only: archiveOnly }
        drafts.push(archive)
        if (archiveOnly) { archived++; continue }
      }
      const stored = normalizeSessionSnapshot(archive.snapshot, snapshot.workoutId, userId)
      if (!stored || stored.clientSessionId !== snapshot.clientSessionId) { skipped++; continue }
      candidates.push({ snapshot: { ...stored, clientSessionId: snapshot.clientSessionId }, archiveId: archive.id })
    }
    // The newest imported session becomes active only when no local pointer exists.
    candidates.sort((a, b) => (b.snapshot.finishedAt || b.snapshot.startedAt) - (a.snapshot.finishedAt || a.snapshot.startedAt))
    return { skipped, candidates, archived }
  })

  let recovered = prepared.archived
  const published: string[] = []
  for (const { snapshot, archiveId } of prepared.candidates) {
    // Check after extraction/SQLite work to respect a draft saved concurrently.
    // Even unreadable existing bytes are preserved for manual recovery.
    if (loadBackup(userId, snapshot.workoutId) || localStorage.getItem(draftKey(userId, snapshot.workoutId)) !== null) { prepared.skipped++; continue }
    const previousPointer = localStorage.getItem(pointerKey(userId))
    const result = saveBackup(snapshot)
    if (!result.ok) throw new Error(`El respaldo completo quedó conservado en el dispositivo, pero no se pudo activar la sesión: ${result.error}`)
    if (previousPointer !== null) {
      localStorage.setItem(pointerKey(userId), previousPointer)
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACTIVE_SESSION_CHANGED_EVENT))
    }
    recovered++
    published.push(archiveId)
  }
  if (published.length) await store.mutate(state => {
    if (state.accountId !== captured.accountId || state.remoteUserId !== userId) throw new Error('La cuenta cambió durante la recuperación. Los borradores siguen asociados a su cuenta original.')
    for (const row of state.tables.session_drafts ?? []) if (row.user_id === userId && published.includes(row.id)) row.published_at = new Date().toISOString()
  })
  return { recovered, skipped: prepared.skipped }
}
