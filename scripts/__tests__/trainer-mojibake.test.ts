import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const trackedTrainerSources = [
  'src/app/(app)/coach',
  'src/app/(app)/coaching',
  'src/app/(app)/session/[workoutId]/SessionClient.tsx',
  'src/app/(app)/trainers',
  'src/app/actions/__tests__',
  'src/app/actions/coachingRelationships.ts',
  'src/app/actions/coachingRequests.ts',
  'src/app/actions/saveSession.ts',
  'src/app/actions/trainerAssignments.ts',
  'src/components/admin/TrainerReviewActions.tsx',
  'src/components/coaching',
  'src/lib/coaching',
  'supabase/migrations',
  'tests/e2e',
  'docs/operations',
  'scripts',
]

function filesUnder(path: string): string[] {
  const absolute = resolve(process.cwd(), path)
  if (!statSync(absolute).isDirectory()) return [absolute]
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(absolute, entry.name)
    return entry.isDirectory() ? filesUnder(child) : /\.(?:ts|tsx|sql|md|mjs)$/.test(entry.name) ? [child] : []
  })
}

describe('trainer release text encoding', () => {
  it('contains no common UTF-8 mojibake markers in trainer-owned source, SQL, E2E, or runbook text', () => {
    const affected = trackedTrainerSources.flatMap(filesUnder).flatMap(file =>
      readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) =>
        /[\u00c3\u00c2\u00e2]/.test(line) ? [`${file}:${index + 1}:${line}`] : [],
      ),
    )
    expect(affected).toEqual([])
  })

  it('contains no replacement question marks inside words in trainer-owned release text', () => {
    const affected = trackedTrainerSources.flatMap(filesUnder).flatMap(file =>
      readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line, index) => {
        const withoutUrls = line.replace(/(?:https?:\/\/|\/)[^\s'"`?]+\?[^\s'"`]+/g, '')
        return /[A-Za-zÀ-ÖØ-öø-ÿ]\?[A-Za-zÀ-ÖØ-öø-ÿ]/.test(withoutUrls) ? [`${file}:${index + 1}:${line}`] : []
      }),
    )
    expect(affected).toEqual([])
  })

  it('preserves the exact UTF-8 release strings used by UI, E2E selectors, and notifications', () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

    expect(read('src/components/coaching/ClientCoachingStatus.tsx')).toContain('Acompañamiento activo')
    expect(read('src/app/actions/coachingRelationships.ts')).toContain('No se pudo identificar el acompañamiento.')
    expect(read('supabase/migrations/042_trainer_relationships.sql')).toContain('Tu solicitud de acompañamiento fue aceptada.')
    expect(read('supabase/migrations/043_trainer_programming.sql')).toContain('Tu entrenador te envió una rutina para revisar.')
    for (const spec of ['tests/e2e/trainer-programming.spec.ts', 'tests/e2e/trainer-relationships.spec.ts']) {
      const source = read(spec)
      expect(source).toContain('Correo electrónico')
      expect(source).toContain('Contraseña')
      expect(source).toContain('Iniciar sesión')
    }
  })
})
