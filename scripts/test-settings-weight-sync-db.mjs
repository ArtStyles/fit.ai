import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.SETTINGS_WEIGHT_DB_IMAGE
  ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-settings-weight-${process.pid}-${Date.now().toString(36)}`
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '048_profile_weight_measurement_sync.sql')
const testPath = path.join(repoRoot, 'supabase', 'tests', '048_profile_weight_measurement_sync_test.sql')

const bootstrapSql = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg NUMERIC(5,1)
);

CREATE TABLE public.measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_kg NUMERIC(5,1),
  notes TEXT
);

INSERT INTO auth.users (id, email)
VALUES ('10000000-0000-4000-8000-000000000002', 'no-history@example.test');

INSERT INTO public.profiles (id, weight_kg)
VALUES ('10000000-0000-4000-8000-000000000002', 72);
`

function docker(args, { input, print = true } = {}) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 10 * 1024 * 1024,
  })

  if (print) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.error) throw result.error
  return result
}

function runPsql(sql, label) {
  process.stdout.write(`\n[settings-weight-db] ${label}\n`)
  const result = docker([
    'exec', '-i', container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], { input: sql })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function waitForDatabase() {
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker([
        'inspect', container,
        '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}',
      ], { print: false })
      return result.status === 0 ? result.stdout.trim() || 'unknown' : `inspect-error-${result.status}`
    },
    probeFinalDatabase: () => {
      const result = docker([
        'exec', container,
        'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
        '-c', "SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL THEN 'ready' ELSE 'missing auth.users' END",
      ], { print: false })
      const output = result.stdout.trim()
      return result.status === 0 && output === 'ready'
        ? { ok: true, diagnostic: 'auth.users ready' }
        : { ok: false, diagnostic: result.stderr.trim() || output || `psql exit ${result.status}` }
    },
    wait: milliseconds => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
    },
  })
}

let started = false

try {
  process.stdout.write(`[settings-weight-db] starting isolated ${container}\n`)
  const start = docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', image,
  ])
  if (start.status !== 0) throw new Error(`docker run failed with exit code ${start.status}`)
  started = true

  const readiness = waitForDatabase()
  process.stdout.write(
    `[settings-weight-db] final database ready (${readiness.health}; ${readiness.diagnostic})\n`,
  )
  runPsql(bootstrapSql, 'applying minimal bootstrap')
  runPsql(readFileSync(migrationPath, 'utf8'), 'applying migration 048')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running pgTAP suite')
  if (/^\s*not ok\b/m.test(tapOutput) || /# Looks like you (?:failed|planned)\b/.test(tapOutput)) {
    throw new Error('pgTAP reported one or more failed assertions')
  }
  process.stdout.write('\n[settings-weight-db] PASS: all pgTAP assertions passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    process.stdout.write(cleanup.status === 0
      ? `[settings-weight-db] removed isolated ${container}\n`
      : `[settings-weight-db] warning: failed to remove ${container}\n`)
  }
}
