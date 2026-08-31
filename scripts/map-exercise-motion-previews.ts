import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildMotionPreviewUpdatePlan,
  validateMotionPreviewMapping,
  type ExerciseMotionRow,
  type MotionPreviewUpdatePlan,
} from '../src/lib/exercises/motionPreviewMapping'
import {
  validateCatalogV1Manifest,
  type CatalogV1Manifest,
} from '../src/lib/exercises/visualCatalogV1'

type ExerciseMotionReadQuery = {
  in(column: 'id', values: string[]): Promise<{
    data: ExerciseMotionRow[] | null
    error: { message: string } | null
  }>
}

type ExerciseMotionReadClient = {
  from(table: 'exercises'): {
    select(columns: 'id, name, image_url, motion_preview_url'): ExerciseMotionReadQuery
  }
}

type MotionPreviewCliDependencies = {
  cwd?: string
  readFile?: (filePath: string) => Promise<string>
  createClient?: () => ExerciseMotionReadClient | Promise<ExerciseMotionReadClient>
  printTable?: (plans: MotionPreviewUpdatePlan[]) => void
  printJson?: (value: string) => void
}

function resolveLocalMappingPath(cwd: string, mappingArgument: string): string {
  const artifactsRoot = path.resolve(cwd, '.artifacts')
  const mappingPath = path.resolve(cwd, mappingArgument)
  const relativePath = path.relative(artifactsRoot, mappingPath)
  if (
    relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    throw new Error('mapping must be inside .artifacts')
  }
  return mappingPath
}

async function createSupabaseReadClient(): Promise<ExerciseMotionReadClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const { createClient } = await import('@supabase/supabase-js')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as ExerciseMotionReadClient
}

export async function runMotionPreviewMappingCli(
  args = process.argv.slice(2),
  dependencies: MotionPreviewCliDependencies = {},
): Promise<MotionPreviewUpdatePlan[]> {
  if (args.includes('--execute')) {
    throw new Error('--execute is intentionally unavailable in this phase')
  }

  const mappingFlagIndex = args.indexOf('--mapping')
  const mappingArgument = mappingFlagIndex === -1 ? undefined : args[mappingFlagIndex + 1]
  if (!mappingArgument || mappingArgument.startsWith('--')) {
    throw new Error('--mapping is required')
  }

  const cwd = dependencies.cwd ?? process.cwd()
  const mappingPath = resolveLocalMappingPath(cwd, mappingArgument)
  const manifestPath = path.resolve(cwd, 'public', 'exercises', 'catalog', 'v1', 'manifest.json')
  const readText = dependencies.readFile ?? ((filePath: string) => readFile(filePath, 'utf8'))

  const mappingValue: unknown = JSON.parse(await readText(mappingPath))
  validateMotionPreviewMapping(mappingValue)

  const manifestValue: unknown = JSON.parse(await readText(manifestPath))
  const manifestErrors = validateCatalogV1Manifest(manifestValue)
  if (manifestErrors.length > 0) {
    throw new Error(`invalid catalog V1 manifest:\n${manifestErrors.join('\n')}`)
  }

  const createClient = dependencies.createClient ?? createSupabaseReadClient
  const client = await createClient()
  const exerciseIds = Object.values(mappingValue)
  const { data, error } = await client
    .from('exercises')
    .select('id, name, image_url, motion_preview_url')
    .in('id', exerciseIds)
  if (error) throw new Error(`exercise motion preview read failed: ${error.message}`)

  const plans = buildMotionPreviewUpdatePlan({
    mapping: mappingValue,
    manifest: manifestValue as CatalogV1Manifest,
    rows: data ?? [],
  })
  const printTable = dependencies.printTable ?? console.table
  const printJson = dependencies.printJson ?? console.log
  printTable(plans)
  printJson(JSON.stringify(plans, null, 2))
  return plans
}

const executedPath = process.argv[1]
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) {
  void runMotionPreviewMappingCli().catch(error => {
    console.error(`Motion preview mapping failed: ${(error as Error).message}`)
    process.exitCode = 1
  })
}
