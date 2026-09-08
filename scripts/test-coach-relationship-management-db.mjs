import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = `vekira-relationship-management-${process.pid}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.121'
const id=n=>'61000000-0000-4000-8000-'+String(n).padStart(12,'0')
function docker(args, input) {
  return spawnSync('docker', args, { cwd: root, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000, windowsHide: true })
}
function must(result, label) {
  if (result.error || result.status !== 0) throw new Error(`${label}: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`)
  console.log(`${label}: OK`)
  return result.stdout.trim()
}
function sql(input) {
  return docker(['exec', '-i', '--env', 'PGPASSWORD=postgres', container, 'psql', '--username', 'supabase_admin', '--dbname', 'postgres', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1'], input)
}
function mustSql(input, label) { return must(sql(input), label) }
function authenticated(userId, statement, setup = '') {
  return `BEGIN;
${setup}
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '${userId}';
${statement}
ROLLBACK;`
}
async function main() {
  must(docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', image]), 'Start disposable database')
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = docker(['inspect', container, '--format', '{{.State.Health.Status}}'])
    if (status.status === 0 && status.stdout.trim() === 'healthy') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Container never became healthy')
  mustSql(`CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT FALSE,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text NOT NULL,name text NOT NULL DEFAULT '',owner_id text,metadata jsonb);
ALTER TABLE storage.buckets OWNER TO postgres;
ALTER TABLE storage.objects OWNER TO postgres;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`, 'Bootstrap storage tables')
  const directory = path.join(root, 'infra/supabase/migrations')
  const migrations = readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
  const baseline = migrations.find(name => name.endsWith('_remote_schema_baseline.sql'))
  if (!baseline) throw new Error('Missing baseline migration')
  for (const migration of migrations.filter(name => name >= baseline)) {
    mustSql(`SET ROLE postgres;\n${readFileSync(path.join(directory, migration), 'utf8')}`, `Apply ${migration}`)
  }
  mustSql(readFileSync(path.join(root,'supabase/tests/coach_relationship_management_fixture.sql'),'utf8'),'Seed management scope fixtures')
  const trainerId=id(1), rpc='SELECT public.get_coach_relationship_management();'
  const snapshot=()=>mustSql(`SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM coaching_relationships r),(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM coaching_consents c),(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM coaching_requests r));`,'Snapshot lifecycle history')
  const before=snapshot()
  assert.equal(mustSql(authenticated(trainerId,`SELECT count(*) FROM coaching_relationships WHERE status IN ('active','paused_by_platform');`),'Direct SELECT remains consent scoped'),'1')
  const payload=JSON.parse(mustSql(authenticated(trainerId,rpc),'Management RPC as authenticator/authenticated'))
  assert.deepEqual(Object.keys(payload).sort(),['counts','relationships'])
  assert.deepEqual(payload.counts,{pendingRequests:1,activeRelationships:2,pausedRelationships:1})
  assert.deepEqual(payload.relationships.map(r=>r.relationshipId),[id(41),id(42),id(43)])
  const keys=['relationshipId','clientId','clientName','username','avatarUrl','serviceName','status','startedAt','trainingConsentActive','trainingAccessAvailable'].sort()
  for(const row of payload.relationships) assert.deepEqual(Object.keys(row).sort(),keys)
  assert.deepEqual(payload.relationships.map(r=>r.trainingAccessAvailable),[true,false,false])
  assert.deepEqual(payload.relationships.map(r=>r.trainingConsentActive),[true,false,true])
  assert.equal(payload.relationships[1].clientName,'fallback-client')
  assert.equal(payload.relationships[1].avatarUrl,null,'empty optional photo is normalized to missing')
  assert.equal(payload.relationships[2].clientName,null)
  const summary=JSON.parse(mustSql(authenticated(trainerId,'SELECT get_coach_clients_summary();'),'Consent-bound summary'))
  assert.deepEqual(summary.clients.map(r=>r.relationshipId),[id(41)])
  function denied(actor, statement, label, setup='', token='COACH_RELATIONSHIP_MANAGEMENT_UNAVAILABLE') {
    const result=sql(authenticated(actor,statement,setup))
    assert.notEqual(result.status,0,label)
    assert.ok(result.stderr.includes(token),result.stderr)
    console.log(`${label}: rejected OK`)
  }
  for(const client of [3,4,6]) denied(trainerId,`SELECT get_coach_client_insights('${id(client)}',current_date-7,current_date);`,'Protected insights denied', '', 'COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  denied(id(2),rpc,'Nontrainer rejected')
  denied('',rpc,'Missing user rejected')
  denied(trainerId,rpc,'Inactive trainer account rejected',`UPDATE profiles SET account_status='suspended' WHERE id='${trainerId}';`)
  denied(trainerId,rpc,'Inactive professional rejected',`UPDATE trainer_profiles SET status='suspended' WHERE user_id='${trainerId}';`)
  const unrelated=JSON.parse(mustSql(authenticated(id(5),rpc),'Unrelated trainer sees only own relationship'))
  assert.deepEqual(unrelated.relationships.map(r=>r.relationshipId),[id(45)])
  for(const role of ['anon','service_role']) {
    const result=sql(`BEGIN;SET SESSION AUTHORIZATION authenticator;SET LOCAL ROLE ${role};${rpc}ROLLBACK;`)
    assert.notEqual(result.status,0);assert.ok(result.stderr.includes('permission denied for function get_coach_relationship_management'))
    console.log(`${role} cannot execute management RPC: OK`)
  }
  const inactive=JSON.parse(mustSql(authenticated(trainerId,rpc,`UPDATE profiles SET account_status='suspended' WHERE id='${id(2)}';`),'Inactive client access is unavailable'))
  assert.equal(inactive.relationships.find(r=>r.relationshipId===id(41)).trainingAccessAvailable,false)
  const missingIdentity=JSON.parse(mustSql(authenticated(trainerId,rpc,`CREATE OR REPLACE VIEW public.public_profiles AS SELECT id,username,full_name,avatar_url,is_private,post_count FROM profiles WHERE id<>'${id(2)}';`),'Missing optional public identity keeps management rows'))
  assert.equal(missingIdentity.relationships.length,3)
  assert.equal(missingIdentity.relationships[0].clientName,null)
  assert.equal(snapshot(),before,'management reads preserve lifecycle histories')
  const duplicate=sql(authenticated(trainerId,'SELECT 1;',`INSERT INTO coaching_relationships(service_id,trainer_user_id,client_user_id,status) VALUES('${id(32)}','${id(5)}','${id(2)}','active');`))
  assert.notEqual(duplicate.status,0);assert.ok(duplicate.stderr.includes('coaching_relationships_one_active_client'))
  assert.equal(mustSql('SELECT trainer_security_preflight();','Preflight retains old checks plus management'),'61')
  const definition=mustSql("SELECT pg_get_functiondef('public.is_professional_audit_event_allowed(text,text)'::regprocedure);",'Read exact allowlist fixture definition')
  for (const eol of ['\n','\r\n']) {
    assert.equal(mustSql(`BEGIN;SET ROLE postgres;${definition.replaceAll('\r\n','\n').replaceAll('\n',eol)}; SELECT trainer_security_preflight();ROLLBACK;`,'Preflight accepts mixed line endings'),'61')
  }
  const tampered=sql(`BEGIN;SET ROLE postgres;${definition.replace("'legacy_event_redacted'","'legacy_event_redacted', 'unexpected_event'")}; SELECT trainer_security_preflight();ROLLBACK;`)
  assert.notEqual(tampered.status,0);assert.ok(tampered.stderr.includes('TRAINER_SECURITY_PREFLIGHT_FAILED'))
  for(const mutation of [
    'GRANT EXECUTE ON FUNCTION get_coach_relationship_management() TO anon;',
    'GRANT EXECUTE ON FUNCTION get_coach_relationship_management() TO PUBLIC;',
    'GRANT EXECUTE ON FUNCTION get_coach_relationship_management() TO service_role;',
    'REVOKE EXECUTE ON FUNCTION get_coach_relationship_management() FROM authenticated;',
    'ALTER FUNCTION get_coach_relationship_management() SECURITY INVOKER;',
    'ALTER FUNCTION get_coach_relationship_management() RESET search_path;',
    'ALTER FUNCTION get_coach_relationship_management() OWNER TO supabase_admin;',
    'DROP FUNCTION get_coach_relationship_management();',
  ]) {
    const probe=sql(`BEGIN;${mutation} SELECT trainer_security_preflight();ROLLBACK;`)
    assert.notEqual(probe.status,0);assert.ok(probe.stderr.includes('TRAINER_SECURITY_PREFLIGHT_FAILED'),probe.stderr)
  }
  console.log('PASS: management scope, exact minimal payload, independent counts, denial matrix, lifecycle invariants and preflight tampering')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{must(docker(['rm','--force',container]),'Remove owned disposable database')})
