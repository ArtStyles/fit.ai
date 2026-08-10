import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const LEGACY_OWNER_POLICIES = [
  ['profiles', 'profiles: own row'],
  ['workout_plans', 'workout_plans: own'],
  ['workouts', 'workouts: own'],
  ['workout_exercises', 'workout_exercises: own'],
  ['progress_logs', 'progress_logs: own'],
  ['exercise_logs', 'exercise_logs: own'],
  ['measurements', 'measurements: own'],
]

// This digest deliberately pins the exact production statements extracted from
// migration 001. A historical policy edit must trigger an explicit review here
// instead of silently changing the authorization harness.
export const LEGACY_OWNER_BOUNDARY_SHA256 = '68859075f6015193483c6a23b443e328fe46465774d1cd919bbcbd15c56cdfcc'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exactStatement(source, pattern, label) {
  const matches = Array.from(source.matchAll(pattern))
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one production ${label}; found ${matches.length}`)
  }
  return matches[0][0].replace(/\r\n/g, '\n').trim()
}

export function loadLegacyOwnerBoundary(repoRoot) {
  const sourcePath = path.join(repoRoot, 'supabase', 'migrations', '001_initial_schema.sql')
  const source = readFileSync(sourcePath, 'utf8')
  const statements = []

  for (const [table, policyName] of LEGACY_OWNER_POLICIES) {
    statements.push(exactStatement(
      source,
      new RegExp(`ALTER TABLE\\s+${escapeRegExp(table)}\\s+ENABLE ROW LEVEL SECURITY\\s*;`, 'g'),
      `${table} RLS enable statement`,
    ))
    statements.push(exactStatement(
      source,
      new RegExp(`CREATE POLICY "${escapeRegExp(policyName)}" ON ${escapeRegExp(table)}[\\s\\S]*?;`, 'g'),
      `${policyName} policy`,
    ))
  }

  const sql = `${statements.join('\n')}\n`
  const sha256 = createHash('sha256').update(sql, 'utf8').digest('hex')
  if (sha256 !== LEGACY_OWNER_BOUNDARY_SHA256) {
    throw new Error(`Legacy owner boundary digest mismatch: expected ${LEGACY_OWNER_BOUNDARY_SHA256}, received ${sha256}`)
  }

  return {
    policyNames: LEGACY_OWNER_POLICIES.map(([, policyName]) => policyName),
    sourcePath,
    sha256,
    sql,
  }
}
