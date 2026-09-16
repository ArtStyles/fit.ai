import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// No URL argument or environment override: all writes use this disposable local container.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = `vekira-account-deletion-${process.pid}`
const run = (args, input) => spawnSync('docker', args, { input, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024 })
const sql = input => run(['exec', '-i', '--env', 'PGPASSWORD=postgres', container, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], input)
function check(result, label, tap = false) {
  const output = result.stdout ?? ''
  const plans = [...output.matchAll(/^1\.\.(\d+)\s*$/gm)]
  const count = output.split('\n').filter(line => /^(?:ok|not ok) \d+\b/.test(line)).length
  if (result.error || result.status !== 0 || /^(not ok|Bail out!|# Looks like)/m.test(output)
    || (tap && (plans.length !== 1 || count === 0 || Number(plans[0][1]) !== count))) throw new Error(`${label}\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`)
  console.log(`${label}: OK`)
  for (const line of result.stdout.split('\n').filter(line => /^(ok |1\.\.)/.test(line))) console.log(line)
}
try {
  check(run(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', 'public.ecr.aws/supabase/postgres:17.6.1.121']), 'Start disposable PostgreSQL')
  let ready = false
  for (let attempt = 0; attempt < 55; attempt++) {
    if (run(['inspect', container, '--format', '{{.State.Health.Status}}']).stdout.trim() === 'healthy') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Disposable database did not become healthy')
  check(sql('CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); ALTER TABLE storage.buckets OWNER TO postgres; CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL DEFAULT \'\', owner_id text, metadata jsonb); ALTER TABLE storage.objects OWNER TO postgres; ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;'), 'Storage bootstrap')
  const dir = path.join(root, 'infra/supabase/migrations')
  const target = '20260916010000_verified_account_deletion.sql'
  for (const migration of readdirSync(dir).filter(name => name.endsWith('.sql') && name < target).sort()) check(sql(`SET ROLE postgres;\n${readFileSync(path.join(dir, migration), 'utf8')}`), `Apply ${migration}`)
  const fixtures = readFileSync(path.join(root, 'supabase/tests/trainer_direct_assignment_test.sql'), 'utf8').split('-- phase: fixtures')[1].split('-- phase: personal_creation')[0]
  check(sql(fixtures), 'Create real professional multi-client fixture')
  const phases = Object.fromEntries(readFileSync(path.join(root, 'supabase/tests/account_deletion_test.sql'), 'utf8').split(/^-- phase: /m).slice(1).map(section => { const end = section.indexOf('\n'); return [section.slice(0, end).trim(), section.slice(end + 1)] }))
  check(sql(phases.seed), 'Create assignments using actual authenticated RPC')
  for (const id of ['002', '001']) {
    const red = sql(`BEGIN; SET SESSION AUTHORIZATION supabase_auth_admin; DELETE FROM auth.users WHERE id='59000000-0000-4000-8000-000000000${id}'; COMMIT;`)
    if (red.status === 0 || !/violates foreign key constraint|TRAINER_PRESCRIPTION_LOCKED/.test(red.stderr)) throw new Error(`Expected deletion blocker absent: ${red.stdout}\n${red.stderr}`)
    console.log(`RED: ${id === '002' ? 'client' : 'trainer'} Auth deletion blocked by existing FK/locked prescription`)
  }
  if (!process.argv.includes('--red-only')) {
    check(sql(`SET ROLE postgres;\n${readFileSync(path.join(dir, target), 'utf8')}`), `Apply ${target}`)
    check(sql(phases.test), 'Account deletion security, isolation, rollback and history', true)
  }
} finally {
  check(run(['rm', '-f', container]), 'Remove only disposable account-deletion container')
}
