-- Disposable test database only. This file is never a deployment migration.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION public.is_account_active(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE TABLE public.workout_plans(id uuid PRIMARY KEY, user_id uuid, source_type text);
CREATE TABLE public.workouts(id uuid PRIMARY KEY, plan_id uuid, user_id uuid);
CREATE TABLE public.workout_exercises(id uuid PRIMARY KEY, workout_id uuid, exercise_id uuid, sets integer, reps integer, duration_seconds integer, rest_seconds integer, weight_kg numeric, target_rpe numeric);
INSERT INTO auth.users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
