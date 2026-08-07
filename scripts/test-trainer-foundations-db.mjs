import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.TRAINER_FOUNDATIONS_DB_IMAGE
  ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-trainer-foundations-db-${process.pid}-${Date.now().toString(36)}`
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '040_trainer_foundations.sql')
const testPath = path.join(repoRoot, 'supabase', 'tests', '040_trainer_foundations_test.sql')

const bootstrapSql = `
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.social_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE public.social_notification_preferences (
  user_id UUID PRIMARY KEY
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'trainer-foundation-existing@example.test',
  '{}'::JSONB
);

INSERT INTO public.profiles (id)
VALUES ('33333333-3333-4333-8333-333333333333');
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
  process.stdout.write(`\n[trainer-db] ${label}\n`)
  const result = docker([
    'exec', '-i', container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
  ], { input: sql })

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }

  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function waitForDatabase() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const result = docker([
      'exec', container,
      'pg_isready', '-U', 'postgres', '-d', 'postgres',
    ], { print: false })

    if (result.status === 0) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }

  throw new Error('isolated PostgreSQL container did not become ready within 90 seconds')
}

let started = false

try {
  process.stdout.write(`[trainer-db] starting isolated ${container}\n`)
  const start = docker([
    'run', '--detach', '--rm',
    '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres',
    image,
  ])
  if (start.status !== 0) throw new Error(`docker run failed with exit code ${start.status}`)
  started = true

  waitForDatabase()
  runPsql(bootstrapSql, 'applying minimal historical bootstrap')
  runPsql(readFileSync(migrationPath, 'utf8'), 'applying migration 040')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running 040 pgTAP behavior suite')

  if (/^not ok\b/m.test(tapOutput) || /# Looks like you failed\b/.test(tapOutput)) {
    throw new Error('pgTAP reported one or more failed assertions')
  }

  process.stdout.write('\n[trainer-db] PASS: all pgTAP assertions passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    if (cleanup.status !== 0) {
      process.stderr.write(`[trainer-db] warning: failed to remove ${container}\n`)
    } else {
      process.stdout.write(`[trainer-db] removed isolated ${container}\n`)
    }
  }
}
