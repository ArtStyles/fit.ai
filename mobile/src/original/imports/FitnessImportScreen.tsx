'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, Check, ChevronRight, FileUp, Loader2 } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from '../router'
import { cancelFitnessImport, commitFitnessImport, loadFitnessImportModel, prepareFitnessImport } from './data'

type Model = Awaited<ReturnType<typeof loadFitnessImportModel>>
type Preview = Awaited<ReturnType<typeof prepareFitnessImport>>
type ImportResult = Awaited<ReturnType<typeof commitFitnessImport>>
type Options = NonNullable<Parameters<typeof prepareFitnessImport>[1]>
type Language = 'es' | 'en'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const NONE = '__unmapped__'
const AUTO = '__auto__'
const control = 'h-auto min-h-11 min-w-0 rounded-xl text-left [&>span]:min-w-0 [&>span]:line-clamp-none [&>span]:break-words [&>span]:whitespace-normal [&>svg]:shrink-0'
const menu = 'z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-0 max-w-[calc(100vw-2rem)] rounded-xl border-violet-500/30 shadow-xl'
const option = 'min-h-11 min-w-0 rounded-lg py-2 data-[state=checked]:bg-violet-500/15 focus:bg-violet-500/25 [&>span:last-child]:min-w-0 [&>span:last-child]:whitespace-normal [&>span:last-child]:break-words'
const copy = (language: Language) => (es: string, en: string) => language === 'es' ? es : en
const sourceName = (source: Preview['source']) => ({ hevy: 'Hevy', strong: 'Strong', fitnotes: 'FitNotes' })[source]
const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function dateLabel(value: string | null, language: Language) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function Choice({ label, value, options, disabled, onChange }: {
  label: string; value: string; options: Array<{ value: string; label: string }>; disabled?: boolean; onChange(value: string): void
}) {
  const id = useId()
  return <div className="min-w-0 space-y-2"><label id={`${id}-label`} htmlFor={id} className="text-sm font-medium">{label}</label>
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} aria-labelledby={`${id}-label`} className={control}><SelectValue /></SelectTrigger>
      <SelectContent className={menu} collisionPadding={16}>{options.map(item => <SelectItem key={item.value} value={item.value} className={option}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>
}

function ExerciseMapping({ exercise, catalog, language, value, busy, onMap }: {
  exercise: Preview['exercises'][number]; catalog: Model['catalog']; language: Language; value: string | null; busy: boolean; onMap(value: string | null): void
}) {
  const t = copy(language), id = useId()
  const [search, setSearch] = useState('')
  const query = searchable(search)
  const found = catalog.filter(item => !query || searchable(`${item.name} ${item.nameEn}`).includes(query))
  const selected = catalog.find(item => item.id === value)
  const choices = selected && !found.some(item => item.id === selected.id) ? [selected, ...found] : found
  return <details className="rounded-xl border border-border/60 bg-background/50 p-3">
    <summary className="min-h-11 cursor-pointer rounded-lg text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
      <span className="break-words font-medium text-foreground">{exercise.name}</span>
      <span className="mt-1 block break-words text-xs text-muted-foreground">{selected?.name ?? t('Conservar nombre importado', 'Keep imported name')} · {exercise.occurrences} {t('apariciones', 'appearances')}</span>
    </summary>
    <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <label htmlFor={id} className="block space-y-2 text-xs text-muted-foreground"><span>{t('Buscar equivalencia', 'Search for a match')}</span><Input id={id} type="search" autoComplete="off" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} className="min-h-11 rounded-xl" placeholder={t('Nombre en español o inglés', 'Spanish or English name')} /></label>
      <Choice label={`${t('Equivalencia de', 'Match for')} ${exercise.name}`} value={value ?? NONE} disabled={busy} onChange={next => onMap(next === NONE ? null : next)} options={[
        { value: NONE, label: t('Conservar nombre importado', 'Keep imported name') },
        ...choices.map(item => ({ value: item.id, label: item.name })),
      ]} />
      {query && !found.length && <p role="status" className="text-xs text-muted-foreground">{t('No hay coincidencias en el catálogo.', 'No catalog matches.')}</p>}
    </div>
  </details>
}

export function FitnessImportReview({ preview, catalog, language, mappings, busy, onMap, onCancel, onImport }: {
  preview: Preview; catalog: Model['catalog']; language: Language; mappings: Record<string, string | null>; busy: boolean
  onMap(key: string, value: string | null): void; onCancel(): void; onImport(): void
}) {
  const t = copy(language)
  const stats = [
    [t('Sesiones del archivo', 'Sessions in file'), preview.fileWorkoutCount],
    [t('Nuevas', 'New'), preview.newWorkoutCount],
    [t('Ya importadas', 'Already imported'), preview.duplicateCount],
    [t('Por revisar', 'Need review'), preview.conflictCount],
  ] as const
  return <SettingsSection title={t('Revisa tu importación', 'Review your import')} description={`${sourceName(preview.source)} · ${dateLabel(preview.fromDate, language)} – ${dateLabel(preview.toDate, language)}`}>
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2">{stats.map(([label, count]) => <div key={label} className="rounded-xl border border-border/60 bg-background/50 p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count}</dd></div>)}</dl>
      <p className="break-words text-xs leading-5 text-muted-foreground">{preview.setCount} {t('series en el archivo', 'sets in the file')} · {t('Zona horaria', 'Time zone')}: {preview.timeZone}</p>
      {(preview.duplicateCount > 0 || preview.conflictCount > 0) && <p className="text-sm leading-6 text-muted-foreground">{t('Las sesiones ya importadas no se repiten. Los conflictos se omiten: revisa el archivo de origen antes de volver a importarlos.', 'Previously imported sessions are not repeated. Conflicts are skipped: review the source file before importing them again.')}</p>}
      {preview.warnings.length > 0 && <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3"><h3 className="text-sm font-medium">{t('Antes de continuar', 'Before you continue')}</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-muted-foreground">{preview.warnings.map((warning, index) => <li key={index} className="break-words">{warning}</li>)}</ul></div>}
      {preview.exercises.length > 0 && <div className="space-y-3"><h3 className="text-sm font-semibold">{t('Equivalencias de ejercicios', 'Exercise matches')}</h3><p className="text-xs leading-5 text-muted-foreground">{t('Solo los nombres exactos se vinculan automáticamente. Puedes revisar cada ejercicio. Sin equivalencia, conservamos su nombre sin asignar músculos.', 'Only exact names are matched automatically. You can review each exercise. Without a match, we keep its name without assigning muscles.')}</p>
        {preview.exercises.map(exercise => <ExerciseMapping key={exercise.key} exercise={exercise} catalog={catalog} language={language} value={mappings[exercise.key] ?? null} busy={busy} onMap={value => onMap(exercise.key, value)} />)}
      </div>}
      <Button className="min-h-11 w-full whitespace-normal rounded-xl bg-violet-600 text-white hover:bg-violet-700" disabled={busy || preview.newWorkoutCount === 0} onClick={onImport}>{busy ? t('Importando…', 'Importing…') : preview.newWorkoutCount === 0 ? t('No hay sesiones nuevas para importar', 'No new sessions to import') : t(`Importar ${preview.newWorkoutCount} ${preview.newWorkoutCount === 1 ? 'sesión' : 'sesiones'}`, `Import ${preview.newWorkoutCount} ${preview.newWorkoutCount === 1 ? 'session' : 'sessions'}`)}</Button>
      <Button className="min-h-11 w-full rounded-xl" variant="outline" disabled={busy} onClick={onCancel}>{t('Cancelar', 'Cancel')}</Button>
    </div>
  </SettingsSection>
}

function ExportHelp({ language }: { language: Language }) {
  const t = copy(language)
  const links = [
    { name: 'Hevy', href: 'https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy', text: t('Perfil → Ajustes → Exportar e importar datos → Exportar entrenamientos.', 'Profile → Settings → Export & Import Data → Export Workouts.') },
    { name: 'Strong', href: 'https://help.strongapp.io/article/235-export-workout-data', text: t('Ajustes → Exportar datos. En iOS: Export Strong Data.', 'Settings → Export Data. On iOS: Export Strong Data.') },
    { name: 'FitNotes', href: 'https://www.fitnotesapp.com/settings/#spreadsheet-export', text: t('Ajustes → Exportación a hoja de cálculo → Entrenamientos → Guardar exportación.', 'Settings → Spreadsheet Export → Workout data → Save Export.') },
  ]
  return <details className="rounded-2xl border border-border/60 bg-muted/10 p-4"><summary className="min-h-11 cursor-pointer rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">{t('Cómo exportar desde otra app', 'How to export from another app')}</summary><div className="mt-3 space-y-3"><p className="text-xs leading-5 text-muted-foreground">{t('Elige el CSV de entrenamientos, no el de medidas corporales ni una copia de respaldo.', 'Choose the workout CSV, not body measurements or a backup file.')}</p>{links.map(link => <div key={link.name}><a href={link.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-violet-400 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">{link.name}<ArrowUpRight className="size-4" aria-hidden="true" /><span className="sr-only">{t('Ayuda oficial, abre el navegador', 'Official help, opens the browser')}</span></a><p className="text-xs leading-5 text-muted-foreground">{link.text}</p></div>)}</div></details>
}

export function FitnessImportScreen({ model }: { model: Model }) {
  const t = copy(model.language), fieldId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<Options>({ source: 'auto', timeZone: model.timeZone })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mappings, setMappings] = useState<Record<string, string | null>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const lifecycle = useRef({ alive: true, operation: 0, token: null as string | null, busy: false })
  const reviewRegion = useRef<HTMLDivElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const current = lifecycle.current
    current.alive = true
    return () => {
      current.alive = false; current.operation++
      if (current.token) cancelFitnessImport(current.token)
      current.token = null
    }
  }, [])
  useEffect(() => { if (preview) reviewRegion.current?.focus() }, [preview])
  useEffect(() => { if (result) resultHeading.current?.focus() }, [result])

  function current(operation: number) { return lifecycle.current.alive && lifecycle.current.operation === operation }
  function clearPreview() {
    if (lifecycle.current.token) cancelFitnessImport(lifecycle.current.token)
    lifecycle.current.token = null
    setPreview(null); setMappings({})
  }
  function changeOption<K extends keyof Options>(key: K, value: Options[K]) {
    setOptions(previous => ({ ...previous, [key]: value })); setError(''); setMessage('')
  }
  async function assertAccount(operation: number) {
    if (!current(operation)) return false
    const latest = await loadFitnessImportModel()
    if (!current(operation)) return false
    if (latest.accountId !== model.accountId) throw new Error(t('Cambiaste de cuenta. Abre la importación de nuevo.', 'Your account changed. Open the import screen again.'))
    return true
  }
  async function prepare() {
    if (!file || lifecycle.current.busy) return
    lifecycle.current.busy = true
    const operation = ++lifecycle.current.operation
    setBusy(true); setError(''); setMessage(''); clearPreview()
    let producedToken: string | null = null
    try {
      if (file.size > MAX_FILE_SIZE) throw new Error(t('El archivo supera el límite de 5 MB.', 'The file exceeds the 5 MB limit.'))
      let text: string
      try { text = await file.text() } catch { throw new Error(t('No se pudo leer el archivo. Selecciónalo de nuevo.', 'Could not read the file. Select it again.')) }
      if (!await assertAccount(operation)) return
      const prepared = await prepareFitnessImport(text, options)
      producedToken = prepared.token
      if (!await assertAccount(operation)) return
      lifecycle.current.token = prepared.token; producedToken = null
      setMappings(Object.fromEntries(prepared.exercises.map(exercise => [exercise.key, exercise.exerciseId])))
      setPreview(prepared)
    } catch (reason) {
      if (current(operation)) setError(reason instanceof Error ? reason.message : t('No se pudo revisar el archivo. Vuelve a intentarlo.', 'Could not review the file. Try again.'))
    } finally {
      if (producedToken) cancelFitnessImport(producedToken)
      if (current(operation)) { lifecycle.current.busy = false; setBusy(false) }
    }
  }
  async function save() {
    if (!preview || !preview.newWorkoutCount || lifecycle.current.busy) return
    lifecycle.current.busy = true
    const operation = ++lifecycle.current.operation
    setBusy(true); setError(''); setMessage('')
    try {
      if (!await assertAccount(operation)) return
      const saved = await commitFitnessImport(preview.token, mappings)
      if (!await assertAccount(operation)) return
      lifecycle.current.token = null
      setResult(saved); setPreview(null); setMappings({}); setFile(null)
    } catch (reason) {
      if (current(operation)) setError(reason instanceof Error ? reason.message : t('No se pudo importar. Inténtalo de nuevo.', 'Could not import. Try again.'))
    } finally { if (current(operation)) { lifecycle.current.busy = false; setBusy(false) } }
  }

  return <SettingsScreen title={t('Importar entrenamientos', 'Import workouts')} description={t('Trae tu historial de Hevy, Strong o FitNotes. Revisa los datos antes de guardarlos.', 'Bring your history from Hevy, Strong or FitNotes. Review the data before saving.')} backHref="/settings/almacenamiento" backLabel={t('Almacenamiento', 'Storage')} icon="dumbbell">
    <div className="space-y-4" aria-busy={busy}>
      {error && <p role="alert" className="break-words rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm leading-6">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-border/60 p-4 text-sm">{message}</p>}
      {result ? <SettingsSection title={t('Historial importado', 'History imported')}><div className="space-y-4">
        <Check className="size-8 text-emerald-400" aria-hidden="true" />
        <h2 ref={resultHeading} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold outline-none">{t(`${result.imported} ${result.imported === 1 ? 'sesión guardada' : 'sesiones guardadas'}`, `${result.imported} ${result.imported === 1 ? 'session saved' : 'sessions saved'}`)}</h2>
        <p role="status" className="text-sm leading-6 text-muted-foreground">{t('Tu historial ya está disponible en este dispositivo.', 'Your history is now available on this device.')}{result.duplicates > 0 ? ` ${result.duplicates} ${t('ya estaban importadas.', 'were already imported.')}` : ''}{result.conflicts > 0 ? ` ${result.conflicts} ${t('se omitieron por conflictos.', 'were skipped due to conflicts.')}` : ''}</p>
        <div className="grid grid-cols-2 gap-2"><Button asChild className="min-h-11 rounded-xl bg-violet-600 text-white hover:bg-violet-700"><Link href="/history">{t('Ver historial', 'View history')}</Link></Button><Button asChild variant="outline" className="min-h-11 rounded-xl"><Link href="/progress">{t('Ver progreso', 'View progress')}</Link></Button></div>
        <Button variant="ghost" className="min-h-11 w-full" onClick={() => { setResult(null); setMessage(''); setError('') }}>{t('Importar otro archivo', 'Import another file')}</Button>
      </div></SettingsSection> : preview ? <div ref={reviewRegion} tabIndex={-1} className="scroll-mt-24 outline-none" aria-label={t('Vista previa de importación', 'Import preview')}><FitnessImportReview preview={preview} catalog={model.catalog} language={model.language} mappings={mappings} busy={busy} onMap={(key, value) => setMappings(previous => ({ ...previous, [key]: value }))} onImport={() => void save()} onCancel={() => { clearPreview(); setError(''); setMessage(t('Importación cancelada. Tus datos siguen igual.', 'Import cancelled. Your data is unchanged.')) }} /></div> : <>
        <SettingsSection title={t('Archivo de entrenamientos', 'Workout file')} description={t('CSV · hasta 5 MB · se procesa en este dispositivo', 'CSV · up to 5 MB · processed on this device')}><div className="space-y-4">
          <label htmlFor={`${fieldId}-file`} className="block space-y-2 text-sm font-medium"><span>{t('Seleccionar archivo CSV', 'Choose CSV file')}</span><input id={`${fieldId}-file`} type="file" accept=".csv,text/csv,application/vnd.ms-excel" disabled={busy} className="block min-h-11 w-full min-w-0 rounded-xl border border-input bg-background p-2 text-xs file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-violet-500/15 file:px-3 file:text-xs file:font-semibold file:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; setError(''); setMessage(''); if (!selected) return; if (selected.size > MAX_FILE_SIZE) { setFile(null); setError(t('El archivo supera el límite de 5 MB.', 'The file exceeds the 5 MB limit.')); return }; setFile(selected) }} /></label>
          {file && <p className="break-words text-xs text-muted-foreground">{file.name} · {(file.size / 1024).toLocaleString(model.language, { maximumFractionDigits: 1 })} KB</p>}
          <Choice label={t('App de origen', 'Source app')} value={options.source ?? 'auto'} disabled={busy} onChange={value => changeOption('source', value as Options['source'])} options={[{ value: 'auto', label: t('Detectar automáticamente', 'Detect automatically') }, { value: 'hevy', label: 'Hevy' }, { value: 'strong', label: 'Strong' }, { value: 'fitnotes', label: 'FitNotes' }]} />
          <p className="break-words text-xs leading-5 text-muted-foreground">{t('Zona horaria para las fechas del archivo', 'Time zone for the file dates')}: <strong className="font-medium text-foreground">{options.timeZone || model.timeZone}</strong></p>
          <details className="rounded-xl border border-border/60 p-3"><summary className="min-h-11 cursor-pointer rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">{t('Unidades y fechas', 'Units and dates')}</summary><div className="mt-3 space-y-4">
            <p className="text-xs leading-5 text-muted-foreground">{t('Completa las unidades solo si no aparecen en el archivo. Si las fechas son ambiguas, indica su orden.', 'Choose units only when the file does not specify them. If dates are ambiguous, select their order.')}</p>
            <Choice label={t('Unidad de peso', 'Weight unit')} value={options.weightUnit ?? AUTO} disabled={busy} onChange={value => changeOption('weightUnit', value === AUTO ? undefined : value as Options['weightUnit'])} options={[{ value: AUTO, label: t('Elegir si el archivo no indica', 'Choose if the file does not specify') }, { value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
            <Choice label={t('Unidad de distancia', 'Distance unit')} value={options.distanceUnit ?? AUTO} disabled={busy} onChange={value => changeOption('distanceUnit', value === AUTO ? undefined : value as Options['distanceUnit'])} options={[{ value: AUTO, label: t('Elegir si el archivo no indica', 'Choose if the file does not specify') }, { value: 'm', label: t('Metros (m)', 'Meters (m)') }, { value: 'km', label: t('Kilómetros (km)', 'Kilometers (km)') }, { value: 'mi', label: t('Millas (mi)', 'Miles (mi)') }]} />
            <Choice label={t('Orden de fecha', 'Date order')} value={options.dateOrder ?? AUTO} disabled={busy} onChange={value => changeOption('dateOrder', value === AUTO ? undefined : value as Options['dateOrder'])} options={[{ value: AUTO, label: t('Detectar automáticamente', 'Detect automatically') }, { value: 'dmy', label: t('Día / mes / año', 'Day / month / year') }, { value: 'mdy', label: t('Mes / día / año', 'Month / day / year') }]} />
            <label htmlFor={`${fieldId}-zone`} className="block space-y-2 text-sm font-medium"><span>{t('Zona horaria del archivo', 'File time zone')}</span><Input id={`${fieldId}-zone`} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={options.timeZone ?? model.timeZone} disabled={busy} onChange={event => changeOption('timeZone', event.target.value)} className="min-h-11 rounded-xl" aria-describedby={`${fieldId}-zone-help`} /></label>
            <p id={`${fieldId}-zone-help`} className="text-xs leading-5 text-muted-foreground">{t('Usamos la de tu perfil para fechas sin zona horaria. Si entrenabas en otra zona, escribe su nombre, por ejemplo America/Havana.', 'Your profile time zone is used for dates without an offset. If you trained elsewhere, enter its name, for example America/Havana.')}</p>
          </div></details>
          <Button className="min-h-11 w-full rounded-xl bg-violet-600 text-white hover:bg-violet-700" disabled={!file || busy} onClick={() => void prepare()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <FileUp className="mr-2 size-4" aria-hidden="true" />}{busy ? t('Revisando archivo…', 'Reviewing file…') : t('Revisar archivo', 'Review file')}</Button>
          {busy && <p role="status" className="sr-only">{t('Revisando el archivo de entrenamientos.', 'Reviewing your workout file.')}</p>}
        </div></SettingsSection>
        <ExportHelp language={model.language} />
      </>}
    </div>
  </SettingsScreen>
}

export function FitnessImportEntry() {
  const { language } = useI18n(), t = copy(language)
  return <Link href="/settings/importar" className="flex min-h-14 items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><FileUp className="size-5 shrink-0 text-violet-400" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{t('Importar entrenamientos', 'Import workouts')}</span><span className="mt-1 block text-xs text-muted-foreground">Hevy · Strong · FitNotes</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></Link>
}

export default async function FitnessImportPage() {
  const model = await loadFitnessImportModel()
  return <FitnessImportScreen key={model.accountId} model={model} />
}
