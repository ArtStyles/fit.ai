import { readFileSync, readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Deliberately accepts no connection string: every write targets this disposable
// local container, never the linked project or a developer's existing database.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = `vekira-direct-assignment-${process.pid}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.121'
const run = (args, input) => spawnSync('docker', args, {
  input, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024,
})
const sqlArgs = ['exec', '-i', '--env', 'PGPASSWORD=postgres', container, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres']
const sql = input => run(sqlArgs, input)
function check(result, label, { tap = false } = {}) {
  const output = result.stdout ?? ''
  const plans = [...output.matchAll(/^1\.\.(\d+)(?:\s.*)?$/gm)]
  const testCount = output.split('\n').filter(line => /^(?:ok|not ok) \d+\b/.test(line)).length
  const invalidPlan = tap && (plans.length !== 1 || Number(plans[0]?.[1]) !== testCount || testCount === 0)
  if (result.error || result.status !== 0 || invalidPlan
    || /^(?:not ok\b|Bail out!|# Looks like|# No tests run)/m.test(output)) {
    throw new Error(`${label}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`)
  }
  const assertions = result.stdout.split('\n').filter(line => /^(ok |1\.\.)/.test(line))
  console.log(`${label}: OK${assertions.length ? `\n${assertions.join('\n')}` : ''}`)
}
const phases = Object.fromEntries(readFileSync(path.join(root, 'supabase/tests/trainer_direct_assignment_test.sql'), 'utf8')
  .split(/^-- phase: /m).slice(1).map(section => {
    const end = section.indexOf('\n')
    return [section.slice(0, end).trim(), section.slice(end + 1)]
  }))
const race = input => new Promise((resolve, reject) => {
  const child = spawn('docker', sqlArgs, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  child.on('error', reject)
  child.on('close', status => resolve({ status, stdout, stderr }))
  child.stdin.end(input)
})

try {
  check(run(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', image]), 'Start disposable PostgreSQL')
  let ready = false
  for (let attempt = 0; attempt < 55; attempt++) {
    if (run(['inspect', container, '--format', '{{.State.Health.Status}}']).stdout.trim() === 'healthy') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Disposable database did not become healthy')
  check(sql('CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); ALTER TABLE storage.buckets OWNER TO postgres;'), 'Bootstrap baseline storage dependency')
  const migrationDirectory = path.join(root, 'infra/supabase/migrations')
  const migrations = readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()
  const baseline = migrations.find(name => name.endsWith('_remote_schema_baseline.sql'))
  check(sql(`SET ROLE postgres;\n${readFileSync(path.join(migrationDirectory, baseline), 'utf8')}`), 'Load active baseline with postgres ownership')
  check(sql(phases.fixtures), 'Create fictional fixtures')
  const red = sql(phases.baseline)
  if (red.status === 0 || !red.stderr.includes('PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN')) {
    throw new Error(`Expected baseline API role regression was not reproduced:\n${red.stdout}\n${red.stderr}`)
  }
  console.log('RED: authenticator/authenticated reproduces PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN')
  if (process.argv.includes('--red-only')) process.exitCode = 0
  else {
    check(sql(phases.legacy), 'Seed existing pending proposals under administrative baseline connection')
    for (const migration of migrations.filter(name => name > baseline)) {
      check(sql(`SET ROLE postgres;\n${readFileSync(path.join(migrationDirectory, migration), 'utf8')}`), `Apply ${migration}`)
    }
    check(sql(phases.behavior), 'API role lifecycle assertions', { tap: true })
    check(sql(phases.permissions), 'Participant and permission boundaries', { tap: true })
    check(sql(phases.selection), 'Selection periods and historical adherence', { tap: true })
    const results = await Promise.all([race(phases.race.replaceAll('RACE_KEY', 'race-a')), race(phases.race.replaceAll('RACE_KEY', 'race-b'))])
    results.forEach((result, index) => check(result, `Concurrent assignment request ${index + 1}`))
    check(sql(phases.race_verify), 'Concurrent retained-template deduplication', { tap: true })
    const fingerprint = `SELECT md5(jsonb_build_array(
      (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_plan_assignments row),
      (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_assignment_versions row),
      (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.workout_plans row),
      (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM private.trainer_plan_selection_periods row),
      (SELECT jsonb_agg(to_jsonb(row) ORDER BY row.idempotency_key) FROM private.trainer_assignment_requests row)
    )::text);`
    const beforeRerun = sql(fingerprint)
    check(beforeRerun, 'Capture library and selection history fingerprint')
    for (const migration of migrations.filter(name => name.endsWith('_trainer_direct_assignment.sql'))) {
      check(sql(`SET ROLE postgres;\n${readFileSync(path.join(migrationDirectory, migration), 'utf8')}`), 'Rerun forward migration with retained and removed history')
    }
    const afterRerun = sql(fingerprint)
    check(afterRerun, 'Capture fingerprint after migration rerun')
    if (beforeRerun.stdout !== afterRerun.stdout) throw new Error('Migration rerun changed library or selection history')
    console.log('Migration rerun preserves exact library, request and selection rows: OK')
    check(sql(phases.rerun_verify), 'Migration rerun preserves data and history', { tap: true })
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  const removed = run(['rm', '--force', container])
  if (removed.status !== 0) console.error(`Container cleanup failed: ${removed.stderr}`)
  else console.log('Removed disposable PostgreSQL container')
}
