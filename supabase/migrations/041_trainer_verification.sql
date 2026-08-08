-- ============================================================
-- Migration 041: private trainer verification and professional profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trainer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required', 'approved', 'rejected', 'withdrawn')),
  professional_name TEXT NOT NULL DEFAULT '',
  professional_photo_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  specialties TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  modalities TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[]),
  experience_summary TEXT NOT NULL DEFAULT '',
  general_location TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'email'
    CHECK (preferred_contact IN ('email', 'phone', 'whatsapp')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  interview_availability TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX trainer_applications_one_open_per_user_idx
  ON public.trainer_applications (user_id)
  WHERE status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required');

CREATE INDEX trainer_applications_status_created_idx
  ON public.trainer_applications (status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.trainer_application_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('document', 'link')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  issuer TEXT,
  issued_on DATE,
  expires_on DATE,
  storage_path TEXT,
  external_url TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_application_credentials_source_check CHECK (
    (
      credential_type = 'document'
      AND storage_path IS NOT NULL
      AND external_url IS NULL
      AND mime_type IN ('application/pdf', 'image/jpeg', 'image/png')
      AND size_bytes BETWEEN 1 AND 10485760
    )
    OR (
      credential_type = 'link'
      AND storage_path IS NULL
      AND external_url LIKE 'https://%'
      AND mime_type IS NULL
      AND size_bytes IS NULL
    )
  ),
  CONSTRAINT trainer_application_credentials_dates_check
    CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on),
  CONSTRAINT trainer_application_credentials_storage_path_unique UNIQUE (storage_path)
);

CREATE INDEX trainer_application_credentials_application_created_idx
  ON public.trainer_application_credentials (application_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.trainer_application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE,
  from_status TEXT
    CHECK (from_status IS NULL OR from_status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required', 'approved', 'rejected', 'withdrawn')),
  to_status TEXT NOT NULL
    CHECK (to_status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required', 'approved', 'rejected', 'withdrawn')),
  public_note TEXT,
  internal_note TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('applicant', 'admin', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trainer_application_events_application_created_idx
  ON public.trainer_application_events (application_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.trainer_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  medium TEXT NOT NULL CHECK (medium IN ('video_call', 'phone', 'in_person')),
  external_url TEXT CHECK (external_url IS NULL OR external_url LIKE 'https://%'),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'scheduled', 'completed', 'cancelled')),
  outcome TEXT,
  public_note TEXT,
  internal_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trainer_interviews_application_proposed_idx
  ON public.trainer_interviews (application_id, proposed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.trainer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_application_id UUID NOT NULL UNIQUE REFERENCES public.trainer_applications(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'inactive')),
  professional_name TEXT NOT NULL,
  professional_photo_url TEXT,
  bio TEXT NOT NULL,
  specialties TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  modalities TEXT[] NOT NULL DEFAULT '{}'::TEXT[]
    CHECK (modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[]),
  experience_summary TEXT NOT NULL,
  general_location TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX trainer_profiles_status_created_idx
  ON public.trainer_profiles (status, created_at DESC, id DESC);

ALTER TABLE public.trainer_applications OWNER TO postgres;
ALTER TABLE public.trainer_application_credentials OWNER TO postgres;
ALTER TABLE public.trainer_application_events OWNER TO postgres;
ALTER TABLE public.trainer_interviews OWNER TO postgres;
ALTER TABLE public.trainer_profiles OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.touch_trainer_verification_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trainer_applications_updated_at ON public.trainer_applications;
CREATE TRIGGER trg_trainer_applications_updated_at
  BEFORE UPDATE ON public.trainer_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();

DROP TRIGGER IF EXISTS trg_trainer_application_credentials_updated_at ON public.trainer_application_credentials;
CREATE TRIGGER trg_trainer_application_credentials_updated_at
  BEFORE UPDATE ON public.trainer_application_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();

DROP TRIGGER IF EXISTS trg_trainer_interviews_updated_at ON public.trainer_interviews;
CREATE TRIGGER trg_trainer_interviews_updated_at
  BEFORE UPDATE ON public.trainer_interviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();

DROP TRIGGER IF EXISTS trg_trainer_profiles_updated_at ON public.trainer_profiles;
CREATE TRIGGER trg_trainer_profiles_updated_at
  BEFORE UPDATE ON public.trainer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();

ALTER FUNCTION public.touch_trainer_verification_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.touch_trainer_verification_updated_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.trainer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer_applications: read own" ON public.trainer_applications;
CREATE POLICY "trainer_applications: read own"
  ON public.trainer_applications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "trainer_applications: insert own draft" ON public.trainer_applications;
CREATE POLICY "trainer_applications: insert own draft"
  ON public.trainer_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'draft'
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.onboarding_done = TRUE
    )
  );

DROP POLICY IF EXISTS "trainer_applications: update own editable" ON public.trainer_applications;
CREATE POLICY "trainer_applications: update own editable"
  ON public.trainer_applications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('draft', 'changes_requested'))
  WITH CHECK (auth.uid() = user_id AND status IN ('draft', 'changes_requested'));

DROP POLICY IF EXISTS "trainer_applications: delete own editable" ON public.trainer_applications;
CREATE POLICY "trainer_applications: delete own editable"
  ON public.trainer_applications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status IN ('draft', 'changes_requested'));

DROP POLICY IF EXISTS "trainer_applications: active account" ON public.trainer_applications;
CREATE POLICY "trainer_applications: active account"
  ON public.trainer_applications AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

DROP POLICY IF EXISTS "trainer_application_credentials: select own" ON public.trainer_application_credentials;
CREATE POLICY "trainer_application_credentials: select own"
  ON public.trainer_application_credentials
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.id = application_id
      AND application.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "trainer_application_credentials: insert own editable" ON public.trainer_application_credentials;
CREATE POLICY "trainer_application_credentials: insert own editable"
  ON public.trainer_application_credentials
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.id = application_id
      AND application.user_id = auth.uid()
      AND application.status IN ('draft', 'changes_requested')
  ));

DROP POLICY IF EXISTS "trainer_application_credentials: update own editable" ON public.trainer_application_credentials;
CREATE POLICY "trainer_application_credentials: update own editable"
  ON public.trainer_application_credentials
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.id = application_id
      AND application.user_id = auth.uid()
      AND application.status IN ('draft', 'changes_requested')
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.id = application_id
      AND application.user_id = auth.uid()
      AND application.status IN ('draft', 'changes_requested')
  ));

DROP POLICY IF EXISTS "trainer_application_credentials: delete own editable" ON public.trainer_application_credentials;
CREATE POLICY "trainer_application_credentials: delete own editable"
  ON public.trainer_application_credentials
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.id = application_id
      AND application.user_id = auth.uid()
      AND application.status IN ('draft', 'changes_requested')
  ));

DROP POLICY IF EXISTS "trainer_application_credentials: active account" ON public.trainer_application_credentials;
CREATE POLICY "trainer_application_credentials: active account"
  ON public.trainer_application_credentials AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

DROP POLICY IF EXISTS "trainer_profiles: read own" ON public.trainer_profiles;
CREATE POLICY "trainer_profiles: read own"
  ON public.trainer_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "trainer_profiles: active account" ON public.trainer_profiles;
CREATE POLICY "trainer_profiles: active account"
  ON public.trainer_profiles AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.is_account_active(auth.uid()));

REVOKE ALL ON TABLE public.trainer_applications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_application_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_application_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_interviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.trainer_applications TO authenticated;
GRANT INSERT (
  user_id,
  professional_name,
  professional_photo_url,
  bio,
  specialties,
  modalities,
  experience_summary,
  general_location,
  languages,
  contact_email,
  contact_phone,
  preferred_contact,
  timezone,
  interview_availability
) ON TABLE public.trainer_applications TO authenticated;
GRANT UPDATE (
  professional_name,
  professional_photo_url,
  bio,
  specialties,
  modalities,
  experience_summary,
  general_location,
  languages,
  contact_email,
  contact_phone,
  preferred_contact,
  timezone,
  interview_availability
) ON TABLE public.trainer_applications TO authenticated;
GRANT DELETE ON TABLE public.trainer_applications TO authenticated;

GRANT SELECT ON TABLE public.trainer_application_credentials TO authenticated;
GRANT INSERT (
  id,
  application_id,
  credential_type,
  title,
  issuer,
  issued_on,
  expires_on,
  storage_path,
  external_url,
  mime_type,
  size_bytes
) ON TABLE public.trainer_application_credentials TO authenticated;
GRANT UPDATE (
  credential_type,
  title,
  issuer,
  issued_on,
  expires_on,
  storage_path,
  external_url,
  mime_type,
  size_bytes
) ON TABLE public.trainer_application_credentials TO authenticated;
GRANT DELETE ON TABLE public.trainer_application_credentials TO authenticated;

GRANT SELECT ON TABLE public.trainer_profiles TO authenticated;

GRANT ALL ON TABLE public.trainer_applications TO service_role;
GRANT ALL ON TABLE public.trainer_application_credentials TO service_role;
GRANT SELECT, INSERT ON TABLE public.trainer_application_events TO service_role;
GRANT ALL ON TABLE public.trainer_interviews TO service_role;
GRANT ALL ON TABLE public.trainer_profiles TO service_role;

DROP VIEW IF EXISTS public.trainer_application_events_public;
CREATE VIEW public.trainer_application_events_public
WITH (security_barrier = true)
AS
SELECT
  event.id,
  event.application_id,
  event.from_status,
  event.to_status,
  event.public_note,
  event.actor_user_id,
  event.actor_role,
  event.created_at
FROM public.trainer_application_events event
JOIN public.trainer_applications application
  ON application.id = event.application_id
WHERE application.user_id = auth.uid()
  AND public.is_account_active(auth.uid());

ALTER VIEW public.trainer_application_events_public OWNER TO postgres;
REVOKE ALL ON TABLE public.trainer_application_events_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trainer_application_events_public TO authenticated;
GRANT SELECT ON TABLE public.trainer_application_events_public TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-credentials',
  'trainer-credentials',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.trainer_applications IS
  'Private trainer applications containing professional, contact and interview availability data.';
COMMENT ON TABLE public.trainer_application_credentials IS
  'Private certification documents or HTTPS verification links for a trainer application.';
COMMENT ON TABLE public.trainer_application_events IS
  'Append-oriented trainer application status history including private administrative notes.';
COMMENT ON VIEW public.trainer_application_events_public IS
  'Applicant-safe application history that intentionally omits internal_note.';
COMMENT ON TABLE public.trainer_interviews IS
  'Private proposed trainer interviews, external meeting details and outcomes.';
COMMENT ON TABLE public.trainer_profiles IS
  'Approved professional capability record; public discovery is intentionally deferred.';
