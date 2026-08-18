import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'
import { parsePsqlScalar } from './settings-weight-db-utils.mjs'

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
  weight_kg NUMERIC(5,1),
  onboarding_done BOOLEAN NOT NULL DEFAULT FALSE
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

INSERT INTO public.profiles (id, weight_kg, onboarding_done)
VALUES ('10000000-0000-4000-8000-000000000002', 72, TRUE);
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

function runPsqlScalar(sql, label) {
  const result = docker([
    'exec', '-i', container,
    'psql', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], { input: sql })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  return parsePsqlScalar(result.stdout ?? '', label)
}

function startPsqlSession(applicationName) {
  const child = spawn('docker', [
    'exec', '-i', '--env', `PGAPPNAME=${applicationName}`, container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })

  const completion = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', status => resolve({ status, stdout, stderr }))
  })

  return {
    write: sql => child.stdin.write(sql),
    completion,
  }
}

async function finishPsqlSession(session, label) {
  const result = await session.completion
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
}

function waitForSession(applicationName, predicate, label) {
  const timeoutMs = 10_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const result = docker([
      'exec', container,
      'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
      '-c', `SELECT state || ':' || COALESCE(wait_event_type, 'none')
        FROM pg_stat_activity
       WHERE application_name = '${applicationName}'`,
    ], { print: false })
    const state = result.status === 0 ? result.stdout.trim() : ''
    if (predicate(state)) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
  }

  throw new Error(`${label} did not reach its expected database state within ${timeoutMs}ms`)
}

async function verifyConcurrentWeightSync() {
  const userId = '10000000-0000-4000-8000-000000000004'
  const newerId = '20000000-0000-4000-8000-000000000004'
  const olderId = '20000000-0000-4000-8000-000000000005'
  const newerApp = 'settings-weight-concurrent-newer'
  const olderApp = 'settings-weight-concurrent-older'

  runPsql(`
    INSERT INTO auth.users (id, email)
    VALUES ('${userId}', 'concurrent-weight@example.test');
    INSERT INTO public.profiles (id, onboarding_done)
    VALUES ('${userId}', TRUE);
  `, 'creating concurrent weight fixture')

  const newer = startPsqlSession(newerApp)
  newer.write(`BEGIN;
    INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
    VALUES ('${newerId}', '${userId}', '2026-08-04T12:00:00Z', 82);
  `)
  waitForSession(newerApp, state => state.startsWith('idle in transaction:'), 'newer transaction')

  const older = startPsqlSession(olderApp)
  older.write(`BEGIN;
    INSERT INTO public.measurements (id, user_id, recorded_at, weight_kg)
    VALUES ('${olderId}', '${userId}', '2026-08-03T12:00:00Z', 79);
    COMMIT;
    \\q
  `)
  waitForSession(olderApp, state => state === 'active:Lock', 'older transaction waiting on the profile lock')

  newer.write('COMMIT;\n\\q\n')
  await finishPsqlSession(newer, 'newer transaction')
  await finishPsqlSession(older, 'older transaction')

  const result = runPsqlScalar(`
    SELECT CASE WHEN weight_kg = 82 THEN 'ok' ELSE COALESCE(weight_kg::text, 'NULL') END
      FROM public.profiles
     WHERE id = '${userId}';
  `, 'checking concurrent weight result')
  if (result !== 'ok') {
    throw new Error(`concurrent inserts left profile at ${result}, expected 82`)
  }
  process.stdout.write('[settings-weight-db] concurrent newer measurement remained current\n')
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
  await verifyConcurrentWeightSync()
  process.stdout.write('\n[settings-weight-db] PASS: all pgTAP assertions passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    if (cleanup.status !== 0) {
      throw new Error(`failed to remove isolated ${container}`)
    }
    process.stdout.write(`[settings-weight-db] removed isolated ${container}\n`)
  }
}
