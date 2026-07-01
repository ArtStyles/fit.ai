/**
 * Incrementally backfills Spanish exercise content with local Argos Translate.
 * No external translation API or API key is required.
 *
 * Usage:
 *   pnpm translate:setup
 *   pnpm translate:exercises:es                 # next 25 untranslated exercises
 *   pnpm translate:exercises:es -- --limit=100
 *   pnpm translate:exercises:es -- --all
 *   pnpm translate:exercises:es -- --limit=25 --dry-run
 *   pnpm translate:exercises:es -- --limit=25 --allow-machine
 *   pnpm translate:exercises:es -- --force --limit=25
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { localizeEquipment, localizeMuscleGroup } from '../src/lib/exercises/localization'

const DEFAULT_LIMIT = 25

type ExerciseRow = {
  id: string
  name: string
  description: string | null
  instructions: string | null
  muscle_groups: string[]
  equipment: string[]
  name_es: string | null
  external_id: string | null
}

type Translation = {
  id: string
  name_es: string
  description_es: string | null
  instructions_es: string | null
}

type ReviewedTranslation = Omit<Translation, 'id'>

function loadReviewedTranslations(): Record<string, ReviewedTranslation> {
  const path = join(process.cwd(), 'scripts', 'exercise-translations-es.reviewed.json')
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, ReviewedTranslation>
}

function parseLimit(): number | null {
  if (process.argv.includes('--all')) return null
  const argument = process.argv.find(value => value.startsWith('--limit='))
  if (!argument) return DEFAULT_LIMIT
  const value = Number.parseInt(argument.slice('--limit='.length), 10)
  if (!Number.isInteger(value) || value < 1 || value > 1_000) {
    throw new Error('--limit must be an integer between 1 and 1000')
  }
  return value
}

function translateWithArgos(rows: ExerciseRow[]): Promise<Translation[]> {
  const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
  const payload = rows.map(({ id, name, description, instructions }) => ({
    id,
    name,
    description,
    instructions,
  }))

  return new Promise((resolve, reject) => {
    const child = spawn(python, ['scripts/translate-exercises-argos.py'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    child.on('error', error => reject(new Error(`Could not start Python: ${error.message}`)))
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Argos translator exited with code ${code}`))
        return
      }
      try {
        const parsed = JSON.parse(stdout) as Translation[]
        if (!Array.isArray(parsed) || parsed.length !== rows.length) {
          throw new Error('Argos returned an incomplete translation batch')
        }
        const expectedIds = new Set(rows.map(row => row.id))
        if (parsed.some(item => !expectedIds.has(item.id) || !item.name_es?.trim())) {
          throw new Error('Argos returned invalid exercise ids or empty names')
        }
        resolve(parsed)
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Invalid Argos output'))
      }
    })

    child.stdin.end(JSON.stringify(payload))
  })
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const force = process.argv.includes('--force')
  const dryRun = process.argv.includes('--dry-run')
  const allowMachine = process.argv.includes('--allow-machine')
  const limit = parseLimit()
  const supabase = createClient(supabaseUrl, serviceKey)

  let query = supabase
    .from('exercises')
    .select('id, external_id, name, description, instructions, muscle_groups, equipment, name_es')
    .eq('is_public', true)
    .order('name')
  if (!force) query = query.is('name_es', null)
  if (limit !== null) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw new Error(`Cannot load exercises: ${error.message}`)
  const rows = (data ?? []) as ExerciseRow[]
  console.log(`Argos Spanish backfill: ${rows.length} exercise(s) selected`)
  if (rows.length === 0) return

  const reviewed = loadReviewedTranslations()
  const machineRows = rows.filter(row => !row.external_id || !reviewed[row.external_id])
  const machineTranslations = machineRows.length > 0
    ? await translateWithArgos(machineRows)
    : []
  const machineById = new Map(machineTranslations.map(translation => [translation.id, translation]))
  const translations = rows.map(row => {
    const approved = row.external_id ? reviewed[row.external_id] : null
    if (approved) return { id: row.id, ...approved }
    return machineById.get(row.id)!
  })
  console.log(`Sources: ${rows.length - machineRows.length} reviewed, ${machineRows.length} Argos`)
  if (dryRun || (machineRows.length > 0 && !allowMachine)) {
    console.log(JSON.stringify(translations, null, 2))
    console.log(
      dryRun
        ? 'Dry run: Supabase was not modified.'
        : 'Review required: unreviewed Argos translations were not saved. Use --allow-machine to accept them.',
    )
    return
  }

  const byId = new Map(rows.map(row => [row.id, row]))
  let completed = 0
  for (const translation of translations) {
    const source = byId.get(translation.id)!
    const { error: updateError } = await supabase
      .from('exercises')
      .update({
        name_es: translation.name_es.trim(),
        description_es: translation.description_es?.trim() || null,
        instructions_es: translation.instructions_es?.trim() || null,
        muscle_groups_es: source.muscle_groups.map(value => localizeMuscleGroup(value, 'es')),
        equipment_es: source.equipment.map(value => localizeEquipment(value, 'es')),
      })
      .eq('id', translation.id)
    if (updateError) throw new Error(`Cannot save ${source.name}: ${updateError.message}`)
    completed++
    console.log(`  ${completed}/${rows.length} ${source.name}`)
  }

  console.log('Batch complete. Run the same command again to translate the next exercises.')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
