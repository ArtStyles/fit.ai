import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.TRAINER_RELATIONSHIPS_DB_IMAGE
  ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = 'fitai-trainer-relationships-db-' + process.pid + '-' + Date.now().toString(36)
const verificationMigrationPath = path.join(repoRoot, 'supabase', 'migrations', '041_trainer_verification.sql')
const relationshipsMigrationPath = path.join(repoRoot, 'supabase', 'migrations', '042_trainer_relationships.sql')
const testPath = path.join(repoRoot, 'supabase', 'tests', '042_trainer_relationships_test.sql')

const bootstrapSql = [
  'GRANT anon, authenticated, service_role TO postgres;',
  'CREATE SCHEMA IF NOT EXISTS extensions;',
  'CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;',
  'CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;',
  'CREATE SCHEMA IF NOT EXISTS storage;',
  'CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner UUID, public BOOLEAN NOT NULL DEFAULT FALSE, file_size_limit BIGINT, allowed_mime_types TEXT[]);',
  'CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE, name TEXT NOT NULL, owner UUID, metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (bucket_id, name));',
  'ALTER TABLE storage.buckets OWNER TO postgres;',
  'ALTER TABLE storage.objects OWNER TO postgres;',
  'CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, avatar_url TEXT, onboarding_done BOOLEAN NOT NULL DEFAULT FALSE, is_admin BOOLEAN NOT NULL DEFAULT FALSE, account_status TEXT NOT NULL DEFAULT \'active\');',
  'CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = p_user_id AND profile.account_status = \'active\') $$;',
  'GRANT EXECUTE ON FUNCTION public.is_account_active(UUID) TO authenticated, service_role;',
  'CREATE TABLE public.product_notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120), body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500), url TEXT, payload JSONB NOT NULL DEFAULT \'{}\'::jsonb, dedupe_key TEXT NOT NULL CHECK (dedupe_key <> \'\'), read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, dedupe_key), CHECK (url IS NULL OR url LIKE \'/%\'));',
  'CREATE TABLE public.professional_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id UUID, subject_user_id UUID, entity_type TEXT NOT NULL CHECK (entity_type <> \'\'), entity_id UUID, action TEXT NOT NULL CHECK (action <> \'\'), metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
  'GRANT ALL ON TABLE public.professional_audit_logs TO service_role;',
  'CREATE OR REPLACE FUNCTION public.create_product_notification(p_user_id UUID, p_type TEXT, p_title TEXT, p_body TEXT, p_url TEXT, p_dedupe_key TEXT, p_payload JSONB DEFAULT \'{}\'::jsonb) RETURNS public.product_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ DECLARE notification public.product_notifications%ROWTYPE; BEGIN INSERT INTO public.product_notifications (user_id, type, title, body, url, payload, dedupe_key) VALUES (p_user_id, p_type, p_title, p_body, p_url, COALESCE(p_payload, \'{}\'::jsonb), p_dedupe_key) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING * INTO notification; IF notification.id IS NULL THEN SELECT * INTO STRICT notification FROM public.product_notifications WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key; END IF; RETURN notification; END; $$;',
  'REVOKE ALL ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;',
  'GRANT EXECUTE ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;',
].join('\n')

const acceptanceRaceFixtureSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('91000000-0000-4000-8000-000000000001', 'race-trainer-a@example.test', '{}'::jsonb),
  ('92000000-0000-4000-8000-000000000002', 'race-trainer-b@example.test', '{}'::jsonb),
  ('93000000-0000-4000-8000-000000000003', 'race-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('91000000-0000-4000-8000-000000000001', 'https://example.test/a.webp', TRUE, 'active'),
  ('92000000-0000-4000-8000-000000000002', 'https://example.test/b.webp', TRUE, 'active'),
  ('93000000-0000-4000-8000-000000000003', 'https://example.test/client.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES
  ('94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001'),
  ('94000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('95000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'race-trainer-a', 'active', 'Race trainer A', 'Bio A', 'Experience A'),
  ('95000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002', 'race-trainer-b', 'active', 'Race trainer B', 'Bio B', 'Experience B');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', 'Race service A', 'online', 60),
  ('96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000002', 'Race service B', 'online', 60);
INSERT INTO public.coaching_requests (id, service_id, trainer_user_id, client_user_id, training_profile_consent_version, idempotency_key, status) VALUES
  ('97000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000003', 'training-profile-v1', '98000000-0000-4000-8000-000000000001', 'pending'),
  ('97000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000003', 'training-profile-v1', '98000000-0000-4000-8000-000000000002', 'pending');
`

const acceptanceRaceSql = `
DO $$
DECLARE
  a_result UUID;
  b_result UUID;
  a_error TEXT;
  b_error TEXT;
BEGIN
  PERFORM dblink_connect('accept_a', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('accept_b', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_exec('accept_a', $query$SET request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001'$query$);
  PERFORM dblink_exec('accept_a', $query$SET request.jwt.claim.role = 'authenticated'$query$);
  PERFORM dblink_exec('accept_a', 'SET ROLE authenticated');
  PERFORM dblink_exec('accept_b', $query$SET request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002'$query$);
  PERFORM dblink_exec('accept_b', $query$SET request.jwt.claim.role = 'authenticated'$query$);
  PERFORM dblink_exec('accept_b', 'SET ROLE authenticated');
  PERFORM dblink_send_query('accept_a', $query$SELECT relationship_id FROM public.accept_coaching_request('97000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001')$query$);
  PERFORM dblink_send_query('accept_b', $query$SELECT relationship_id FROM public.accept_coaching_request('97000000-0000-4000-8000-000000000002', '99000000-0000-4000-8000-000000000002')$query$);
  SELECT relationship_id INTO a_result FROM dblink_get_result('accept_a', false) AS result(relationship_id UUID);
  SELECT relationship_id INTO b_result FROM dblink_get_result('accept_b', false) AS result(relationship_id UUID);
  a_error := dblink_error_message('accept_a');
  b_error := dblink_error_message('accept_b');
  IF (CASE WHEN a_result IS NULL THEN 0 ELSE 1 END + CASE WHEN b_result IS NULL THEN 0 ELSE 1 END) <> 1 THEN
    RAISE EXCEPTION 'COACHING_RACE_EXPECTED_ONE_SUCCESS: a=% b=% errors=%/%', a_result, b_result, a_error, b_error;
  END IF;
  IF a_result IS NULL AND a_error NOT LIKE '%COACHING_ACTIVE_RELATIONSHIP_EXISTS%' THEN
    RAISE EXCEPTION 'COACHING_RACE_WRONG_A_LOSER_ERROR: %', a_error;
  END IF;
  IF b_result IS NULL AND b_error NOT LIKE '%COACHING_ACTIVE_RELATIONSHIP_EXISTS%' THEN
    RAISE EXCEPTION 'COACHING_RACE_WRONG_B_LOSER_ERROR: %', b_error;
  END IF;
  IF (SELECT count(*) FROM public.coaching_relationships WHERE client_user_id = '93000000-0000-4000-8000-000000000003' AND status = 'active') <> 1
    OR (SELECT count(*) FROM public.coaching_consents consent JOIN public.coaching_relationships relationship ON relationship.id = consent.relationship_id WHERE relationship.client_user_id = '93000000-0000-4000-8000-000000000003' AND consent.scope = 'training_profile') <> 1
    OR (SELECT count(*) FROM public.coaching_requests WHERE client_user_id = '93000000-0000-4000-8000-000000000003' AND status = 'accepted') <> 1
    OR (SELECT count(*) FROM public.coaching_requests WHERE client_user_id = '93000000-0000-4000-8000-000000000003' AND status = 'cancelled') <> 1 THEN
    RAISE EXCEPTION 'COACHING_RACE_PARTIAL_STATE';
  END IF;
  PERFORM dblink_disconnect('accept_a');
  PERFORM dblink_disconnect('accept_b');
END;
$$;
`

function docker(args, { input, print = true } = {}) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 20 * 1024 * 1024,
  })
  if (print) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.error) throw result.error
  return result
}

function runPsql(sql, label) {
  process.stdout.write('\n[trainer-relationships-db] ' + label + '\n')
  const result = docker([
    'exec', '-i', container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres',
  ], { input: sql })
  if (result.status !== 0) throw new Error(label + ' failed with exit code ' + result.status)
  return (result.stdout ?? '') + '\n' + (result.stderr ?? '')
}

function waitForDatabase() {
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker(['inspect', container, '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}'], { print: false })
      return result.status === 0 ? result.stdout.trim() || 'unknown' : 'inspect-error-' + result.status
    },
    probeFinalDatabase: () => {
      const result = docker([
        'exec', container, 'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
        '-c', "SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3 THEN 'ready' ELSE 'missing auth/storage/API roles' END",
      ], { print: false })
      const output = result.stdout.trim()
      return result.status === 0 && output === 'ready'
        ? { ok: true, diagnostic: 'auth and API roles ready' }
        : { ok: false, diagnostic: result.stderr.trim() || output || 'psql exit ' + result.status }
    },
    wait: milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  })
}

let started = false
try {
  process.stdout.write('[trainer-relationships-db] starting isolated ' + container + '\n')
  const start = docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', image])
  if (start.status !== 0) throw new Error('docker run failed with exit code ' + start.status)
  started = true

  const readiness = waitForDatabase()
  process.stdout.write('[trainer-relationships-db] database ready (' + readiness.health + '; ' + readiness.diagnostic + ')\n')
  runPsql(bootstrapSql, 'applying minimal historical bootstrap')
  runPsql(readFileSync(verificationMigrationPath, 'utf8'), 'applying migration 041')
  runPsql(readFileSync(relationshipsMigrationPath, 'utf8'), 'applying migration 042')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running 042 pgTAP behavior suite')
  if (/^\s*not ok\b/m.test(tapOutput) || /# Looks like you (?:failed|planned)\b/.test(tapOutput)) {
    throw new Error('pgTAP reported one or more failed assertions')
  }
  runPsql(acceptanceRaceFixtureSql, 'creating committed two-trainer acceptance race fixture')
  runPsql(acceptanceRaceSql, 'running real dblink two-connection acceptance race')
  process.stdout.write('\n[trainer-relationships-db] PASS: pgTAP assertions and real dblink race passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    process.stdout.write(cleanup.status === 0
      ? '[trainer-relationships-db] removed isolated ' + container + '\n'
      : '[trainer-relationships-db] warning: failed to remove ' + container + '\n')
  }
}
