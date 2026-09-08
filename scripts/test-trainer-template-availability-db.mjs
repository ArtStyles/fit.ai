import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { mapCatalogV1ManifestToRows } from '../src/lib/exercises/catalogV1Rows.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = `vekira-template-availability-${process.pid}`
const image = 'public.ecr.aws/supabase/postgres:17.6.1.143'
const trainerId = '59000000-0000-4000-8000-000000000001'
const clientId = '59000000-0000-4000-8000-000000000002'
const templateId = '59000000-0000-4000-8000-000000000061'
const relationshipId = '59000000-0000-4000-8000-000000000042'
const unrelatedId = '59000000-0000-4000-8000-000000000004'
const retiredId = '59000000-0000-4000-8000-000000000053'

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
const assignmentSql = `SELECT count(*) FROM public.assign_trainer_program('${relationshipId}', '${templateId}', NULL, 'availability-fresh-request');`
const fixtureSql = readFileSync(path.join(root, 'supabase/tests/trainer_template_availability_fixture.sql'), 'utf8')

const predicateSql = `SELECT jsonb_build_object(
'declared_days',t.days_per_week,
'stored_days',(SELECT count(*) FROM trainer_template_workouts w WHERE w.template_id=t.id),
'stored_exercises',(SELECT count(*) FROM trainer_template_exercises e JOIN trainer_template_workouts w ON w.id=e.template_workout_id WHERE w.template_id=t.id),
'public_exercises',(SELECT count(*) FROM trainer_template_exercises e JOIN trainer_template_workouts w ON w.id=e.template_workout_id JOIN exercises c ON c.id=e.exercise_id AND c.is_public=TRUE WHERE w.template_id=t.id),
'empty_days',(SELECT count(*) FROM trainer_template_workouts w WHERE w.template_id=t.id AND NOT EXISTS(SELECT 1 FROM trainer_template_exercises e WHERE e.template_workout_id=w.id)),
'nonpublic_or_missing',(SELECT count(*) FROM trainer_template_exercises e JOIN trainer_template_workouts w ON w.id=e.template_workout_id LEFT JOIN exercises c ON c.id=e.exercise_id AND c.is_public=TRUE WHERE w.template_id=t.id AND c.id IS NULL),
'by_day',(SELECT jsonb_agg(jsonb_build_object('order',d.order_in_plan,'total',d.total,'public',d.public_count) ORDER BY d.order_in_plan) FROM (SELECT w.order_in_plan,count(e.id) total,count(c.id) FILTER(WHERE c.is_public) public_count FROM trainer_template_workouts w JOIN trainer_template_exercises e ON e.template_workout_id=w.id JOIN exercises c ON c.id=e.exercise_id WHERE w.template_id=t.id GROUP BY w.order_in_plan)d)
) FROM trainer_program_templates t WHERE t.id='${templateId}';`

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
  mustSql(fixtureSql, 'Seed active trainer, consent, and saved 3x3 template')
  const beforeState = JSON.parse(mustSql(authenticated(trainerId,predicateSql),'Read saved 3x3 before cutover'))
  assert.equal(beforeState.stored_days,3)
  assert.equal(beforeState.stored_exercises,9)
  assert.equal(beforeState.public_exercises,9)
  assert.equal(mustSql(authenticated(trainerId,assignmentSql),'Assign 3x3 to fresh recipient before cutover then ROLLBACK'),'1')
  const revisionAssignmentId = mustSql(authenticated(trainerId,
    `SELECT assignment_id FROM public.assign_trainer_program('59000000-0000-4000-8000-000000000041','${templateId}',NULL,'availability-original');`
  ).replace('ROLLBACK;','COMMIT;'),'Save original assignment for independent revision validation')
  const revisionSql = `SELECT count(*) FROM public.publish_trainer_assignment_revision('${revisionAssignmentId}','${templateId}','Explicit new revision','availability-new-revision');`
  assert.equal(mustSql(authenticated(trainerId,revisionSql),'Publish fresh revision before cutover then ROLLBACK'),'1')
  mustSql(`INSERT INTO public.progress_logs(id,user_id,workout_id,completed_at,notes)
    SELECT '59000000-0000-4000-8000-000000000101','${clientId}',w.id,'2026-09-01T10:00:00Z','Historical completed session'
    FROM public.workouts w JOIN public.workout_exercises e ON e.workout_id=w.id WHERE e.exercise_id='${retiredId}' LIMIT 1;
    INSERT INTO public.exercise_logs(progress_log_id,exercise_id,sets_completed,reps_completed,weights_kg,rpe_values,notes)
    VALUES ('59000000-0000-4000-8000-000000000101','${retiredId}',3,ARRAY[10,9,8],ARRAY[82.5,82.5,80],ARRAY[7,8,9],'Historical retired reference');`, 'Seed immutable retired exercise history')
  const snapshot = table => `SELECT COALESCE(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb) FROM public.${table} row;`
  const historyBefore = mustSql(snapshot('exercise_logs'), 'Read exact retired history before cutover')
  const prescriptionSql = `SELECT jsonb_agg(to_jsonb(e)-'exercise_id'-'updated_at' ORDER BY e.id) FROM public.trainer_template_exercises e;`
  const prescriptionBefore = mustSql(prescriptionSql,'Read exact prescriptions before cutover')
  const manifest = JSON.parse(readFileSync(path.join(root,'public/exercises/catalog/v1/manifest.json'),'utf8'))
  const payload = JSON.stringify(mapCatalogV1ManifestToRows(manifest,'https://fixture-project.supabase.co'))
  const cutover = mustSql(`BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT public.replace_exercise_catalog_v1($catalog_payload$${payload}$catalog_payload$::jsonb)::text;
COMMIT;`, 'Execute actual digest-pinned V1 cutover on synthetic data')
  console.log(`CUTOVER ${cutover}`)
  const afterState = JSON.parse(mustSql(authenticated(trainerId,predicateSql),'Read saved 3x3 after cutover'))
  assert.equal(afterState.stored_days,3)
  assert.equal(afterState.stored_exercises,9)
  assert.equal(afterState.public_exercises,8)
  assert.equal(afterState.nonpublic_or_missing,1)
  assert.deepEqual(afterState.by_day.map(day => day.total),[3,3,3])
  assert.equal(mustSql(prescriptionSql,'Read prescriptions after cutover'),prescriptionBefore)
  assert.equal(mustSql(snapshot('exercise_logs'),'Read history after cutover'),historyBefore)
  const exactTemplate = mustSql(snapshot('trainer_template_exercises'),'Snapshot unchanged references after cutover')
  const exactVersions = mustSql(snapshot('trainer_assignment_versions'),'Snapshot published versions after cutover')
  const exactWorkouts = mustSql(snapshot('workout_exercises'),'Snapshot materialized prescriptions after cutover')
  function rejected(statement, token, label, setup = '', actor = trainerId) {
    const result = sql(authenticated(actor,statement,setup))
    assert.notEqual(result.status,0,`${label}: must reject`)
    assert.equal(result.stderr.match(/ERROR:  ([^\r\n]+)/)?.[1],token,label)
    console.log(`${label}: ${token} OK`)
  }
  const replaceSql = `UPDATE public.trainer_template_exercises SET exercise_id=(SELECT id FROM public.exercises WHERE source='vekira-catalog-v1' AND external_id='face-pull-polea') WHERE exercise_id='${retiredId}';`
  for (const [operation,statement,recipient,relationship] of [
    ['assignment',assignmentSql,'59000000-0000-4000-8000-000000000003',relationshipId],
    ['revision',revisionSql,clientId,'59000000-0000-4000-8000-000000000041'],
  ]) {
    rejected(statement,'Not authenticated',`${operation}: missing actor remains rejected`,'','')
    rejected(statement,'TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE',`${operation}: complete 3x3 with one retired row`)
    rejected(statement,'TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE',`${operation}: all nine rows retired`, `UPDATE public.exercises SET is_public=false WHERE id IN (SELECT exercise_id FROM public.trainer_template_exercises);`)
    rejected(statement,'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE',`${operation}: truly missing day takes precedence`, `DELETE FROM public.trainer_template_workouts WHERE template_id='${templateId}' AND order_in_plan=1;`)
    rejected(statement,'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE',`${operation}: empty day takes precedence`, `DELETE FROM public.trainer_template_exercises WHERE template_workout_id IN (SELECT id FROM public.trainer_template_workouts WHERE template_id='${templateId}' AND order_in_plan=1);`)
    rejected(statement,'TRAINER_ASSIGNMENT_CLIENT_INACTIVE',`${operation}: inactive recipient remains rejected`, `UPDATE public.profiles SET account_status='suspended' WHERE id='${recipient}';`)
    rejected(statement,'TRAINER_ASSIGNMENT_TRAINER_INACTIVE',`${operation}: inactive trainer remains rejected`, `UPDATE public.profiles SET account_status='suspended' WHERE id='${trainerId}';`)
    rejected(statement,'TRAINER_ASSIGNMENT_CONSENT_REQUIRED',`${operation}: revoked consent remains rejected`, `UPDATE public.coaching_consents SET revoked_at=now(), revoked_by='${recipient}' WHERE relationship_id='${relationship}';`)
    rejected(statement,operation==='assignment'?'COACHING_RELATIONSHIP_NOT_ACTIVE':'TRAINER_ASSIGNMENT_NOT_FOUND',`${operation}: unrelated actor remains rejected`,'',unrelatedId)
    const replacementCheck = `${replaceSql}
      SELECT jsonb_agg(to_jsonb(e)-'exercise_id'-'updated_at' ORDER BY e.id) FROM public.trainer_template_exercises e;
      ${statement}`
    const replacementResult = mustSql(authenticated(trainerId,replacementCheck),`${operation}: explicit public replacement succeeds preserving prescription`).split('\n')
    assert.equal(replacementResult[0],prescriptionBefore)
    assert.equal(replacementResult.at(-1),'1')
    assert.equal(mustSql(snapshot('trainer_template_exercises'),`${operation}: no silent edits to saved references`),exactTemplate)
    assert.equal(mustSql(snapshot('trainer_assignment_versions'),`${operation}: published history unchanged`),exactVersions)
    assert.equal(mustSql(snapshot('workout_exercises'),`${operation}: materialized prescriptions unchanged`),exactWorkouts)
    assert.equal(mustSql(snapshot('exercise_logs'),`${operation}: exact session history unchanged`),historyBefore)
  }
  assert.equal(mustSql("SELECT count(*) FROM public.exercises WHERE id='59000000-0000-4000-8000-000000000054';",'Unrelated private row really exists'),'1')
  const privateRead = id => `SELECT count(*) FROM public.exercises WHERE id='${id}';`
  assert.equal(mustSql(authenticated(trainerId,privateRead(retiredId)),'Trainer can read saved retired row'),'1')
  assert.equal(mustSql(authenticated(unrelatedId,privateRead(retiredId)),'Unrelated account cannot read saved retired row'),'0')
  assert.equal(mustSql(authenticated(trainerId,privateRead('59000000-0000-4000-8000-000000000054')),'Trainer cannot read unrelated private catalog row'),'0')
  console.log('PASS: saved 3x3 availability classification and explicit replacement')
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{must(docker(['rm','--force',container]),'Remove owned disposable database')})
