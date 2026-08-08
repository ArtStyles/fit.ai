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
  'CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, avatar_url TEXT, onboarding_done BOOLEAN NOT NULL DEFAULT FALSE, is_admin BOOLEAN NOT NULL DEFAULT FALSE, account_status TEXT NOT NULL DEFAULT \'active\', suspension_reason TEXT, suspended_at TIMESTAMPTZ, suspended_until TIMESTAMPTZ, suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL);',
  'CREATE TABLE public.admin_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, action TEXT NOT NULL, reason TEXT, metadata JSONB NOT NULL DEFAULT \'{}\'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());',
  'CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = p_user_id AND profile.account_status = \'active\') $$;',
  'CREATE OR REPLACE FUNCTION public.enforce_protected_profile_fields() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$ BEGIN IF COALESCE(auth.role(), \'\') <> \'service_role\' THEN NEW.is_admin := OLD.is_admin; NEW.account_status := OLD.account_status; NEW.suspension_reason := OLD.suspension_reason; NEW.suspended_at := OLD.suspended_at; NEW.suspended_until := OLD.suspended_until; NEW.suspended_by := OLD.suspended_by; END IF; RETURN NEW; END; $$;',
  'CREATE TRIGGER trg_enforce_protected_profile_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_profile_fields();',
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

const resumeAcceptRaceFixtureSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('93000000-0000-4000-8000-000000000004', 'resume-race-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status)
VALUES ('93000000-0000-4000-8000-000000000004', 'https://example.test/resume-client.webp', TRUE, 'active');
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status, paused_at)
VALUES ('97000000-0000-4000-8000-000000000004', '96000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000004', 'paused_by_platform', NOW());
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by, revoked_at, revoked_by)
VALUES ('97000000-0000-4000-8000-000000000004', 'training_profile', 'training-profile-v1',
  '93000000-0000-4000-8000-000000000004', NOW(), '91000000-0000-4000-8000-000000000001');
INSERT INTO public.coaching_requests (id, service_id, trainer_user_id, client_user_id, training_profile_consent_version, idempotency_key, status)
VALUES ('97000000-0000-4000-8000-000000000005', '96000000-0000-4000-8000-000000000002',
  '92000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000004', 'training-profile-v1',
  '98000000-0000-4000-8000-000000000005', 'pending');
`

const resumeAcceptRaceSql = `
DO $$
DECLARE
  resume_result UUID;
  accept_result UUID;
  resume_error TEXT;
  accept_error TEXT;
BEGIN
  PERFORM dblink_connect('resume_client', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('resume_accept_trainer', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_exec('resume_client', $query$SET request.jwt.claim.sub = '93000000-0000-4000-8000-000000000004'$query$);
  PERFORM dblink_exec('resume_client', $query$SET request.jwt.claim.role = 'authenticated'$query$);
  PERFORM dblink_exec('resume_client', 'SET ROLE authenticated');
  PERFORM dblink_exec('resume_accept_trainer', $query$SET request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002'$query$);
  PERFORM dblink_exec('resume_accept_trainer', $query$SET request.jwt.claim.role = 'authenticated'$query$);
  PERFORM dblink_exec('resume_accept_trainer', 'SET ROLE authenticated');
  PERFORM dblink_send_query('resume_client', $query$SELECT relationship_id FROM public.resume_paused_coaching_relationship('97000000-0000-4000-8000-000000000004', '99000000-0000-4000-8000-000000000004')$query$);
  PERFORM dblink_send_query('resume_accept_trainer', $query$SELECT relationship_id FROM public.accept_coaching_request('97000000-0000-4000-8000-000000000005', '99000000-0000-4000-8000-000000000005')$query$);
  SELECT relationship_id INTO resume_result FROM dblink_get_result('resume_client', false) AS result(relationship_id UUID);
  SELECT relationship_id INTO accept_result FROM dblink_get_result('resume_accept_trainer', false) AS result(relationship_id UUID);
  resume_error := dblink_error_message('resume_client');
  accept_error := dblink_error_message('resume_accept_trainer');
  IF (CASE WHEN resume_result IS NULL THEN 0 ELSE 1 END + CASE WHEN accept_result IS NULL THEN 0 ELSE 1 END) <> 1 THEN
    RAISE EXCEPTION 'COACHING_RESUME_RACE_EXPECTED_ONE_SUCCESS: resume=% accept=% errors=%/%', resume_result, accept_result, resume_error, accept_error;
  END IF;
  IF resume_result IS NULL AND resume_error NOT LIKE '%COACHING_ACTIVE_RELATIONSHIP_EXISTS%' THEN
    RAISE EXCEPTION 'COACHING_RESUME_RACE_WRONG_RESUME_LOSER_ERROR: %', resume_error;
  END IF;
  IF accept_result IS NULL AND accept_error NOT LIKE '%COACHING_ACTIVE_RELATIONSHIP_EXISTS%' THEN
    RAISE EXCEPTION 'COACHING_RESUME_RACE_WRONG_ACCEPT_LOSER_ERROR: %', accept_error;
  END IF;
  IF (SELECT count(*) FROM public.coaching_relationships WHERE client_user_id = '93000000-0000-4000-8000-000000000004' AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'COACHING_RESUME_RACE_PARTIAL_STATE';
  END IF;
  PERFORM dblink_disconnect('resume_client');
  PERFORM dblink_disconnect('resume_accept_trainer');
END;
$$;
`

const suspensionAcceptRaceFixtureSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'suspend-accept-trainer@example.test', '{}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'suspend-accept-client@example.test', '{}'::jsonb),
  ('a3000000-0000-4000-8000-000000000003', 'suspend-accept-admin@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status, is_admin) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'https://example.test/trainer.webp', TRUE, 'active', FALSE),
  ('a2000000-0000-4000-8000-000000000002', 'https://example.test/client.webp', TRUE, 'active', FALSE),
  ('a3000000-0000-4000-8000-000000000003', 'https://example.test/admin.webp', TRUE, 'active', TRUE);
INSERT INTO public.trainer_applications (id, user_id)
VALUES ('a4000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary)
VALUES ('a5000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000004', 'suspend-accept-trainer', 'active', 'Suspend accept trainer', 'Bio', 'Experience');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes)
VALUES ('a6000000-0000-4000-8000-000000000006', 'a5000000-0000-4000-8000-000000000005', 'Suspend accept service', 'online', 60);
INSERT INTO public.coaching_requests (id, service_id, trainer_user_id, client_user_id, training_profile_consent_version, idempotency_key, status)
VALUES ('a7000000-0000-4000-8000-000000000007', 'a6000000-0000-4000-8000-000000000006',
  'a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'training-profile-v1',
  'a8000000-0000-4000-8000-000000000008', 'pending');
`

const suspensionAcceptRaceSql = `
DO $$
DECLARE
  accept_result UUID;
  suspension_result BOOLEAN;
  accept_error TEXT;
  suspension_error TEXT;
BEGIN
  PERFORM dblink_connect('suspend_accept_trainer', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('suspend_accept_admin', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_exec('suspend_accept_trainer', $query$SET request.jwt.claim.sub = 'a1000000-0000-4000-8000-000000000001'$query$);
  PERFORM dblink_exec('suspend_accept_trainer', $query$SET request.jwt.claim.role = 'authenticated'$query$);
  PERFORM dblink_exec('suspend_accept_trainer', 'SET ROLE authenticated');
  PERFORM dblink_exec('suspend_accept_admin', $query$SET request.jwt.claim.sub = ''$query$);
  PERFORM dblink_exec('suspend_accept_admin', $query$SET request.jwt.claim.role = 'service_role'$query$);
  PERFORM dblink_exec('suspend_accept_admin', 'SET ROLE service_role');
  PERFORM dblink_send_query('suspend_accept_trainer', $query$SELECT relationship_id FROM public.accept_coaching_request('a7000000-0000-4000-8000-000000000007', 'a9000000-0000-4000-8000-000000000009')$query$);
  PERFORM dblink_send_query('suspend_accept_admin', $query$SELECT account_suspended FROM public.suspend_account_and_professional('a1000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', 'Administrative race suspension', NULL)$query$);
  SELECT relationship_id INTO accept_result FROM dblink_get_result('suspend_accept_trainer', false) AS result(relationship_id UUID);
  SELECT account_suspended INTO suspension_result FROM dblink_get_result('suspend_accept_admin', false) AS result(account_suspended BOOLEAN);
  accept_error := dblink_error_message('suspend_accept_trainer');
  suspension_error := dblink_error_message('suspend_accept_admin');
  IF suspension_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_ACCEPT_SUSPENSION_FAILED: result=% error=%', suspension_result, suspension_error;
  END IF;
  IF accept_result IS NULL AND accept_error NOT LIKE '%COACHING_TRAINER_NOT_ACTIVE%' THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_ACCEPT_WRONG_LOSER_ERROR: %', accept_error;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = 'a2000000-0000-4000-8000-000000000002' AND relationship.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.coaching_consents consent
    JOIN public.coaching_relationships relationship ON relationship.id = consent.relationship_id
    WHERE relationship.client_user_id = 'a2000000-0000-4000-8000-000000000002' AND consent.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_ACCEPT_ACTIVE_STATE: result=% error=%', accept_result, accept_error;
  END IF;
  PERFORM dblink_disconnect('suspend_accept_trainer');
  PERFORM dblink_disconnect('suspend_accept_admin');
END;
$$;
`

const suspensionResumeRaceFixtureSql = `
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'suspend-resume-trainer@example.test', '{}'::jsonb),
  ('b2000000-0000-4000-8000-000000000002', 'suspend-resume-client@example.test', '{}'::jsonb),
  ('b3000000-0000-4000-8000-000000000003', 'suspend-resume-admin@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status, is_admin) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'https://example.test/trainer.webp', TRUE, 'active', FALSE),
  ('b2000000-0000-4000-8000-000000000002', 'https://example.test/client.webp', TRUE, 'active', FALSE),
  ('b3000000-0000-4000-8000-000000000003', 'https://example.test/admin.webp', TRUE, 'active', TRUE);
INSERT INTO public.trainer_applications (id, user_id)
VALUES ('b4000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary)
VALUES ('b5000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000004', 'suspend-resume-trainer', 'active', 'Suspend resume trainer', 'Bio', 'Experience');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes)
VALUES ('b6000000-0000-4000-8000-000000000006', 'b5000000-0000-4000-8000-000000000005', 'Suspend resume service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status, paused_at)
VALUES ('b7000000-0000-4000-8000-000000000007', 'b6000000-0000-4000-8000-000000000006',
  'b1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'paused_by_platform', NOW());
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by, revoked_at, revoked_by)
VALUES ('b7000000-0000-4000-8000-000000000007', 'training_profile', 'training-profile-v1',
  'b2000000-0000-4000-8000-000000000002', NOW(), 'b1000000-0000-4000-8000-000000000001');
`

const suspensionResumeRaceSql = `
DO $$
DECLARE
  resume_result UUID;
  suspension_result BOOLEAN;
  resume_error TEXT;
  suspension_error TEXT;
  resume_backend_pid INTEGER;
  resume_waiting_on_relationship BOOLEAN := FALSE;
  attempt INTEGER;
BEGIN
  -- Hold the relationship first. The resume must reach that blocked row before
  -- suspension starts; the new trainer advisory lock makes suspension wait
  -- behind resume, while the former order deterministically formed a deadlock.
  PERFORM dblink_connect('suspend_resume_guard', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('suspend_resume_client', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('suspend_resume_admin', 'host=localhost port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_exec('suspend_resume_guard', 'BEGIN');
  PERFORM 1 FROM dblink('suspend_resume_guard', $query$SELECT 1 FROM public.coaching_relationships WHERE id = 'b7000000-0000-4000-8000-000000000007' FOR UPDATE$query$) AS guard_lock(locked INTEGER);
  PERFORM dblink_exec('suspend_resume_client', $query$SET request.jwt.claim.sub = 'b2000000-0000-4000-8000-000000000002'$query$);
  PERFORM dblink_exec('suspend_resume_client', $query$SET request.jwt.claim.role = 'authenticated'$query$);
  PERFORM dblink_exec('suspend_resume_client', 'SET ROLE authenticated');
  PERFORM dblink_exec('suspend_resume_admin', $query$SET request.jwt.claim.sub = ''$query$);
  PERFORM dblink_exec('suspend_resume_admin', $query$SET request.jwt.claim.role = 'service_role'$query$);
  PERFORM dblink_exec('suspend_resume_admin', 'SET ROLE service_role');
  SELECT pid INTO resume_backend_pid
  FROM dblink('suspend_resume_client', 'SELECT pg_backend_pid()') AS backend(pid INTEGER);
  PERFORM dblink_send_query('suspend_resume_client', $query$SELECT relationship_id FROM public.resume_paused_coaching_relationship('b7000000-0000-4000-8000-000000000007', 'b9000000-0000-4000-8000-000000000009')$query$);
  FOR attempt IN 1..100000 LOOP
    SELECT COALESCE(wait_event_type = 'Lock', FALSE) INTO resume_waiting_on_relationship
    FROM pg_stat_activity
    WHERE pid = resume_backend_pid;
    EXIT WHEN resume_waiting_on_relationship;
  END LOOP;
  IF NOT resume_waiting_on_relationship THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_RESUME_INTERLEAVE_NOT_REACHED';
  END IF;
  PERFORM dblink_send_query('suspend_resume_admin', $query$SELECT account_suspended FROM public.suspend_account_and_professional('b1000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000003', 'Administrative race suspension', NULL)$query$);
  PERFORM dblink_exec('suspend_resume_guard', 'COMMIT');
  SELECT relationship_id INTO resume_result FROM dblink_get_result('suspend_resume_client', false) AS result(relationship_id UUID);
  SELECT account_suspended INTO suspension_result FROM dblink_get_result('suspend_resume_admin', false) AS result(account_suspended BOOLEAN);
  resume_error := dblink_error_message('suspend_resume_client');
  suspension_error := dblink_error_message('suspend_resume_admin');
  IF COALESCE(resume_error, '') ~* '40P01|deadlock' OR COALESCE(suspension_error, '') ~* '40P01|deadlock' THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_RESUME_DEADLOCK: resume=% suspension=%', resume_error, suspension_error;
  END IF;
  IF suspension_result IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_RESUME_SUSPENSION_FAILED: result=% error=%', suspension_result, suspension_error;
  END IF;
  IF resume_result IS NULL AND resume_error NOT LIKE '%COACHING_TRAINER_NOT_ACTIVE%' THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_RESUME_WRONG_LOSER_ERROR: %', resume_error;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = 'b1000000-0000-4000-8000-000000000001'
      AND profile.account_status <> 'suspended'
  ) THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_RESUME_TRAINER_NOT_SUSPENDED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.id = 'b7000000-0000-4000-8000-000000000007' AND relationship.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.coaching_consents consent
    WHERE consent.relationship_id = 'b7000000-0000-4000-8000-000000000007' AND consent.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'COACHING_SUSPEND_RESUME_ACTIVE_STATE: result=% error=%', resume_result, resume_error;
  END IF;
  PERFORM dblink_disconnect('suspend_resume_guard');
  PERFORM dblink_disconnect('suspend_resume_client');
  PERFORM dblink_disconnect('suspend_resume_admin');
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
  runPsql(resumeAcceptRaceFixtureSql, 'creating committed resume-versus-accept race fixture')
  runPsql(resumeAcceptRaceSql, 'running real dblink resume-versus-accept race')
  runPsql(suspensionAcceptRaceFixtureSql, 'creating committed suspension-versus-accept race fixture')
  runPsql(suspensionAcceptRaceSql, 'running real dblink suspension-versus-accept race')
  runPsql(suspensionResumeRaceFixtureSql, 'creating committed suspension-versus-resume race fixture')
  runPsql(suspensionResumeRaceSql, 'running real dblink suspension-versus-resume race')
  process.stdout.write('\n[trainer-relationships-db] PASS: pgTAP assertions and four real dblink races passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    process.stdout.write(cleanup.status === 0
      ? '[trainer-relationships-db] removed isolated ' + container + '\n'
      : '[trainer-relationships-db] warning: failed to remove ' + container + '\n')
  }
}
