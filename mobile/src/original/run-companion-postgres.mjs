// Real PostgreSQL companion contracts. Only a task-owned disposable database is touched.
// Docker is the default; --native uses an existing local PostgreSQL installation.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const container = `vekira-companion-contract-${process.pid}-${Date.now()}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const native = process.argv.includes('--native')
const nativeBin = process.env.COMPANION_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin'
const pg = name => join(nativeBin, process.platform === 'win32' ? `${name}.exe` : name)
const subprocessEnv = { ...process.env, PGCLIENTENCODING: 'UTF8' }
let nativeRoot
const run = (args, input, executable = 'docker') => {
  // A Windows server inherits pg_ctl's pipe handles even after pg_ctl exits.
  // Its output goes to server.log; do not keep the test blocked on inherited pipes.
  const stdio = native && executable === pg('pg_ctl') ? 'ignore' : 'pipe'
  try { return execFileSync(executable, args, { encoding: 'utf8', input, env: subprocessEnv, windowsHide: true, stdio, timeout: 60000, maxBuffer: 12 * 1024 * 1024 }) }
  catch (error) { throw new Error(error.stderr?.trim() || error.message) }
}
const sqlExecutable = native ? pg('psql') : 'docker'
let sqlArgs = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'companion_contract', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-X']
const sql = source => run(sqlArgs, source, sqlExecutable)
const parallelSql = source => new Promise(resolve => {
  const child = spawn(sqlExecutable, sqlArgs, { env: subprocessEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  child.on('error', error => resolve({ code: -1, output: error.message }))
  child.on('close', code => resolve({ code, output }))
  child.stdin.end(`SET statement_timeout = '20s'; ${source}`)
})
const auth = id => `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
try {
  if (native) {
    nativeRoot = mkdtempSync(join(tmpdir(), 'vekira-companion-contract-'))
    const port = await new Promise((resolve, reject) => {
      const probe = createServer()
      probe.once('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const { port } = probe.address()
        probe.close(error => error ? reject(error) : resolve(port))
      })
    })
    run(['-D', join(nativeRoot, 'data'), '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth=trust'], undefined, pg('initdb'))
    run(['start', '-D', join(nativeRoot, 'data'), '-l', join(nativeRoot, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30'], undefined, pg('pg_ctl'))
    sqlArgs = ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-X']
    sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE DATABASE companion_contract;')
    sqlArgs[7] = 'companion_contract'
  } else {
    run(['image', 'inspect', image])
    run(['run', '--name', container, '--detach', '--env', 'POSTGRES_PASSWORD=companion-local-contract-only', image])
    let ready = false
    for (let n = 0; n < 60; n++) {
      try { run(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)) }
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not start')
    run(['exec', container, 'createdb', '-U', 'postgres', 'companion_contract'])
  }
  sql(readFileSync(join(root, 'mobile/src/cloud/__tests__/postgres-platform-fixture.sql'), 'utf8'))
  // The shared fixture uses current_user for auth.role(); real JWT claims must
  // remain visible inside SECURITY DEFINER triggers for suspension fixtures.
  sql(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text) $$;`)
  for (const name of readdirSync(join(root, 'infra/supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    if (process.argv.includes('--red') && ['20260912010000_companion_constancy.sql', '20260912020000_companion_received_greeting.sql'].includes(name)) continue
    if (process.argv.includes('--red-received') && name === '20260912020000_companion_received_greeting.sql') continue
    sql(readFileSync(join(root, 'infra/supabase/migrations', name), 'utf8'))
  }
  sql(readFileSync(join(root, 'mobile/src/original/companion-postgres-contract.sql'), 'utf8'))
  console.log('PASS: companion consent, private summaries, code expiry, Unicode, idempotency, notification bounds and access contracts.')
  sql(readFileSync(join(root, 'mobile/src/original/companion-received-postgres-contract.sql'), 'utf8'))
  console.log('PASS: received greetings preserve sender quotas and isolate active accounts, consent and exact relationships across days and re-pairing.')
  if (!process.argv.includes('--red')) {
    // Both requests compete for B, in opposite caller/recipient roles.
    sql(`DELETE FROM private.companion_memberships; DELETE FROM private.companion_greetings; DELETE FROM private.companion_relationships; DELETE FROM private.companion_invite_codes;`)
    const bCode = sql(`${auth(B)} SELECT public.get_companion_invite_code()->>'code';`).trim().split('\n').at(-1)
    const cCode = sql(`${auth(C)} SELECT public.get_companion_invite_code()->>'code';`).trim().split('\n').at(-1)
    const results = await Promise.all([
      parallelSql(`${auth(A)} SELECT public.request_companion('${bCode}');`),
      parallelSql(`${auth(B)} SELECT public.request_companion('${cCode}');`),
    ])
    if (results.filter(result => result.code === 0).length !== 1 || results.some(result => result.code !== 0 && !result.output.includes('COMPANION_BUSY'))) {
      throw new Error(`Cross-role invitation race failed: ${JSON.stringify(results)}`)
    }
    sql(`DO $$ BEGIN IF (SELECT count(*) FROM private.companion_memberships) <> 2 OR (SELECT count(*) FROM private.companion_relationships WHERE status IN ('pending','active')) <> 1 THEN RAISE EXCEPTION 'Concurrent invitations violated one companion'; END IF; END $$;`)
    console.log('PASS: concurrent invitations preserve one companion across both roles.')
    // Keep a single active A/B relationship for concurrent sends and unlink.
    sql(`DELETE FROM private.companion_memberships; DELETE FROM private.companion_relationships; DELETE FROM private.companion_invite_codes;`)
    const code = sql(`${auth(B)} SELECT public.get_companion_invite_code()->>'code';`).trim().split('\n').at(-1)
    const relationship = JSON.parse(sql(`${auth(A)} SELECT public.request_companion('${code}');`).trim().split('\n').at(-1)).relationship.id
    sql(`${auth(B)} SELECT public.respond_companion('${relationship}',true);`)
    const sends = await Promise.all([
      parallelSql(`${auth(A)} SELECT public.send_companion_greeting('${relationship}','Vamos','10000000-0000-4000-8000-000000000001');`),
      parallelSql(`${auth(A)} SELECT public.send_companion_greeting('${relationship}','Vamos','10000000-0000-4000-8000-000000000002');`),
    ])
    if (sends.filter(result => result.code === 0).length !== 1 || sends.some(result => result.code !== 0 && !result.output.includes('COMPANION_DAILY_LIMIT'))) throw new Error(`Greeting race failed: ${JSON.stringify(sends)}`)
    sql(`DO $$ BEGIN IF (SELECT count(*) FROM private.companion_greetings WHERE sender_id='${A}') <> 1 THEN RAISE EXCEPTION 'Duplicate daily greeting'; END IF; END $$;`)
    const unlink = await Promise.all([
      parallelSql(`${auth(A)} SELECT public.leave_companion('${relationship}');`),
      parallelSql(`${auth(B)} SELECT public.send_companion_greeting('${relationship}','Ánimo','10000000-0000-4000-8000-000000000003');`),
    ])
    if (unlink[0].code !== 0 || (unlink[1].code !== 0 && !unlink[1].output.includes('COMPANION_NOT_ACTIVE'))) throw new Error(`Unlink race failed: ${JSON.stringify(unlink)}`)
    sql(`DO $$ BEGIN IF EXISTS(SELECT FROM private.companion_memberships) THEN RAISE EXCEPTION 'Unlink left membership'; END IF; END $$;`)
    console.log('PASS: simultaneous greetings and unlink serialize without duplicate delivery or stale active membership.')
  }
} finally {
  if (nativeRoot) {
    if (existsSync(join(nativeRoot, 'data', 'postmaster.pid'))) {
      run(['stop', '-D', join(nativeRoot, 'data'), '-m', 'fast', '-w', '-t', '30'], undefined, pg('pg_ctl'))
    }
    const ownedPath = realpathSync(nativeRoot)
    if (dirname(ownedPath) !== realpathSync(tmpdir()) || !basename(ownedPath).startsWith('vekira-companion-contract-')) throw new Error('Refusing cleanup outside the task-owned temporary cluster')
    rmSync(ownedPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    console.log('CLEANUP: stopped and removed task-owned native PostgreSQL cluster.')
  } else if (!native) {
    try { run(['rm', '--force', '--volumes', container]) } catch { /* This exact test-owned container only. */ }
  }
}
