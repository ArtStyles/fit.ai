import { ImportFormatError, type FitnessSource, type ImportExercise, type ImportSet, type ImportWorkout, type ParsedFitnessImport, type ParseFitnessOptions } from './types'
export { ImportFormatError } from './types'
export type { ParseFitnessOptions } from './types'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 20_000

interface CsvRow { cells: string[]; line: number }
interface ParsedDate { iso: string; date: string; milliseconds: number; offset: string }
interface OrderedSet { value: ImportSet; order: number | null }
interface ExerciseBuilder { value: ImportExercise; notes: Set<string>; restNotes: string[]; sets: OrderedSet[] }
interface WorkoutBuilder { value: ImportWorkout; notes: Set<string>; exercises: Map<string, ExerciseBuilder> }

const headerKey = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const textKey = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

function readCsv(input: string): CsvRow[] {
  if (input.length > MAX_IMPORT_BYTES || new TextEncoder().encode(input).byteLength > MAX_IMPORT_BYTES) {
    throw new ImportFormatError('limit', 'El archivo supera el límite de 5 MiB.')
  }
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!text.trim()) throw new ImportFormatError('empty', 'El archivo está vacío.')
  const header = text.split('\n').find(line => line.trim()) ?? ''
  const delimiter = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: CsvRow[] = []
  let cells: string[] = [], cell = '', line = 1, rowLine = 1, quoted = false, closed = false
  function finishRow() {
    cells.push(cell)
    if (cells.length > 128) throw new ImportFormatError('limit', 'Demasiadas columnas (máximo 128).', rowLine)
    if (cells.some(value => value.trim())) rows.push({ cells, line: rowLine })
    if (rows.length > MAX_IMPORT_ROWS + 1) throw new ImportFormatError('limit', 'El archivo supera el límite de 20.000 filas de datos.')
    cells = []; cell = ''; closed = false
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true }
      } else { cell += char; if (char === '\n') line++ }
    } else if (char === delimiter) {
      cells.push(cell); cell = ''; closed = false
      if (cells.length > 128) throw new ImportFormatError('limit', 'Demasiadas columnas (máximo 128).', rowLine)
    } else if (char === '\n') {
      finishRow(); line++; rowLine = line
    } else if (char === '"' && cell === '' && !closed) {
      quoted = true
    } else if (char === '"' || closed) {
      throw new ImportFormatError('csv', 'Comillas CSV inválidas.', rowLine)
    } else cell += char
  }
  if (quoted) throw new ImportFormatError('csv', 'Hay un campo entre comillas sin cerrar.', rowLine)
  if (cell || cells.length || closed) finishRow()
  return rows
}

function numberValue(raw: string, field: string, line: number, integer = false): number | null {
  if (!raw.trim()) return null
  const normalized = raw.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new ImportFormatError('number', `${field}: número inválido «${raw}».`, line)
  const value = Number(normalized)
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isInteger(value))) {
    throw new ImportFormatError('number', `${field}: valor fuera de rango.`, line)
  }
  return value
}

function duration(raw: string, line: number): number | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null
  if (/^\d+(?:[.,]\d+)?$/.test(value)) return numberValue(value, 'Tiempo en segundos', line)
  const clock = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d+))?$/)
  if (clock && Number(clock[2]) < 60 && Number(clock[3]) < 60) {
    return numberValue(String(Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(`${clock[3]}.${clock[4] ?? 0}`)), 'Duración', line)
  }
  const units = value.match(/^(?:(\d+)\s*h(?:r|rs|our|ours)?\s*)?(?:(\d+)\s*m(?:in|ins|inute|inutes)?\s*)?(?:(\d+)\s*s(?:ec|ecs|econd|econds)?\s*)?$/)
  if (units && units.slice(1).some(Boolean)) return numberValue(String(Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0)), 'Duración', line)
  throw new ImportFormatError('number', `Duración inválida «${raw}». Usa HH:MM:SS o unidades h/m/s.`, line)
}

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
function parseDate(raw: string, line: number, options: ParseFitnessOptions): ParsedDate {
  const value = raw.trim()
  let year: number, month: number, day: number, time = ''
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](.+))?$/)
  const named = value.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})(?:,?\s+(.+))?$/)
  const numeric = value.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[, ]+(.+))?$/)
  if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); time = iso[4] ?? '' }
  else if (named) {
    const name = named[2].toLowerCase()
    year = Number(named[3]); month = (name === 'sept' ? 8 : Math.max(months.indexOf(name), fullMonths.indexOf(name))) + 1
    day = Number(named[1]); time = named[4] ?? ''
  }
  else if (numeric) {
    const first = Number(numeric[1]), second = Number(numeric[2])
    let order = options.dateOrder
    if (!order) {
      if (first > 12) order = 'dmy'
      else if (second > 12) order = 'mdy'
      else if (first === second) order = 'dmy'
      else throw new ImportFormatError('date-order', `Fecha ambigua «${raw}». Indica día/mes o mes/día.`, line)
    }
    year = Number(numeric[3]); month = order === 'dmy' ? second : first; day = order === 'dmy' ? first : second; time = numeric[4] ?? ''
  } else throw new ImportFormatError('date', `Fecha no reconocida «${raw}».`, line)
  const matched = time ? time.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?\s*(AM|PM)?\s*(Z|[+-]\d{2}:?\d{2})?$/i) : null
  if (time && !matched) throw new ImportFormatError('date', `Hora inválida «${raw}».`, line)
  let hour = Number(matched?.[1] ?? 0)
  const minute = Number(matched?.[2] ?? 0), second = Number(matched?.[3] ?? 0), fraction = matched?.[4] ?? ''
  const ampm = matched?.[5]?.toUpperCase()
  if (ampm) {
    if (hour < 1 || hour > 12) throw new ImportFormatError('date', `Hora inválida «${raw}».`, line)
    hour = hour % 12 + (ampm === 'PM' ? 12 : 0)
  }
  let offset = (matched?.[6] ?? '').toUpperCase()
  if (offset && offset !== 'Z') {
    offset = offset.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')
    if (Number(offset.slice(1, 3)) > 14 || Number(offset.slice(4)) > 59 || (Number(offset.slice(1, 3)) === 14 && Number(offset.slice(4)) !== 0)) {
      throw new ImportFormatError('date', `Zona horaria inválida «${raw}».`, line)
    }
  }
  const check = new Date(0)
  check.setUTCFullYear(year, month - 1, day); check.setUTCHours(hour, minute, second, Number(fraction || 0) * 1000)
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new ImportFormatError('date', `Fecha u hora inexistente «${raw}».`, line)
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
  const stamp = `${date}T${pad(hour)}:${pad(minute)}:${pad(second)}${fraction}${offset}`
  return { iso: stamp, date, milliseconds: offset ? Date.parse(stamp) : check.getTime(), offset }
}

function addSeconds(start: ParsedDate, seconds: number, line: number): string {
  const wall = Date.parse(start.iso.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '') + 'Z')
  const end = new Date(wall + seconds * 1000)
  if (!Number.isFinite(end.getTime()) || end.getUTCFullYear() > 9999) throw new ImportFormatError('number', 'La duración excede el rango de fechas admitido.', line)
  return end.toISOString().replace(/\.000Z$/, '').replace(/Z$/, '') + start.offset
}

const weightFactors: Record<string, number> = { kg: 1, kgs: 1, kilogram: 1, kilograms: 1, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237 }
const distanceFactors: Record<string, number> = { m: 1, meter: 1, meters: 1, metre: 1, metres: 1, km: 1000, kilometer: 1000, kilometers: 1000, mi: 1609.344, mile: 1609.344, miles: 1609.344, cm: 0.01, in: 0.0254, ft: 0.3048, yd: 0.9144 }

export function parseFitnessCsv(text: string, options: ParseFitnessOptions = {}): ParsedFitnessImport {
  const rows = readCsv(text)
  const first = rows.shift()
  if (!first) throw new ImportFormatError('empty', 'El archivo está vacío.')
  const headers = first.cells.map(headerKey)
  if (headers.some(key => !key) || new Set(headers).size !== headers.length) throw new ImportFormatError('header', 'Hay encabezados vacíos o repetidos.', first.line)
  const has = (...keys: string[]) => keys.every(key => headers.includes(key))
  const detected: FitnessSource | null = has('start_time', 'exercise_title') ? 'hevy' : has('date', 'workout_name', 'exercise_name') ? 'strong' : has('date', 'exercise', 'category') ? 'fitnotes' : null
  if (!detected || (options.source && options.source !== 'auto' && options.source !== detected)) throw new ImportFormatError('format', 'El archivo no coincide con un CSV compatible de Hevy, Strong o FitNotes.')
  if (!rows.length) throw new ImportFormatError('empty', 'El archivo no contiene series.')
  const source = detected, warnings = new Set<string>(), workouts = new Map<string, WorkoutBuilder>()
  if (source === 'fitnotes') warnings.add('FitNotes no aporta una hora de sesión en este formato: todas las series de una misma fecha se agrupan en una sesión; su duración queda sin determinar.')

  for (const row of rows) {
    if (row.cells.length !== headers.length) throw new ImportFormatError('row', `Se esperaban ${headers.length} columnas y se encontraron ${row.cells.length}.`, row.line)
    const record = new Map(headers.map((key, index) => [key, row.cells[index].trim()]))
    const get = (...keys: string[]) => keys.map(key => record.get(key)).find(value => value !== undefined && value !== '') ?? ''
    const start = parseDate(get(source === 'hevy' ? 'start_time' : 'date'), row.line, options)
    const title = get(source === 'hevy' ? 'title' : 'workout_name') || (source === 'fitnotes' ? 'FitNotes' : source === 'hevy' ? 'Hevy' : 'Strong')
    const name = get(source === 'hevy' ? 'exercise_title' : source === 'strong' ? 'exercise_name' : 'exercise')
    if (!name) throw new ImportFormatError('row', 'Falta el nombre del ejercicio.', row.line)
    let durationSeconds: number | null = null, completedAt = start.iso
    if (source === 'hevy' && get('end_time')) {
      const end = parseDate(get('end_time'), row.line, options)
      if (Boolean(start.offset) !== Boolean(end.offset) || end.milliseconds < start.milliseconds) throw new ImportFormatError('date', 'La hora final debe ser posterior al inicio y usar la misma convención de zona horaria.', row.line)
      durationSeconds = (end.milliseconds - start.milliseconds) / 1000; completedAt = end.iso
    } else if (source === 'strong') {
      durationSeconds = duration(get('duration', 'workout_duration'), row.line)
      if (durationSeconds !== null) completedAt = addSeconds(start, durationSeconds, row.line)
    }
    if (durationSeconds === null && source !== 'fitnotes') warnings.add('Hay sesiones sin duración: se conserva su fecha de inicio sin inventar minutos de entrenamiento.')
    if (!start.offset && source !== 'fitnotes') warnings.add('Las fechas sin zona horaria conservan la hora local indicada en el CSV.')

    function measurement(prefix: 'weight' | 'distance'): number | null {
      const factors = prefix === 'weight' ? weightFactors : distanceFactors
      const entries = [...record].filter(([key, value]) => value && (key === prefix || key.startsWith(prefix + '_')) && key !== prefix + '_unit')
      const values: number[] = []
      for (const [key, raw] of entries) {
        const value = numberValue(raw, prefix === 'weight' ? 'Peso' : 'Distancia', row.line)!
        const suffix = key === prefix ? '' : key.slice(prefix.length + 1)
        const unit = (suffix || get(prefix + '_unit') || (prefix === 'weight' ? options.weightUnit : options.distanceUnit) || '').toLowerCase()
        const factor = factors[unit]
        if (typeof factor !== 'number') throw new ImportFormatError(prefix === 'weight' ? 'weight-unit' : 'distance-unit', `${prefix === 'weight' ? 'Peso' : 'Distancia'} sin unidad reconocida. Indica la unidad del archivo.`, row.line)
        const converted = value * factor
        if (!Number.isFinite(converted) || converted > Number.MAX_SAFE_INTEGER) throw new ImportFormatError('number', 'La medida convertida excede el rango admitido.', row.line)
        values.push(Math.round(converted * 1e9) / 1e9)
      }
      if (values.length > 1 && values.some(value => Math.abs(value - values[0]) > Math.max(0.01, values[0] * 0.001))) throw new ImportFormatError('row', `Las columnas de ${prefix === 'weight' ? 'peso' : 'distancia'} se contradicen.`, row.line)
      return values[0] ?? null
    }
    const orderText = get('set_index', 'set_order')
    const order = source === 'hevy' || /^\d+$/.test(orderText) ? numberValue(orderText, 'Orden de serie', row.line, true) : null
    const rawKind = get('set_type') || (source === 'strong' && order === null ? orderText : '')
    const kindKey = rawKind.toLowerCase().replace(/[\s_-]/g, '')
    const kind = ({ '': 'normal', normal: 'normal', working: 'normal', warmup: 'warmup', w: 'warmup', drop: 'drop', dropset: 'drop', d: 'drop', failure: 'failure', f: 'failure', rest: 'rest', resttimer: 'rest' } as Record<string, string>)[kindKey]
    if (typeof kind !== 'string') throw new ImportFormatError('set-type', `Tipo de serie no reconocido «${rawKind}». Revisa la exportación antes de importar.`, row.line)
    const setDuration = duration(get('duration_seconds', 'seconds', 'time'), row.line)
    const weightKg = kind === 'rest' ? null : measurement('weight'), distanceMeters = kind === 'rest' ? null : measurement('distance')
    const reps = kind === 'rest' ? null : numberValue(get('reps'), 'Repeticiones', row.line, true)
    const rpe = kind === 'rest' ? null : numberValue(get('rpe'), 'RPE', row.line)
    if (rpe !== null && rpe > 10) throw new ImportFormatError('number', 'RPE debe estar entre 0 y 10.', row.line)
    if (kind !== 'rest' && [weightKg, distanceMeters, reps, setDuration].every(value => value === null)) throw new ImportFormatError('row', 'La fila no contiene ninguna medida de la serie.', row.line)
    const sourceId = get('workout_id', 'workout_number')
    const sourceKey = `${source}:${JSON.stringify(source === 'fitnotes' ? [start.date] : sourceId ? ['id', sourceId] : ['start', start.iso])}`
    let workout = workouts.get(sourceKey)
    if (!workout) {
      workout = { value: { sourceKey, title, startedAt: start.iso, completedAt, date: start.date, durationSeconds, notes: '', exercises: [] }, notes: new Set(), exercises: new Map() }
      workouts.set(sourceKey, workout)
    } else if (workout.value.title !== title || workout.value.startedAt !== start.iso || workout.value.completedAt !== completedAt || workout.value.durationSeconds !== durationSeconds) {
      throw new ImportFormatError('row', 'La misma sesión contiene títulos, horas o duraciones contradictorios.', row.line)
    }
    const workoutNotes = get('description', 'workout_notes')
    if (workoutNotes) workout.notes.add(workoutNotes)
    const exerciseKey = textKey(name)
    let exercise = workout.exercises.get(exerciseKey)
    if (!exercise) {
      exercise = { value: { key: exerciseKey, name, notes: '', sets: [] }, notes: new Set(), restNotes: [], sets: [] }
      workout.exercises.set(exerciseKey, exercise)
    }
    if (compare(name, exercise.value.name) < 0) exercise.value.name = name
    const exerciseNotes = get('exercise_notes')
    if (exerciseNotes) exercise.notes.add(exerciseNotes)
    if (get('superset_id')) {
      exercise.notes.add(`Superserie de origen: ${get('superset_id')}`)
      warnings.add('Los grupos de superserie se conservan en las notas del ejercicio; no se crea una rutina de superseries.')
    }
    const setNotes = get('comment', 'notes', 'set_notes')
    if (kind === 'rest') {
      exercise.restNotes.push(`Descanso de origen${setDuration === null ? '' : `: ${setDuration} s`}${setNotes ? ` · ${setNotes}` : ''}`)
      warnings.add('Las filas de descanso se conservan en las notas y no cuentan como series ni tiempo de ejercicio.')
    } else exercise.sets.push({ order, value: { reps, weightKg, durationSeconds: setDuration, distanceMeters, rpe, kind, notes: setNotes } })
  }
  const result = [...workouts.values()].map(workout => ({
    ...workout.value,
    notes: [...workout.notes].sort(compare).concat([...workout.exercises.values()].filter(exercise => !exercise.sets.length).sort((a, b) => compare(a.value.key, b.value.key)).flatMap(exercise => [...exercise.notes, ...exercise.restNotes].sort(compare).map(note => `${exercise.value.name} · ${note}`))).join('\n'),
    exercises: [...workout.exercises.values()].filter(exercise => exercise.sets.length).sort((a, b) => compare(a.value.key, b.value.key)).map(exercise => ({
      ...exercise.value, notes: [...exercise.notes].sort(compare).concat([...exercise.restNotes].sort(compare)).join('\n'),
      // Without numeric indices the CSV sequence is the only available set order.
      sets: (exercise.sets.every(set => set.order !== null)
        ? exercise.sets.sort((a, b) => a.order! - b.order!) : exercise.sets).map(set => set.value),
    })),
  })).filter(workout => workout.exercises.length).sort((a, b) => compare(a.sourceKey, b.sourceKey))
  if (!result.length) throw new ImportFormatError('empty', 'El archivo no contiene series de ejercicio; solo hay descansos.')
  return { source, workouts: result, warnings: [...warnings].sort(compare) }
}
