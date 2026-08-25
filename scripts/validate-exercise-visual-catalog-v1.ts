import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  validateCatalogV1Manifest,
  type CatalogV1ExerciseEntry,
  type CatalogV1Manifest,
} from '../src/lib/exercises/visualCatalogV1'

const POSTER_MAX_BYTES = 102400

function resolveWithin(root: string, assetPath: string): string | null {
  const resolvedRoot = path.resolve(root)
  const resolvedAsset = path.resolve(resolvedRoot, assetPath.replace(/^[/\\]+/, ''))
  const relative = path.relative(resolvedRoot, resolvedAsset)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    ? resolvedAsset
    : null
}

async function fileDigest(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function requiresAssets(entry: CatalogV1ExerciseEntry, complete: boolean): boolean {
  return complete || entry.status === 'visual-approved'
}

export async function validateCatalogV1AssetFiles(
  manifest: CatalogV1Manifest,
  publicRoot: string,
  artifactsRoot: string,
  options: { complete?: boolean } = {},
): Promise<string[]> {
  const errors: string[] = []
  const complete = options.complete === true

  for (const entry of manifest.exercises) {
    if (!requiresAssets(entry, complete)) continue
    const { assets, slug } = entry
    const posterPath = resolveWithin(publicRoot, assets.poster)

    if (!posterPath) {
      errors.push(`poster path escapes public root: ${slug}`)
    } else if (!await isFile(posterPath)) {
      errors.push(`missing poster: ${slug}`)
    } else {
      const poster = await stat(posterPath)
      if (poster.size > POSTER_MAX_BYTES) errors.push(`poster exceeds ${POSTER_MAX_BYTES} bytes: ${slug}`)
      if (assets.posterSha256 && await fileDigest(posterPath) !== assets.posterSha256) {
        errors.push(`poster digest mismatch: ${slug}`)
      }
    }

    if (!assets.sourceObjectKey) {
      errors.push(`missing source metadata: ${slug}`)
      continue
    }
    const sourcePath = resolveWithin(artifactsRoot, assets.sourceObjectKey)
    if (!sourcePath) {
      errors.push(`source path escapes artifacts root: ${slug}`)
    } else if (!await isFile(sourcePath)) {
      errors.push(`missing source: ${slug}`)
    } else if (assets.sourceSha256 && await fileDigest(sourcePath) !== assets.sourceSha256) {
      errors.push(`source digest mismatch: ${slug}`)
    }
  }

  return errors
}

async function main() {
  const root = process.cwd()
  const manifestPath = path.resolve(root, 'public', 'exercises', 'catalog', 'v1', 'manifest.json')
  let value: unknown
  try {
    value = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    console.error(`Unable to read catalog V1 manifest: ${(error as Error).message}`)
    process.exitCode = 1
    return
  }

  const errors = validateCatalogV1Manifest(value)
  if (errors.length === 0) {
    errors.push(...await validateCatalogV1AssetFiles(
      value as CatalogV1Manifest,
      path.resolve(root, 'public'),
      path.resolve(root, '.artifacts', 'exercises', 'catalog-v1'),
      { complete: process.argv.includes('--complete') },
    ))
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }
  console.log(`Catalog V1 filesystem validation is valid (${(value as CatalogV1Manifest).exercises.length} exercises).`)
}

const executedPath = process.argv[1]
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) {
  void main()
}
