// Real PostgreSQL companion contracts. Only a task-owned disposable database is touched.
// Docker is the default; --native uses an existing local PostgreSQL installation.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const container = `vekira-fitness-card-contract-${process.pid}-${Date.now()}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const native = process.argv.includes('--native')
const nativeBin = process.env.FITNESS_CARD_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin'
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
let sqlArgs = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'fitness_card_contract', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-X']
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
    nativeRoot = mkdtempSync(join(tmpdir(), 'vekira-fitness-card-contract-'))
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
    sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE DATABASE fitness_card_contract;')
    sqlArgs[7] = 'fitness_card_contract'
  } else {
    run(['image', 'inspect', image])
    run(['run', '--name', container, '--detach', '--env', 'POSTGRES_PASSWORD=companion-local-contract-only', image])
    let ready = false
    for (let n = 0; n < 60; n++) {
      try { run(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); ready = true; break }
      catch { await new Promise(resolve => setTimeout(resolve, 1000)) }
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not start')
    run(['exec', container, 'createdb', '-U', 'postgres', 'fitness_card_contract'])
  }
  sql(readFileSync(join(root, 'mobile/src/cloud/__tests__/postgres-platform-fixture.sql'), 'utf8'))
  // The shared fixture uses current_user for auth.role(); real JWT claims must
  // remain visible inside SECURITY DEFINER triggers for suspension fixtures.
  sql(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text) $$;`)
  for (const name of readdirSync(join(root, 'infra/supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    if (process.argv.includes('--red') && name === '20260912040000_fitness_card.sql') continue
    sql(readFileSync(join(root, 'infra/supabase/migrations', name), 'utf8'))
  }
  sql(readFileSync(join(root, 'mobile/src/original/fitness-card-postgres-contract.sql'), 'utf8'))
  console.log('PASS: fitness card PostgreSQL contracts.')
  const revision = sql(`${auth(A)} SELECT public.get_fitness_card('${A}')->>'revision';`).trim().split('\n').at(-1)
  const saves = await Promise.all([
    parallelSql(`${auth(A)} SELECT public.save_fitness_card('Concurrent one','ice',${revision});`),
    parallelSql(`${auth(A)} SELECT public.save_fitness_card('Concurrent two','ember',${revision});`),
  ])
  if (saves.filter(result => result.code === 0).length !== 1 || saves.some(result => result.code !== 0 && !result.output.includes('FITNESS_CARD_CONFLICT'))) throw new Error(`CAS race failed: ${JSON.stringify(saves)}`)
  const relation = JSON.parse(sql(`${auth(A)} SELECT public.get_fitness_card_state();`).trim().split('\n').at(-1)).access.find(item => item.viewer.userId === B).id
  await Promise.all([
    parallelSql(`${auth(A)} SELECT public.fitness_card_access('revoke',NULL,'${relation}');`),
    parallelSql(`${auth(A)} INSERT INTO storage.objects(bucket_id,name) VALUES('fitness-card-photos','${A}/2.webp');`),
  ]).then(results => { if(results.some(result => result.code !== 0)) throw new Error(`Photo/revoke race failed: ${JSON.stringify(results)}`) })
  const denied = await parallelSql(`${auth(B)} SELECT public.get_fitness_card('${A}');`)
  if (denied.code === 0 || !denied.output.includes('FITNESS_CARD_NOT_ALLOWED')) throw new Error('Concurrent revoke retained authority')
  const count = sql(`${auth(B)} SELECT count(*) FROM storage.objects WHERE bucket_id='fitness-card-photos';`).trim().split('\n').at(-1)
  if(count !== '0') throw new Error('Concurrent revoke retained photo access')
  console.log('PASS: real concurrent CAS, photo/revoke serialization and revoked Storage access.')
} finally {
  if (nativeRoot) {
    if (existsSync(join(nativeRoot, 'data', 'postmaster.pid'))) {
      run(['stop', '-D', join(nativeRoot, 'data'), '-m', 'fast', '-w', '-t', '30'], undefined, pg('pg_ctl'))
    }
    const ownedPath = realpathSync(nativeRoot)
    if (dirname(ownedPath) !== realpathSync(tmpdir()) || !basename(ownedPath).startsWith('vekira-fitness-card-contract-')) throw new Error('Refusing cleanup outside the task-owned temporary cluster')
    rmSync(ownedPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    console.log('CLEANUP: stopped and removed task-owned native PostgreSQL cluster.')
  } else if (!native) {
    try { run(['rm', '--force', '--volumes', container]) } catch { /* This exact test-owned container only. */ }
  }
}
