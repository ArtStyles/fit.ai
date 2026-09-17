import { getAppStore, type AppState, type AppStore, type AppRow } from '../storage'
import { parseFitnessCsv } from './parse'
import type { FitnessSource, FitnessImportOptions, ImportWorkout } from './types'

export type ImportOptions = FitnessImportOptions & { distanceUnit?: 'm' | 'km' | 'mi'; timeZone?: string }
export interface ImportCatalogItem { id: string; name: string; nameEn: string }
export interface FitnessImportModel { accountId: string; language: 'es' | 'en'; timeZone: string; catalog: ImportCatalogItem[] }
export interface ImportPreview {
  token: string; source: FitnessSource; fileWorkoutCount: number; newWorkoutCount: number; duplicateCount: number; conflictCount: number
  setCount: number; fromDate: string; toDate: string; timeZone: string; warnings: string[]
  exercises: Array<{ key: string; name: string; occurrences: number; exerciseId: string | null }>
}
export interface ImportResult { imported: number; duplicates: number; conflicts: number }
type PreparedWorkout = ImportWorkout & { fingerprint: string; id: string }
type Pending = { accountId: string; session: number; language: 'es' | 'en'; createdAt: number; preview: ImportPreview; workouts: PreparedWorkout[] }
const table = (state: AppState, key: string): AppRow[] => state.tables[key] ?? []
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []
const profile = (state: AppState) => table(state, 'profiles').find(row => row.id === state.accountId)
const language = (state: AppState): 'es' | 'en' => profile(state)?.language === 'en' ? 'en' : 'es'
const accessible = (state: AppState) => table(state, 'exercises').filter(row => uuid(row.id) && (row.is_public === true || row.user_id === state.accountId))
const message = (lang: 'es' | 'en', es: string, en: string) => lang === 'es' ? es : en
const changed = (lang: 'es' | 'en') => new Error(message(lang, 'La cuenta cambió. Vuelve a seleccionar el archivo.', 'The account changed. Select the file again.'))

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
// Namespaced UUID v5: stable across imports, devices and local backup restoration.
async function identity(value: string): Promise<string> {
  const namespace = Uint8Array.from('c3f887d50edb42f18f5907fcd0e9d285'.match(/../g)!, part => parseInt(part, 16))
  const name = new TextEncoder().encode(value); const input = new Uint8Array(namespace.length + name.length)
  input.set(namespace); input.set(name, namespace.length)
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', input)).slice(0, 16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function zoneParts(instant: number, zone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

/** Resolve a CSV wall clock in the chosen zone, rejecting nonexistent DST times. */
function instant(value: string, zone: string): string {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) throw new Error('date')
    return date.toISOString()
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value)) throw new Error('date')
  const whole = value.split('.')[0]
  const fraction = Date.parse(`${value}Z`) - Date.parse(`${whole}Z`)
  const target = Date.parse(`${whole}Z`)
  let current = target
  for (let attempt = 0; attempt < 5; attempt++) {
    const rendered = zoneParts(current, zone)
    if (rendered === whole) {
      // A repeated wall clock during the autumn change has two valid instants.
      // Without a source offset we cannot choose one reliably.
      for (const adjacent of [current - 86400000, current + 86400000]) {
        const offset = Date.parse(`${zoneParts(adjacent, zone)}Z`) - adjacent
        const candidate = target - offset
        if (candidate !== current && zoneParts(candidate, zone) === whole) throw new Error('ambiguous-date')
      }
      return new Date(current + fraction).toISOString()
    }
    current += target - Date.parse(`${rendered}Z`)
  }
  throw new Error('date')
}

function fingerprintPayload(workout: ImportWorkout): string {
  // Export row order can change. Duplicate detection is based on recorded content.
  const exercises = workout.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map(set => JSON.stringify(set)).sort() }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return JSON.stringify({ ...workout, exercises })
}

function disposition(state: AppState, source: FitnessSource, workout: PreparedWorkout): 'new' | 'duplicate' | 'conflict' {
  const previous = table(state, 'progress_logs').find(row => row.user_id === state.accountId && row.mobile_session_kind === 'imported' && row.mobile_import?.source === source && row.mobile_import?.sourceKey === workout.sourceKey)
  return previous ? previous.mobile_import.fingerprint === workout.fingerprint ? 'duplicate' : 'conflict' : 'new'
}

function parseError(reason: unknown, lang: 'es' | 'en'): Error {
  const error = reason as { code?: string; row?: number }
  const messages: Record<string, [string, string]> = {
    empty: ['El archivo no contiene entrenamientos.', 'The file contains no workouts.'],
    format: ['No reconocemos este formato. Elige una exportación de entrenamientos de Hevy, Strong o FitNotes.', 'Unrecognized format. Choose a workout export from Hevy, Strong or FitNotes.'],
    header: ['Las columnas no corresponden a una exportación de entrenamientos compatible.', 'The columns do not match a supported workout export.'],
    csv: ['El CSV está incompleto o sus comillas no son válidas.', 'The CSV is incomplete or contains invalid quotes.'],
    'weight-unit': ['Selecciona si los pesos del archivo están en kg o lb.', 'Select whether the file weights are in kg or lb.'],
    'distance-unit': ['Selecciona la unidad de distancia del archivo.', 'Select the distance unit used in the file.'],
    'date-order': ['Selecciona el orden de las fechas: día/mes o mes/día.', 'Select the date order: day/month or month/day.'],
    date: ['Hay una fecha inválida o una hora inexistente en la zona elegida.', 'A date is invalid or its time does not exist in the selected time zone.'],
    'ambiguous-date': ['Una hora del archivo se repite por el cambio de horario. El CSV necesita su desfase UTC para interpretarla sin ambigüedad.', 'A file time occurs twice during a clock change. The CSV needs its UTC offset to interpret that time unambiguously.'],
    limit: ['El archivo supera el límite de 5 MiB o 20.000 filas.', 'The file exceeds the limit of 5 MiB or 20,000 rows.'],
    number: ['Hay un valor o una unidad que no podemos interpretar. Revisa el archivo y las opciones.', 'A value or unit cannot be interpreted. Check the file and options.'],
    'set-type': ['Hay un tipo de serie no reconocido. Revisa la fila indicada antes de importar; no se guardó ningún dato.', 'An unrecognized set type was found. Review the indicated row before importing; no data was saved.'],
    row: ['Faltan datos necesarios en una fila. Revisa la exportación.', 'A row is missing required data. Check the export.'],
  }
  const text = messages[error.code ?? ''] ?? messages.row
  return new Error(`${Number.isInteger(error.row) ? message(lang, `Fila ${error.row}: `, `Row ${error.row}: `) : ''}${text[lang === 'es' ? 0 : 1]}`)
}

export function createFitnessImporter(store: AppStore) {
  const pending = new Map<string, Pending>()
  async function current(): Promise<AppState> {
    const state = await store.read()
    if (!state || !profile(state)) throw new Error('Inicia sesión para importar tu historial. / Sign in to import your history.')
    return state
  }
  async function load(): Promise<FitnessImportModel> {
    const version = store.sessionVersion(); const state = await current(); const lang = language(state)
    if (store.sessionVersion() !== version) throw changed(lang)
    return { accountId: state.accountId, language: lang, timeZone: String(profile(state)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), catalog: accessible(state).map(row => ({ id: row.id, name: String(lang === 'es' ? row.name_es || row.name : row.name), nameEn: String(row.name) })).sort((a, b) => a.name.localeCompare(b.name, lang)) }
  }
  async function prepare(text: string, options: ImportOptions = {}): Promise<ImportPreview> {
    const version = store.sessionVersion(); const state = await current(); const lang = language(state)
    const zone = options.timeZone?.trim() || String(profile(state)?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    try { new Intl.DateTimeFormat('en', { timeZone: zone }).format() } catch { throw new Error(message(lang, 'Revisa la zona horaria; por ejemplo, America/Havana.', 'Check the time zone; for example, America/Havana.')) }
    let parsed
    try { parsed = parseFitnessCsv(text, options) } catch (error) { throw parseError(error, lang) }
    const workouts = await Promise.all(parsed.workouts.map(async original => {
      let startedAt: string, completedAt: string
      try {
        // Date-only exports use a civil-day anchor, not a claimed workout time.
        startedAt = instant(parsed.source === 'fitnotes' ? `${original.date}T12:00:00` : original.startedAt, zone)
        completedAt = parsed.source === 'fitnotes' ? startedAt : parsed.source === 'strong' && original.durationSeconds !== null
          ? new Date(Date.parse(startedAt) + original.durationSeconds * 1000).toISOString()
          : instant(original.completedAt, zone)
      } catch (error) { throw parseError({ code: error instanceof Error && error.message === 'ambiguous-date' ? 'ambiguous-date' : 'date' }, lang) }
      const future = parsed.source === 'fitnotes' ? original.date > zoneParts(Date.now(), zone).slice(0, 10) : Date.parse(completedAt) > Date.now() + 5 * 60_000
      if (Date.parse(completedAt) < Date.parse(startedAt) || future) throw new Error(message(lang, 'El archivo contiene una sesión futura o con fechas invertidas.', 'The file contains a future workout or reversed dates.'))
      const durationSeconds = parsed.source === 'hevy' && original.durationSeconds !== null ? (Date.parse(completedAt) - Date.parse(startedAt)) / 1000 : original.durationSeconds
      const workout = { ...original, startedAt, completedAt, durationSeconds }
      return { ...workout, fingerprint: await digest(fingerprintPayload(workout)), id: await identity(`${state.accountId}:${parsed.source}:session:${original.sourceKey}`) }
    }))
    if (store.sessionVersion() !== version || (await current()).accountId !== state.accountId) throw changed(lang)
    const counts = { new: 0, duplicate: 0, conflict: 0 }
    workouts.forEach(workout => { counts[disposition(state, parsed.source, workout)]++ })
    const catalog = accessible(state)
    const exercises = new Map<string, ImportPreview['exercises'][number]>()
    for (const workout of workouts) for (const exercise of workout.exercises) {
      const previous = exercises.get(exercise.key)
      if (previous) { previous.occurrences++; continue }
      const saved = table(state, 'mobile_fitness_import_links').find(row => row.user_id === state.accountId && row.source === parsed.source && row.key === exercise.key)
      const exact = catalog.filter(row => [row.name, row.name_es].some(name => typeof name === 'string' && normalize(name) === normalize(exercise.name)))
      const exerciseId = saved ? catalog.some(row => row.id === saved.exercise_id) ? saved.exercise_id as string : null : exact.length === 1 ? exact[0].id as string : null
      exercises.set(exercise.key, { key: exercise.key, name: exercise.name, occurrences: 1, exerciseId })
    }
    const warnings: string[] = [message(lang, 'Los duplicados se detectan dentro de cada app de origen. Si exportaste las mismas sesiones desde dos apps distintas, elige una de las dos fuentes.', 'Duplicates are detected within each source app. If the same workouts exist in two apps, choose one of those sources.')]
    if (parsed.source === 'fitnotes') warnings.push(message(lang, 'FitNotes no incluye la hora de cada sesión: sus registros se agrupan por fecha.', 'FitNotes does not include workout times: its records are grouped by date.'))
    if ([...exercises.values()].some(exercise => !exercise.exerciseId)) warnings.push(message(lang, 'Los ejercicios sin equivalencia conservarán su nombre e historial. Solo los vinculados aportarán músculos al mapa.', 'Unmatched exercises keep their name and history. Only linked exercises contribute muscles to the map.'))
    if (counts.conflict) warnings.push(message(lang, 'Hay sesiones ya importadas que cambiaron en el archivo. Se conservará la versión guardada; esas sesiones se omitirán.', 'Some imported workouts changed in this file. The saved version will be preserved and those workouts skipped.'))
    if (workouts.some(workout => workout.durationSeconds === null)) warnings.push(message(lang, 'Algunas sesiones no incluyen duración. Aparecerán sin minutos registrados.', 'Some workouts have no duration. They will appear without recorded minutes.'))
    const unusualKinds = [...new Set(workouts.flatMap(workout => workout.exercises.flatMap(exercise => exercise.sets.map(set => set.kind))).filter(kind => !['normal', 'warmup', 'drop', 'failure'].includes(kind)))]
    if (unusualKinds.length) warnings.push(message(lang, `Tipos de serie de origen: ${unusualKinds.join(', ')}. Se conservarán esas etiquetas.`, `Original set types: ${unusualKinds.join(', ')}. These labels will be preserved.`))
    if (parsed.warnings.some(warning => warning.includes('superserie'))) warnings.push(message(lang, 'Las superseries del archivo se conservan como notas del ejercicio.', 'Supersets from the file are preserved as exercise notes.'))
    if (parsed.warnings.some(warning => /descanso/i.test(warning))) warnings.push(message(lang, 'Los descansos se conservan como notas y no cuentan como series ni tiempo de ejercicio.', 'Rest periods are kept as notes and do not count as sets or exercise time.'))
    const dates = workouts.map(workout => workout.date).sort()
    const preview: ImportPreview = { token: crypto.randomUUID(), source: parsed.source, fileWorkoutCount: workouts.length, newWorkoutCount: counts.new, duplicateCount: counts.duplicate, conflictCount: counts.conflict, setCount: workouts.reduce((sum, workout) => sum + workout.exercises.reduce((n, exercise) => n + exercise.sets.length, 0), 0), fromDate: dates[0], toDate: dates.at(-1)!, timeZone: zone, warnings, exercises: [...exercises.values()] }
    for (const [key, item] of pending) if (item.createdAt < Date.now() - 30 * 60_000 || item.session !== version) pending.delete(key)
    if (pending.size >= 5) pending.delete(pending.keys().next().value!)
    pending.set(preview.token, { accountId: state.accountId, session: version, language: lang, createdAt: Date.now(), preview: structuredClone(preview), workouts })
    return preview
  }
  async function commit(token: string, mappings: Record<string, string | null>): Promise<ImportResult> {
    const prepared = pending.get(token)
    if (!prepared || prepared.createdAt < Date.now() - 30 * 60_000) throw new Error('Vuelve a revisar el archivo. / Preview the file again.')
    const { preview, language: lang } = prepared
    if (store.sessionVersion() !== prepared.session) throw changed(lang)
    if (!mappings || typeof mappings !== 'object' || Object.keys(mappings).some(key => !preview.exercises.some(exercise => exercise.key === key))) throw new Error(message(lang, 'Revisa las equivalencias de ejercicios.', 'Review the exercise matches.'))
    const unknownIds = new Map(await Promise.all(preview.exercises.map(async exercise => [exercise.key, await identity(`${prepared.accountId}:${preview.source}:exercise:${exercise.key}`)] as const)))
    const linkIds = new Map(await Promise.all(preview.exercises.map(async exercise => [exercise.key, await identity(`${prepared.accountId}:${preview.source}:link:${exercise.key}`)] as const)))
    const batchId = crypto.randomUUID()
    const result = await store.mutate(state => {
      if (state.accountId !== prepared.accountId || store.sessionVersion() !== prepared.session) throw changed(lang)
      const catalog = accessible(state)
      const resolved = new Map(preview.exercises.map(exercise => {
        const choice = Object.prototype.hasOwnProperty.call(mappings, exercise.key) ? mappings[exercise.key] : exercise.exerciseId
        if (choice !== null && (!uuid(choice) || !catalog.some(row => row.id === choice))) throw new Error(message(lang, 'Un ejercicio elegido ya no está disponible. Revisa sus equivalencias.', 'A selected exercise is no longer available. Review the matches.'))
        return [exercise.key, { id: choice ?? unknownIds.get(exercise.key)!, meta: catalog.find(row => row.id === choice) }]
      }))
      const result: ImportResult = { imported: 0, duplicates: 0, conflicts: 0 }
      const parents: AppRow[] = [], details: AppRow[] = []
      for (const workout of prepared.workouts) {
        const status = disposition(state, preview.source, workout)
        if (status !== 'new') { result[status === 'duplicate' ? 'duplicates' : 'conflicts']++; continue }
        if (table(state, 'progress_logs').some(row => row.id === workout.id)) throw new Error(message(lang, 'Hay un conflicto con la identidad de una sesión. No se importó el archivo.', 'A workout identity conflicts with existing data. The file was not imported.'))
        const exercises = workout.exercises.map(exercise => ({ ...structuredClone(exercise), exerciseId: resolved.get(exercise.key)!.id }))
        const snapshotExercises = [...new Map(exercises.map(exercise => {
          const meta = resolved.get(exercise.key)!.meta
          return [exercise.exerciseId, { exerciseId: exercise.exerciseId, name: String(meta?.name || exercise.name), nameEs: typeof meta?.name_es === 'string' && meta.name_es.trim() ? meta.name_es : null, muscleGroups: strings(meta?.muscle_groups), muscleGroupsEs: strings(meta?.muscle_groups_es), isCompound: Boolean(meta?.is_compound) }]
        })).values()]
        // An exercise can occur several times in one source workout. Canonical
        // consumers identify by exercise UUID, so preserve each block in metadata
        // and aggregate only its historical projection.
        const grouped = new Map<string, typeof exercises>()
        exercises.forEach(exercise => grouped.set(exercise.exerciseId, [...(grouped.get(exercise.exerciseId) ?? []), exercise]))
        const children = [...grouped].map(([exerciseId, blocks]) => {
          const sets = blocks.flatMap(block => block.sets)
          const times = sets.flatMap(set => set.durationSeconds === null ? [] : [set.durationSeconds])
          return { id: crypto.randomUUID(), progress_log_id: workout.id, exercise_id: exerciseId, sets_completed: sets.length, reps_completed: sets.map(set => set.reps), weights_kg: sets.map(set => set.weightKg), rpe_values: sets.map(set => set.rpe), duration_seconds: times.length ? times.reduce((sum, seconds) => sum + seconds, 0) : null, notes: blocks.map(block => block.notes).filter(Boolean).join('\n') || null, skip_reason: null }
        })
        const importedAt = new Date().toISOString()
        parents.push({ id: workout.id, user_id: state.accountId, client_session_id: workout.id, workout_id: null, completed_at: workout.completedAt, duration_minutes: workout.durationSeconds === null ? null : workout.durationSeconds / 60, mood_rating: null, notes: workout.notes || null, mobile_session_kind: 'imported', session_context_snapshot: { version: 1, workout: { id: workout.id, name: `${workout.title} · ${preview.source === 'hevy' ? 'Hevy' : preview.source === 'strong' ? 'Strong' : 'FitNotes'}`, focus: null, dayOfWeek: null }, plan: null, exercises: snapshotExercises }, session_result_snapshot: null, session_detail_backup: children.map(({ id: _id, progress_log_id: _parent, ...detail }) => detail), mobile_import: { version: 1, source: preview.source, sourceKey: workout.sourceKey, fingerprint: workout.fingerprint, batchId, importedAt, date: workout.date, timeZone: preview.timeZone, startedAt: workout.startedAt, notes: workout.notes, exercises } })
        details.push(...children); result.imported++
      }
      if (parents.length) {
        state.tables.progress_logs = [...table(state, 'progress_logs'), ...parents]
        state.tables.exercise_logs = [...table(state, 'exercise_logs'), ...details]
        state.tables.mobile_history_imports = [...table(state, 'mobile_history_imports'), { id: batchId, user_id: state.accountId, source: preview.source, imported_at: new Date().toISOString(), progress_log_ids: parents.map(row => row.id) }]
        const links = table(state, 'mobile_fitness_import_links').filter(row => !(row.user_id === state.accountId && row.source === preview.source && resolved.has(row.key)))
        state.tables.mobile_fitness_import_links = [...links, ...preview.exercises.map(exercise => ({ id: linkIds.get(exercise.key)!, user_id: state.accountId, source: preview.source, key: exercise.key, exercise_id: resolved.get(exercise.key)!.meta?.id ?? null }))]
      }
      return result
    })
    pending.delete(token)
    return result
  }
  return { load, prepare, commit, cancel(token: string) { pending.delete(token) } }
}

const services = new WeakMap<AppStore, ReturnType<typeof createFitnessImporter>>()
async function service() { const store = await getAppStore(); let value = services.get(store); if (!value) { value = createFitnessImporter(store); services.set(store, value) } return value }
export async function loadFitnessImportModel() { return (await service()).load() }
export async function prepareFitnessImport(text: string, options: ImportOptions = {}) { return (await service()).prepare(text, options) }
export async function commitFitnessImport(token: string, mappings: Record<string, string | null>) { return (await service()).commit(token, mappings) }
export function cancelFitnessImport(token: string): void { void service().then(current => current.cancel(token)) }
