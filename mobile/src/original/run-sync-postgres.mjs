// Real PostgreSQL verification in a disposable container without exposed ports.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const container = `vekira-original-snapshot-${process.pid}-${Date.now()}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const run = (args, input) => execFileSync('docker', args, { encoding: 'utf8', input, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
const sql = (database, source) => run(['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-q'], source)
const migration = readFileSync(join(root, 'infra/supabase/migrations/20260911003000_original_app_snapshot_backup.sql'), 'utf8')
try {
  run(['image', 'inspect', image])
  run(['run', '--name', container, '--detach', '--env', 'POSTGRES_PASSWORD=original-snapshot-local-contract', image])
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { run(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break }
    catch { await new Promise(resolve => setTimeout(resolve, 1000)) }
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not start')
  run(['exec', container, 'createdb', '-U', 'postgres', 'original_snapshot'])
  sql('original_snapshot', `CREATE SCHEMA IF NOT EXISTS auth;
    DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; END $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    CREATE TABLE public.original_snapshot_test_access(id uuid PRIMARY KEY, active boolean NOT NULL);
    INSERT INTO public.original_snapshot_test_access VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
    CREATE FUNCTION public.is_account_active(p_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
      SELECT coalesce((SELECT active FROM public.original_snapshot_test_access WHERE id=p_id),false) $$;`)
  sql('original_snapshot', migration)
  sql('original_snapshot', readFileSync(join(root, 'mobile/src/original/sync-postgres-contract.sql'), 'utf8'))
  console.log('PASS: real PostgreSQL full-state roundtrip, CAS, immutable retries, RLS, direct-write denial, account isolation and suspension.')
  if (process.argv.includes('--full')) {
    run(['exec', container, 'createdb', '-U', 'postgres', 'original_full'])
    sql('original_full', readFileSync(join(root, 'mobile/src/cloud/__tests__/postgres-platform-fixture.sql'), 'utf8'))
    for (const name of readdirSync(join(root, 'infra/supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
      sql('original_full', readFileSync(join(root, 'infra/supabase/migrations', name), 'utf8'))
    }
    console.log('PASS: complete existing web migration baseline plus additive original Android snapshot migration.')
  }
} finally {
  try { run(['rm', '--force', '--volumes', container]) } catch { /* Only this exact owned test container may be removed. */ }
}
