import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'
import { loadLegacyOwnerBoundary } from './trainer-authorization-production-boundary.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const authorizationMode = process.argv.includes('--authorization')
const securityMode = process.argv.includes('--security')
const image = process.env.TRAINER_PROGRAMMING_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-trainer-programming-db-${process.pid}-${Date.now().toString(36)}`
const trainerMigrationFiles = [
  '040_trainer_foundations.sql',
  '041_trainer_verification.sql',
  '042_trainer_relationships.sql',
  '043_trainer_programming.sql',
  '044_trainer_insights.sql',
  '045_trainer_hardening.sql',
  '046_release_session_authorization.sql',
  '047_product_notification_preferences_insert.sql',
  '048_profile_weight_measurement_sync.sql',
  '049_trainer_iso_weekday_repair.sql',
  '050_product_events_conversion_funnel.sql',
  '051_workout_adjustment_atomic.sql',
]
const migrationPath = file => path.join(repoRoot, 'supabase', 'migrations', file)
const readMigration = file => readFileSync(migrationPath(file), 'utf8')
const isoWeekdayMigrationFile = '049_trainer_iso_weekday_repair.sql'
const testPath = path.join(repoRoot, 'supabase', 'tests', '043_trainer_programming_test.sql')
const insightsTestPath = path.join(repoRoot, 'supabase', 'tests', '044_trainer_insights_test.sql')
const isoWeekdayTestPath = path.join(repoRoot, 'supabase', 'tests', '049_trainer_iso_weekday_repair_test.sql')
const conversionFunnelTestPath = path.join(repoRoot, 'supabase', 'tests', '050_product_events_conversion_funnel_test.sql')
const workoutAdjustmentTestPath = path.join(repoRoot, 'supabase', 'tests', '051_workout_adjustment_atomic_test.sql')
const authorizationTestPath = path.join(repoRoot, 'supabase', 'tests', 'trainer_authorization_test.sql')
const securityTestPath = path.join(repoRoot, 'supabase', 'tests', 'trainer_security_test.sql')
const auditTestPath = path.join(repoRoot, 'supabase', 'tests', 'trainer_audit_test.sql')

// Represents rows written by migrations 041-043 before migration 045 exists.
// The hardening migration must redact them once, then remain rerunnable after
// the append-only guard has been installed.
const legacyProfessionalAuditSql = `
INSERT INTO public.professional_audit_logs (
  id, actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
) VALUES
  (
    'ad900000-0000-4000-8000-000000000001',
    'ad900000-0000-4000-8000-000000000011',
    'ad900000-0000-4000-8000-000000000012',
    'coaching_relationship',
    'ad900000-0000-4000-8000-000000000021',
    'ended',
    jsonb_build_object(
      'idempotency_key', 'ad900000-0000-4000-8000-000000000031',
      'reason', 'legacy private reason',
      'change_summary', 'legacy private summary'
    )
  ),
  (
    'ad900000-0000-4000-8000-000000000002',
    NULL,
    NULL,
    'private@example.test',
    NULL,
    'https://storage.example.test/private/path',
    jsonb_build_object('notes', 'legacy private note')
  );
`

const legacyConversionHistorySql = `
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f5000000-0000-4000-8000-000000000001', 'conversion-existing@example.test', '{}'::JSONB);
INSERT INTO public.profiles (id, full_name, onboarding_done, account_status) VALUES
  ('f5000000-0000-4000-8000-000000000001', 'Conversion existing user', TRUE, 'active');
INSERT INTO public.progress_logs (id, user_id, completed_at, duration_minutes) VALUES
  ('f5000000-0000-4000-8000-000000000101', 'f5000000-0000-4000-8000-000000000001', NOW() - INTERVAL '1 day', 20);
COMMIT;
`

const conversionFunnelRerunFixtureSql = `
BEGIN;
INSERT INTO public.progress_logs (id, user_id, completed_at, duration_minutes) VALUES
  ('f5000000-0000-4000-8000-000000000102', 'f5000000-0000-4000-8000-000000000001', NOW() - INTERVAL '1 minute', 42),
  ('f5000000-0000-4000-8000-000000000103', 'f5000000-0000-4000-8000-000000000001', NOW(), 80);
COMMIT;
`

const conversionFunnelRerunVerifySql = `
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.progress_logs WHERE user_id = 'f5000000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'migration 050 rerun changed committed session history';
  END IF;
  IF (SELECT completed_count FROM private.session_completion_analytics_state WHERE user_id = 'f5000000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'migration 050 rerun changed the authoritative completion ordinal';
  END IF;
  IF (SELECT COUNT(*) FROM public.product_events WHERE user_id = 'f5000000-0000-4000-8000-000000000001') <> 1
     OR (SELECT event_name FROM public.product_events WHERE user_id = 'f5000000-0000-4000-8000-000000000001') <> 'second_session_completed' THEN
    RAISE EXCEPTION 'migration 050 rerun duplicated or removed the committed milestone';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_events
    WHERE user_id = 'f5000000-0000-4000-8000-000000000001'
      AND (
        path <> '/session'
        OR properties - ARRAY['path', 'authenticated', 'duration_bucket'] <> '{}'::JSONB
        OR properties::TEXT LIKE '%f5000000-%'
      )
  ) THEN
    RAISE EXCEPTION 'migration 050 persisted a non-canonical or identifying milestone payload';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_events'::regclass
      AND conname IN ('product_events_event_name_check', 'product_events_path_check')
      AND NOT convalidated
  ) THEN
    RAISE EXCEPTION 'migration 050 rerun left an unvalidated product event constraint';
  END IF;
END;
$$;
`

const legacyIsoWeekdayFixturesSql = `
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f4700000-0000-4000-8000-000000000001', 'iso-repair-trainer@example.test', '{}'::jsonb),
  ('f4700000-0000-4000-8000-000000000002', 'iso-repair-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, full_name, avatar_url, onboarding_done, account_status) VALUES
  ('f4700000-0000-4000-8000-000000000001', 'ISO repair trainer', 'https://example.test/iso-repair-trainer.webp', TRUE, 'active'),
  ('f4700000-0000-4000-8000-000000000002', 'ISO repair client', 'https://example.test/iso-repair-client.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES
  ('f4700000-0000-4000-8000-000000000011', 'f4700000-0000-4000-8000-000000000001', 'approved', NOW());
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('f4700000-0000-4000-8000-000000000021', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000011', 'iso-repair-trainer', 'active', 'ISO repair trainer', 'Bio', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('f4700000-0000-4000-8000-000000000031', 'f4700000-0000-4000-8000-000000000021', 'ISO repair service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000031', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('f4700000-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'f4700000-0000-4000-8000-000000000002');

SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status) VALUES
  ('f4700000-0000-4000-8000-000000000061', 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'proposed'),
  ('f4700000-0000-4000-8000-000000000062', 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'proposed'),
  ('f4700000-0000-4000-8000-000000000064', 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'proposed');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id) VALUES
  (
    'f4700000-0000-4000-8000-000000000071',
    'f4700000-0000-4000-8000-000000000061',
    1,
    '{"schemaVersion":1,"workouts":[{"dayOfWeek":7,"orderInPlan":1}]}'::jsonb,
    'proposed',
    'f4700000-0000-4000-8000-000000000091'
  ),
  (
    'f4700000-0000-4000-8000-000000000072',
    'f4700000-0000-4000-8000-000000000062',
    1,
    '{"schemaVersion":1,"workouts":[{"dayOfWeek":6,"orderInPlan":1},{"dayOfWeek":7,"orderInPlan":1}]}'::jsonb,
    'proposed',
    'f4700000-0000-4000-8000-000000000093'
  ),
  (
    'f4700000-0000-4000-8000-000000000074',
    'f4700000-0000-4000-8000-000000000064',
    1,
    '{"schemaVersion":1,"workouts":[{"dayOfWeek":7,"orderInPlan":1}]}'::jsonb,
    'proposed',
    'f4700000-0000-4000-8000-000000000095'
  );
INSERT INTO public.workout_plans (
  id, user_id, name, family_id, source_type, library_slot, prescription_locked,
  trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id
) VALUES
  ('f4700000-0000-4000-8000-000000000091', 'f4700000-0000-4000-8000-000000000002', 'Recoverable ISO plan', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000061', 'f4700000-0000-4000-8000-000000000071'),
  ('f4700000-0000-4000-8000-000000000093', 'f4700000-0000-4000-8000-000000000002', 'Malformed ISO plan', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000062', 'f4700000-0000-4000-8000-000000000072'),
  ('f4700000-0000-4000-8000-000000000095', 'f4700000-0000-4000-8000-000000000002', 'Non-adjacent ISO plan', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000064', 'f4700000-0000-4000-8000-000000000074');
INSERT INTO public.workout_plans (id, user_id, name, family_id, source_type, is_active) VALUES
  ('f4700000-0000-4000-8000-000000000092', 'f4700000-0000-4000-8000-000000000002', 'Personal ISO control', gen_random_uuid(), 'manual', FALSE);

SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES
  ('f4700000-0000-4000-8000-000000000101', 'f4700000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000091', 'Recoverable Sunday', 6, 1),
  ('f4700000-0000-4000-8000-000000000103', 'f4700000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000093', 'Malformed Sunday', 6, 1),
  ('f4700000-0000-4000-8000-000000000102', 'f4700000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000092', 'Personal control', 6, 1),
  ('f4700000-0000-4000-8000-000000000105', 'f4700000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000095', 'Non-adjacent Sunday', 2, 1);
RESET ROLE;
COMMIT;
`

const assertIsoWeekdayRepairRollbackSql = `
DO $$
BEGIN
  IF (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000101') <> 6 THEN
    RAISE EXCEPTION 'failed ISO migration changed recoverable data before rollback';
  END IF;
  IF (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000102') <> 6 THEN
    RAISE EXCEPTION 'failed ISO migration changed personal data before rollback';
  END IF;
  IF (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000105') <> 2 THEN
    RAISE EXCEPTION 'failed ISO migration changed non-adjacent recoverable data before rollback';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.workouts'::regclass
      AND tgname = 'trg_enforce_trainer_workout_iso_schedule'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'failed ISO migration left its defensive trigger installed';
  END IF;
END;
$$;
`

const removeMalformedIsoWeekdayFixtureSql = `
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
DELETE FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000103';
UPDATE public.trainer_assignment_versions
SET materialized_plan_id = NULL
WHERE id = 'f4700000-0000-4000-8000-000000000072';
DELETE FROM public.workout_plans WHERE id = 'f4700000-0000-4000-8000-000000000093';
DELETE FROM public.trainer_assignment_versions WHERE id = 'f4700000-0000-4000-8000-000000000072';
DELETE FROM public.trainer_plan_assignments WHERE id = 'f4700000-0000-4000-8000-000000000062';
RESET ROLE;
COMMIT;
`

const malformedIsoStringFixturesSql = `
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status) VALUES
  ('f4700000-0000-4000-8000-000000000063', 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'proposed'),
  ('f4700000-0000-4000-8000-000000000065', 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000001', 'f4700000-0000-4000-8000-000000000002', 'proposed');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id) VALUES
  (
    'f4700000-0000-4000-8000-000000000073',
    'f4700000-0000-4000-8000-000000000063',
    1,
    '{"schemaVersion":"1","workouts":[{"dayOfWeek":7,"orderInPlan":1}]}'::jsonb,
    'proposed',
    'f4700000-0000-4000-8000-000000000094'
  ),
  (
    'f4700000-0000-4000-8000-000000000075',
    'f4700000-0000-4000-8000-000000000065',
    1,
    '{"schemaVersion":1,"workouts":[{"dayOfWeek":"7","orderInPlan":"1"}]}'::jsonb,
    'proposed',
    'f4700000-0000-4000-8000-000000000096'
  );
INSERT INTO public.workout_plans (
  id, user_id, name, family_id, source_type, library_slot, prescription_locked,
  trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id
) VALUES
  ('f4700000-0000-4000-8000-000000000094', 'f4700000-0000-4000-8000-000000000002', 'Malformed schema scalar plan', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000063', 'f4700000-0000-4000-8000-000000000073'),
  ('f4700000-0000-4000-8000-000000000096', 'f4700000-0000-4000-8000-000000000002', 'Malformed workout scalar plan', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, 'f4700000-0000-4000-8000-000000000041', 'f4700000-0000-4000-8000-000000000065', 'f4700000-0000-4000-8000-000000000075');

SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES
  ('f4700000-0000-4000-8000-000000000104', 'f4700000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000094', 'Malformed schema scalar workout', 6, 1),
  ('f4700000-0000-4000-8000-000000000106', 'f4700000-0000-4000-8000-000000000002', 'f4700000-0000-4000-8000-000000000096', 'Malformed workout scalar workout', 6, 1);
RESET ROLE;
COMMIT;
`

const removeMalformedIsoSchemaFixtureSql = `
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
DELETE FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000104';
UPDATE public.trainer_assignment_versions
SET materialized_plan_id = NULL
WHERE id = 'f4700000-0000-4000-8000-000000000073';
DELETE FROM public.workout_plans WHERE id = 'f4700000-0000-4000-8000-000000000094';
DELETE FROM public.trainer_assignment_versions WHERE id = 'f4700000-0000-4000-8000-000000000073';
DELETE FROM public.trainer_plan_assignments WHERE id = 'f4700000-0000-4000-8000-000000000063';
RESET ROLE;
COMMIT;
`

const removeMalformedIsoWorkoutScalarFixtureSql = `
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
DELETE FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000106';
UPDATE public.trainer_assignment_versions
SET materialized_plan_id = NULL
WHERE id = 'f4700000-0000-4000-8000-000000000075';
DELETE FROM public.workout_plans WHERE id = 'f4700000-0000-4000-8000-000000000096';
DELETE FROM public.trainer_assignment_versions WHERE id = 'f4700000-0000-4000-8000-000000000075';
DELETE FROM public.trainer_plan_assignments WHERE id = 'f4700000-0000-4000-8000-000000000065';
RESET ROLE;
COMMIT;
`

// This is the smallest faithful pre-041 surface: the auth/API roles come from
// the Supabase image, while these legacy tables/functions are real dependencies
// of migrations 041–043 rather than mocked application behavior.
const bootstrapSql = `
GRANT anon, authenticated, service_role TO postgres;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner UUID, public BOOLEAN NOT NULL DEFAULT FALSE, file_size_limit BIGINT, allowed_mime_types TEXT[]);
CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE, name TEXT NOT NULL, owner UUID, metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (bucket_id, name));
CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, avatar_url TEXT, weight_kg NUMERIC, onboarding_done BOOLEAN NOT NULL DEFAULT FALSE, is_admin BOOLEAN NOT NULL DEFAULT FALSE, account_status TEXT NOT NULL DEFAULT 'active', suspension_reason TEXT, suspended_at TIMESTAMPTZ, suspended_until TIMESTAMPTZ, suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL);
CREATE TABLE public.admin_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id UUID, target_user_id UUID, action TEXT NOT NULL, reason TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.product_notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, dedupe_key TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, dedupe_key));
CREATE TABLE public.professional_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id UUID, subject_user_id UUID, entity_type TEXT NOT NULL, entity_id UUID, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_name TEXT NOT NULL CHECK (event_name IN ('landing_view', 'primary_cta_clicked', 'language_changed', 'signup_started', 'signup_completed', 'onboarding_step_completed', 'onboarding_abandoned', 'plan_generated', 'first_session_started', 'first_session_completed', 'plan_adjustment_used', 'organic_page_cta_clicked')),
  anonymous_id UUID NOT NULL, user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locale TEXT CHECK (locale IN ('es', 'en')), path TEXT CHECK (path IS NULL OR path IN ('/', '/es', '/en', '/register', '/onboarding')),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = p_user_id AND profile.account_status = 'active') $$;
CREATE OR REPLACE FUNCTION public.enforce_protected_profile_fields() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$ BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN NEW.is_admin := OLD.is_admin; NEW.account_status := OLD.account_status; NEW.suspension_reason := OLD.suspension_reason; NEW.suspended_at := OLD.suspended_at; NEW.suspended_until := OLD.suspended_until; NEW.suspended_by := OLD.suspended_by; END IF; RETURN NEW; END; $$;
CREATE TRIGGER trg_enforce_protected_profile_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_profile_fields();
GRANT EXECUTE ON FUNCTION public.is_account_active(UUID) TO authenticated, service_role;
GRANT ALL ON TABLE public.product_notifications, public.professional_audit_logs, public.product_events TO service_role;
`

const planBootstrapSql = `
ALTER TABLE public.profiles ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN timezone TEXT;
ALTER TABLE public.profiles ADD COLUMN days_per_week INTEGER;
ALTER TABLE public.profiles ADD COLUMN session_duration_minutes INTEGER;
ALTER TABLE public.profiles ADD COLUMN preferred_workout_days INTEGER[];
ALTER TABLE public.profiles ADD COLUMN available_equipment TEXT[];
ALTER TABLE public.profiles ADD COLUMN cardio_preferences TEXT[];
ALTER TABLE public.profiles ADD COLUMN fitness_level TEXT;
ALTER TABLE public.profiles ADD COLUMN primary_goal TEXT;
ALTER TABLE public.profiles ADD COLUMN gym_type TEXT;
ALTER TABLE public.profiles ADD COLUMN movement_limitations JSONB NOT NULL DEFAULT '[]'::JSONB;
CREATE TABLE public.exercises (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, name_es TEXT, muscle_groups TEXT[], muscle_groups_es TEXT[], is_compound BOOLEAN, is_public BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE public.workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), name TEXT NOT NULL,
  goal TEXT, duration_weeks INTEGER, days_per_week INTEGER, difficulty TEXT, is_active BOOLEAN NOT NULL DEFAULT FALSE,
  generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE, ai_notes TEXT, week_number INTEGER NOT NULL DEFAULT 1,
  plan_context TEXT NOT NULL DEFAULT 'first_plan', parent_plan_id UUID, source_type TEXT NOT NULL DEFAULT 'ai',
  generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb, family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  generation_request_id UUID, retired_at TIMESTAMPTZ, superseded_at TIMESTAMPTZ, manually_updated_at TIMESTAMPTZ,
  source_post_id UUID, source_user_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.workouts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), plan_id UUID REFERENCES public.workout_plans(id), name TEXT NOT NULL, focus TEXT, day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7), order_in_plan INTEGER, estimated_duration_minutes INTEGER);
CREATE TABLE public.workout_exercises (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workout_id UUID NOT NULL REFERENCES public.workouts(id), exercise_id UUID REFERENCES public.exercises(id), order_index INTEGER, sets INTEGER, reps INTEGER, duration_seconds INTEGER, rest_seconds INTEGER, target_rpe INTEGER, weight_kg NUMERIC, notes TEXT, weight_suggestion_basis TEXT);
CREATE TABLE public.plan_generation_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), mode TEXT NOT NULL, generator TEXT NOT NULL, success BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.posts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), routine_snapshot JSONB);
CREATE TABLE public.progress_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), workout_id UUID REFERENCES public.workouts(id), session_context_snapshot JSONB, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), duration_minutes INTEGER, mood_rating INTEGER, notes TEXT);
CREATE TABLE public.exercise_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), progress_log_id UUID NOT NULL REFERENCES public.progress_logs(id), exercise_id UUID REFERENCES public.exercises(id), sets_completed INTEGER, reps_completed INTEGER[], weights_kg NUMERIC[], rpe_values NUMERIC[], duration_seconds INTEGER, notes TEXT);
CREATE TABLE public.measurements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), weight_kg NUMERIC, body_fat_percentage NUMERIC, muscle_mass_kg NUMERIC, chest_cm NUMERIC, waist_cm NUMERIC, hips_cm NUMERIC, arms_cm NUMERIC, legs_cm NUMERIC, notes TEXT);
CREATE OR REPLACE FUNCTION public.record_plan_generation_success(p_plan_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.plan_generation_events (user_id, mode, generator, success) SELECT user_id, 'initial', 'evidence_engine', TRUE FROM public.workout_plans WHERE id = p_plan_id; END; $$;
`

// This runs after the pgTAP transaction rolls back. dblink sessions therefore
// observe a committed fixture, which is essential for a real acceptance race.
const acceptanceRaceSql = `
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'accept-race-trainer@example.test', '{}'::jsonb),
  ('cccccccc-0000-4000-8000-000000000002', 'accept-race-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, avatar_url, onboarding_done, account_status) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'https://example.test/race-trainer.webp', TRUE, 'active'),
  ('cccccccc-0000-4000-8000-000000000002', 'https://example.test/race-client.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES ('cccccccc-0000-4000-8000-000000000011', 'cccccccc-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('cccccccc-0000-4000-8000-000000000021', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000011', 'accept-race-trainer', 'active', 'Acceptance trainer', 'Race', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('cccccccc-0000-4000-8000-000000000031', 'cccccccc-0000-4000-8000-000000000021', 'Acceptance service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('cccccccc-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000031', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('cccccccc-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'cccccccc-0000-4000-8000-000000000002');
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active) VALUES
  ('cccccccc-0000-4000-8000-000000000051', 'cccccccc-0000-4000-8000-000000000002', 'Race personal', gen_random_uuid(), TRUE);
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status) VALUES
  ('cccccccc-0000-4000-8000-000000000061', 'cccccccc-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 'proposed');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id) VALUES
  ('cccccccc-0000-4000-8000-000000000071', 'cccccccc-0000-4000-8000-000000000061', 1, '{"schemaVersion":1,"workouts":[{"dayOfWeek":1,"orderInPlan":1}]}'::jsonb, 'proposed', 'cccccccc-0000-4000-8000-000000000081');
INSERT INTO public.workout_plans (id, user_id, name, family_id, source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id) VALUES
  ('cccccccc-0000-4000-8000-000000000081', 'cccccccc-0000-4000-8000-000000000002', 'Race professional', gen_random_uuid(), 'trainer_assigned', 'professional', TRUE, 'cccccccc-0000-4000-8000-000000000041', 'cccccccc-0000-4000-8000-000000000061', 'cccccccc-0000-4000-8000-000000000071');
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES
  ('cccccccc-0000-4000-8000-000000000091', 'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000081', 'Race day', 1, 1);
RESET ROLE;
COMMIT;
SELECT pg_advisory_lock(hashtextextended('cccccccc-0000-4000-8000-000000000002', 0));
SELECT dblink_connect('accept_a', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('accept_b', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('accept_a', $$SET request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000002'$$);
SELECT dblink_exec('accept_a', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('accept_a', 'SET ROLE authenticated');
SELECT dblink_exec('accept_b', $$SET request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000002'$$);
SELECT dblink_exec('accept_b', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('accept_b', 'SET ROLE authenticated');
SELECT dblink_exec('accept_a', $$CREATE FUNCTION pg_temp.try_accept_a() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN PERFORM public.accept_trainer_assignment('cccccccc-0000-4000-8000-000000000061', 'race-key-a'); RETURN jsonb_build_object('ok', true); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM); END; $f$;$$);
SELECT dblink_exec('accept_b', $$CREATE FUNCTION pg_temp.try_accept_b() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN PERFORM public.accept_trainer_assignment('cccccccc-0000-4000-8000-000000000061', 'race-key-b'); RETURN jsonb_build_object('ok', true); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM); END; $f$;$$);
SELECT dblink_send_query('accept_a', 'SELECT pg_temp.try_accept_a()');
SELECT dblink_send_query('accept_b', 'SELECT pg_temp.try_accept_b()');
DO $$ DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds'; BEGIN LOOP EXIT WHEN dblink_is_busy('accept_a') = 1 AND dblink_is_busy('accept_b') = 1; IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'acceptance race did not dispatch'; END IF; PERFORM pg_sleep(0.01); END LOOP; END; $$;
SELECT pg_advisory_unlock(hashtextextended('cccccccc-0000-4000-8000-000000000002', 0));
CREATE TEMP TABLE acceptance_race_results (result JSONB NOT NULL);
INSERT INTO acceptance_race_results SELECT result FROM dblink_get_result('accept_a') AS response(result JSONB);
INSERT INTO acceptance_race_results SELECT result FROM dblink_get_result('accept_b') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT count(*) FROM acceptance_race_results WHERE result->>'sqlstate' = '40P01') <> 0 THEN RAISE EXCEPTION 'acceptance race deadlocked'; END IF;
  IF (SELECT count(*) FROM acceptance_race_results WHERE (result->>'ok')::boolean) <> 1 THEN RAISE EXCEPTION 'acceptance race did not produce exactly one winner: %', (SELECT string_agg(result::text, ' | ') FROM acceptance_race_results); END IF;
  IF (SELECT count(*) FROM acceptance_race_results WHERE NOT COALESCE((result->>'ok')::boolean, false) AND result->>'message' LIKE '%TRAINER_ASSIGNMENT_NOT_PROPOSED%') <> 1 THEN RAISE EXCEPTION 'acceptance race loser was not deterministically rejected: %', (SELECT string_agg(result::text, ' | ') FROM acceptance_race_results); END IF;
  IF (SELECT count(*) FROM public.trainer_plan_assignments WHERE id = 'cccccccc-0000-4000-8000-000000000061' AND status = 'active') <> 1 THEN RAISE EXCEPTION 'acceptance race did not activate assignment'; END IF;
  IF (SELECT count(*) FROM public.workout_plans WHERE user_id = 'cccccccc-0000-4000-8000-000000000002' AND is_active AND library_slot = 'professional') <> 1 THEN RAISE EXCEPTION 'acceptance race did not leave professional winner active'; END IF;
  IF (SELECT is_active FROM public.workout_plans WHERE id = 'cccccccc-0000-4000-8000-000000000051') THEN RAISE EXCEPTION 'acceptance race did not preserve prior plan as inactive'; END IF;
  IF (SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = 'cccccccc-0000-4000-8000-000000000061' AND action = 'accepted') <> 1 THEN RAISE EXCEPTION 'acceptance race audit duplication'; END IF;
  IF (SELECT count(*) FROM public.product_notifications WHERE user_id = 'cccccccc-0000-4000-8000-000000000001' AND dedupe_key = 'coaching-assignment-accepted:cccccccc-0000-4000-8000-000000000061') <> 1 THEN RAISE EXCEPTION 'acceptance race notification duplication'; END IF;
END;
$$;
SELECT dblink_disconnect('accept_a');
SELECT dblink_disconnect('accept_b');
`

// Hold the relationship lock in the real revocation transaction, then dispatch
// the measurements RPC in a second authenticated connection. The reader must
// recheck after the revocation commits and return only the generic error.
const measurementRevocationRaceSql = `
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'measurement-race-trainer@example.test', '{}'::jsonb),
  ('d4000000-0000-4000-8000-000000000002', 'measurement-race-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, full_name, avatar_url, timezone, onboarding_done, account_status) VALUES
  ('d4000000-0000-4000-8000-000000000001', 'Measurement race trainer', 'https://example.test/measurement-race-trainer.webp', 'America/Havana', TRUE, 'active'),
  ('d4000000-0000-4000-8000-000000000002', 'Measurement race client', 'https://example.test/measurement-race-client.webp', 'America/Havana', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES ('d4000000-0000-4000-8000-000000000011', 'd4000000-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('d4000000-0000-4000-8000-000000000021', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000011', 'measurement-race-trainer', 'active', 'Measurement race trainer', 'Race', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('d4000000-0000-4000-8000-000000000031', 'd4000000-0000-4000-8000-000000000021', 'Measurement race service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('d4000000-0000-4000-8000-000000000041', 'd4000000-0000-4000-8000-000000000031', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('d4000000-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'd4000000-0000-4000-8000-000000000002'),
  ('d4000000-0000-4000-8000-000000000041', 'body_measurements', 'body-measurements-v1', 'd4000000-0000-4000-8000-000000000002');
INSERT INTO public.measurements (user_id, recorded_at, weight_kg, notes) VALUES
  ('d4000000-0000-4000-8000-000000000002', NOW(), 70, 'RACE_NOTE_MUST_NOT_LEAK');
SELECT dblink_connect('measurement_reader', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('measurement_revoker', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('measurement_reader', $$SET application_name = 'measurement-race-reader'$$);
SELECT dblink_exec('measurement_reader', $$SET request.jwt.claim.sub = 'd4000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('measurement_reader', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('measurement_reader', 'SET ROLE authenticated');
SELECT dblink_exec('measurement_reader', $$CREATE FUNCTION pg_temp.try_measurements() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN RETURN jsonb_build_object('ok', true, 'payload', public.get_coach_client_measurements('d4000000-0000-4000-8000-000000000002', CURRENT_DATE - 30, CURRENT_DATE)); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM); END; $f$;$$);
SELECT dblink_exec('measurement_revoker', $$SET request.jwt.claim.sub = 'd4000000-0000-4000-8000-000000000002'$$);
SELECT dblink_exec('measurement_revoker', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('measurement_revoker', 'SET ROLE service_role');
SELECT dblink_exec('measurement_revoker', $$BEGIN; DO $lock$ BEGIN PERFORM 1 FROM public.coaching_relationships WHERE id = 'd4000000-0000-4000-8000-000000000041' FOR UPDATE; END $lock$;$$);
SELECT dblink_send_query('measurement_reader', 'SELECT pg_temp.try_measurements()');
DO $$
DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'measurement-race-reader' AND wait_event_type = 'Lock');
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'measurement reader did not wait for revocation lock'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT dblink_exec('measurement_revoker', $$SET ROLE authenticated; DO $revoke$ BEGIN PERFORM public.revoke_body_measurements_consent('d4000000-0000-4000-8000-000000000041', gen_random_uuid()); END $revoke$; COMMIT;$$);
CREATE TEMP TABLE measurement_race_results (result JSONB NOT NULL);
INSERT INTO measurement_race_results SELECT result FROM dblink_get_result('measurement_reader') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT result->>'ok' FROM measurement_race_results) <> 'false' THEN RAISE EXCEPTION 'measurement reader returned data after effective revocation: %', (SELECT result FROM measurement_race_results); END IF;
  IF (SELECT result->>'sqlstate' FROM measurement_race_results) <> 'P0001' OR (SELECT result->>'message' FROM measurement_race_results) <> 'COACH_CLIENT_INSIGHTS_UNAVAILABLE' THEN RAISE EXCEPTION 'measurement reader leaked revocation result: %', (SELECT result FROM measurement_race_results); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_consents WHERE relationship_id = 'd4000000-0000-4000-8000-000000000041' AND scope = 'body_measurements' AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'measurement revocation did not commit'; END IF;
END;
$$;
SELECT dblink_disconnect('measurement_reader');
SELECT dblink_disconnect('measurement_revoker');
`

// Hold the same relationship row that a real training-consent revocation
// updates. The detail RPC must wait, recheck the committed revocation, and
// return the generic unavailable error without reading client evidence.
const detailRevocationRaceSql = `
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'detail-race-trainer@example.test', '{}'::jsonb),
  ('d5000000-0000-4000-8000-000000000002', 'detail-race-client@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, full_name, avatar_url, timezone, onboarding_done, account_status) VALUES
  ('d5000000-0000-4000-8000-000000000001', 'Detail race trainer', 'https://example.test/detail-race-trainer.webp', 'America/Havana', TRUE, 'active'),
  ('d5000000-0000-4000-8000-000000000002', 'Detail race client', 'https://example.test/detail-race-client.webp', 'America/Havana', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES
  ('d5000000-0000-4000-8000-000000000011', 'd5000000-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('d5000000-0000-4000-8000-000000000021', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000011', 'detail-race-trainer', 'active', 'Detail race trainer', 'Race', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('d5000000-0000-4000-8000-000000000031', 'd5000000-0000-4000-8000-000000000021', 'Detail race service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('d5000000-0000-4000-8000-000000000041', 'd5000000-0000-4000-8000-000000000031', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('d5000000-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'd5000000-0000-4000-8000-000000000002');
SELECT dblink_connect('detail_reader', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('detail_revoker', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('detail_reader', $$SET application_name = 'detail-race-reader'$$);
SELECT dblink_exec('detail_reader', $$SET request.jwt.claim.sub = 'd5000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('detail_reader', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('detail_reader', 'SET ROLE authenticated');
SELECT dblink_exec('detail_reader', $$CREATE FUNCTION pg_temp.try_detail() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN RETURN jsonb_build_object('ok', true, 'payload', public.get_coach_client_insights('d5000000-0000-4000-8000-000000000002', CURRENT_DATE - 30, CURRENT_DATE)); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM); END; $f$;$$);
SELECT dblink_exec('detail_revoker', $$SET request.jwt.claim.sub = 'd5000000-0000-4000-8000-000000000002'$$);
SELECT dblink_exec('detail_revoker', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('detail_revoker', 'SET ROLE service_role');
SELECT dblink_exec('detail_revoker', $$BEGIN; DO $lock$ BEGIN PERFORM 1 FROM public.coaching_relationships WHERE id = 'd5000000-0000-4000-8000-000000000041' FOR UPDATE; END $lock$;$$);
SELECT dblink_send_query('detail_reader', 'SELECT pg_temp.try_detail()');
DO $$
DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'detail-race-reader' AND wait_event_type = 'Lock');
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'detail reader did not wait for revocation lock'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT dblink_exec('detail_revoker', $$SET ROLE authenticated; DO $revoke$ BEGIN PERFORM public.revoke_training_profile_consent('d5000000-0000-4000-8000-000000000041', gen_random_uuid()); END $revoke$; COMMIT;$$);
CREATE TEMP TABLE detail_race_results (result JSONB NOT NULL);
INSERT INTO detail_race_results SELECT result FROM dblink_get_result('detail_reader') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT result->>'ok' FROM detail_race_results) <> 'false' THEN RAISE EXCEPTION 'detail reader returned data after effective revocation: %', (SELECT result FROM detail_race_results); END IF;
  IF (SELECT result->>'sqlstate' FROM detail_race_results) <> 'P0001' OR (SELECT result->>'message' FROM detail_race_results) <> 'COACH_CLIENT_INSIGHTS_UNAVAILABLE' THEN RAISE EXCEPTION 'detail reader leaked revocation result: %', (SELECT result FROM detail_race_results); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_relationships WHERE id = 'd5000000-0000-4000-8000-000000000041' AND status = 'ended') THEN RAISE EXCEPTION 'detail revocation did not end relationship'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_consents WHERE relationship_id = 'd5000000-0000-4000-8000-000000000041' AND scope = 'training_profile' AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'detail revocation did not commit'; END IF;
END;
$$;
SELECT dblink_disconnect('detail_reader');
SELECT dblink_disconnect('detail_revoker');
`

// A real administrative suspension updates the trainer account, professional
// profile, relationships, and consents. The summary must wait on that authority
// transition and re-evaluate to the same generic unavailable response.
const summarySuspensionRaceSql = `
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('d6000000-0000-4000-8000-000000000001', 'summary-race-trainer@example.test', '{}'::jsonb),
  ('d6000000-0000-4000-8000-000000000002', 'summary-race-client@example.test', '{}'::jsonb),
  ('d6000000-0000-4000-8000-000000000003', 'summary-race-admin@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, full_name, avatar_url, timezone, onboarding_done, is_admin, account_status) VALUES
  ('d6000000-0000-4000-8000-000000000001', 'Summary race trainer', 'https://example.test/summary-race-trainer.webp', 'America/Havana', TRUE, FALSE, 'active'),
  ('d6000000-0000-4000-8000-000000000002', 'Summary race client', 'https://example.test/summary-race-client.webp', 'America/Havana', TRUE, FALSE, 'active'),
  ('d6000000-0000-4000-8000-000000000003', 'Summary race admin', NULL, 'America/Havana', TRUE, TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id) VALUES
  ('d6000000-0000-4000-8000-000000000011', 'd6000000-0000-4000-8000-000000000001');
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('d6000000-0000-4000-8000-000000000021', 'd6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000011', 'summary-race-trainer', 'active', 'Summary race trainer', 'Race', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES
  ('d6000000-0000-4000-8000-000000000031', 'd6000000-0000-4000-8000-000000000021', 'Summary race service', 'online', 60);
INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status) VALUES
  ('d6000000-0000-4000-8000-000000000041', 'd6000000-0000-4000-8000-000000000031', 'd6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('d6000000-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'd6000000-0000-4000-8000-000000000002');
SELECT dblink_connect('summary_reader', 'dbname=postgres user=supabase_admin');
SELECT dblink_connect('summary_suspender', 'dbname=postgres user=supabase_admin');
SELECT dblink_exec('summary_reader', $$SET application_name = 'summary-suspension-race-reader'$$);
SELECT dblink_exec('summary_reader', $$SET request.jwt.claim.sub = 'd6000000-0000-4000-8000-000000000001'$$);
SELECT dblink_exec('summary_reader', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT dblink_exec('summary_reader', 'SET ROLE authenticated');
SELECT dblink_exec('summary_reader', $$CREATE FUNCTION pg_temp.try_summary() RETURNS JSONB LANGUAGE plpgsql AS $f$ BEGIN RETURN jsonb_build_object('ok', true, 'payload', public.get_coach_clients_summary()); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false, 'sqlstate', SQLSTATE, 'message', SQLERRM); END; $f$;$$);
SELECT dblink_exec('summary_suspender', $$SET request.jwt.claim.sub = 'd6000000-0000-4000-8000-000000000003'$$);
SELECT dblink_exec('summary_suspender', $$SET request.jwt.claim.role = 'service_role'$$);
SELECT dblink_exec('summary_suspender', 'SET ROLE service_role');
SELECT dblink_exec('summary_suspender', $$BEGIN; DO $lock$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('d6000000-0000-4000-8000-000000000001', 0)); PERFORM 1 FROM public.profiles WHERE id = 'd6000000-0000-4000-8000-000000000001' FOR UPDATE; PERFORM 1 FROM public.trainer_profiles WHERE user_id = 'd6000000-0000-4000-8000-000000000001' FOR UPDATE; END $lock$;$$);
SELECT dblink_send_query('summary_reader', 'SELECT pg_temp.try_summary()');
DO $$
DECLARE deadline TIMESTAMPTZ := clock_timestamp() + interval '5 seconds';
BEGIN
  LOOP
    EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = 'summary-suspension-race-reader' AND wait_event_type = 'Lock');
    IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'summary reader did not wait for suspension lock'; END IF;
    PERFORM pg_sleep(0.01);
  END LOOP;
END;
$$;
SELECT dblink_exec('summary_suspender', $$DO $suspend$ BEGIN PERFORM public.suspend_account_and_professional('d6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000003', 'Summary suspension race', NULL); END $suspend$; COMMIT;$$);
CREATE TEMP TABLE summary_race_results (result JSONB NOT NULL);
INSERT INTO summary_race_results SELECT result FROM dblink_get_result('summary_reader') AS response(result JSONB);
DO $$
BEGIN
  IF (SELECT result->>'ok' FROM summary_race_results) <> 'false' THEN RAISE EXCEPTION 'summary reader returned data after effective suspension: %', (SELECT result FROM summary_race_results); END IF;
  IF (SELECT result->>'sqlstate' FROM summary_race_results) <> 'P0001' OR (SELECT result->>'message' FROM summary_race_results) <> 'COACH_CLIENT_INSIGHTS_UNAVAILABLE' THEN RAISE EXCEPTION 'summary reader leaked suspension result: %', (SELECT result FROM summary_race_results); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'd6000000-0000-4000-8000-000000000001' AND account_status = 'suspended') THEN RAISE EXCEPTION 'summary suspension did not suspend account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainer_profiles WHERE user_id = 'd6000000-0000-4000-8000-000000000001' AND status = 'suspended') THEN RAISE EXCEPTION 'summary suspension did not suspend professional profile'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_relationships WHERE id = 'd6000000-0000-4000-8000-000000000041' AND status = 'paused_by_platform') THEN RAISE EXCEPTION 'summary suspension did not pause relationship'; END IF;
END;
$$;
SELECT dblink_disconnect('summary_reader');
SELECT dblink_disconnect('summary_suspender');
`

// Exercise the real authorization RPC across a professional revision. The
// reservation is released before B because the daily policy intentionally
// permits only one live authorization per user/date.
const revisionSessionContinuitySql = `
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001', 'continuity-trainer@example.test', '{}'::jsonb),
  ('eeeeeeee-0000-4000-8000-000000000002', 'continuity-client@example.test', '{}'::jsonb),
  ('eeeeeeee-0000-4000-8000-000000000003', 'continuity-admin@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, full_name, avatar_url, onboarding_done, is_admin, account_status) VALUES
  ('eeeeeeee-0000-4000-8000-000000000001', 'Continuity trainer', 'https://example.test/continuity-trainer.webp', TRUE, FALSE, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'Continuity client', 'https://example.test/continuity-client.webp', TRUE, FALSE, 'active'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'Continuity admin', NULL, TRUE, TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES ('eeeeeeee-0000-4000-8000-000000000011', 'eeeeeeee-0000-4000-8000-000000000001', 'approved', NOW());
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary) VALUES
  ('eeeeeeee-0000-4000-8000-000000000021', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000011', 'continuity-trainer', 'active', 'Continuity trainer', 'Bio', 'Evidence');
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, modality, duration_minutes) VALUES ('eeeeeeee-0000-4000-8000-000000000031', 'eeeeeeee-0000-4000-8000-000000000021', 'Continuity service', 'online', 60);
INSERT INTO public.coaching_requests (id, service_id, trainer_user_id, client_user_id, message, training_profile_consent_version, idempotency_key, acceptance_idempotency_key, status, decided_at) VALUES
  ('eeeeeeee-0000-4000-8000-000000000032', 'eeeeeeee-0000-4000-8000-000000000031', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'Continuity request', 'training-profile-v1', 'eeeeeeee-0000-4000-8000-000000000033', 'eeeeeeee-0000-4000-8000-000000000034', 'accepted', NOW());
INSERT INTO public.coaching_relationships (id, source_request_id, service_id, trainer_user_id, client_user_id, status) VALUES ('eeeeeeee-0000-4000-8000-000000000041', 'eeeeeeee-0000-4000-8000-000000000032', 'eeeeeeee-0000-4000-8000-000000000031', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'active');
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES
  ('eeeeeeee-0000-4000-8000-000000000041', 'training_profile', 'training-profile-v1', 'eeeeeeee-0000-4000-8000-000000000002'),
  ('eeeeeeee-0000-4000-8000-000000000041', 'body_measurements', 'body-measurements-v1', 'eeeeeeee-0000-4000-8000-000000000002');
INSERT INTO public.admin_audit_logs (id, admin_user_id, target_user_id, action, reason, metadata) VALUES
  ('eeeeeeee-0000-4000-8000-000000000035', 'eeeeeeee-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000001', 'trainer_application_approved', 'Continuity fixture approval', jsonb_build_object('application_id', 'eeeeeeee-0000-4000-8000-000000000011'));
INSERT INTO public.exercises (id, name, name_es, muscle_groups, muscle_groups_es, is_compound) VALUES ('eeeeeeee-0000-4000-8000-000000000051', 'Continuity squat', 'Sentadilla', ARRAY['quadriceps'], ARRAY['cuadriceps'], TRUE);
INSERT INTO public.trainer_program_templates (id, trainer_user_id, name, days_per_week) VALUES ('eeeeeeee-0000-4000-8000-000000000061', 'eeeeeeee-0000-4000-8000-000000000001', 'Continuity B', 1);
INSERT INTO public.trainer_template_workouts (id, template_id, name, day_of_week, order_in_plan) VALUES ('eeeeeeee-0000-4000-8000-000000000071', 'eeeeeeee-0000-4000-8000-000000000061', 'Version B day', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER, 1);
INSERT INTO public.trainer_template_exercises (id, template_workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES ('eeeeeeee-0000-4000-8000-000000000081', 'eeeeeeee-0000-4000-8000-000000000071', 'eeeeeeee-0000-4000-8000-000000000051', 1, 3, 8, 60);
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, source_template_id, status, accepted_at, active_version_id) VALUES ('eeeeeeee-0000-4000-8000-000000000091', 'eeeeeeee-0000-4000-8000-000000000041', 'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000061', 'active', NOW(), 'eeeeeeee-0000-4000-8000-000000000101');
INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, status, materialized_plan_id) VALUES (
  'eeeeeeee-0000-4000-8000-000000000101',
  'eeeeeeee-0000-4000-8000-000000000091',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'workouts', jsonb_build_array(jsonb_build_object(
      'dayOfWeek', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER,
      'orderInPlan', 1
    ))
  ),
  'active',
  'eeeeeeee-0000-4000-8000-000000000111'
);
INSERT INTO public.workout_plans (id, user_id, name, family_id, is_active, source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id) VALUES ('eeeeeeee-0000-4000-8000-000000000111', 'eeeeeeee-0000-4000-8000-000000000002', 'Continuity A', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, 'eeeeeeee-0000-4000-8000-000000000041', 'eeeeeeee-0000-4000-8000-000000000091', 'eeeeeeee-0000-4000-8000-000000000101');
INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan) VALUES ('eeeeeeee-0000-4000-8000-000000000121', 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000111', 'Version A day', EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER, 1);
INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_seconds) VALUES ('eeeeeeee-0000-4000-8000-000000000121', 'eeeeeeee-0000-4000-8000-000000000051', 1, 3, 8, 60);
COMMIT;
SET request.jwt.claim.sub = 'eeeeeeee-0000-4000-8000-000000000002'; SET request.jwt.claim.role = 'authenticated'; SET ROLE authenticated;
SELECT public.authorize_session_start('eeeeeeee-0000-4000-8000-000000000131', 'eeeeeeee-0000-4000-8000-000000000121');
RESET ROLE; SET request.jwt.claim.sub = 'eeeeeeee-0000-4000-8000-000000000001'; SET request.jwt.claim.role = 'authenticated'; SET ROLE authenticated;
SELECT public.publish_trainer_assignment_revision('eeeeeeee-0000-4000-8000-000000000091', 'eeeeeeee-0000-4000-8000-000000000061', 'Revision B for future sessions', 'continuity-revision-key');
RESET ROLE; SET request.jwt.claim.sub = 'eeeeeeee-0000-4000-8000-000000000002'; SET request.jwt.claim.role = 'authenticated'; SET ROLE authenticated;
SELECT public.authorize_session_start('eeeeeeee-0000-4000-8000-000000000131', 'eeeeeeee-0000-4000-8000-000000000121');
DO $$ BEGIN
  IF (SELECT plan_id FROM public.session_authorizations WHERE client_session_id = 'eeeeeeee-0000-4000-8000-000000000131') <> 'eeeeeeee-0000-4000-8000-000000000111'::uuid THEN RAISE EXCEPTION 'authorization A plan changed'; END IF;
  IF (SELECT session_context_snapshot->'plan'->>'trainerAssignmentVersionId' FROM public.session_authorizations WHERE client_session_id = 'eeeeeeee-0000-4000-8000-000000000131') <> 'eeeeeeee-0000-4000-8000-000000000101' THEN RAISE EXCEPTION 'authorization A version changed'; END IF;
END $$;
SELECT public.save_session_log_atomic_v3(
  'eeeeeeee-0000-4000-8000-000000000131',
  'eeeeeeee-0000-4000-8000-000000000121',
  NOW(),
  35,
  NULL,
  '[{"exercise_id":"eeeeeeee-0000-4000-8000-000000000051","sets_completed":1,"reps_completed":[8],"weights_kg":[60],"rpe_values":[7],"duration_seconds":null,"notes":"Completed after revision B","skip_reason":null}]'::jsonb,
  '{"version":1,"prs":[],"progressions":[]}'::jsonb
);
DO $$ BEGIN
  IF (SELECT session_context_snapshot->'plan'->>'trainerAssignmentVersionId' FROM public.progress_logs WHERE client_session_id = 'eeeeeeee-0000-4000-8000-000000000131') <> 'eeeeeeee-0000-4000-8000-000000000101' THEN RAISE EXCEPTION 'v3 did not preserve superseded authorization A version'; END IF;
  IF (SELECT count(*) FROM public.exercise_logs WHERE progress_log_id = (SELECT id FROM public.progress_logs WHERE client_session_id = 'eeeeeeee-0000-4000-8000-000000000131') AND exercise_id = 'eeeeeeee-0000-4000-8000-000000000051') <> 1 THEN RAISE EXCEPTION 'v3 did not persist authorized A exercise result'; END IF;
END $$;
RESET ROLE;
`

const trainerMigrationRerunSnapshotSql = `
DROP TABLE IF EXISTS public.trainer_migration_rerun_snapshot;
DROP FUNCTION IF EXISTS public.capture_trainer_migration_rerun_snapshot();
CREATE TABLE public.trainer_migration_rerun_snapshot (snapshot JSONB NOT NULL);
CREATE FUNCTION public.capture_trainer_migration_rerun_snapshot()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object(
    'trainer', (SELECT jsonb_build_object(
      'application_id', application.id,
      'application_status', application.status,
      'profile_id', profile.id,
      'profile_status', profile.status,
      'user_id', profile.user_id
    ) FROM public.trainer_applications application
    JOIN public.trainer_profiles profile ON profile.source_application_id = application.id
    WHERE application.id = 'eeeeeeee-0000-4000-8000-000000000011'),
    'accounts', (SELECT COALESCE(jsonb_agg(to_jsonb(account_row) ORDER BY account_row.id), '[]'::jsonb)
      FROM public.profiles account_row
      WHERE account_row.id IN ('eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003')),
    'application', (SELECT to_jsonb(application_row) FROM public.trainer_applications application_row
      WHERE application_row.id = 'eeeeeeee-0000-4000-8000-000000000011'),
    'trainer_profile', (SELECT to_jsonb(profile_row) FROM public.trainer_profiles profile_row
      WHERE profile_row.id = 'eeeeeeee-0000-4000-8000-000000000021'),
    'service', (SELECT to_jsonb(service_row) FROM public.trainer_service_offerings service_row
      WHERE service_row.id = 'eeeeeeee-0000-4000-8000-000000000031'),
    'request', (SELECT to_jsonb(request_row) FROM public.coaching_requests request_row
      WHERE request_row.id = 'eeeeeeee-0000-4000-8000-000000000032'),
    'relationship', (SELECT to_jsonb(relationship_row) FROM public.coaching_relationships relationship_row
      WHERE relationship_row.id = 'eeeeeeee-0000-4000-8000-000000000041'),
    'consents', (SELECT COALESCE(jsonb_agg(to_jsonb(consent_row) ORDER BY consent_row.id), '[]'::jsonb)
      FROM public.coaching_consents consent_row
      WHERE consent_row.relationship_id = 'eeeeeeee-0000-4000-8000-000000000041'),
    'exercise', (SELECT to_jsonb(exercise_row) FROM public.exercises exercise_row
      WHERE exercise_row.id = 'eeeeeeee-0000-4000-8000-000000000051'),
    'template', (SELECT to_jsonb(template_row) FROM public.trainer_program_templates template_row
      WHERE template_row.id = 'eeeeeeee-0000-4000-8000-000000000061'),
    'template_workouts', (SELECT COALESCE(jsonb_agg(to_jsonb(template_workout_row) ORDER BY template_workout_row.id), '[]'::jsonb)
      FROM public.trainer_template_workouts template_workout_row
      WHERE template_workout_row.template_id = 'eeeeeeee-0000-4000-8000-000000000061'),
    'template_exercises', (SELECT COALESCE(jsonb_agg(to_jsonb(template_exercise_row) ORDER BY template_exercise_row.id), '[]'::jsonb)
      FROM public.trainer_template_exercises template_exercise_row
      WHERE template_exercise_row.template_workout_id IN (
        SELECT id FROM public.trainer_template_workouts WHERE template_id = 'eeeeeeee-0000-4000-8000-000000000061'
      )),
    'assignment', (SELECT to_jsonb(assignment_row) FROM public.trainer_plan_assignments assignment_row
      WHERE assignment_row.id = 'eeeeeeee-0000-4000-8000-000000000091'),
    'versions', (SELECT COALESCE(jsonb_agg(to_jsonb(version_row) ORDER BY version_row.version_number, version_row.id), '[]'::jsonb)
      FROM public.trainer_assignment_versions version_row
      WHERE version_row.assignment_id = 'eeeeeeee-0000-4000-8000-000000000091'),
    'plans', (SELECT COALESCE(jsonb_agg(to_jsonb(plan_row) ORDER BY plan_row.id), '[]'::jsonb)
      FROM public.workout_plans plan_row
      WHERE plan_row.trainer_assignment_id = 'eeeeeeee-0000-4000-8000-000000000091'),
    'workouts', (SELECT COALESCE(jsonb_agg(to_jsonb(workout_row) ORDER BY workout_row.id), '[]'::jsonb)
      FROM public.workouts workout_row
      WHERE workout_row.plan_id IN (
        SELECT id FROM public.workout_plans WHERE trainer_assignment_id = 'eeeeeeee-0000-4000-8000-000000000091'
      )),
    'workout_exercises', (SELECT COALESCE(jsonb_agg(to_jsonb(workout_exercise_row) ORDER BY workout_exercise_row.workout_id, workout_exercise_row.order_index, workout_exercise_row.id), '[]'::jsonb)
      FROM public.workout_exercises workout_exercise_row
      WHERE workout_exercise_row.workout_id IN (
        SELECT workout.id FROM public.workouts workout
        JOIN public.workout_plans plan ON plan.id = workout.plan_id
        WHERE plan.trainer_assignment_id = 'eeeeeeee-0000-4000-8000-000000000091'
      )),
    'session_authorizations', (SELECT COALESCE(jsonb_agg(to_jsonb(authorization_row) ORDER BY authorization_row.client_session_id), '[]'::jsonb)
      FROM public.session_authorizations authorization_row
      WHERE authorization_row.client_session_id = 'eeeeeeee-0000-4000-8000-000000000131'),
    'progress_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(progress_row) ORDER BY progress_row.id), '[]'::jsonb)
      FROM public.progress_logs progress_row
      WHERE progress_row.client_session_id = 'eeeeeeee-0000-4000-8000-000000000131'),
    'exercise_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(exercise_log_row) ORDER BY exercise_log_row.id), '[]'::jsonb)
      FROM public.exercise_logs exercise_log_row
      WHERE exercise_log_row.progress_log_id IN (
        SELECT id FROM public.progress_logs WHERE client_session_id = 'eeeeeeee-0000-4000-8000-000000000131'
      )),
    'product_notifications', (SELECT COALESCE(jsonb_agg(to_jsonb(notification_row) ORDER BY notification_row.id), '[]'::jsonb)
      FROM public.product_notifications notification_row
      WHERE notification_row.user_id IN ('eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003')),
    'professional_audits', (SELECT COALESCE(jsonb_agg(to_jsonb(audit_row) ORDER BY audit_row.id), '[]'::jsonb)
      FROM public.professional_audit_logs audit_row
      WHERE audit_row.actor_user_id IN ('eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003')
         OR audit_row.subject_user_id IN ('eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000003')),
    'admin_audits', (SELECT COALESCE(jsonb_agg(to_jsonb(admin_audit_row) ORDER BY admin_audit_row.id), '[]'::jsonb)
      FROM public.admin_audit_logs admin_audit_row
      WHERE admin_audit_row.id = 'eeeeeeee-0000-4000-8000-000000000035')
  );
$function$;
INSERT INTO public.trainer_migration_rerun_snapshot (snapshot)
SELECT public.capture_trainer_migration_rerun_snapshot();
DO $$ BEGIN
  IF (SELECT snapshot->'trainer'->>'application_status' <> 'approved' FROM public.trainer_migration_rerun_snapshot) THEN
    RAISE EXCEPTION 'rerun fixture trainer application is not approved';
  END IF;
  IF (SELECT snapshot->'trainer'->>'profile_status' <> 'active' FROM public.trainer_migration_rerun_snapshot) THEN
    RAISE EXCEPTION 'rerun fixture trainer profile is not active';
  END IF;
  IF (SELECT snapshot->'request'->>'status' <> 'accepted' FROM public.trainer_migration_rerun_snapshot) THEN
    RAISE EXCEPTION 'rerun fixture request is not accepted';
  END IF;
  IF jsonb_array_length((SELECT snapshot->'consents' FROM public.trainer_migration_rerun_snapshot)) <> 2 THEN
    RAISE EXCEPTION 'rerun fixture lacks both active consent scopes';
  END IF;
  IF jsonb_array_length((SELECT snapshot->'versions' FROM public.trainer_migration_rerun_snapshot)) <> 2
     OR jsonb_array_length((SELECT snapshot->'plans' FROM public.trainer_migration_rerun_snapshot)) <> 2
     OR jsonb_array_length((SELECT snapshot->'workouts' FROM public.trainer_migration_rerun_snapshot)) <> 2
     OR jsonb_array_length((SELECT snapshot->'workout_exercises' FROM public.trainer_migration_rerun_snapshot)) <> 2 THEN
    RAISE EXCEPTION 'rerun fixture lacks locked professional plan history';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workout_plans
    WHERE trainer_assignment_id = 'eeeeeeee-0000-4000-8000-000000000091'
      AND source_type = 'trainer_assigned'
      AND library_slot = 'professional'
      AND prescription_locked = TRUE
  ) THEN RAISE EXCEPTION 'rerun fixture lacks professional identity lock'; END IF;
  IF jsonb_array_length((SELECT snapshot->'session_authorizations' FROM public.trainer_migration_rerun_snapshot)) <> 1
     OR jsonb_array_length((SELECT snapshot->'progress_logs' FROM public.trainer_migration_rerun_snapshot)) <> 1
     OR jsonb_array_length((SELECT snapshot->'exercise_logs' FROM public.trainer_migration_rerun_snapshot)) <> 1 THEN
    RAISE EXCEPTION 'rerun fixture lacks execution evidence';
  END IF;
  IF jsonb_array_length((SELECT snapshot->'professional_audits' FROM public.trainer_migration_rerun_snapshot)) = 0
     OR jsonb_array_length((SELECT snapshot->'admin_audits' FROM public.trainer_migration_rerun_snapshot)) <> 1 THEN
    RAISE EXCEPTION 'rerun fixture lacks professional audit evidence';
  END IF;
END $$;
`

const trainerMigrationRerunVerifySql = `
DO $$
DECLARE
  before_snapshot JSONB;
  after_snapshot JSONB;
BEGIN
  SELECT snapshot INTO before_snapshot FROM public.trainer_migration_rerun_snapshot;
  SELECT public.capture_trainer_migration_rerun_snapshot() INTO after_snapshot;
  IF before_snapshot IS DISTINCT FROM after_snapshot THEN
    RAISE EXCEPTION 'migrations 040-050 changed locked professional fixture: before=%, after=%', before_snapshot, after_snapshot;
  END IF;
END $$;
DROP TABLE public.trainer_migration_rerun_snapshot;
DROP FUNCTION public.capture_trainer_migration_rerun_snapshot();
`

function docker(args, { input, print = true } = {}) {
  const result = spawnSync('docker', args, { cwd: repoRoot, encoding: 'utf8', input, maxBuffer: 20 * 1024 * 1024 })
  if (print) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.error) throw result.error
  return result
}

function runPsql(sql, label) {
  process.stdout.write(`\n[trainer-programming-db] ${label}\n`)
  const result = docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'], { input: sql })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function runPsqlExpectFailure(sql, label, expectedMessage) {
  process.stdout.write(`\n[trainer-programming-db] ${label}\n`)
  const result = docker(
    ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
    { input: sql, print: false },
  )
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(`${label} did not fail with ${expectedMessage}: ${output}`)
  }
  return output
}

function assertFailureHidesFixtureIds(output, label) {
  if (output.includes('f4700000-')) throw new Error(`${label} exposed a fixture identifier`)
}

function waitForDatabase() {
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker(['inspect', container, '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}'], { print: false })
      return result.status === 0 ? result.stdout.trim() || 'unknown' : `inspect-error-${result.status}`
    },
    probeFinalDatabase: () => {
      const result = docker(['exec', container, 'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres', '-c', "SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3 THEN 'ready' ELSE 'missing' END"], { print: false })
      const output = result.stdout.trim()
      return result.status === 0 && output === 'ready' ? { ok: true, diagnostic: 'auth and API roles ready' } : { ok: false, diagnostic: result.stderr.trim() || output }
    },
    wait: milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  })
}

let started = false
try {
  process.stdout.write(`[trainer-programming-db] starting isolated ${container}\n`)
  const start = docker(['run', '--detach', '--rm', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', image])
  if (start.status !== 0) throw new Error(`docker run failed with exit code ${start.status}`)
  started = true
  const readiness = waitForDatabase()
  process.stdout.write(`[trainer-programming-db] database ready (${readiness.health}; ${readiness.diagnostic})\n`)
  runPsql(bootstrapSql, 'applying minimal pre-041 history')
  runPsql(planBootstrapSql, 'applying required plan and exercise history')
  runPsql(readMigration('035_session_save_idempotency.sql'), 'applying migration 035 session save idempotency')
  runPsql(`BEGIN;\n${readMigration('037_atomic_plan_lifecycle.sql')}\nCOMMIT;`, 'applying migration 037 lifecycle')
  runPsql(readMigration('038_session_authorizations.sql'), 'applying migration 038 session authorization')
  runPsql(readMigration('040_trainer_foundations.sql'), 'applying migration 040')
  runPsql(readMigration('041_trainer_verification.sql'), 'applying migration 041')
  runPsql(readMigration('042_trainer_relationships.sql'), 'applying migration 042')
  runPsql(readMigration('043_trainer_programming.sql'), 'applying migration 043')
  runPsql(readMigration('044_trainer_insights.sql'), 'applying migration 044')
  runPsql(readMigration('043_trainer_programming.sql'), 'reapplying migration 043 for rerunnability')
  runPsql(readMigration('044_trainer_insights.sql'), 'reapplying migration 044 for rerunnability')
  runPsql(legacyProfessionalAuditSql, 'seeding pre-045 professional audit evidence')
  const productionBoundary = loadLegacyOwnerBoundary(repoRoot)
  runPsql(productionBoundary.sql, `applying migration 001 owner boundary (${productionBoundary.sha256})`)
  runPsql(readMigration('045_trainer_hardening.sql'), 'applying migration 045 trainer hardening')
  runPsql(readMigration('045_trainer_hardening.sql'), 'reapplying migration 045 for rerunnability')
  runPsql(readMigration('046_release_session_authorization.sql'), 'applying migration 046 release session authorization')
  runPsql(readMigration('047_product_notification_preferences_insert.sql'), 'applying migration 047 product notification preferences insert')
  runPsql(readMigration('048_profile_weight_measurement_sync.sql'), 'applying migration 048 profile weight measurement sync')
  runPsql(legacyIsoWeekdayFixturesSql, 'seeding malformed and recoverable ISO weekday fixtures')
  runPsqlExpectFailure(
    readMigration(isoWeekdayMigrationFile),
    'rejecting ambiguous ISO weekday repair',
    'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED',
  )
  runPsql(assertIsoWeekdayRepairRollbackSql, 'verifying failed ISO repair rolled back atomically')
  runPsql(removeMalformedIsoWeekdayFixtureSql, 'removing only the malformed ISO weekday fixture')
  runPsql(malformedIsoStringFixturesSql, 'seeding malformed ISO string-scalar fixtures')
  const schemaScalarFailure = runPsqlExpectFailure(
    readMigration(isoWeekdayMigrationFile),
    'rejecting string schemaVersion scalar',
    'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: snapshot_shape=1',
  )
  assertFailureHidesFixtureIds(schemaScalarFailure, 'schemaVersion scalar preflight')
  runPsql(assertIsoWeekdayRepairRollbackSql, 'verifying string schemaVersion failure rolled back atomically')
  runPsql(removeMalformedIsoSchemaFixtureSql, 'removing only the malformed schemaVersion fixture')
  const workoutScalarFailure = runPsqlExpectFailure(
    readMigration(isoWeekdayMigrationFile),
    'rejecting string workout schedule scalars',
    'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: snapshot_value=1',
  )
  assertFailureHidesFixtureIds(workoutScalarFailure, 'workout scalar preflight')
  runPsql(assertIsoWeekdayRepairRollbackSql, 'verifying string workout scalar failure rolled back atomically')
  runPsql(removeMalformedIsoWorkoutScalarFixtureSql, 'removing only the malformed workout scalar fixture')
  runPsql(readMigration(isoWeekdayMigrationFile), 'applying migration 049 ISO weekday repair')
  runPsql(legacyConversionHistorySql, 'seeding pre-050 conversion history')
  runPsql(readMigration('050_product_events_conversion_funnel.sql'), 'applying migration 050 conversion funnel events')
  runPsql(readMigration('051_workout_adjustment_atomic.sql'), 'applying migration 051 atomic workout adjustment')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running 043 pgTAP behavior suite against migration 051')
  if (/^\s*not ok\b/m.test(tapOutput) || /# Looks like you (?:failed|planned)\b/.test(tapOutput)) throw new Error('pgTAP reported one or more failed assertions')
  const insightsTapOutput = runPsql(readFileSync(insightsTestPath, 'utf8'), 'running final consent-bound insight suite against migration 050')
  if (/^\s*not ok\b/m.test(insightsTapOutput) || /# Looks like you (?:failed|planned)\b/.test(insightsTapOutput)) throw new Error('044 pgTAP reported one or more failed assertions')
  const isoTapOutput = runPsql(readFileSync(isoWeekdayTestPath, 'utf8'), 'running 049 ISO weekday repair pgTAP suite')
  if (/^\s*not ok\b/m.test(isoTapOutput) || /# Looks like you (?:failed|planned)\b/.test(isoTapOutput)) throw new Error('049 pgTAP reported one or more failed assertions')
  const conversionTapOutput = runPsql(readFileSync(conversionFunnelTestPath, 'utf8'), 'running 050 conversion funnel pgTAP suite')
  if (/^\s*not ok\b/m.test(conversionTapOutput) || /# Looks like you (?:failed|planned)\b/.test(conversionTapOutput)) throw new Error('050 pgTAP reported one or more failed assertions')
  const workoutAdjustmentTapOutput = runPsql(readFileSync(workoutAdjustmentTestPath, 'utf8'), 'running 051 atomic workout adjustment pgTAP suite')
  if (/^\s*not ok\b/m.test(workoutAdjustmentTapOutput) || /# Looks like you (?:failed|planned)\b/.test(workoutAdjustmentTapOutput)) throw new Error('051 pgTAP reported one or more failed assertions')
  const auditTapOutput = runPsql(readFileSync(auditTestPath, 'utf8'), 'running trainer append-only audit behavior suite')
  if (/^\s*not ok\b/m.test(auditTapOutput) || /# Looks like you (?:failed|planned)\b/.test(auditTapOutput)) throw new Error('trainer audit pgTAP reported one or more failed assertions')
  if (authorizationMode) {
    const authorizationTapOutput = runPsql(readFileSync(authorizationTestPath, 'utf8'), 'running trainer authorization matrix against migrations 040-051')
    if (/^\s*not ok\b/m.test(authorizationTapOutput) || /# Looks like you (?:failed|planned)\b/.test(authorizationTapOutput)) throw new Error('trainer authorization pgTAP reported one or more failed assertions')
  }
  runPsql(measurementRevocationRaceSql, 'running committed concurrent measurement revocation race')
  runPsql(detailRevocationRaceSql, 'running committed concurrent detail revocation race')
  runPsql(summarySuspensionRaceSql, 'running committed concurrent summary suspension race')
  runPsql(acceptanceRaceSql, 'running committed concurrent trainer acceptance race')
  runPsql(revisionSessionContinuitySql, 'running real authorization continuity across plan revision')
  runPsql(trainerMigrationRerunSnapshotSql, 'seeding rerun preservation fixture')
  runPsql(
    trainerMigrationFiles.map(readMigration).join('\n'),
    'reapplying migrations 040-051 after locked professional data',
  )
  runPsql(trainerMigrationRerunVerifySql, 'verifying rerun preservation snapshot')
  runPsql(conversionFunnelRerunFixtureSql, 'seeding committed conversion rerun fixture')
  runPsql(readMigration('050_product_events_conversion_funnel.sql'), 'reapplying migration 050 against committed conversion rows')
  runPsql(conversionFunnelRerunVerifySql, 'verifying conversion rows after migration 050 rerun')
  if (securityMode) {
    runPsql(readFileSync(securityTestPath, 'utf8'), 'running trainer security supplemental races and IDOR effects')
  }
  process.stdout.write('\n[trainer-programming-db] PASS: migrations 040-051 behavior and rerunnability passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    process.stdout.write(cleanup.status === 0 ? `[trainer-programming-db] removed isolated ${container}\n` : `[trainer-programming-db] warning: failed to remove ${container}\n`)
  }
}
