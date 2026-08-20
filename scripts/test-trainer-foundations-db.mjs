import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.TRAINER_FOUNDATIONS_DB_IMAGE
  ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-trainer-foundations-db-${process.pid}-${Date.now().toString(36)}`
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '040_trainer_foundations.sql')
const testPath = path.join(repoRoot, 'supabase', 'tests', '040_trainer_foundations_test.sql')
const preferenceInsertMigrationPath = path.join(
  repoRoot, 'supabase', 'migrations', '047_product_notification_preferences_insert.sql',
)
const preferenceInsertTestPath = path.join(
  repoRoot, 'supabase', 'tests', '047_product_notification_preferences_insert_test.sql',
)
const attentionDismissalTestPath = path.join(
  repoRoot, 'supabase', 'tests', '052_notification_attention_dismissals_test.sql',
)
const attentionDismissalMigrationPath = path.join(
  repoRoot, 'supabase', 'migrations', '052_notification_attention_dismissals.sql',
)

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
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker([
        'inspect', container,
        '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}',
      ], { print: false })

      if (result.status !== 0) {
        return `inspect-error-${result.status}`
      }
      return result.stdout.trim() || 'unknown'
    },
    probeFinalDatabase: () => {
      const result = docker([
        'exec', container,
        'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
        '-c', `SELECT CASE WHEN
          to_regclass('auth.users') IS NOT NULL
          AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) = 3
          THEN 'ready' ELSE 'missing auth.users or API roles' END`,
      ], { print: false })
      const output = result.stdout.trim()

      if (result.status === 0 && output === 'ready') {
        return { ok: true, diagnostic: 'auth.users and API roles ready' }
      }

      const error = result.stderr.trim() || output || `psql exit ${result.status}`
      return { ok: false, diagnostic: error }
    },
    wait: milliseconds => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
    },
  })
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

  const readiness = waitForDatabase()
  process.stdout.write(
    `[trainer-db] final database ready (${readiness.health}; ${readiness.diagnostic})\n`,
  )
  runPsql(bootstrapSql, 'applying minimal historical bootstrap')
  runPsql(readFileSync(migrationPath, 'utf8'), 'applying migration 040')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running 040 pgTAP behavior suite')

  if (/^not ok\b/m.test(tapOutput) || /# Looks like you failed\b/.test(tapOutput)) {
    throw new Error('pgTAP reported one or more failed assertions')
  }

  runPsql(readFileSync(preferenceInsertMigrationPath, 'utf8'), 'applying migration 047')
  const preferenceInsertTap = runPsql(
    readFileSync(preferenceInsertTestPath, 'utf8'),
    'running 047 preference-insert pgTAP suite',
  )
  if (/^not ok\b/m.test(preferenceInsertTap) || /# Looks like you failed\b/.test(preferenceInsertTap)) {
    throw new Error('migration 047 pgTAP reported one or more failed assertions')
  }

  runPsql(readFileSync(attentionDismissalMigrationPath, 'utf8'), 'applying migration 052')
  runPsql(readFileSync(attentionDismissalMigrationPath, 'utf8'), 'reapplying migration 052')
  const attentionDismissalTap = runPsql(
    readFileSync(attentionDismissalTestPath, 'utf8'),
    'running 052 attention-dismissal pgTAP suite',
  )
  if (/^not ok\b/m.test(attentionDismissalTap) || /# Looks like you failed\b/.test(attentionDismissalTap)) {
    throw new Error('migration 052 pgTAP reported one or more failed assertions')
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
