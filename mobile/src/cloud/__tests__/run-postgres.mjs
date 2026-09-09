/** Opt-in real PostgreSQL contracts. Starts only its own isolated, unexposed container. */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const container = `vekira-mobile-contract-${process.pid}-${Date.now()}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const run = (args, input) => execFileSync('docker', args, { encoding: 'utf8', input, timeout: 120000, maxBuffer: 8 * 1024 * 1024 })
const sql = (database, source) => run(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'], source)
const file = name => readFileSync(join(root, 'mobile/src/cloud/__tests__', name), 'utf8')
try {
  run(['image', 'inspect', image]) // Do not silently pull a database image or touch another container.
  run(['run', '--name', container, '--detach', '--env', 'POSTGRES_PASSWORD=mobile-local-contract-only', image])
  let ready = false
  for (let n = 0; n < 90; n++) {
    try { run(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break } catch { await new Promise(r => setTimeout(r, 1000)) }
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.')
  run(['exec', container, 'createdb', '-U', 'postgres', 'mobile_contract'])
  sql('mobile_contract', file('postgres-fixture.sql'))
  const migration = readFileSync(join(root, 'infra/supabase/migrations/20260909030000_mobile_offline_backup.sql'), 'utf8')
  sql('mobile_contract', migration)
  for (const name of ['postgres-contract.sql', 'postgres-extra-contract.sql', 'postgres-validation-contract.sql']) sql('mobile_contract', file(name))
  console.log('PASS: real PostgreSQL owner, retry, rollback, canonical trainer, stale-write, tombstone, RLS and payload contracts.')

  run(['exec', container, 'createdb', '-U', 'postgres', 'mobile_full'])
  sql('mobile_full', file('postgres-platform-fixture.sql'))
  for (const name of readdirSync(join(root, 'infra/supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
    sql('mobile_full', readFileSync(join(root, 'infra/supabase/migrations', name), 'utf8'))
  }
  sql('mobile_full', `INSERT INTO auth.users(id,email) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','mobile-a@example.invalid'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','mobile-b@example.invalid');
    INSERT INTO public.profiles(id,full_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Mobile A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Mobile B');`)
  sql('mobile_full', file('postgres-contract.sql'))
  sql('mobile_full', file('postgres-validation-contract.sql'))
  console.log('PASS: complete public/private baseline and all following migrations, plus mobile contracts against real web schema.')
} finally {
  try { run(['rm', '--force', '--volumes', container]) } catch { /* Only the named test container may be removed. */ }
}
