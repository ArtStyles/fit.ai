import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  validatePilotManifest,
  type PilotExerciseEntry,
  type PilotManifest,
} from '../src/lib/exercises/visualPilot'

function referencedAssets(entry: PilotExerciseEntry): string[] {
  return [entry.assets.source, entry.assets.poster, entry.assets.motionPreview].filter(
    (asset): asset is string => typeof asset === 'string',
  )
}

export async function validatePilotAssetFiles(
  manifest: PilotManifest,
  publicRoot: string,
): Promise<string[]> {
  const errors: string[] = []
  const resolvedPublicRoot = path.resolve(publicRoot)
  const publicPrefix = `${resolvedPublicRoot}${path.sep}`

  for (const entry of manifest.exercises) {
    for (const asset of referencedAssets(entry)) {
      const relativeAsset = asset.replace(/^[/\\]+/, '')
      const resolvedAsset = path.resolve(resolvedPublicRoot, relativeAsset)

      if (!resolvedAsset.startsWith(publicPrefix)) {
        errors.push(`asset escapes public root: ${asset}`)
        continue
      }

      try {
        const file = await stat(resolvedAsset)
        if (!file.isFile()) errors.push(`missing asset: ${asset}`)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          errors.push(`missing asset: ${asset}`)
          continue
        }
        throw error
      }
    }
  }

  return errors
}

async function main() {
  const manifestPath = path.resolve(process.cwd(), 'public', 'exercises', 'pilot', 'manifest.json')
  const publicRoot = path.resolve(process.cwd(), 'public')
  let value: unknown

  try {
    value = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    console.error(`Unable to read pilot manifest: ${(error as Error).message}`)
    process.exitCode = 1
    return
  }

  const errors = validatePilotManifest(value)
  if (errors.length === 0) {
    errors.push(...await validatePilotAssetFiles(value as PilotManifest, publicRoot))
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(error)
    process.exitCode = 1
    return
  }

  const manifest = value as PilotManifest
  console.log(`Exercise visual pilot is valid (${manifest.exercises.length} exercises).`)
}

const executedPath = process.argv[1]
if (executedPath && import.meta.url === pathToFileURL(executedPath).href) {
  void main()
}
