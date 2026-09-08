import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { mapCatalogV1ManifestToRows } from '../src/lib/exercises/catalogV1Rows'
import type { CatalogV1Manifest } from '../src/lib/exercises/visualCatalogV1'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationDirectory = path.join(root, 'infra/supabase/migrations')
const image = process.env.CATALOG_V1_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `vekira-catalog-v1-db-${process.pid}`
const expectedDigest = '58e3b1621b74a930405878c68b47fff2bf7ebe28b91111f62087c326de814917'
const fixtureSupabaseUrl = 'https://fixture-project.supabase.co'

type CommandResult = SpawnSyncReturns<string>

function docker(args: string[], input?: string): CommandResult {
  return spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    windowsHide: true,
  })
}

function describe(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}

function requireSuccess(result: CommandResult, label: string): string {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}):\n${describe(result)}`)
  process.stdout.write(`${label}: OK\n`)
  return result.stdout.trim()
}

function sql(input: string): CommandResult {
  return docker([
    'exec', '-i', '--env', 'PGPASSWORD=postgres', container,
    'psql', '--username', 'supabase_admin', '--dbname', 'postgres',
    '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
    '--set', 'ON_ERROR_STOP=1',
  ], input)
}

function requireSql(input: string, label: string): string {
  return requireSuccess(sql(input), label)
}

function jsonbLiteral(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized.includes('$catalog_payload$')) throw new Error('Unexpected payload delimiter collision')
  return `$catalog_payload$${serialized}$catalog_payload$::jsonb`
}

function authenticatedSql(userId: string, statement: string): string {
  return `
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '${userId}';
${statement}
ROLLBACK;
`
}

const manifest = JSON.parse(readFileSync(
  path.join(root, 'public/exercises/catalog/v1/manifest.json'),
  'utf8',
)) as CatalogV1Manifest
const rows = mapCatalogV1ManifestToRows(manifest, fixtureSupabaseUrl)
const tamperedRows = structuredClone(rows)
tamperedRows[0].name_es = 'Sustitución semántica no aprobada'
const payloadSql = jsonbLiteral(rows)
const tamperedPayloadSql = jsonbLiteral(tamperedRows)

const fixtureSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ca100000-0000-4000-8000-000000000001', 'catalog-owner@example.test', '{}'::jsonb),
  ('ca100000-0000-4000-8000-000000000002', 'catalog-other@example.test', '{}'::jsonb),
  ('ca100000-0000-4000-8000-000000000003', 'catalog-trainer@example.test', '{}'::jsonb);

INSERT INTO public.profiles (id, full_name, avatar_url, onboarding_done, account_status) VALUES
  ('ca100000-0000-4000-8000-000000000001', 'Catalog owner', 'https://example.test/owner.webp', TRUE, 'active'),
  ('ca100000-0000-4000-8000-000000000002', 'Catalog other', 'https://example.test/other.webp', TRUE, 'active'),
  ('ca100000-0000-4000-8000-000000000003', 'Catalog trainer', 'https://example.test/trainer.webp', TRUE, 'active');

INSERT INTO public.exercises (id, name, difficulty, exercise_type, source, external_id, is_public) VALUES
  ('ca200000-0000-4000-8000-000000000001', 'Mapped log legacy', 'beginner', 'strength', 'free-exercise-db', 'Barbell_Curl', TRUE),
  ('ca200000-0000-4000-8000-000000000002', 'Mapped workout legacy', 'beginner', 'strength', 'free-exercise-db', 'Barbell_Deadlift', TRUE),
  ('ca200000-0000-4000-8000-000000000003', 'Mapped template legacy', 'beginner', 'strength', 'free-exercise-db', 'Face_Pull', TRUE),
  ('ca200000-0000-4000-8000-000000000011', 'Private log history', 'beginner', 'strength', 'catalog-private-fixture', 'private-log', TRUE),
  ('ca200000-0000-4000-8000-000000000012', 'Private workout history', 'beginner', 'strength', 'catalog-private-fixture', 'private-workout', TRUE),
  ('ca200000-0000-4000-8000-000000000013', 'Private trainer template', 'beginner', 'strength', 'catalog-private-fixture', 'private-template', TRUE),
  ('ca200000-0000-4000-8000-000000000021', 'Unreferenced legacy', 'beginner', 'strength', 'catalog-delete-fixture', 'delete-me', TRUE);

INSERT INTO public.workouts (id, user_id, name, day_of_week, order_in_plan) VALUES
  ('ca300000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', 'Catalog fixture workout', 1, 1);

INSERT INTO public.workout_exercises (id, workout_id, exercise_id, order_index, sets, reps) VALUES
  ('ca400000-0000-4000-8000-000000000001', 'ca300000-0000-4000-8000-000000000001', 'ca200000-0000-4000-8000-000000000002', 1, 3, 5),
  ('ca400000-0000-4000-8000-000000000002', 'ca300000-0000-4000-8000-000000000001', 'ca200000-0000-4000-8000-000000000012', 2, 3, 8);

INSERT INTO public.progress_logs (id, user_id, workout_id, completed_at, duration_minutes) VALUES
  ('ca500000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', 'ca300000-0000-4000-8000-000000000001', NOW(), 30);

INSERT INTO public.exercise_logs (id, progress_log_id, exercise_id, sets_completed, reps_completed, weights_kg) VALUES
  ('ca600000-0000-4000-8000-000000000001', 'ca500000-0000-4000-8000-000000000001', 'ca200000-0000-4000-8000-000000000001', 3, ARRAY[5,5,5], ARRAY[40,40,40]::numeric[]),
  ('ca600000-0000-4000-8000-000000000002', 'ca500000-0000-4000-8000-000000000001', 'ca200000-0000-4000-8000-000000000011', 3, ARRAY[8,8,8], ARRAY[10,10,10]::numeric[]);

INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week, status) VALUES
  ('ca700000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000003', 'Catalog fixture template', 1, 'draft');
INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES
  ('ca800000-0000-4000-8000-000000000001', 'ca700000-0000-4000-8000-000000000001', 'Template day', 1, 1);
INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES
  ('ca900000-0000-4000-8000-000000000001', 'ca800000-0000-4000-8000-000000000001', 'ca200000-0000-4000-8000-000000000003', 1, 3, 12, 60),
  ('ca900000-0000-4000-8000-000000000002', 'ca800000-0000-4000-8000-000000000001', 'ca200000-0000-4000-8000-000000000013', 2, 3, 12, 60);
`

const fingerprintSql = `
SELECT md5(jsonb_build_array(
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.exercises row), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.exercise_logs row), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.workout_exercises row), '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.id) FROM public.trainer_template_exercises row), '[]'::jsonb)
)::text);
`

function privateExerciseCount(userId: string): number {
  const value = requireSql(authenticatedSql(userId, `
SELECT count(*) FROM public.exercises WHERE source = 'catalog-private-fixture';
`), `Read private exercises as ${userId.slice(-4)}`)
  return Number(value)
}

async function main(): Promise<void> {
  requireSuccess(docker([
    'run', '--detach', '--rm', '--name', container,
    '--env', 'POSTGRES_PASSWORD=postgres', image,
  ]), 'Start disposable Supabase PostgreSQL')

  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker(['inspect', container, '--format', '{{.State.Health.Status}}'])
    if (result.status === 0 && result.stdout.trim() === 'healthy') {
      ready = true
      break
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  if (!ready) throw new Error('Disposable Supabase PostgreSQL did not become healthy')

  requireSql(`
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT FALSE,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  owner_id text,
  metadata jsonb
);
ALTER TABLE storage.buckets OWNER TO postgres;
ALTER TABLE storage.objects OWNER TO postgres;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`, 'Bootstrap Supabase Storage dependencies')

  const migrations = readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()
  const baseline = migrations.find(name => name.endsWith('_remote_schema_baseline.sql'))
  if (!baseline) throw new Error('Active remote schema baseline was not found')

  requireSql(`SET ROLE postgres;\n${readFileSync(path.join(migrationDirectory, baseline), 'utf8')}`, `Apply ${baseline}`)
  for (const migration of migrations.filter(name => name > baseline)) {
    requireSql(`SET ROLE postgres;\n${readFileSync(path.join(migrationDirectory, migration), 'utf8')}`, `Apply ${migration}`)
  }

  requireSql(fixtureSql, 'Seed catalog cutover references and private-history fixtures')

  const directUpdate = sql(`
UPDATE public.exercise_logs
SET exercise_id = 'ca200000-0000-4000-8000-000000000002'
WHERE id = 'ca600000-0000-4000-8000-000000000001';
`)
  if (directUpdate.status === 0 || !directUpdate.stderr.includes('SESSION_EXERCISE_EVIDENCE_IMMUTABLE')) {
    throw new Error(`Exercise-log immutability was not enforced:\n${describe(directUpdate)}`)
  }
  process.stdout.write('Direct exercise-log remap is rejected by the immutable trigger: OK\n')

  const beforeInvalid = requireSql(fingerprintSql, 'Capture pre-rejection catalog fingerprint')
  const invalid = sql(`
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT public.replace_exercise_catalog_v1(${tamperedPayloadSql});
COMMIT;
`)
  if (invalid.status === 0 || !invalid.stderr.includes('catalog V1 semantic digest mismatch')) {
    throw new Error(`Tampered semantic payload was not rejected:\n${describe(invalid)}`)
  }
  process.stdout.write('Tampered semantic payload is rejected before cutover: OK\n')
  const afterInvalid = requireSql(fingerprintSql, 'Capture post-rejection catalog fingerprint')
  if (afterInvalid !== beforeInvalid) throw new Error('Rejected semantic payload changed catalog or reference rows')
  process.stdout.write('Rejected semantic payload rolls back without data changes: OK\n')

  const result = requireSql(`
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT public.replace_exercise_catalog_v1(${payloadSql})::text;
COMMIT;
`, 'Execute digest-pinned catalog V1 cutover as service_role')
  const cutover = JSON.parse(result) as Record<string, unknown>
  if (
    cutover.catalog_semantic_sha256 !== expectedDigest
    || cutover.exercise_logs_remapped_count !== 1
    || cutover.workout_exercises_remapped_count !== 1
    || cutover.trainer_template_exercises_remapped_count !== 1
    || cutover.hidden_count !== 3
    || cutover.deleted_count !== 4
  ) {
    throw new Error(`Cutover result did not report the pinned digest and expected mutations:\n${result}`)
  }

  requireSql(`
DO $$
BEGIN
  IF (SELECT count(*) FROM public.exercises WHERE source = 'vekira-catalog-v1' AND is_public) <> 50 THEN
    RAISE EXCEPTION 'expected exactly 50 public V1 exercises';
  END IF;
  IF (SELECT count(*) FROM public.exercises WHERE is_public AND source <> 'vekira-catalog-v1') <> 0 THEN
    RAISE EXCEPTION 'legacy public exercises remain';
  END IF;
  IF (SELECT count(*) FROM public.exercises) <> 53 THEN
    RAISE EXCEPTION 'expected 50 V1 rows plus three referenced private rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exercises WHERE source IN ('free-exercise-db', 'catalog-delete-fixture')) THEN
    RAISE EXCEPTION 'mapped or unreferenced legacy rows were not deleted';
  END IF;
  IF (SELECT count(*) FROM public.exercises WHERE source = 'catalog-private-fixture' AND NOT is_public) <> 3 THEN
    RAISE EXCEPTION 'referenced legacy rows were not retained privately';
  END IF;
  IF (SELECT count(*) FROM public.exercise_logs) <> 2
    OR (SELECT count(*) FROM public.workout_exercises) <> 2
    OR (SELECT count(*) FROM public.trainer_template_exercises) <> 2 THEN
    RAISE EXCEPTION 'reference cardinality changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.exercise_logs reference
    JOIN public.exercises exercise ON exercise.id = reference.exercise_id
    WHERE reference.id = 'ca600000-0000-4000-8000-000000000001'
      AND exercise.external_id = 'curl-biceps-barra-recta'
  ) THEN RAISE EXCEPTION 'exercise_logs was not remapped'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workout_exercises reference
    JOIN public.exercises exercise ON exercise.id = reference.exercise_id
    WHERE reference.id = 'ca400000-0000-4000-8000-000000000001'
      AND exercise.external_id = 'peso-muerto-convencional-barra'
  ) THEN RAISE EXCEPTION 'workout_exercises was not remapped'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.trainer_template_exercises reference
    JOIN public.exercises exercise ON exercise.id = reference.exercise_id
    WHERE reference.id = 'ca900000-0000-4000-8000-000000000001'
      AND exercise.external_id = 'face-pull-polea'
  ) THEN RAISE EXCEPTION 'trainer_template_exercises was not remapped'; END IF;
  IF has_function_privilege('anon', 'public.replace_exercise_catalog_v1(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.replace_exercise_catalog_v1(jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.replace_exercise_catalog_v1(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public cutover RPC permissions are not service-role-only';
  END IF;
  IF has_function_privilege('service_role', 'private.replace_exercise_catalog_v1_unchecked(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'unchecked cutover implementation is directly executable by service_role';
  END IF;
END;
$$;
`, 'Verify remaps, retirement, deletion, cardinality, and RPC permissions')

  if (privateExerciseCount('ca100000-0000-4000-8000-000000000001') !== 2) {
    throw new Error('Workout/log owner did not see exactly their two referenced private exercises')
  }
  if (privateExerciseCount('ca100000-0000-4000-8000-000000000003') !== 1) {
    throw new Error('Trainer did not see exactly the private exercise in their template')
  }
  if (privateExerciseCount('ca100000-0000-4000-8000-000000000002') !== 0) {
    throw new Error('Unrelated authenticated user could read private exercise history')
  }
  process.stdout.write('Referenced-private exercise RLS isolates owner and trainer history: OK\n')

  const postCutoverUpdate = sql(`
UPDATE public.exercise_logs
SET notes = 'forbidden mutation'
WHERE id = 'ca600000-0000-4000-8000-000000000001';
`)
  if (postCutoverUpdate.status === 0 || !postCutoverUpdate.stderr.includes('SESSION_EXERCISE_EVIDENCE_IMMUTABLE')) {
    throw new Error(`Exercise-log immutability bypass leaked after cutover:\n${describe(postCutoverUpdate)}`)
  }
  process.stdout.write('Exercise-log immutability remains enforced after the transaction-local bypass: OK\n')
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => {
    const removed = docker(['rm', '--force', container])
    if (removed.status === 0) process.stdout.write('Removed disposable catalog database\n')
  })
