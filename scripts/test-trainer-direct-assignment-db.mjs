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

function openSql(input, { hold = false } = {}) {
  const child = spawn('docker', sqlArgs, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
  const state = { stdout: '', stderr: '' }
  const done = new Promise((resolve, reject) => {
    child.stdout.on('data', data => { state.stdout += data })
    child.stderr.on('data', data => { state.stderr += data })
    child.on('error', reject)
    child.on('close', status => resolve({ status, ...state }))
  })
  if (hold) child.stdin.write(input)
  else child.stdin.end(input)
  return { state, done, release: () => child.stdin.end('COMMIT;\n') }
}

async function waitForDatabaseGate(predicate, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function removalRelationshipRace(prefix, operation) {
  const fixture = phases.fixtures.replaceAll('59000000', prefix)
    .replaceAll('single-pending', `removal-${operation}`)
    .replaceAll('@example.test', `+${operation}@example.test`)
  check(sql(fixture), `Create ${operation} race fixtures`)
  const trainer = `${prefix}-0000-4000-8000-000000000001`
  const client = `${prefix}-0000-4000-8000-000000000002`
  const relationship = `${prefix}-0000-4000-8000-000000000041`
  const authenticate = id => `SET SESSION AUTHORIZATION authenticator; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${id}',true); SELECT set_config('request.jwt.claim.role','authenticated',true);`
  const setup = sql(`BEGIN; ${authenticate(trainer)}
    SELECT assignment_id AS aid,workout_plan_id AS pid FROM assign_trainer_program('${relationship}','${prefix}-0000-4000-8000-000000000061',NULL,'removal-${operation}') \\gset
    SELECT set_config('request.jwt.claim.sub','${client}',true);
    SELECT activate_plan_version(:'pid'); SELECT 'RESULT:'||:'aid'||','||:'pid'; COMMIT;`)
  check(setup, `Assign and select ${operation} fixture`)
  const match = setup.stdout.match(/RESULT:([0-9a-f-]+),([0-9a-f-]+)/)
  if (!match) throw new Error('Race fixture did not return assignment and plan')
  const [, assignment, plan] = match
  // An independent transaction gates the assignment row. The real removal RPC
  // blocks there first; end/revoke then blocks under its real lock protocol.
  // Releasing this gate deadlocks the old assignment-before-relationship flow.
  const gate = openSql(`BEGIN; SELECT id FROM trainer_plan_assignments WHERE id='${assignment}' FOR UPDATE; SELECT 'ASSIGNMENT_GATE_HELD';\n`, { hold: true })
  let removal; let transition
  try {
    await waitForDatabaseGate(() => gate.state.stdout.includes('ASSIGNMENT_GATE_HELD'), 'assignment gate')
    const removingName = `removal-${operation}-${process.pid}`
    const endingName = `transition-${operation}-${process.pid}`
    removal = openSql(`BEGIN; SET application_name='${removingName}'; SET deadlock_timeout='200ms'; SET statement_timeout='15s'; ${authenticate(client)} SELECT remove_trainer_assignment('${plan}'); COMMIT;`)
    const isWaiting = name => {
      const result = sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND wait_event_type='Lock';`)
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout.trim() === '1'
    }
    await waitForDatabaseGate(() => isWaiting(removingName), 'removal blocked by assignment gate')
    const call = operation === 'end'
      ? `end_coaching_relationship('${relationship}',NULL,'${prefix}-0000-4000-8000-000000000099')`
      : `revoke_training_profile_consent('${relationship}','${prefix}-0000-4000-8000-000000000099')`
    transition = openSql(`BEGIN; SET application_name='${endingName}'; SET deadlock_timeout='200ms'; SET statement_timeout='15s'; ${authenticate(client)} SELECT * FROM ${call}; COMMIT;`)
    await waitForDatabaseGate(() => isWaiting(endingName), `${operation} blocked during removal`)
  } finally {
    gate.release()
    const results = await Promise.allSettled([gate.done, removal?.done, transition?.done].filter(Boolean))
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') throw result.reason
      check(result.value, `${operation} lifecycle race connection ${index + 1}`)
    }
  }
  check(sql(phases.lifecycle_race_verify.replaceAll('RACE_PREFIX', prefix)), `${operation} leaves cancellation and consent coherent`, { tap: true })
}

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
  const personalBoundarySql = `SELECT jsonb_agg(jsonb_build_array(oid::regprocedure::text,
    proowner::regrole::text,prosecdef,proconfig,proacl::text,pronargdefaults) ORDER BY proname)
    FROM pg_proc WHERE oid IN ('public.create_manual_plan_atomic(jsonb,jsonb,boolean)'::regprocedure,
    'public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb)'::regprocedure);`
  const personalBoundaryBefore = sql(personalBoundarySql)
  check(personalBoundaryBefore, 'Capture original personal RPC ownership, invoker mode, search path, ACL and defaults')
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
    const personalBoundaryAfter = sql(personalBoundarySql)
    check(personalBoundaryAfter, 'Read migrated personal RPC boundaries')
    if (personalBoundaryBefore.stdout !== personalBoundaryAfter.stdout) throw new Error('Personal RPC migration changed original ownership, invoker mode, search path, ACL or defaults')
    console.log('Personal creation preserves exact original RPC boundaries: OK')
    const personalFixtures = phases.fixtures.replaceAll('59000000', '59400000')
      .replaceAll('single-pending', 'personal-creation').replaceAll('@example.test', '+personal@example.test')
    check(sql(phases.personal_creation.replace('-- PERSONAL_FIXTURES', personalFixtures)), 'Independent personal creation under API role', { tap: true })
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
    await removalRelationshipRace('59200000', 'end')
    await removalRelationshipRace('59300000', 'revoke')
    check(sql(phases.cleanup), 'Fixture cleanup preserves unrelated histories', { tap: true })
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  const removed = run(['rm', '--force', container])
  if (removed.status !== 0) console.error(`Container cleanup failed: ${removed.stderr}`)
  else console.log('Removed disposable PostgreSQL container')
}
