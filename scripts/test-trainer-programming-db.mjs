import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { waitForFinalDatabase } from './trainer-foundations-readiness.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const image = process.env.TRAINER_PROGRAMMING_DB_IMAGE ?? 'public.ecr.aws/supabase/postgres:17.6.1.143'
const container = `fitai-trainer-programming-db-${process.pid}-${Date.now().toString(36)}`
const migrationPaths = ['037_atomic_plan_lifecycle.sql', '041_trainer_verification.sql', '042_trainer_relationships.sql', '043_trainer_programming.sql']
  .map(file => path.join(repoRoot, 'supabase', 'migrations', file))
const testPath = path.join(repoRoot, 'supabase', 'tests', '043_trainer_programming_test.sql')

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
CREATE TABLE public.profiles (id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, avatar_url TEXT, onboarding_done BOOLEAN NOT NULL DEFAULT FALSE, is_admin BOOLEAN NOT NULL DEFAULT FALSE, account_status TEXT NOT NULL DEFAULT 'active', suspension_reason TEXT, suspended_at TIMESTAMPTZ, suspended_until TIMESTAMPTZ, suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL);
CREATE TABLE public.admin_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), admin_user_id UUID, target_user_id UUID, action TEXT NOT NULL, reason TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.product_notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, dedupe_key TEXT NOT NULL, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, dedupe_key));
CREATE TABLE public.professional_audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id UUID, subject_user_id UUID, entity_type TEXT NOT NULL, entity_id UUID, action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = p_user_id AND profile.account_status = 'active') $$;
CREATE OR REPLACE FUNCTION public.enforce_protected_profile_fields() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$ BEGIN IF COALESCE(auth.role(), '') <> 'service_role' THEN NEW.is_admin := OLD.is_admin; NEW.account_status := OLD.account_status; NEW.suspension_reason := OLD.suspension_reason; NEW.suspended_at := OLD.suspended_at; NEW.suspended_until := OLD.suspended_until; NEW.suspended_by := OLD.suspended_by; END IF; RETURN NEW; END; $$;
CREATE TRIGGER trg_enforce_protected_profile_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_profile_fields();
GRANT EXECUTE ON FUNCTION public.is_account_active(UUID) TO authenticated, service_role;
GRANT ALL ON TABLE public.product_notifications, public.professional_audit_logs TO service_role;
`

const planBootstrapSql = `
ALTER TABLE public.profiles ADD COLUMN subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN days_per_week INTEGER;
ALTER TABLE public.profiles ADD COLUMN session_duration_minutes INTEGER;
ALTER TABLE public.profiles ADD COLUMN preferred_workout_days INTEGER[];
ALTER TABLE public.profiles ADD COLUMN available_equipment TEXT[];
ALTER TABLE public.profiles ADD COLUMN cardio_preferences TEXT[];
CREATE TABLE public.exercises (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, is_public BOOLEAN NOT NULL DEFAULT TRUE);
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
CREATE OR REPLACE FUNCTION public.record_plan_generation_success(p_plan_id UUID) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.plan_generation_events (user_id, mode, generator, success) SELECT user_id, 'initial', 'evidence_engine', TRUE FROM public.workout_plans WHERE id = p_plan_id; END; $$;
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
  runPsql(`BEGIN;\n${readFileSync(migrationPaths[0], 'utf8')}\nCOMMIT;`, 'applying migration 037 lifecycle')
  runPsql(readFileSync(migrationPaths[1], 'utf8'), 'applying migration 041')
  runPsql(readFileSync(migrationPaths[2], 'utf8'), 'applying migration 042')
  runPsql(readFileSync(migrationPaths[3], 'utf8'), 'applying migration 043')
  runPsql(readFileSync(migrationPaths[3], 'utf8'), 'reapplying migration 043 for rerunnability')
  const tapOutput = runPsql(readFileSync(testPath, 'utf8'), 'running 043 pgTAP behavior suite')
  if (/^\s*not ok\b/m.test(tapOutput) || /# Looks like you (?:failed|planned)\b/.test(tapOutput)) throw new Error('pgTAP reported one or more failed assertions')
  process.stdout.write('\n[trainer-programming-db] PASS: migration 043 behavior and rerunnability passed\n')
} finally {
  if (started) {
    const cleanup = docker(['rm', '--force', container], { print: false })
    process.stdout.write(cleanup.status === 0 ? `[trainer-programming-db] removed isolated ${container}\n` : `[trainer-programming-db] warning: failed to remove ${container}\n`)
  }
}
