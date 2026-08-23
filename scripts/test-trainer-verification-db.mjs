import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.TRAINER_FOUNDATIONS_DB_IMAGE
  ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-trainer-verification-db-${process.pid}-${Date.now().toString(36)}`
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '041_trainer_verification.sql')
const repairMigrationPath = path.join(repoRoot, 'supabase', 'migrations', '053_trainer_draft_rpc_json_repair.sql')
const testPath = path.join(repoRoot, 'supabase', 'tests', '041_trainer_verification_test.sql')

const bootstrapSql = `
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner UUID,
  public BOOLEAN NOT NULL DEFAULT FALSE,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[]
);
CREATE TABLE storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets OWNER TO postgres;
ALTER TABLE storage.objects OWNER TO postgres;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_url TEXT,
  onboarding_done BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  account_status TEXT NOT NULL DEFAULT 'active'
);

CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles profile
  WHERE profile.id = p_user_id AND profile.account_status = 'active'
) $$;
GRANT EXECUTE ON FUNCTION public.is_account_active(UUID) TO authenticated, service_role;

CREATE TABLE public.product_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT NOT NULL CHECK (dedupe_key <> ''),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, dedupe_key),
  CHECK (url IS NULL OR url LIKE '/%')
);

CREATE TABLE public.professional_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  subject_user_id UUID,
  entity_type TEXT NOT NULL CHECK (entity_type <> ''),
  entity_id UUID,
  action TEXT NOT NULL CHECK (action <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT ALL ON TABLE public.professional_audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.create_product_notification(
  p_user_id UUID, p_type TEXT, p_title TEXT, p_body TEXT, p_url TEXT,
  p_dedupe_key TEXT, p_payload JSONB DEFAULT '{}'::JSONB
) RETURNS public.product_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE notification public.product_notifications%ROWTYPE;
BEGIN
  INSERT INTO public.product_notifications (user_id, type, title, body, url, payload, dedupe_key)
  VALUES (p_user_id, p_type, p_title, p_body, p_url, COALESCE(p_payload, '{}'::JSONB), p_dedupe_key)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING * INTO notification;
  IF notification.id IS NULL THEN
    SELECT * INTO STRICT notification FROM public.product_notifications
    WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key;
  END IF;
  RETURN notification;
END;
$$;
REVOKE ALL ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
`

const concurrencyFixtureSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'verification-concurrent@example.test', '{}'::jsonb),
  ('abababab-abab-4bab-8bab-abababababab', 'verification-draft-race@example.test', '{}'::jsonb),
  ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', 'verification-remove-race@example.test', '{}'::jsonb),
  ('efefefef-efef-4efe-8efe-efefefefefef', 'verification-approval-revalidation@example.test', '{}'::jsonb),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'verification-admin@example.test', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, avatar_url, onboarding_done, is_admin, account_status)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'https://cdn.example.test/d.jpg', true, false, 'active'),
  ('abababab-abab-4bab-8bab-abababababab', 'https://cdn.example.test/ab.jpg', true, false, 'active'),
  ('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', 'https://cdn.example.test/cd.jpg', true, false, 'active'),
  ('efefefef-efef-4efe-8efe-efefefefefef', 'https://cdn.example.test/ef.jpg', true, false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://cdn.example.test/admin.jpg', true, true, 'active')
ON CONFLICT (id) DO UPDATE SET
  avatar_url = EXCLUDED.avatar_url,
  onboarding_done = EXCLUDED.onboarding_done,
  is_admin = EXCLUDED.is_admin,
  account_status = EXCLUDED.account_status;

INSERT INTO public.trainer_applications (
  id, user_id, professional_name, professional_photo_url, bio, specialties, modalities,
  experience_summary, general_location, languages, contact_email, preferred_contact,
  timezone, interview_availability
) VALUES (
  '3ddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'Concurrent Trainer', 'https://cdn.example.test/d.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
  repeat('experience ', 4), NULL, ARRAY['es'], 'd@example.test', 'email',
  'America/Havana', 'Weekdays after 14:00'
), (
  '3abababa-abab-4aba-8aba-abababababab', 'abababab-abab-4bab-8bab-abababababab',
  'Draft Race Trainer', 'https://cdn.example.test/ab.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
  repeat('experience ', 4), NULL, ARRAY['es'], 'ab@example.test', 'email',
  'America/Havana', 'Weekdays after 14:00'
), (
  '3cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd', 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
  'Removal Race Trainer', 'https://cdn.example.test/cd.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
  repeat('experience ', 4), NULL, ARRAY['es'], 'cd@example.test', 'email',
  'America/Havana', 'Weekdays after 14:00'
), (
  '3efefefe-efef-4efe-8efe-efefefefefef', 'efefefef-efef-4efe-8efe-efefefefefef',
  'Approval Revalidation Trainer', 'https://cdn.example.test/ef.jpg', repeat('bio ', 20), ARRAY['strength'], ARRAY['online'],
  repeat('experience ', 4), NULL, ARRAY['es'], 'ef@example.test', 'email',
  'America/Havana', 'Weekdays after 14:00'
);

UPDATE public.trainer_applications
SET status = 'under_review', submitted_at = NOW()
WHERE id = '3abababa-abab-4aba-8aba-abababababab';

UPDATE public.trainer_applications
SET status = 'under_review', submitted_at = NOW()
WHERE id = '3efefefe-efef-4efe-8efe-efefefefefef';

INSERT INTO public.trainer_application_credentials (
  id, application_id, credential_type, title, storage_path, external_url, mime_type, size_bytes
) VALUES (
  '4ddddddd-dddd-4ddd-8ddd-dddddddddddd', '3ddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'link', 'Concurrent certificate', NULL, 'https://issuer.example.test/cert/d', NULL, NULL
), (
  '4abababa-abab-4aba-8aba-abababababab', '3abababa-abab-4aba-8aba-abababababab',
  'link', 'Draft race certificate', NULL, 'https://issuer.example.test/cert/ab', NULL, NULL
), (
  '4cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd', '3cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
  'document', 'Removal race certificate',
  'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd/3cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd/4cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd.pdf',
  NULL, 'application/pdf', 3
);

INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES (
  'trainer-credentials',
  'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd/3cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd/4cdcdcdc-cdcd-4dcd-8dcd-cdcdcdcdcdcd.pdf',
  '{"mimetype":"application/pdf","size":3}'::jsonb
);

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES (
  'avatars',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd/avatar.webp',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '{"mimetype":"image/webp","size":1024}'::jsonb
);
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
  process.stdout.write(`\n[trainer-verification-db] ${label}\n`)
  const result = docker([
    'exec', '-i', container,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres',
  ], { input: sql })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function waitForDatabase() {
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker(['inspect', container, '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}'], { print: false })
      return result.status === 0 ? result.stdout.trim() || 'unknown' : `inspect-error-${result.status}`
    },
    probeFinalDatabase: () => {
      const result = docker([
        'exec', container, 'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
        '-c', `SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL
          AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3
          THEN 'ready' ELSE 'missing auth/storage/API roles' END`,
      ], { print: false })
      const output = result.stdout.trim()
      return result.status === 0 && output === 'ready'
        ? { ok: true, diagnostic: 'auth and API roles ready' }
        : { ok: false, diagnostic: result.stderr.trim() || output || `psql exit ${result.status}` }
    },
    wait: milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  })
}

let started = false
try {
  process.stdout.write(`[trainer-verification-db] starting isolated ${container}\n`)
  const start = docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', image])
  if (start.status !== 0) throw new Error(`docker run failed with exit code ${start.status}`)
  started = true

  const readiness = waitForDatabase()
  process.stdout.write(`[trainer-verification-db] database ready (${readiness.health}; ${readiness.diagnostic})\n`)
  runPsql(bootstrapSql, 'applying minimal historical bootstrap')
  runPsql(readFileSync(migrationPath, 'utf8'), 'applying migration 041')
  runPsql(readFileSync(repairMigrationPath, 'utf8'), 'applying migration 053')
  runPsql(concurrencyFixtureSql, 'creating committed concurrency fixture')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running 041 pgTAP behavior suite')
  if (/^\s*not ok\b/m.test(tapOutput)
    || /# Looks like you (?:failed|planned)\b/.test(tapOutput)) {
    throw new Error('pgTAP reported one or more failed assertions')
  }
  process.stdout.write('\n[trainer-verification-db] PASS: all pgTAP assertions passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    process.stdout.write(cleanup.status === 0
      ? `[trainer-verification-db] removed isolated ${container}\n`
      : `[trainer-verification-db] warning: failed to remove ${container}\n`)
  }
}
