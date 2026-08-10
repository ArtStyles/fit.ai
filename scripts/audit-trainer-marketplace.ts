import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLegacyOwnerBoundary } from './trainer-authorization-production-boundary.mjs'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.TRAINER_AUDIT_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-trainer-audit-${process.pid}-${Date.now().toString(36)}`
const repetitions = 20
const budgetMs = 300
const largeRelationRows = 1_000

const migrationFiles = [
  '035_session_save_idempotency.sql',
  '037_atomic_plan_lifecycle.sql',
  '038_session_authorizations.sql',
  '040_trainer_foundations.sql',
  '041_trainer_verification.sql',
  '042_trainer_relationships.sql',
  '043_trainer_programming.sql',
  '044_trainer_insights.sql',
  '045_trainer_hardening.sql',
] as const

const bootstrapSql = `
GRANT anon, authenticated, service_role TO postgres;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner UUID, public BOOLEAN NOT NULL DEFAULT FALSE, file_size_limit BIGINT, allowed_mime_types TEXT[]);
CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE, name TEXT NOT NULL, owner UUID, metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (bucket_id, name));
CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, avatar_url TEXT, onboarding_done BOOLEAN NOT NULL DEFAULT FALSE, is_admin BOOLEAN NOT NULL DEFAULT FALSE, account_status TEXT NOT NULL DEFAULT 'active', suspension_reason TEXT, suspended_at TIMESTAMPTZ, suspended_until TIMESTAMPTZ, suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL);
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
CREATE TABLE public.workouts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), plan_id UUID REFERENCES public.workout_plans(id), name TEXT NOT NULL, focus TEXT, day_of_week INTEGER, order_in_plan INTEGER, estimated_duration_minutes INTEGER);
CREATE TABLE public.workout_exercises (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workout_id UUID NOT NULL REFERENCES public.workouts(id), exercise_id UUID REFERENCES public.exercises(id), order_index INTEGER, sets INTEGER, reps INTEGER, duration_seconds INTEGER, rest_seconds INTEGER, target_rpe INTEGER, weight_kg NUMERIC, notes TEXT, weight_suggestion_basis TEXT);
CREATE TABLE public.plan_generation_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), mode TEXT NOT NULL, generator TEXT NOT NULL, success BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.posts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), routine_snapshot JSONB);
CREATE TABLE public.progress_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), workout_id UUID REFERENCES public.workouts(id), session_context_snapshot JSONB, completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), duration_minutes INTEGER, mood_rating INTEGER, notes TEXT);
CREATE TABLE public.exercise_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), progress_log_id UUID NOT NULL REFERENCES public.progress_logs(id), exercise_id UUID REFERENCES public.exercises(id), sets_completed INTEGER, reps_completed INTEGER[], weights_kg NUMERIC[], rpe_values NUMERIC[], duration_seconds INTEGER, notes TEXT);
CREATE TABLE public.measurements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id), recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), weight_kg NUMERIC, body_fat_percentage NUMERIC, muscle_mass_kg NUMERIC, chest_cm NUMERIC, waist_cm NUMERIC, hips_cm NUMERIC, arms_cm NUMERIC, legs_cm NUMERIC, notes TEXT);
CREATE OR REPLACE FUNCTION public.record_plan_generation_success(p_plan_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.plan_generation_events (user_id, mode, generator, success) SELECT user_id, 'initial', 'evidence_engine', TRUE FROM public.workout_plans WHERE id = p_plan_id; END; $$;
`

// These are the complete historical indexes from 001/004/006/008/011/026
// for the legacy tables represented by this focused bootstrap. Applying them
// before 045 prevents the audit from crediting a new index for an old gap.
const historicalIndexSql = `
CREATE INDEX idx_workout_plans_user ON public.workout_plans(user_id);
CREATE INDEX idx_workouts_user ON public.workouts(user_id);
CREATE INDEX idx_workouts_plan ON public.workouts(plan_id);
CREATE INDEX idx_workout_exercises_workout ON public.workout_exercises(workout_id);
CREATE INDEX idx_workout_exercises_exercise ON public.workout_exercises(exercise_id);
CREATE INDEX idx_progress_logs_user ON public.progress_logs(user_id);
CREATE INDEX idx_progress_logs_completed_at ON public.progress_logs(completed_at DESC);
CREATE INDEX idx_exercise_logs_progress ON public.exercise_logs(progress_log_id);
CREATE INDEX idx_exercise_logs_exercise ON public.exercise_logs(exercise_id);
CREATE INDEX idx_measurements_user ON public.measurements(user_id);
CREATE INDEX idx_measurements_recorded_at ON public.measurements(recorded_at DESC);
CREATE INDEX idx_workout_exercises_weight_basis ON public.workout_exercises(weight_suggestion_basis) WHERE weight_suggestion_basis IS NOT NULL;
CREATE INDEX idx_workout_plans_user_active ON public.workout_plans(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_workout_plans_user_created ON public.workout_plans(user_id, created_at DESC);
CREATE INDEX idx_workouts_plan_day_order ON public.workouts(plan_id, day_of_week, order_in_plan) WHERE plan_id IS NOT NULL;
CREATE INDEX idx_workout_exercises_workout_order ON public.workout_exercises(workout_id, order_index);
CREATE INDEX idx_progress_logs_user_completed ON public.progress_logs(user_id, completed_at DESC);
CREATE INDEX idx_progress_logs_user_workout_completed ON public.progress_logs(user_id, workout_id, completed_at DESC) WHERE workout_id IS NOT NULL;
CREATE INDEX idx_exercise_logs_progress_exercise ON public.exercise_logs(progress_log_id, exercise_id);
CREATE INDEX idx_workout_plans_user_context_created ON public.workout_plans(user_id, plan_context, created_at DESC);
CREATE INDEX idx_workout_plans_parent ON public.workout_plans(parent_plan_id) WHERE parent_plan_id IS NOT NULL;
CREATE INDEX idx_exercise_logs_exercise_progress ON public.exercise_logs(exercise_id, progress_log_id);
CREATE UNIQUE INDEX idx_workout_plans_one_active_per_user ON public.workout_plans(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_workout_plans_user_active_created ON public.workout_plans(user_id, is_active, created_at DESC);
CREATE INDEX idx_workout_plans_source_post ON public.workout_plans(source_post_id) WHERE source_post_id IS NOT NULL;
`

const fixtureSql = `
CREATE OR REPLACE FUNCTION public.audit_uuid(p_namespace TEXT, p_value BIGINT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT (
    substr(md5(p_namespace || ':' || p_value::TEXT), 1, 8) || '-' ||
    substr(md5(p_namespace || ':' || p_value::TEXT), 9, 4) || '-4' ||
    substr(md5(p_namespace || ':' || p_value::TEXT), 14, 3) || '-8' ||
    substr(md5(p_namespace || ':' || p_value::TEXT), 18, 3) || '-' ||
    substr(md5(p_namespace || ':' || p_value::TEXT), 21, 12)
  )::UUID
$$;

BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT public.audit_uuid('trainer-user', trainer_number), 'audit-trainer-' || trainer_number || '@example.test', '{}'::JSONB
FROM generate_series(1, 100) AS trainer(trainer_number);
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT public.audit_uuid('client-user', client_number), 'audit-client-' || client_number || '@example.test', '{}'::JSONB
FROM generate_series(1, 1000) AS client(client_number);

INSERT INTO public.profiles (id, full_name, timezone, avatar_url, onboarding_done, account_status)
SELECT public.audit_uuid('trainer-user', trainer_number), 'Audit trainer ' || lpad(trainer_number::TEXT, 3, '0'), 'UTC', NULL, TRUE, 'active'
FROM generate_series(1, 100) AS trainer(trainer_number);
INSERT INTO public.profiles (id, full_name, timezone, avatar_url, onboarding_done, account_status, fitness_level, primary_goal, days_per_week, session_duration_minutes, gym_type)
SELECT public.audit_uuid('client-user', client_number), 'Audit client ' || lpad(client_number::TEXT, 4, '0'), 'UTC', NULL, TRUE, 'active', 'intermediate', 'muscle_gain', 3, 60, 'commercial_gym'
FROM generate_series(1, 1000) AS client(client_number);
UPDATE public.profiles SET timezone = 'Invalid/Performance_Audit' WHERE id = public.audit_uuid('client-user', 101);
UPDATE public.profiles SET timezone = NULL WHERE id = public.audit_uuid('client-user', 201);

INSERT INTO public.trainer_applications (id, user_id, status, submitted_at, decided_at)
SELECT public.audit_uuid('application', trainer_number), public.audit_uuid('trainer-user', trainer_number), 'approved', NOW() - INTERVAL '2 years', NOW() - INTERVAL '2 years'
FROM generate_series(1, 100) AS trainer(trainer_number);
INSERT INTO public.trainer_profiles (id, user_id, source_application_id, slug, status, professional_name, bio, specialties, modalities, experience_summary, general_location, languages, verified_at)
SELECT public.audit_uuid('trainer-profile', trainer_number), public.audit_uuid('trainer-user', trainer_number), public.audit_uuid('application', trainer_number), 'audit-trainer-' || lpad(trainer_number::TEXT, 3, '0'), 'active', 'Audit trainer ' || lpad(trainer_number::TEXT, 3, '0'), 'Performance fixture profile', ARRAY['strength'], ARRAY['online'], 'Verified performance fixture', 'La Habana', ARRAY['es'], NOW() - INTERVAL '2 years'
FROM generate_series(1, 100) AS trainer(trainer_number);
INSERT INTO public.trainer_service_offerings (id, trainer_profile_id, name, description, modality, duration_minutes, content, capacity, is_active)
SELECT public.audit_uuid('service', trainer_number), public.audit_uuid('trainer-profile', trainer_number), 'Audit coaching ' || trainer_number, 'Representative active service', 'online', 60, 'Weekly training follow-up', 100, TRUE
FROM generate_series(1, 100) AS trainer(trainer_number);

INSERT INTO public.coaching_requests (id, service_id, trainer_user_id, client_user_id, message, training_profile_consent_version, idempotency_key, status, created_at, updated_at)
SELECT public.audit_uuid('request', client_number),
  public.audit_uuid('service', ((client_number - 1) % 100) + 1),
  public.audit_uuid('trainer-user', ((client_number - 1) % 100) + 1),
  public.audit_uuid('client-user', client_number),
  'Representative pending request', 'training-profile-v1', public.audit_uuid('request-key', client_number), 'pending',
  NOW() - make_interval(hours => client_number % 240), NOW() - make_interval(hours => client_number % 240)
FROM generate_series(1, 1000) AS client(client_number);

INSERT INTO public.coaching_relationships (id, service_id, trainer_user_id, client_user_id, status, started_at)
SELECT public.audit_uuid('relationship', client_number),
  public.audit_uuid('service', ((client_number - 1) % 100) + 1),
  public.audit_uuid('trainer-user', ((client_number - 1) % 100) + 1),
  public.audit_uuid('client-user', client_number), 'active', NOW() - INTERVAL '2 years'
FROM generate_series(1, 1000) AS client(client_number);
INSERT INTO public.coaching_consents (id, relationship_id, scope, text_version, granted_at, granted_by)
SELECT public.audit_uuid('consent', client_number), public.audit_uuid('relationship', client_number), 'training_profile', 'training-profile-v1', NOW() - INTERVAL '2 years', public.audit_uuid('client-user', client_number)
FROM generate_series(1, 1000) AS client(client_number);

INSERT INTO public.exercises (id, name, name_es, muscle_groups, muscle_groups_es, is_compound, is_public)
VALUES (public.audit_uuid('exercise', 1), 'Audit squat', 'Sentadilla de auditoria', ARRAY['quadriceps'], ARRAY['cuadriceps'], TRUE, TRUE);

INSERT INTO public.trainer_plan_assignments (id, relationship_id, trainer_user_id, client_user_id, status, accepted_at, active_version_id, created_at, updated_at)
SELECT public.audit_uuid('assignment', client_number), public.audit_uuid('relationship', client_number),
  public.audit_uuid('trainer-user', ((client_number - 1) % 100) + 1), public.audit_uuid('client-user', client_number),
  'active', NOW() - INTERVAL '1 year', public.audit_uuid('version', (client_number - 1) * 52 + 52), NOW() - INTERVAL '1 year', NOW()
FROM generate_series(1, 1000) AS client(client_number);

INSERT INTO public.trainer_assignment_versions (id, assignment_id, version_number, snapshot, change_summary, status, effective_from, effective_to, materialized_plan_id, created_at)
SELECT public.audit_uuid('version', (client_number - 1) * 52 + week_number),
  public.audit_uuid('assignment', client_number), week_number,
  jsonb_build_object(
    'schemaVersion', 1,
    'name', 'Audit program',
    'goal', 'strength',
    'daysPerWeek', CASE WHEN client_number = 1 THEN 2 ELSE 1 END,
    'workouts', CASE WHEN client_number = 1 THEN
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Audit workout', 'dayOfWeek', 1, 'orderInPlan', 1,
          'exercises', jsonb_build_array(jsonb_build_object(
            'exerciseId', public.audit_uuid('exercise', 1), 'orderIndex', 1,
            'sets', 3, 'reps', 8, 'restSeconds', 60
          ))
        ),
        jsonb_build_object(
          'name', 'Audit recovery workout', 'dayOfWeek', 7, 'orderInPlan', 2,
          'exercises', jsonb_build_array(jsonb_build_object(
            'exerciseId', public.audit_uuid('exercise', 1), 'orderIndex', 1,
            'sets', 2, 'reps', 12, 'restSeconds', 45
          ))
        )
      )
    ELSE
      jsonb_build_array(jsonb_build_object(
        'name', 'Audit workout', 'dayOfWeek', 1, 'orderInPlan', 1,
        'exercises', jsonb_build_array(jsonb_build_object(
          'exerciseId', public.audit_uuid('exercise', 1), 'orderIndex', 1,
          'sets', 3, 'reps', 8, 'restSeconds', 60
        ))
      ))
    END
  ),
  'Week ' || week_number, CASE WHEN week_number = 52 THEN 'active' ELSE 'superseded' END,
  date_trunc('day', NOW()) - make_interval(days => (52 - week_number) * 7),
  CASE WHEN week_number = 52 THEN NULL ELSE date_trunc('day', NOW()) - make_interval(days => (51 - week_number) * 7) END,
  public.audit_uuid('plan', (client_number - 1) * 52 + week_number),
  date_trunc('day', NOW()) - make_interval(days => (52 - week_number) * 7)
FROM generate_series(1, 1000) AS client(client_number)
CROSS JOIN generate_series(1, 52) AS week(week_number);

INSERT INTO public.workout_plans (id, user_id, name, goal, duration_weeks, days_per_week, is_active, generated_by_ai, source_type, family_id, library_slot, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, prescription_locked, created_at, updated_at)
SELECT public.audit_uuid('plan', (client_number - 1) * 52 + week_number), public.audit_uuid('client-user', client_number),
  'Audit plan week ' || week_number, 'strength', 1, 1, week_number = 52, FALSE, 'trainer_assigned', public.audit_uuid('family', client_number), 'professional',
  public.audit_uuid('relationship', client_number), public.audit_uuid('assignment', client_number), public.audit_uuid('version', (client_number - 1) * 52 + week_number), TRUE,
  date_trunc('day', NOW()) - make_interval(days => (52 - week_number) * 7), NOW()
FROM generate_series(1, 1000) AS client(client_number)
CROSS JOIN generate_series(1, 52) AS week(week_number);

INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan, estimated_duration_minutes)
SELECT public.audit_uuid('workout', (client_number - 1) * 52 + week_number), public.audit_uuid('client-user', client_number),
  public.audit_uuid('plan', (client_number - 1) * 52 + week_number), 'Audit workout', 0, 1, 60
FROM generate_series(1, 1000) AS client(client_number)
CROSS JOIN generate_series(1, 52) AS week(week_number);

INSERT INTO public.workouts (id, user_id, plan_id, name, day_of_week, order_in_plan, estimated_duration_minutes)
SELECT public.audit_uuid('workout-secondary', week_number), public.audit_uuid('client-user', 1),
  public.audit_uuid('plan', week_number), 'Audit recovery workout', 6, 2, 45
FROM generate_series(1, 52) AS week(week_number);

INSERT INTO public.session_authorizations (client_session_id, user_id, workout_id, plan_id, session_context_snapshot, policy_timezone, policy_date, policy_day_start, policy_day_end, workout_window_start, created_at, expires_at, consumed_at, released_at)
SELECT public.audit_uuid('session', (client_number - 1) * 52 + week_number), public.audit_uuid('client-user', client_number),
  public.audit_uuid('workout', (client_number - 1) * 52 + week_number), public.audit_uuid('plan', (client_number - 1) * 52 + week_number),
  jsonb_build_object('plan', jsonb_build_object('trainerAssignmentVersionId', public.audit_uuid('version', (client_number - 1) * 52 + week_number)), 'workout', jsonb_build_object('name', 'Audit workout'), 'exercises', jsonb_build_array(jsonb_build_object('exerciseId', public.audit_uuid('exercise', 1), 'name', 'Audit squat'))),
  'UTC', (CURRENT_DATE - ((52 - week_number) * 7)),
  (CURRENT_DATE - ((52 - week_number) * 7))::TIMESTAMP AT TIME ZONE 'UTC',
  (CURRENT_DATE - ((52 - week_number) * 7) + 1)::TIMESTAMP AT TIME ZONE 'UTC',
  (CURRENT_DATE - ((52 - week_number) * 7))::TIMESTAMP AT TIME ZONE 'UTC',
  (CURRENT_DATE - ((52 - week_number) * 7))::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '8 hours',
  (CURRENT_DATE - ((52 - week_number) * 7))::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '20 hours',
  (CURRENT_DATE - ((52 - week_number) * 7))::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '9 hours', NULL
FROM generate_series(1, 1000) AS client(client_number)
CROSS JOIN generate_series(1, 52) AS week(week_number);

INSERT INTO public.progress_logs (id, user_id, workout_id, client_session_id, session_context_snapshot, completed_at, duration_minutes, mood_rating, notes)
SELECT public.audit_uuid('progress', (client_number - 1) * 52 + week_number), public.audit_uuid('client-user', client_number),
  public.audit_uuid('workout', (client_number - 1) * 52 + week_number), public.audit_uuid('session', (client_number - 1) * 52 + week_number),
  '{}'::JSONB, (CURRENT_DATE - ((52 - week_number) * 7))::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '9 hours', 50, 4, 'Representative completed session'
FROM generate_series(1, 1000) AS client(client_number)
CROSS JOIN generate_series(1, 52) AS week(week_number);
INSERT INTO public.exercise_logs (id, progress_log_id, exercise_id, sets_completed, reps_completed, weights_kg, rpe_values, duration_seconds, notes)
SELECT public.audit_uuid('exercise-log', (client_number - 1) * 52 + week_number), public.audit_uuid('progress', (client_number - 1) * 52 + week_number),
  public.audit_uuid('exercise', 1), 3, ARRAY[8,8,8], ARRAY[80,80,80]::NUMERIC[], ARRAY[7,8,8]::NUMERIC[], NULL, 'Representative evidence'
FROM generate_series(1, 1000) AS client(client_number)
CROSS JOIN generate_series(1, 52) AS week(week_number);

COMMIT;
ANALYZE public.trainer_profiles;
ANALYZE public.profiles;
ANALYZE public.trainer_applications;
ANALYZE public.trainer_service_offerings;
ANALYZE public.coaching_requests;
ANALYZE public.coaching_relationships;
ANALYZE public.coaching_consents;
ANALYZE public.trainer_plan_assignments;
ANALYZE public.trainer_assignment_versions;
ANALYZE public.workout_plans;
ANALYZE public.workouts;
ANALYZE public.session_authorizations;
ANALYZE public.progress_logs;
ANALYZE public.exercise_logs;
ANALYZE public.exercises;
`

type ExplainPlan = {
  Plan: PlanNode
  'Planning Time': number
  'Execution Time': number
  JIT?: unknown
}

type PlanNode = {
  'Node Type': string
  'Relation Name'?: string
  'Schema'?: string
  'Index Name'?: string
  Plans?: PlanNode[]
}

type TableStat = { relation: string; rows: number; seqScans: number }
type IndexStat = { name: string; scans: number }
type PlannerCardinality = { relation: string; estimatedRows: number }
type RpcProjectionSnapshot = {
  directory: unknown
  summary: unknown
  validDetail: unknown
  invalidTimezoneDetail: unknown
  nullTimezoneDetail: unknown
}

type AuditShape = {
  name: string
  userId: string
  statement: string
  expectedIndexGroups: string[][]
}

function docker(args: string[], input?: string, print = false) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (print || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.error) throw result.error
  return result
}

function psql(sql: string, label: string) {
  const result = docker([
    'exec', '-i', container, 'psql', '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'supabase_admin', '-d', 'postgres',
  ], sql)
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  return result.stdout.trim()
}

function waitForDatabase() {
  return waitForFinalDatabase({
    inspectHealth: () => {
      const result = docker(['inspect', container, '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}'])
      return result.status === 0 ? result.stdout.trim() || 'unknown' : `inspect-error-${result.status}`
    },
    probeFinalDatabase: () => {
      const result = docker([
        'exec', container, 'psql', '-X', '-A', '-t', '-q', '-U', 'postgres', '-d', 'postgres',
        '-c', "SELECT CASE WHEN to_regclass('auth.users') IS NOT NULL AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3 THEN 'ready' ELSE 'missing' END",
      ])
      const output = result.stdout.trim()
      return result.status === 0 && output === 'ready'
        ? { ok: true, diagnostic: 'auth and API roles ready' }
        : { ok: false, diagnostic: result.stderr.trim() || output }
    },
    wait: milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds),
  })
}

function authenticatedSql(userId: string, statement: string) {
  return `
SET search_path = pg_catalog, public, pg_temp;
SET request.jwt.claim.sub = '${userId}';
SET request.jwt.claim.role = 'authenticated';
SET ROLE authenticated;
${statement}
RESET ROLE;
`
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label} did not return valid JSON`)
  }
}

function jsonRecord(value: unknown) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function redactWorkoutIds(workouts: unknown) {
  if (!Array.isArray(workouts)) return
  for (const workout of workouts) {
    const row = jsonRecord(workout)
    if (row) row.id = '__MATERIALIZED_WORKOUT_ID__'
  }
}

function normalizeRpcProjection(snapshot: RpcProjectionSnapshot) {
  const normalized = JSON.parse(JSON.stringify(snapshot)) as RpcProjectionSnapshot
  for (const key of ['validDetail', 'invalidTimezoneDetail', 'nullTimezoneDetail'] as const) {
    redactWorkoutIds(jsonRecord(normalized[key])?.prescribedWorkouts)
  }
  const summaryClients = jsonRecord(normalized.summary)?.clients
  if (Array.isArray(summaryClients)) {
    for (const client of summaryClients) {
      const versions = jsonRecord(jsonRecord(client)?.adherenceInput)?.versions
      if (!Array.isArray(versions)) continue
      for (const version of versions) redactWorkoutIds(jsonRecord(version)?.workouts)
    }
  }
  return normalized
}

function prescribedWorkoutIdCount(detail: unknown) {
  const workouts = jsonRecord(detail)?.prescribedWorkouts
  if (!Array.isArray(workouts)) return 0
  return workouts.filter(workout => typeof jsonRecord(workout)?.id === 'string').length
}

function summaryWorkoutIdCount(summary: unknown) {
  const clients = jsonRecord(summary)?.clients
  if (!Array.isArray(clients)) return 0
  let count = 0
  for (const client of clients) {
    const versions = jsonRecord(jsonRecord(client)?.adherenceInput)?.versions
    if (!Array.isArray(versions)) continue
    for (const version of versions) {
      const workouts = jsonRecord(version)?.workouts
      if (!Array.isArray(workouts)) continue
      count += workouts.filter(workout => typeof jsonRecord(workout)?.id === 'string').length
    }
  }
  return count
}

function captureRpcProjection(trainerId: string, label: string) {
  return parseJson<RpcProjectionSnapshot>(psql(authenticatedSql(trainerId, `
WITH directory AS MATERIALIZED (
  SELECT COALESCE(jsonb_agg(to_jsonb(directory_row) ORDER BY directory_row.professional_name, directory_row.user_id), '[]'::JSONB) AS payload
  FROM public.active_trainer_directory AS directory_row
),
summary AS MATERIALIZED (SELECT public.get_coach_clients_summary() AS payload),
valid_detail AS MATERIALIZED (
  SELECT public.get_coach_client_insights(public.audit_uuid('client-user', 1), CURRENT_DATE - 86, CURRENT_DATE + 1) AS payload
),
invalid_detail AS MATERIALIZED (
  SELECT public.get_coach_client_insights(public.audit_uuid('client-user', 101), CURRENT_DATE - 86, CURRENT_DATE + 1) AS payload
),
null_detail AS MATERIALIZED (
  SELECT public.get_coach_client_insights(public.audit_uuid('client-user', 201), CURRENT_DATE - 86, CURRENT_DATE + 1) AS payload
)
SELECT jsonb_build_object(
  'directory', directory.payload,
  'summary', summary.payload,
  'validDetail', valid_detail.payload,
  'invalidTimezoneDetail', invalid_detail.payload,
  'nullTimezoneDetail', null_detail.payload
)
FROM directory CROSS JOIN summary CROSS JOIN valid_detail CROSS JOIN invalid_detail CROSS JOIN null_detail;
`), label), label)
}

function verifyRpcOutputEquivalence(before045: RpcProjectionSnapshot, after045: RpcProjectionSnapshot) {
  const normalizedBefore = JSON.stringify(normalizeRpcProjection(before045))
  const normalizedAfter = JSON.stringify(normalizeRpcProjection(after045))
  if (normalizedBefore !== normalizedAfter) {
    throw new Error('045 changed the consent-bound RPC payload outside the intentional materialized workout ID repair')
  }
  const beforeIds = prescribedWorkoutIdCount(before045.validDetail)
  const summaryIds = {
    before045: summaryWorkoutIdCount(before045.summary),
    after045: summaryWorkoutIdCount(after045.summary),
  }
  const afterIds = {
    valid: prescribedWorkoutIdCount(after045.validDetail),
    invalidTimezone: prescribedWorkoutIdCount(after045.invalidTimezoneDetail),
    nullTimezone: prescribedWorkoutIdCount(after045.nullTimezoneDetail),
  }
  if (beforeIds !== 0 || summaryIds.before045 !== 0 || summaryIds.after045 < 1
    || afterIds.valid !== 104 || afterIds.invalidTimezone !== 52 || afterIds.nullTimezone !== 52) {
    throw new Error(`unexpected workout ID repair counts detailBefore=${beforeIds} detailAfter=${JSON.stringify(afterIds)} summary=${JSON.stringify(summaryIds)}`)
  }
  return {
    normalizedPayloadEqual: true,
    directoryProjectionEqual: true,
    before045MaterializedIds: beforeIds,
    after045MaterializedIds: afterIds,
    summaryMaterializedIds: summaryIds,
  }
}

function walkPlan(node: PlanNode, visitor: (node: PlanNode) => void) {
  visitor(node)
  for (const child of node.Plans ?? []) walkPlan(child, visitor)
}

function measurePlans(shape: AuditShape) {
  const marker = (repetition: number) => `__TRAINER_AUDIT_PLAN_${repetition}__`
  const measuredStatements = Array.from({ length: repetitions }, (_, repetition) => `
SELECT '${marker(repetition)}';
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${shape.statement}
`).join('\n')
  const output = psql(authenticatedSql(shape.userId, `
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${shape.statement}
${measuredStatements}
`), `measure ${shape.name}`)
  const payloads = output.split(/__TRAINER_AUDIT_PLAN_\d+__\r?\n/).slice(1)
  if (payloads.length !== repetitions) {
    throw new Error(`${shape.name} returned ${payloads.length} measured plans instead of ${repetitions}`)
  }
  return payloads.map((payload, repetition) => {
    const parsed = parseJson<ExplainPlan[]>(payload.trim(), `${shape.name} repetition ${repetition + 1}`)
    if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`${shape.name} repetition ${repetition + 1} returned an unexpected EXPLAIN payload`)
    return parsed[0]
  })
}

function percentile95(values: number[]) {
  if (values.length !== repetitions) throw new Error(`p95 requires exactly ${repetitions} measurements`)
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * 0.95) - 1]
}

function resetStatistics() {
  psql('SELECT pg_stat_reset();', 'reset statistics')
}

function tableStatistics() {
  const output = psql(`
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'relation', table_stat.relname,
  'rows', GREATEST(table_stat.reltuples::BIGINT, 0),
  'seqScans', table_stat.seq_scan
) ORDER BY table_stat.relname), '[]'::JSONB)
FROM (
  SELECT relation.relname, relation.reltuples, stats.seq_scan
  FROM pg_catalog.pg_stat_user_tables AS stats
  JOIN pg_catalog.pg_class AS relation ON relation.oid = stats.relid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
) AS table_stat;
`, 'read table statistics')
  return parseJson<TableStat[]>(output, 'table statistics')
}

function indexStatistics() {
  const output = psql(`
SELECT COALESCE(jsonb_agg(jsonb_build_object('name', indexrelname, 'scans', idx_scan) ORDER BY indexrelname), '[]'::JSONB)
FROM pg_catalog.pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan > 0;
`, 'read index statistics')
  return parseJson<IndexStat[]>(output, 'index statistics')
}

function verifyPlannerCardinalities() {
  const output = psql(`
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'relation', relation.relname,
  'estimatedRows', relation.reltuples::BIGINT
) ORDER BY relation.relname), '[]'::JSONB)
FROM pg_catalog.pg_class AS relation
JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE namespace.nspname = 'public'
  AND relation.relname = ANY (ARRAY[
    'profiles', 'trainer_profiles', 'trainer_service_offerings', 'coaching_requests',
    'coaching_relationships', 'coaching_consents', 'trainer_plan_assignments',
    'trainer_assignment_versions', 'workout_plans', 'workouts',
    'session_authorizations', 'progress_logs', 'exercise_logs'
  ]);
`, 'verify planner cardinalities')
  const cardinalities = parseJson<PlannerCardinality[]>(output, 'planner cardinalities')
  const expected: Record<string, number> = {
    profiles: 1100,
    trainer_profiles: 100,
    trainer_service_offerings: 100,
    coaching_requests: 1000,
    coaching_relationships: 1000,
    coaching_consents: 1000,
    trainer_plan_assignments: 1000,
    trainer_assignment_versions: 52_000,
    workout_plans: 52_000,
    workouts: 52_052,
    session_authorizations: 52_000,
    progress_logs: 52_000,
    exercise_logs: 52_000,
  }
  for (const [relation, expectedRows] of Object.entries(expected)) {
    const observed = cardinalities.find(cardinality => cardinality.relation === relation)?.estimatedRows
    if (observed === undefined || Math.abs(observed - expectedRows) > Math.max(1, expectedRows * 0.01)) {
      throw new Error(`planner cardinality ${relation} expected ${expectedRows}±1%, received ${observed ?? 'missing'}`)
    }
  }
  return cardinalities
}

function verifyPinnedIndexCatalog() {
  const required = [
    'idx_workouts_plan_day_order',
    'idx_exercise_logs_progress',
    'idx_exercise_logs_progress_exercise',
    'workouts_plan_schedule_idx',
  ]
  const output = psql(`
SELECT COALESCE(jsonb_agg(index_name ORDER BY index_name), '[]'::JSONB)
FROM unnest(ARRAY[${required.map(name => `'${name}'`).join(', ')}]) AS expected(index_name)
WHERE to_regclass('public.' || index_name) IS NOT NULL;
`, 'verify historical and final index catalog')
  const present = parseJson<string[]>(output, 'index catalog')
  const missing = required.filter(index => !present.includes(index))
  if (missing.length > 0) throw new Error(`audit database omitted required production indexes: ${missing.join(', ')}`)
  return present
}

function assertExpectedIndexes(shape: AuditShape, selectedIndexes: Set<string>) {
  for (const group of shape.expectedIndexGroups) {
    if (!group.some(index => selectedIndexes.has(index))) {
      throw new Error(`${shape.name} did not select any approved index from [${group.join(', ')}]; selected=[${Array.from(selectedIndexes).sort().join(', ')}]`)
    }
  }
}

function nestedPlanDiagnostic(shape: AuditShape) {
  const marker = `TRAINER_AUDIT_NESTED_${process.pid}_${Date.now()}_${shape.name.replace(/\W+/g, '_')}`
  psql(`
LOAD 'auto_explain';
SET auto_explain.log_min_duration = 0;
SET auto_explain.log_analyze = TRUE;
SET auto_explain.log_buffers = TRUE;
SET auto_explain.log_nested_statements = TRUE;
SET auto_explain.log_format = 'json';
DO $audit_marker$ BEGIN RAISE LOG '${marker}'; END $audit_marker$;
${authenticatedSql(shape.userId, shape.statement)}
`, `capture nested plan for ${shape.name}`)
  const logs = docker(['logs', container])
  const completeLogs = `${logs.stdout}\n${logs.stderr}`
  const markerPosition = completeLogs.lastIndexOf(marker)
  if (markerPosition < 0) throw new Error(`${shape.name} auto_explain marker was not captured`)
  return completeLogs.slice(markerPosition + marker.length)
}

function assertMaterializedTimezonePlan(shape: AuditShape, nestedPlan: string) {
  const timezoneScans = nestedPlan.match(/"Function Name": "pg_timezone_names"/g) ?? []
  if (timezoneScans.length !== 1) {
    throw new Error(`${shape.name} expected one materialized pg_timezone_names plan node, received ${timezoneScans.length}`)
  }
  const loopMatch = nestedPlan.match(/"Function Name": "pg_timezone_names"[\s\S]*?"Actual Loops": ([0-9]+)/)
  if (loopMatch?.[1] !== '1') {
    throw new Error(`${shape.name} expected the materialized timezone catalog scan to execute once, received loops=${loopMatch?.[1] ?? 'unknown'}`)
  }
}

function auditShape(shape: AuditShape) {
  resetStatistics()

  const executionTimes: number[] = []
  const planIndexes = new Set<string>()
  const measuredPlans = measurePlans(shape)
  for (const measured of measuredPlans) {
    executionTimes.push(measured['Execution Time'])
    walkPlan(measured.Plan, node => {
      if (node['Index Name']) planIndexes.add(node['Index Name'])
    })
  }

  const tableStats = tableStatistics()
  const indexStats = indexStatistics()
  const selectedIndexes = new Set([...Array.from(planIndexes), ...indexStats.map(index => index.name)])
  const avoidableSequentialScans = tableStats.filter(stat => stat.rows >= largeRelationRows && stat.seqScans > 0)
  if (avoidableSequentialScans.length > 0) {
    const nestedPlan = nestedPlanDiagnostic(shape)
    throw new Error(`${shape.name} sequentially scanned large populated relations: ${avoidableSequentialScans.map(stat => `${stat.relation}(${stat.rows})`).join(', ')}; nested=${nestedPlan}`)
  }
  assertExpectedIndexes(shape, selectedIndexes)

  const p95Ms = percentile95(executionTimes)
  const nestedPlan = shape.name === 'client list' ? nestedPlanDiagnostic(shape) : ''
  if (nestedPlan) assertMaterializedTimezonePlan(shape, nestedPlan)
  if (p95Ms > budgetMs) {
    throw new Error(`${shape.name} p95 ${p95Ms.toFixed(3)} ms exceeds ${budgetMs} ms; min=${Math.min(...executionTimes).toFixed(3)} max=${Math.max(...executionTimes).toFixed(3)} jit=${JSON.stringify(measuredPlans.at(-1)?.JIT ?? null)} nested=${nestedPlan}`)
  }

  return {
    name: shape.name,
    p95Ms,
    minimumMs: Math.min(...executionTimes),
    maximumMs: Math.max(...executionTimes),
    selectedIndexes: Array.from(selectedIndexes).sort(),
    representativePlan: measuredPlans.at(-1),
  }
}

function verifyFixture(trainerId: string, clientId: string) {
  const rawCounts = parseJson<Record<string, number>>(psql(`
SELECT jsonb_build_object(
  'trainers', (SELECT count(*) FROM public.trainer_profiles),
  'clients', (SELECT count(*) FROM public.profiles WHERE id NOT IN (SELECT user_id FROM public.trainer_profiles)),
  'requests', (SELECT count(*) FROM public.coaching_requests),
  'relationships', (SELECT count(*) FROM public.coaching_relationships),
  'versions', (SELECT count(*) FROM public.trainer_assignment_versions),
  'versionWeeks', (SELECT count(DISTINCT version_number) FROM public.trainer_assignment_versions),
  'progressLogs', (SELECT count(*) FROM public.progress_logs),
  'exerciseLogs', (SELECT count(*) FROM public.exercise_logs)
);
`, 'verify fixture counts'), 'fixture counts')
  const expectedCounts: Record<string, number> = {
    trainers: 100,
    clients: 1000,
    requests: 1000,
    relationships: 1000,
    versions: 52_000,
    versionWeeks: 52,
    progressLogs: 52_000,
    exerciseLogs: 52_000,
  }
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (rawCounts[key] !== expected) throw new Error(`fixture ${key} expected ${expected}, received ${rawCounts[key]}`)
  }

  const productCounts = parseJson<Record<string, number>>(psql(authenticatedSql(trainerId, `
WITH summary AS MATERIALIZED (SELECT public.get_coach_clients_summary() AS payload),
detail AS MATERIALIZED (SELECT public.get_coach_client_insights('${clientId}', CURRENT_DATE - 86, CURRENT_DATE + 1) AS payload),
invalid_timezone_detail AS MATERIALIZED (
  SELECT public.get_coach_client_insights(public.audit_uuid('client-user', 101), CURRENT_DATE - 86, CURRENT_DATE + 1) AS payload
),
null_timezone_detail AS MATERIALIZED (
  SELECT public.get_coach_client_insights(public.audit_uuid('client-user', 201), CURRENT_DATE - 86, CURRENT_DATE + 1) AS payload
)
SELECT jsonb_build_object(
  'directory', (SELECT count(*) FROM public.active_trainer_directory),
  'pendingQueue', (SELECT count(*) FROM public.coaching_requests WHERE trainer_user_id = '${trainerId}' AND status = 'pending'),
  'activeClients', (summary.payload->'counts'->>'activeClients')::INTEGER,
  'summaryScheduleIdentityRows', CASE WHEN
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(summary.payload->'clients') AS summary_client(row)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(summary_client.row->'adherenceInput'->'versions', '[]'::JSONB)) AS summary_version(row)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(summary_version.row->'workouts', '[]'::JSONB)) AS summary_workout(row)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(summary.payload->'clients') AS summary_client(row)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(summary_client.row->'adherenceInput'->'versions', '[]'::JSONB)) AS summary_version(row)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(summary_version.row->'workouts', '[]'::JSONB)) AS summary_workout(row)
      WHERE summary_workout.row->>'id' IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM generate_series(1, 1000) AS expected_client(client_number)
          CROSS JOIN generate_series(1, 52) AS expected_week(week_number)
          WHERE public.audit_uuid('client-user', expected_client.client_number) = (summary_client.row->'client'->>'id')::UUID
            AND public.audit_uuid('version', (expected_client.client_number - 1) * 52 + expected_week.week_number) = (summary_version.row->>'id')::UUID
            AND (summary_workout.row->>'id')::UUID = CASE
              WHEN expected_client.client_number = 1 AND (summary_workout.row->>'isoDay')::INTEGER = 7
              THEN public.audit_uuid('workout-secondary', expected_week.week_number)
              ELSE public.audit_uuid('workout', (expected_client.client_number - 1) * 52 + expected_week.week_number)
            END
            AND (summary_workout.row->>'isoDay')::INTEGER = CASE
              WHEN expected_client.client_number = 1 AND (summary_workout.row->>'id')::UUID = public.audit_uuid('workout-secondary', expected_week.week_number)
              THEN 7 ELSE 1
            END
        )
    ) THEN 1 ELSE 0 END,
  'validTimezoneRows', (SELECT count(*) FROM jsonb_array_elements(summary.payload->'clients') AS row WHERE row->'client'->>'id' = public.audit_uuid('client-user', 1)::TEXT AND row->'client'->>'timezone' = 'UTC'),
  'fallbackTimezoneRows', (SELECT count(*) FROM jsonb_array_elements(summary.payload->'clients') AS row WHERE row->'client'->>'id' IN (public.audit_uuid('client-user', 101)::TEXT, public.audit_uuid('client-user', 201)::TEXT) AND row->'client'->>'timezone' = 'America/Havana'),
  'detailVersions', jsonb_array_length(detail.payload->'versions'),
  'detailPrescribedWorkouts', jsonb_array_length(detail.payload->'prescribedWorkouts'),
  'detailDistinctPrescribedWorkouts', (SELECT count(DISTINCT (row->>'assignmentVersionId', row->>'dayOfWeek', row->>'orderInPlan')) FROM jsonb_array_elements(detail.payload->'prescribedWorkouts') AS row),
  'detailNonNullMaterializedIds', (SELECT count(*) FROM jsonb_array_elements(detail.payload->'prescribedWorkouts') AS row WHERE row->>'id' IS NOT NULL),
  'detailDistinctMaterializedIds', (SELECT count(DISTINCT row->>'id') FROM jsonb_array_elements(detail.payload->'prescribedWorkouts') AS row),
  'detailExercisePrescriptionRows', (SELECT count(*) FROM jsonb_array_elements(detail.payload->'prescribedWorkouts') AS row WHERE jsonb_array_length(row->'exercises') = 1),
  'detailOrderBoundaryRows', CASE WHEN
    detail.payload->'prescribedWorkouts'->0 @> jsonb_build_object('assignmentVersionId', public.audit_uuid('version', 1), 'id', public.audit_uuid('workout', 1), 'dayOfWeek', 1, 'orderInPlan', 1)
    AND detail.payload->'prescribedWorkouts'->1 @> jsonb_build_object('assignmentVersionId', public.audit_uuid('version', 1), 'id', public.audit_uuid('workout-secondary', 1), 'dayOfWeek', 7, 'orderInPlan', 2)
    AND detail.payload->'prescribedWorkouts'->102 @> jsonb_build_object('assignmentVersionId', public.audit_uuid('version', 52), 'id', public.audit_uuid('workout', 52), 'dayOfWeek', 1, 'orderInPlan', 1)
    AND detail.payload->'prescribedWorkouts'->103 @> jsonb_build_object('assignmentVersionId', public.audit_uuid('version', 52), 'id', public.audit_uuid('workout-secondary', 52), 'dayOfWeek', 7, 'orderInPlan', 2)
    THEN 1 ELSE 0 END,
  'validTimezoneDetailRows', CASE WHEN detail.payload->'client'->>'timezone' = 'UTC' THEN 1 ELSE 0 END,
  'invalidTimezoneDetailRows', CASE WHEN invalid_timezone_detail.payload->'client'->>'timezone' = 'America/Havana' THEN 1 ELSE 0 END,
  'nullTimezoneDetailRows', CASE WHEN null_timezone_detail.payload->'client'->>'timezone' = 'America/Havana' THEN 1 ELSE 0 END,
  'detailMeasurementsNull', CASE WHEN detail.payload->'measurements' = 'null'::JSONB THEN 1 ELSE 0 END,
  'detailSessions', jsonb_array_length(detail.payload->'sessions'),
  'rpcCatalogContracts', (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN ('get_coach_clients_summary', 'get_coach_client_insights')
      AND pg_catalog.pg_get_userbyid(procedure.proowner) = 'postgres'
      AND procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']::TEXT[]
      AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) AS privilege
        WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
      )
  )
) FROM summary CROSS JOIN detail CROSS JOIN invalid_timezone_detail CROSS JOIN null_timezone_detail;
`), 'verify product query counts'), 'product query counts')
  const expectedProductCounts: Record<string, number> = {
    directory: 100,
    pendingQueue: 10,
    activeClients: 10,
    summaryScheduleIdentityRows: 1,
    validTimezoneRows: 1,
    fallbackTimezoneRows: 2,
    detailVersions: 52,
    detailPrescribedWorkouts: 104,
    detailDistinctPrescribedWorkouts: 104,
    detailNonNullMaterializedIds: 104,
    detailDistinctMaterializedIds: 104,
    detailExercisePrescriptionRows: 104,
    detailOrderBoundaryRows: 1,
    validTimezoneDetailRows: 1,
    invalidTimezoneDetailRows: 1,
    nullTimezoneDetailRows: 1,
    detailMeasurementsNull: 1,
    detailSessions: 13,
    rpcCatalogContracts: 2,
  }
  for (const [key, expected] of Object.entries(expectedProductCounts)) {
    if (productCounts[key] !== expected) {
      const adminPending = psql(`SELECT count(*) FROM public.coaching_requests WHERE trainer_user_id = '${trainerId}' AND status = 'pending';`, 'diagnose admin fixture visibility')
      const authenticatedVisibility = psql(authenticatedSql(trainerId, `
SELECT jsonb_build_object(
  'uid', auth.uid(),
  'profileRows', (SELECT count(*) FROM public.trainer_profiles WHERE user_id = auth.uid()),
  'accountRows', (SELECT count(*) FROM public.profiles WHERE id = auth.uid()),
  'pendingRows', (SELECT count(*) FROM public.coaching_requests WHERE trainer_user_id = auth.uid() AND status = 'pending')
);
`), 'diagnose authenticated fixture visibility')
      throw new Error(`product ${key} expected ${expected}, received ${productCounts[key]}; adminPending=${adminPending}; authenticated=${authenticatedVisibility}`)
    }
  }

  return { ...rawCounts, ...productCounts }
}

const trainerIdExpression = "public.audit_uuid('trainer-user', 1)"
const clientIdExpression = "public.audit_uuid('client-user', 1)"

let startAttempted = false
let auditError: unknown
try {
  process.stdout.write(`[trainer-audit] starting isolated local database ${container}\n`)
  startAttempted = true
  const start = docker(['run', '--detach', '--name', container, '--env', 'POSTGRES_PASSWORD=postgres', image])
  if (start.status !== 0) throw new Error(`docker run failed with exit code ${start.status}`)
  waitForDatabase()
  process.stdout.write('[trainer-audit] database ready; applying local schema\n')

  psql(bootstrapSql, 'apply minimal product bootstrap')
  psql(planBootstrapSql, 'apply plan bootstrap')
  psql(historicalIndexSql, 'apply pinned historical index catalog')
  for (const migrationFile of migrationFiles.filter(file => file !== '045_trainer_hardening.sql')) {
    const migration = readFileSync(path.join(repoRoot, 'supabase', 'migrations', migrationFile), 'utf8')
    psql(migrationFile === '037_atomic_plan_lifecycle.sql' ? `BEGIN;\n${migration}\nCOMMIT;` : migration, `apply ${migrationFile}`)
  }
  psql(loadLegacyOwnerBoundary(repoRoot).sql, 'apply migration 001 owner policy boundary')

  process.stdout.write('[trainer-audit] seeding verified 100 trainer / 1,000 client / 52 week fixture\n')
  psql(fixtureSql, 'seed performance fixture')
  const trainerId = psql(`SELECT ${trainerIdExpression};`, 'resolve trainer fixture id')
  const clientId = psql(`SELECT ${clientIdExpression};`, 'resolve client fixture id')
  const before045 = captureRpcProjection(trainerId, 'capture pre-045 RPC projection')
  const hardeningMigration = readFileSync(path.join(repoRoot, 'supabase', 'migrations', '045_trainer_hardening.sql'), 'utf8')
  psql(hardeningMigration, 'apply 045 trainer hardening')
  psql(hardeningMigration, 'reapply 045 for rerunnability')
  const after045 = captureRpcProjection(trainerId, 'capture post-045 RPC projection')
  const rpcEquivalence = verifyRpcOutputEquivalence(before045, after045)
  const plannerCardinalities = verifyPlannerCardinalities()
  const pinnedIndexes = verifyPinnedIndexCatalog()
  const fixture = { ...verifyFixture(trainerId, clientId), rpcEquivalence, plannerCardinalities, pinnedIndexes }

  const shapes: AuditShape[] = [
    {
      name: 'directory',
      userId: trainerId,
      statement: 'SELECT user_id, slug, professional_name, professional_photo_url, bio, specialties, modalities, experience_summary, general_location, languages, verified_at, active_services FROM public.active_trainer_directory ORDER BY professional_name ASC, user_id ASC LIMIT 13;',
      expectedIndexGroups: [['trainer_service_offerings_profile_active_idx']],
    },
    {
      name: 'pending queue',
      userId: trainerId,
      statement: `SELECT request.id, request.message, request.created_at, service.name FROM public.coaching_requests AS request JOIN public.trainer_service_offerings AS service ON service.id = request.service_id WHERE request.trainer_user_id = '${trainerId}' AND request.status = 'pending' ORDER BY request.created_at DESC;`,
      expectedIndexGroups: [['coaching_requests_trainer_pending_created_idx']],
    },
    {
      name: 'client list',
      userId: trainerId,
      statement: 'SELECT public.get_coach_clients_summary();',
      expectedIndexGroups: [
        ['coaching_relationships_trainer_active_started_idx', 'coaching_relationships_trainer_status_idx'],
        ['coaching_consents_active_scope_lookup_idx', 'coaching_consents_active_scope_idx', 'coaching_consents_one_active_scope'],
        ['trainer_assignment_versions_assignment_effective_idx', 'trainer_assignment_versions_assignment_idx', 'trainer_assignment_versions_assignment_version_unique'],
        ['progress_logs_user_completed_insights_idx', 'idx_progress_logs_user_completed', 'idx_progress_logs_user_workout_completed', 'idx_progress_logs_user'],
        ['idx_exercise_logs_progress', 'idx_exercise_logs_progress_exercise'],
      ],
    },
    {
      name: '12-week client detail',
      userId: trainerId,
      statement: `SELECT public.get_coach_client_insights('${clientId}', CURRENT_DATE - 86, CURRENT_DATE + 1);`,
      expectedIndexGroups: [
        ['coaching_relationships_one_active_client', 'coaching_relationships_client_status_idx'],
        ['coaching_consents_active_scope_lookup_idx', 'coaching_consents_active_scope_idx', 'coaching_consents_one_active_scope'],
        ['trainer_assignment_versions_assignment_effective_idx', 'trainer_assignment_versions_assignment_idx', 'trainer_assignment_versions_assignment_version_unique'],
        ['progress_logs_user_completed_insights_idx', 'idx_progress_logs_user_completed', 'idx_progress_logs_user_workout_completed', 'idx_progress_logs_user'],
        ['workouts_plan_schedule_idx'],
        ['idx_exercise_logs_progress', 'idx_exercise_logs_progress_exercise'],
      ],
    },
  ]

  const results = shapes.map(auditShape)
  process.stdout.write(`${JSON.stringify({ fixture, repetitions, budgetMs, results }, null, 2)}\n`)
  process.stdout.write('[trainer-audit] PASS: all four production query shapes stayed indexed and within budget\n')
} catch (error) {
  auditError = error
} finally {
  if (startAttempted) {
    const cleanup = docker(['rm', '--force', container])
    if (cleanup.status !== 0) {
      auditError = new Error(`failed to remove isolated local database ${container}; prior=${auditError instanceof Error ? auditError.message : String(auditError ?? 'none')}`)
    } else {
      process.stdout.write(`[trainer-audit] removed isolated local database ${container}\n`)
    }
  }
}

if (auditError) throw auditError
