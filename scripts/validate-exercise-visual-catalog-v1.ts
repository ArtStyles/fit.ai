import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  validateCatalogV1Manifest,
  type CatalogV1ExerciseEntry,
  type CatalogV1Manifest,
} from '../src/lib/exercises/visualCatalogV1'

const POSTER_MAX_BYTES = 102400
type FileInspection = { kind: 'missing' } | { kind: 'non-regular' } | { kind: 'file', size: number }

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function resolveWithin(root: string, assetPath: string): Promise<string | null> {
  const resolvedRoot = path.resolve(root)
  const resolvedAsset = path.resolve(resolvedRoot, assetPath.replace(/^[/\\]+/, ''))
  if (!isWithin(resolvedRoot, resolvedAsset)) return null

  try {
    const [canonicalRoot, canonicalAsset] = await Promise.all([realpath(resolvedRoot), realpath(resolvedAsset)])
    return isWithin(canonicalRoot, canonicalAsset) ? canonicalAsset : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolvedAsset
    throw error
  }
}

async function fileDigest(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

async function inspectFile(filePath: string): Promise<FileInspection> {
  try {
    const file = await stat(filePath)
    return file.isFile() ? { kind: 'file', size: file.size } : { kind: 'non-regular' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' }
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
    if (!assets.posterSha256) errors.push(`missing poster digest: ${slug}`)
    if (!assets.sourceSha256) errors.push(`missing source digest: ${slug}`)

    const posterPath = await resolveWithin(publicRoot, assets.poster)

    if (!posterPath) {
      errors.push(`poster path escapes public root: ${slug}`)
    } else {
      const poster = await inspectFile(posterPath)
      if (poster.kind === 'missing') errors.push(`missing poster: ${slug}`)
      else if (poster.kind === 'non-regular') errors.push(`poster is not a regular file: ${slug}`)
      else if (poster.size > POSTER_MAX_BYTES) errors.push(`poster exceeds ${POSTER_MAX_BYTES} bytes: ${slug}`)
      if (poster.kind === 'file' && assets.posterSha256 && await fileDigest(posterPath) !== assets.posterSha256) {
        errors.push(`poster digest mismatch: ${slug}`)
      }
    }

    if (!assets.sourceObjectKey) {
      errors.push(`missing source metadata: ${slug}`)
    }
    const sourcePath = await resolveWithin(artifactsRoot, path.join(slug, 'source.png'))
    if (!sourcePath) {
      errors.push(`source path escapes artifacts root: ${slug}`)
    } else {
      const source = await inspectFile(sourcePath)
      if (source.kind === 'missing') errors.push(`missing source: ${slug}`)
      else if (source.kind === 'non-regular') errors.push(`source is not a regular file: ${slug}`)
      else if (assets.sourceSha256 && await fileDigest(sourcePath) !== assets.sourceSha256) {
        errors.push(`source digest mismatch: ${slug}`)
      }
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
