-- Minimal platform-owned schemas required by the schema-only public/private baseline.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO authenticated;
