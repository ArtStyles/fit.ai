-- ============================================================
-- Migration 041: private trainer verification and professional profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.trainer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  application_kind TEXT NOT NULL DEFAULT 'initial'
    CHECK (application_kind IN ('initial', 'profile_update')),
  source_profile_id UUID,
  credential_source_application_id UUID REFERENCES public.trainer_applications(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_applications_profile_update_references_check CHECK (
    (application_kind = 'initial' AND source_profile_id IS NULL AND credential_source_application_id IS NULL)
    OR
    (application_kind = 'profile_update' AND source_profile_id IS NOT NULL AND credential_source_application_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS trainer_applications_one_open_per_user_idx
  ON public.trainer_applications (user_id)
  WHERE status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required');

CREATE INDEX IF NOT EXISTS trainer_applications_status_created_idx
  ON public.trainer_applications (status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.trainer_application_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
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

CREATE INDEX IF NOT EXISTS trainer_application_credentials_application_created_idx
  ON public.trainer_application_credentials (application_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.trainer_credential_storage_cleanup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  credential_id UUID NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('upload_rollback', 'user_removal')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_credential_storage_cleanup_owner_path_check
    CHECK (storage_path LIKE user_id::TEXT || '/' || application_id::TEXT || '/' || credential_id::TEXT || '.%')
);

CREATE INDEX IF NOT EXISTS trainer_credential_storage_cleanup_user_created_idx
  ON public.trainer_credential_storage_cleanup (user_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.trainer_application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  from_status TEXT
    CHECK (from_status IS NULL OR from_status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required', 'approved', 'rejected', 'withdrawn')),
  to_status TEXT NOT NULL
    CHECK (to_status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required', 'approved', 'rejected', 'withdrawn')),
  public_note TEXT,
  internal_note TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('applicant', 'admin', 'system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trainer_application_events_application_created_idx
  ON public.trainer_application_events (application_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.trainer_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  proposed_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  medium TEXT NOT NULL CHECK (medium IN ('video_call', 'phone', 'in_person')),
  external_url TEXT CHECK (external_url IS NULL OR external_url LIKE 'https://%'),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'scheduled', 'completed', 'cancelled')),
  outcome TEXT,
  public_note TEXT,
  internal_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trainer_interviews_application_proposed_idx
  ON public.trainer_interviews (application_id, proposed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.trainer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  source_application_id UUID NOT NULL UNIQUE REFERENCES public.trainer_applications(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
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

CREATE INDEX IF NOT EXISTS trainer_profiles_status_created_idx
  ON public.trainer_profiles (status, created_at DESC, id DESC);

ALTER TABLE public.trainer_applications
  DROP CONSTRAINT IF EXISTS trainer_applications_source_profile_fk;
ALTER TABLE public.trainer_applications
  ADD CONSTRAINT trainer_applications_source_profile_fk
  FOREIGN KEY (source_profile_id) REFERENCES public.trainer_profiles(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.trainer_applications OWNER TO postgres;
ALTER TABLE public.trainer_application_credentials OWNER TO postgres;
ALTER TABLE public.trainer_credential_storage_cleanup OWNER TO postgres;
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

DROP TRIGGER IF EXISTS trg_trainer_credential_storage_cleanup_updated_at ON public.trainer_credential_storage_cleanup;
CREATE TRIGGER trg_trainer_credential_storage_cleanup_updated_at
  BEFORE UPDATE ON public.trainer_credential_storage_cleanup
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

CREATE OR REPLACE FUNCTION public.trainer_application_has_eligible_credentials(
  p_application_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trainer_application_credentials credential
    JOIN public.trainer_applications application
      ON application.id = credential.application_id
    WHERE credential.application_id = p_application_id
      AND application.user_id = p_user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.trainer_application_credentials credential
    JOIN public.trainer_credential_storage_cleanup cleanup
      ON cleanup.application_id = credential.application_id
      AND cleanup.credential_id = credential.id
      AND cleanup.reason = 'user_removal'
    WHERE credential.application_id = p_application_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.trainer_application_credentials credential
    WHERE credential.application_id = p_application_id
      AND (
        char_length(btrim(credential.title)) NOT BETWEEN 1 AND 160
        OR (
          credential.credential_type = 'link'
          AND (
            credential.external_url IS NULL
            OR credential.external_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
            OR char_length(credential.external_url) > 2048
            OR credential.storage_path IS NOT NULL
            OR credential.mime_type IS NOT NULL
            OR credential.size_bytes IS NOT NULL
          )
        )
        OR (
          credential.credential_type = 'document'
          AND (
            credential.external_url IS NOT NULL
            OR credential.storage_path <> (
              p_user_id::TEXT || '/' || p_application_id::TEXT || '/' || credential.id::TEXT || '.' ||
              CASE credential.mime_type
                WHEN 'application/pdf' THEN 'pdf'
                WHEN 'image/jpeg' THEN 'jpg'
                WHEN 'image/png' THEN 'png'
                ELSE 'invalid'
              END
            )
            OR credential.size_bytes NOT BETWEEN 1 AND 10485760
            OR NOT EXISTS (
              SELECT 1
              FROM storage.objects object
              WHERE object.bucket_id = 'trainer-credentials'
                AND object.name = credential.storage_path
                AND object.metadata->>'mimetype' = credential.mime_type
                AND COALESCE(object.metadata->>'size', '') ~ '^[0-9]+$'
                AND (object.metadata->>'size')::BIGINT = credential.size_bytes
            )
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.trainer_photo_url_is_owned(
  p_user_id UUID,
  p_photo_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_claims JSONB;
  v_issuer TEXT;
  v_origin TEXT;
  v_expected_url TEXT;
BEGIN
  IF p_photo_url IS NULL THEN RETURN TRUE; END IF;

  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
  v_issuer := NULLIF(v_claims->>'iss', '');

  IF auth.uid() IS DISTINCT FROM p_user_id
    OR v_issuer IS NULL
    OR v_issuer !~ '^https://[^/[:space:]]+/auth/v1/?$'
  THEN
    RETURN FALSE;
  END IF;

  v_origin := regexp_replace(v_issuer, '/auth/v1/?$', '');
  v_expected_url := v_origin || '/storage/v1/object/public/avatars/'
    || p_user_id::TEXT || '/avatar.webp';

  RETURN regexp_replace(p_photo_url, '\?v=[0-9]+$', '') = v_expected_url
    AND (p_photo_url = v_expected_url OR p_photo_url ~ '\?v=[0-9]+$')
    AND EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = 'avatars'
        AND object.name = p_user_id::TEXT || '/avatar.webp'
    );
END;
$$;

ALTER FUNCTION public.trainer_application_has_eligible_credentials(UUID, UUID) OWNER TO postgres;
ALTER FUNCTION public.trainer_photo_url_is_owned(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_application_has_eligible_credentials(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trainer_photo_url_is_owned(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_trainer_credential_cleanup(
  p_application_id UUID,
  p_credential_id UUID,
  p_storage_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_cleanup public.trainer_credential_storage_cleanup%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR v_application.status NOT IN ('draft', 'changes_requested')
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF p_storage_path !~ (
    '^' || v_user_id::TEXT || '/' || p_application_id::TEXT || '/' || p_credential_id::TEXT || '\.(pdf|jpg|png)$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Storage path invalid.';
  END IF;

  INSERT INTO public.trainer_credential_storage_cleanup (
    user_id, application_id, credential_id, storage_path, reason
  ) VALUES (
    v_user_id, p_application_id, p_credential_id, p_storage_path, 'upload_rollback'
  )
  ON CONFLICT (storage_path) DO UPDATE SET
    updated_at = NOW()
  WHERE trainer_credential_storage_cleanup.user_id = EXCLUDED.user_id
    AND trainer_credential_storage_cleanup.application_id = EXCLUDED.application_id
    AND trainer_credential_storage_cleanup.credential_id = EXCLUDED.credential_id
  RETURNING * INTO v_cleanup;

  IF v_cleanup.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Cleanup path already claimed.';
  END IF;

  RETURN jsonb_build_object('id', v_cleanup.id, 'storage_path', v_cleanup.storage_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_trainer_application_credential(
  p_credential_id UUID,
  p_application_id UUID,
  p_credential_type TEXT,
  p_title TEXT,
  p_issuer TEXT,
  p_issued_on DATE,
  p_expires_on DATE,
  p_external_url TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_storage_path TEXT;
  v_expected_extension TEXT;
  v_credential public.trainer_application_credentials%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR v_application.status NOT IN ('draft', 'changes_requested')
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 160
    OR char_length(COALESCE(p_issuer, '')) > 160
    OR (p_expires_on IS NOT NULL AND p_issued_on IS NOT NULL AND p_expires_on < p_issued_on) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential metadata invalid.';
  END IF;

  IF p_credential_type = 'link' THEN
    IF p_external_url IS NULL
      OR p_external_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
      OR char_length(p_external_url) > 2048
      OR p_mime_type IS NOT NULL
      OR p_size_bytes IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential link invalid.';
    END IF;
  ELSIF p_credential_type = 'document' THEN
    v_expected_extension := CASE p_mime_type
      WHEN 'application/pdf' THEN 'pdf'
      WHEN 'image/jpeg' THEN 'jpg'
      WHEN 'image/png' THEN 'png'
      ELSE NULL
    END;
    v_storage_path := v_user_id::TEXT || '/' || p_application_id::TEXT || '/'
      || p_credential_id::TEXT || '.' || COALESCE(v_expected_extension, 'invalid');

    IF p_external_url IS NOT NULL
      OR v_expected_extension IS NULL
      OR p_size_bytes NOT BETWEEN 1 AND 10485760
      OR NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = 'trainer-credentials'
          AND object.name = v_storage_path
          AND object.metadata->>'mimetype' = p_mime_type
          AND COALESCE(object.metadata->>'size', '') ~ '^[0-9]+$'
          AND (object.metadata->>'size')::BIGINT = p_size_bytes
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential document invalid.';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential type invalid.';
  END IF;

  INSERT INTO public.trainer_application_credentials (
    id, application_id, credential_type, title, issuer, issued_on, expires_on,
    storage_path, external_url, mime_type, size_bytes
  ) VALUES (
    p_credential_id, p_application_id, p_credential_type, btrim(p_title),
    NULLIF(btrim(COALESCE(p_issuer, '')), ''), p_issued_on, p_expires_on,
    v_storage_path, p_external_url, p_mime_type, p_size_bytes
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_credential;

  IF v_credential.id IS NULL THEN
    SELECT credential.* INTO v_credential
    FROM public.trainer_application_credentials credential
    JOIN public.trainer_applications application ON application.id = credential.application_id
    WHERE credential.id = p_credential_id
      AND credential.application_id = p_application_id
      AND application.user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Credential identifier unavailable.';
    END IF;
  END IF;

  IF p_credential_type = 'document' THEN
    DELETE FROM public.trainer_credential_storage_cleanup cleanup
    WHERE cleanup.user_id = v_user_id
      AND cleanup.application_id = p_application_id
      AND cleanup.credential_id = p_credential_id
      AND cleanup.storage_path = v_storage_path
      AND cleanup.reason = 'upload_rollback';
  END IF;

  RETURN jsonb_build_object('id', v_credential.id, 'application_id', v_credential.application_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_trainer_credential_removal(
  p_application_id UUID,
  p_credential_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_credential public.trainer_application_credentials%ROWTYPE;
  v_cleanup public.trainer_credential_storage_cleanup%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR v_application.status NOT IN ('draft', 'changes_requested')
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  SELECT credential.* INTO v_credential
  FROM public.trainer_application_credentials credential
  WHERE credential.id = p_credential_id
    AND credential.application_id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_credential.storage_path IS NULL THEN
    DELETE FROM public.trainer_application_credentials WHERE id = v_credential.id;
    RETURN jsonb_build_object('cleanup_id', NULL, 'storage_path', NULL);
  END IF;

  IF v_credential.storage_path !~ (
    '^' || v_user_id::TEXT || '/' || p_application_id::TEXT || '/' || p_credential_id::TEXT || '\.(pdf|jpg|png)$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential path invalid.';
  END IF;

  INSERT INTO public.trainer_credential_storage_cleanup (
    user_id, application_id, credential_id, storage_path, reason
  ) VALUES (
    v_user_id, p_application_id, p_credential_id, v_credential.storage_path, 'user_removal'
  )
  ON CONFLICT (storage_path) DO UPDATE SET
    reason = 'user_removal', updated_at = NOW()
  WHERE trainer_credential_storage_cleanup.user_id = EXCLUDED.user_id
    AND trainer_credential_storage_cleanup.credential_id = EXCLUDED.credential_id
  RETURNING * INTO v_cleanup;

  RETURN jsonb_build_object('cleanup_id', v_cleanup.id, 'storage_path', v_cleanup.storage_path);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_trainer_credential_cleanup()
RETURNS TABLE (id UUID, storage_path TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT cleanup.id, cleanup.storage_path
  FROM public.trainer_credential_storage_cleanup cleanup
  WHERE cleanup.user_id = auth.uid()
    AND auth.role() = 'authenticated'
  ORDER BY cleanup.created_at, cleanup.id
  LIMIT 20
$$;

CREATE OR REPLACE FUNCTION public.record_trainer_credential_cleanup_failure(
  p_cleanup_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;
  UPDATE public.trainer_credential_storage_cleanup
  SET attempt_count = attempt_count + 1,
      last_error = left(COALESCE(p_error, 'Storage cleanup failed.'), 500)
  WHERE id = p_cleanup_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_trainer_credential_cleanup(p_cleanup_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cleanup public.trainer_credential_storage_cleanup%ROWTYPE;
  v_application public.trainer_applications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  SELECT cleanup.* INTO v_cleanup
  FROM public.trainer_credential_storage_cleanup cleanup
  WHERE cleanup.id = p_cleanup_id AND cleanup.user_id = v_user_id;
  IF NOT FOUND THEN RETURN TRUE; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = v_cleanup.application_id
    AND application.user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN TRUE; END IF;

  SELECT cleanup.* INTO v_cleanup
  FROM public.trainer_credential_storage_cleanup cleanup
  WHERE cleanup.id = p_cleanup_id
    AND cleanup.user_id = v_user_id
    AND cleanup.application_id = v_application.id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN TRUE; END IF;

  IF v_cleanup.reason = 'user_removal'
    AND (v_application.application_kind <> 'initial'
      OR v_application.status NOT IN ('draft', 'changes_requested'))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application is no longer editable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM storage.objects object
    WHERE object.bucket_id = 'trainer-credentials' AND object.name = v_cleanup.storage_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Storage object still exists.';
  END IF;

  IF v_cleanup.reason = 'user_removal' THEN
    DELETE FROM public.trainer_application_credentials credential
    WHERE credential.id = v_cleanup.credential_id
      AND credential.application_id = v_cleanup.application_id;
  END IF;
  DELETE FROM public.trainer_credential_storage_cleanup WHERE id = v_cleanup.id;
  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.queue_trainer_credential_cleanup(UUID, UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.create_trainer_application_credential(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, BIGINT) OWNER TO postgres;
ALTER FUNCTION public.prepare_trainer_credential_removal(UUID, UUID) OWNER TO postgres;
ALTER FUNCTION public.list_trainer_credential_cleanup() OWNER TO postgres;
ALTER FUNCTION public.record_trainer_credential_cleanup_failure(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.finalize_trainer_credential_cleanup(UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.queue_trainer_credential_cleanup(UUID, UUID, TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_trainer_application_credential(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.prepare_trainer_credential_removal(UUID, UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.list_trainer_credential_cleanup() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.record_trainer_credential_cleanup_failure(UUID, TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.finalize_trainer_credential_cleanup(UUID) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.queue_trainer_credential_cleanup(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trainer_application_credential(UUID, UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_trainer_credential_removal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trainer_credential_cleanup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_trainer_credential_cleanup_failure(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_trainer_credential_cleanup(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_trainer_application_admins(
  p_application_id UUID,
  p_event_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin RECORD;
  v_count INTEGER := 0;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Submission event unavailable.';
  END IF;

  FOR v_admin IN
    SELECT profile.id
    FROM public.profiles profile
    WHERE profile.is_admin = TRUE
      AND profile.account_status = 'active'
    ORDER BY profile.id
  LOOP
    PERFORM public.create_product_notification(
      v_admin.id,
      'trainer_application_status',
      'Nueva solicitud de entrenador',
      'Una solicitud de entrenador esta lista para revision.',
      '/admin/trainers/' || p_application_id::TEXT,
      'trainer-application:' || p_application_id::TEXT || ':submitted:' || p_event_id::TEXT,
      jsonb_build_object('applicationId', p_application_id, 'status', 'submitted')
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'No active administrator available.';
  END IF;
  RETURN v_count;
END;
$$;

ALTER FUNCTION public.notify_trainer_application_admins(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notify_trainer_application_admins(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_trainer_application_draft(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_avatar_url TEXT;
  v_onboarding_done BOOLEAN;
  v_professional_name TEXT;
  v_professional_photo_url TEXT;
  v_bio TEXT;
  v_specialties TEXT[];
  v_modalities TEXT[];
  v_experience_summary TEXT;
  v_general_location TEXT;
  v_languages TEXT[];
  v_contact_email TEXT;
  v_contact_phone TEXT;
  v_preferred_contact TEXT;
  v_timezone TEXT;
  v_interview_availability TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT profile.avatar_url, profile.onboarding_done
  INTO v_avatar_url, v_onboarding_done
  FROM public.profiles profile
  WHERE profile.id = v_user_id;

  IF NOT FOUND OR NOT COALESCE(v_onboarding_done, FALSE) OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active onboarded account required.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A trainer profile already exists; use the profile update workflow.';
  END IF;

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.user_id = v_user_id
    AND application.application_kind = 'initial'
    AND application.status IN ('draft', 'changes_requested')
  ORDER BY application.created_at DESC, application.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_application.id IS NULL AND EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.user_id = v_user_id
      AND application.application_kind = 'initial'
      AND application.status IN ('submitted', 'under_review', 'interview_required')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'The initial trainer application is already under review.';
  END IF;

  IF jsonb_typeof(p_payload) <> 'object'
    OR jsonb_object_length(p_payload) <> 13
    OR NOT (p_payload ?& ARRAY[
      'professional_name', 'professional_photo_url', 'bio', 'specialties', 'modalities',
      'experience_summary', 'general_location', 'languages', 'contact_email', 'contact_phone',
      'preferred_contact', 'timezone', 'interview_availability'
    ])
    OR jsonb_typeof(p_payload->'specialties') <> 'array'
    OR jsonb_typeof(p_payload->'modalities') <> 'array'
    OR jsonb_typeof(p_payload->'languages') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft payload invalid.';
  END IF;

  v_professional_name := btrim(COALESCE(p_payload->>'professional_name', ''));
  v_professional_photo_url := NULLIF(btrim(COALESCE(p_payload->>'professional_photo_url', '')), '');
  v_bio := btrim(COALESCE(p_payload->>'bio', ''));
  v_specialties := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'specialties') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_modalities := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'modalities') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_experience_summary := btrim(COALESCE(p_payload->>'experience_summary', ''));
  v_general_location := NULLIF(btrim(COALESCE(p_payload->>'general_location', '')), '');
  v_languages := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'languages') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_contact_email := lower(btrim(COALESCE(p_payload->>'contact_email', '')));
  v_contact_phone := NULLIF(btrim(COALESCE(p_payload->>'contact_phone', '')), '');
  v_preferred_contact := btrim(COALESCE(p_payload->>'preferred_contact', ''));
  v_timezone := btrim(COALESCE(p_payload->>'timezone', ''));
  v_interview_availability := btrim(COALESCE(p_payload->>'interview_availability', ''));

  IF char_length(v_professional_name) <> 0 AND char_length(v_professional_name) NOT BETWEEN 2 AND 100
    OR char_length(v_bio) <> 0 AND char_length(v_bio) NOT BETWEEN 50 AND 2000
    OR cardinality(v_specialties) > 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_specialties) specialty
      WHERE char_length(specialty) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_modalities) > 3
    OR NOT (v_modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[])
    OR char_length(v_experience_summary) <> 0
      AND char_length(v_experience_summary) NOT BETWEEN 20 AND 2000
    OR char_length(COALESCE(v_general_location, '')) > 120
    OR cardinality(v_languages) > 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_languages) language
      WHERE char_length(language) NOT BETWEEN 1 AND 80
    )
    OR char_length(v_contact_email) > 254
    OR v_contact_email <> '' AND v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_contact_phone IS NOT NULL AND v_contact_phone !~ '^\+?[0-9][0-9 ()\.\-]{6,31}$'
    OR v_preferred_contact NOT IN ('email', 'phone', 'whatsapp')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name WHERE timezone_name.name = v_timezone
    )
    OR char_length(v_interview_availability) <> 0
      AND char_length(v_interview_availability) NOT BETWEEN 10 AND 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft fields invalid.';
  END IF;

  IF v_professional_photo_url IS NOT NULL
    AND (
      char_length(v_professional_photo_url) > 2048
      OR v_professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
      OR v_professional_photo_url IS DISTINCT FROM v_avatar_url
        AND v_professional_photo_url IS DISTINCT FROM v_application.professional_photo_url
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Professional photo must be owned by the applicant.';
  END IF;

  IF v_application.id IS NULL THEN
    INSERT INTO public.trainer_applications (
      user_id, application_kind, status, professional_name, professional_photo_url, bio,
      specialties, modalities, experience_summary, general_location, languages, contact_email,
      contact_phone, preferred_contact, timezone, interview_availability
    ) VALUES (
      v_user_id, 'initial', 'draft', v_professional_name, v_professional_photo_url, v_bio,
      v_specialties, v_modalities, v_experience_summary, v_general_location, v_languages,
      v_contact_email, v_contact_phone, v_preferred_contact, v_timezone, v_interview_availability
    ) RETURNING * INTO v_application;
  ELSE
    UPDATE public.trainer_applications
    SET professional_name = v_professional_name,
        professional_photo_url = v_professional_photo_url,
        bio = v_bio,
        specialties = v_specialties,
        modalities = v_modalities,
        experience_summary = v_experience_summary,
        general_location = v_general_location,
        languages = v_languages,
        contact_email = v_contact_email,
        contact_phone = v_contact_phone,
        preferred_contact = v_preferred_contact,
        timezone = v_timezone,
        interview_availability = v_interview_availability
    WHERE id = v_application.id
    RETURNING * INTO v_application;
  END IF;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', v_application.status);
END;
$$;

ALTER FUNCTION public.save_trainer_application_draft(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_trainer_application_draft(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_trainer_application_draft(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_trainer_profile_changes(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.trainer_profiles%ROWTYPE;
  v_source_application public.trainer_applications%ROWTYPE;
  v_credential_source public.trainer_applications%ROWTYPE;
  v_review public.trainer_applications%ROWTYPE;
  v_event_id UUID;
  v_professional_name TEXT;
  v_professional_photo_url TEXT;
  v_bio TEXT;
  v_specialties TEXT[];
  v_modalities TEXT[];
  v_effective_modalities TEXT[];
  v_experience_summary TEXT;
  v_general_location TEXT;
  v_languages TEXT[];
  v_review_changed BOOLEAN;
  v_review_created BOOLEAN := FALSE;
  v_previous_status TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT profile.* INTO v_profile
  FROM public.trainer_profiles profile
  WHERE profile.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_profile.status <> 'active' OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active trainer profile required.';
  END IF;

  SELECT application.* INTO v_review
  FROM public.trainer_applications application
  WHERE application.user_id = v_user_id
    AND application.application_kind = 'profile_update'
    AND application.status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required')
  ORDER BY application.created_at DESC, application.id DESC
  LIMIT 1
  FOR UPDATE;

  IF jsonb_typeof(p_payload) <> 'object'
    OR NOT (p_payload ?& ARRAY[
      'professionalName', 'professionalPhotoUrl', 'bio', 'specialties',
      'modalities', 'experienceSummary', 'generalLocation', 'languages'
    ])
    OR jsonb_typeof(p_payload->'specialties') <> 'array'
    OR jsonb_typeof(p_payload->'modalities') <> 'array'
    OR jsonb_typeof(p_payload->'languages') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer profile payload invalid.';
  END IF;

  v_professional_name := btrim(COALESCE(p_payload->>'professionalName', ''));
  v_professional_photo_url := NULLIF(btrim(COALESCE(p_payload->>'professionalPhotoUrl', '')), '');
  v_bio := btrim(COALESCE(p_payload->>'bio', ''));
  v_specialties := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'specialties') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_modalities := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'modalities') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_experience_summary := btrim(COALESCE(p_payload->>'experienceSummary', ''));
  v_general_location := NULLIF(btrim(COALESCE(p_payload->>'generalLocation', '')), '');
  v_languages := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'languages') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_effective_modalities := ARRAY(
    SELECT DISTINCT modality
    FROM unnest(
      v_profile.modalities || CASE
        WHEN v_review.id IS NOT NULL AND v_review.status IN ('under_review', 'interview_required')
          THEN v_review.modalities
        ELSE v_modalities
      END
    ) AS modality
  );

  IF char_length(v_professional_name) NOT BETWEEN 2 AND 100
    OR (
      v_professional_photo_url IS NOT NULL
      AND (
        v_professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
        OR char_length(v_professional_photo_url) > 2048
      )
    )
    OR char_length(v_bio) NOT BETWEEN 50 AND 2000
    OR cardinality(v_specialties) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_specialties) specialty
      WHERE char_length(specialty) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_modalities) NOT BETWEEN 1 AND 3
    OR NOT (v_modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[])
    OR char_length(v_experience_summary) NOT BETWEEN 20 AND 2000
    OR char_length(COALESCE(v_general_location, '')) > 120
    OR cardinality(v_languages) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_languages) language
      WHERE char_length(language) NOT BETWEEN 1 AND 80
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer profile fields invalid.';
  END IF;

  IF v_professional_photo_url IS DISTINCT FROM v_profile.professional_photo_url
    AND v_professional_photo_url IS NOT NULL
    AND NOT public.trainer_photo_url_is_owned(v_user_id, v_professional_photo_url)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Professional photo must come from the owner avatar storage path.';
  END IF;

  IF v_effective_modalities && ARRAY['in_person', 'hybrid']::TEXT[]
    AND v_general_location IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'General location is required while approved or pending modalities include in-person or hybrid coaching.';
  END IF;

  v_review_changed := v_professional_name IS DISTINCT FROM v_profile.professional_name
    OR v_specialties IS DISTINCT FROM v_profile.specialties
    OR v_modalities IS DISTINCT FROM v_profile.modalities
    OR v_experience_summary IS DISTINCT FROM v_profile.experience_summary;

  UPDATE public.trainer_profiles
  SET professional_photo_url = v_professional_photo_url,
      bio = v_bio,
      general_location = v_general_location,
      languages = v_languages
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  IF NOT v_review_changed
    AND v_review.id IS NOT NULL
    AND v_review.application_kind = 'profile_update'
    AND v_review.status IN ('draft', 'submitted', 'changes_requested')
    AND (
      v_review.professional_name IS DISTINCT FROM v_profile.professional_name
      OR v_review.specialties IS DISTINCT FROM v_profile.specialties
      OR v_review.modalities IS DISTINCT FROM v_profile.modalities
      OR v_review.experience_summary IS DISTINCT FROM v_profile.experience_summary
    )
  THEN
    UPDATE public.trainer_applications
    SET status = 'withdrawn',
        decided_at = NOW()
    WHERE id = v_review.id;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, actor_user_id, actor_role
    ) VALUES (
      v_review.id, v_review.status, 'withdrawn',
      'Actualizacion de perfil retirada por el entrenador.', v_user_id, 'applicant'
    );

    RETURN jsonb_build_object(
      'profile_updated', TRUE,
      'review_application_id', NULL,
      'review_status', NULL,
      'review_created', FALSE
    );
  END IF;

  IF NOT v_review_changed THEN
    RETURN jsonb_build_object(
      'profile_updated', TRUE,
      'review_application_id', v_review.id,
      'review_status', v_review.status,
      'review_created', FALSE
    );
  END IF;

  SELECT application.* INTO v_source_application
  FROM public.trainer_applications application
  WHERE application.id = v_profile.source_application_id
    AND application.user_id = v_user_id
    AND application.status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved trainer source unavailable.';
  END IF;

  SELECT application.* INTO v_credential_source
  FROM public.trainer_applications application
  WHERE application.id = COALESCE(
      v_source_application.credential_source_application_id,
      v_source_application.id
    )
    AND application.user_id = v_user_id
    AND application.status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.trainer_application_credentials credential
      WHERE credential.application_id = application.id
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved credential source unavailable.';
  END IF;

  IF v_review.id IS NOT NULL THEN
    IF v_review.application_kind <> 'profile_update'
      OR v_review.source_profile_id IS DISTINCT FROM v_profile.id
      OR v_review.credential_source_application_id IS DISTINCT FROM v_credential_source.id
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Open trainer review conflicts with approved profile.';
    END IF;

    IF v_review.status IN ('under_review', 'interview_required') THEN
      RETURN jsonb_build_object(
        'profile_updated', TRUE,
        'review_application_id', v_review.id,
        'review_status', v_review.status,
        'review_created', FALSE
      );
    END IF;

    v_previous_status := v_review.status;
    UPDATE public.trainer_applications
    SET status = 'submitted',
        professional_name = v_professional_name,
        professional_photo_url = v_professional_photo_url,
        bio = v_bio,
        specialties = v_specialties,
        modalities = v_modalities,
        experience_summary = v_experience_summary,
        general_location = v_general_location,
        languages = v_languages,
        contact_email = v_source_application.contact_email,
        contact_phone = v_source_application.contact_phone,
        preferred_contact = v_source_application.preferred_contact,
        timezone = v_source_application.timezone,
        interview_availability = v_source_application.interview_availability,
        submitted_at = COALESCE(submitted_at, NOW()),
        decided_at = NULL
    WHERE id = v_review.id
    RETURNING * INTO v_review;

    SELECT event.id INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_review.id
      AND event.to_status = 'submitted'
      AND event.actor_role = 'applicant'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    IF v_event_id IS NULL OR v_previous_status = 'changes_requested' THEN
      INSERT INTO public.trainer_application_events (
        application_id, from_status, to_status, public_note, actor_user_id, actor_role
      ) VALUES (
        v_review.id, v_previous_status, 'submitted',
        'Actualizacion de perfil enviada para revision.', v_user_id, 'applicant'
      ) RETURNING id INTO v_event_id;
    END IF;
  ELSE
    INSERT INTO public.trainer_applications (
      user_id, application_kind, source_profile_id, credential_source_application_id,
      status, professional_name, professional_photo_url, bio, specialties, modalities,
      experience_summary, general_location, languages, contact_email, contact_phone,
      preferred_contact, timezone, interview_availability, submitted_at
    ) VALUES (
      v_user_id, 'profile_update', v_profile.id, v_credential_source.id,
      'submitted', v_professional_name, v_professional_photo_url, v_bio,
      v_specialties, v_modalities, v_experience_summary, v_general_location,
      v_languages, v_source_application.contact_email, v_source_application.contact_phone,
      v_source_application.preferred_contact, v_source_application.timezone,
      v_source_application.interview_availability, NOW()
    ) RETURNING * INTO v_review;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, actor_user_id, actor_role
    ) VALUES (
      v_review.id, NULL, 'submitted',
      'Actualizacion de perfil enviada para revision.', v_user_id, 'applicant'
    ) RETURNING id INTO v_event_id;
    v_review_created := TRUE;
  END IF;

  PERFORM public.notify_trainer_application_admins(v_review.id, v_event_id);

  RETURN jsonb_build_object(
    'profile_updated', TRUE,
    'review_application_id', v_review.id,
    'review_status', v_review.status,
    'review_created', v_review_created
  );
END;
$$;

ALTER FUNCTION public.save_trainer_profile_changes(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.save_trainer_profile_changes(JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_trainer_profile_changes(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_trainer_application(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_event_id UUID;
  v_profile_avatar_url TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.*
  INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'An existing trainer profile must be updated through the profile review flow.';
  END IF;

  SELECT profile.avatar_url INTO v_profile_avatar_url
  FROM public.profiles profile
  WHERE profile.id = v_user_id
    AND profile.onboarding_done = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Applicant profile unavailable.';
  END IF;

  IF v_application.status = 'submitted' THEN
    SELECT event.id
    INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_application.id
      AND event.to_status = 'submitted'
      AND event.actor_user_id = v_user_id
      AND event.actor_role = 'applicant'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    PERFORM public.notify_trainer_application_admins(v_application.id, v_event_id);

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'user_id', v_user_id,
      'status', v_application.status,
      'transitioned', FALSE,
      'event_id', v_event_id
    );
  END IF;

  IF v_application.status NOT IN ('draft', 'changes_requested') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid applicant transition.';
  END IF;

  IF char_length(btrim(v_application.professional_name)) NOT BETWEEN 2 AND 100
    OR v_application.professional_photo_url IS NULL
    OR v_application.professional_photo_url IS DISTINCT FROM v_profile_avatar_url
    OR v_application.professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
    OR char_length(btrim(v_application.bio)) NOT BETWEEN 50 AND 2000
    OR cardinality(v_application.specialties) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_application.specialties) specialty
      WHERE char_length(btrim(specialty)) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_application.modalities) NOT BETWEEN 1 AND 3
    OR char_length(btrim(v_application.experience_summary)) NOT BETWEEN 20 AND 2000
    OR (
      v_application.modalities && ARRAY['in_person', 'hybrid']::TEXT[]
      AND (
        v_application.general_location IS NULL
        OR char_length(btrim(v_application.general_location)) NOT BETWEEN 1 AND 120
      )
    )
    OR char_length(COALESCE(v_application.general_location, '')) > 120
    OR cardinality(v_application.languages) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_application.languages) language
      WHERE char_length(btrim(language)) NOT BETWEEN 1 AND 80
    )
    OR char_length(v_application.contact_email) > 254
    OR v_application.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (
      v_application.preferred_contact IN ('phone', 'whatsapp')
      AND NULLIF(btrim(COALESCE(v_application.contact_phone, '')), '') IS NULL
    )
    OR (
      v_application.contact_phone IS NOT NULL
      AND v_application.contact_phone !~ '^\+?[0-9][0-9[:space:]().-]{6,31}$'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name
      WHERE timezone_name.name = v_application.timezone
    )
    OR char_length(btrim(v_application.interview_availability)) NOT BETWEEN 10 AND 1000
    OR NOT public.trainer_application_has_eligible_credentials(v_application.id, v_user_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application is incomplete.';
  END IF;

  UPDATE public.trainer_applications
  SET status = 'submitted',
      submitted_at = NOW(),
      decided_at = NULL
  WHERE id = v_application.id;

  INSERT INTO public.trainer_application_events (
    application_id,
    from_status,
    to_status,
    public_note,
    actor_user_id,
    actor_role
  ) VALUES (
    v_application.id,
    v_application.status,
    'submitted',
    'Solicitud enviada para revision.',
    v_user_id,
    'applicant'
  )
  RETURNING id INTO v_event_id;

  PERFORM public.notify_trainer_application_admins(v_application.id, v_event_id);

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'user_id', v_user_id,
    'status', 'submitted',
    'transitioned', TRUE,
    'event_id', v_event_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_trainer_application(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  SELECT application.*
  INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF v_application.status = 'withdrawn' THEN
    SELECT event.id
    INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_application.id
      AND event.to_status = 'withdrawn'
      AND event.actor_user_id = v_user_id
      AND event.actor_role = 'applicant'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'user_id', v_user_id,
      'status', v_application.status,
      'transitioned', FALSE,
      'event_id', v_event_id
    );
  END IF;

  IF v_application.status NOT IN (
    'draft',
    'submitted',
    'under_review',
    'changes_requested',
    'interview_required'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid applicant transition.';
  END IF;

  UPDATE public.trainer_applications
  SET status = 'withdrawn',
      decided_at = NOW()
  WHERE id = v_application.id;

  INSERT INTO public.trainer_application_events (
    application_id,
    from_status,
    to_status,
    public_note,
    actor_user_id,
    actor_role
  ) VALUES (
    v_application.id,
    v_application.status,
    'withdrawn',
    'Solicitud retirada por el solicitante.',
    v_user_id,
    'applicant'
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'user_id', v_user_id,
    'status', 'withdrawn',
    'transitioned', TRUE,
    'event_id', v_event_id
  );
END;
$$;

ALTER FUNCTION public.submit_trainer_application(UUID) OWNER TO postgres;
ALTER FUNCTION public.withdraw_trainer_application(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.submit_trainer_application(UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.withdraw_trainer_application(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_trainer_application(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_trainer_application(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_trainer_application(
  p_application_id UUID,
  p_actor_user_id UUID,
  p_action TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_application public.trainer_applications%ROWTYPE;
  v_application_user_id UUID;
  v_existing_profile public.trainer_profiles%ROWTYPE;
  v_interview public.trainer_interviews%ROWTYPE;
  v_event_id UUID;
  v_profile_id UUID;
  v_target_status TEXT;
  v_public_note TEXT := NULLIF(btrim(COALESCE(p_payload->>'public_note', '')), '');
  v_internal_note TEXT := NULLIF(btrim(COALESCE(p_payload->>'internal_note', '')), '');
  v_interview_id UUID;
  v_proposed_at TIMESTAMPTZ;
  v_timezone TEXT;
  v_medium TEXT;
  v_external_url TEXT;
  v_interview_status TEXT;
  v_outcome TEXT;
  v_notification_title TEXT;
  v_notification_body TEXT;
  v_notification_url TEXT;
  v_dedupe_key TEXT;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_actor_user_id
      AND profile.is_admin = TRUE
      AND profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active administrator required.';
  END IF;

  IF p_action NOT IN (
    'start_review',
    'request_changes',
    'schedule_interview',
    'record_interview_outcome',
    'approve',
    'reject'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unsupported administrative transition.';
  END IF;

  IF char_length(COALESCE(v_public_note, '')) > 1000
    OR char_length(COALESCE(v_internal_note, '')) > 2000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Administrative note is too long.';
  END IF;

  SELECT application.user_id
  INTO v_application_user_id
  FROM public.trainer_applications application
  WHERE application.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application unavailable.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_application_user_id::TEXT, 0));

  SELECT application.*
  INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application unavailable.';
  END IF;

  v_notification_url := CASE v_application.application_kind
    WHEN 'profile_update' THEN '/coach/profile'
    ELSE '/coach/apply'
  END;

  IF p_action = 'schedule_interview' THEN
    IF COALESCE(p_payload->>'interview_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview identifier is invalid.';
    END IF;
    v_interview_id := (p_payload->>'interview_id')::UUID;
    v_proposed_at := (p_payload->>'proposed_at')::TIMESTAMPTZ;
    v_timezone := NULLIF(btrim(COALESCE(p_payload->>'timezone', '')), '');
    v_medium := NULLIF(btrim(COALESCE(p_payload->>'medium', '')), '');
    v_external_url := NULLIF(btrim(COALESCE(p_payload->>'external_url', '')), '');

    IF v_application.status = 'interview_required' THEN
      SELECT interview.*
      INTO v_interview
      FROM public.trainer_interviews interview
      WHERE interview.id = v_interview_id
        AND interview.application_id = v_application.id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview retry does not match the application.';
      END IF;
      IF v_interview.proposed_at <> v_proposed_at
        OR v_interview.timezone <> v_timezone
        OR v_interview.medium <> v_medium
        OR v_interview.external_url IS DISTINCT FROM v_external_url
      THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview idempotency conflict.';
      END IF;

      SELECT event.id
      INTO v_event_id
      FROM public.trainer_application_events event
      WHERE event.application_id = v_application.id
        AND event.to_status = 'interview_required'
        AND event.actor_role = 'admin'
      ORDER BY event.created_at DESC, event.id DESC
      LIMIT 1;

      RETURN jsonb_build_object(
        'application_id', v_application.id,
        'status', v_application.status,
        'transitioned', FALSE,
        'event_id', v_event_id,
        'interview_id', v_interview.id
      );
    END IF;

    IF v_application.status <> 'under_review' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid administrative transition.';
    END IF;
    IF v_proposed_at IS NULL OR v_proposed_at <= NOW() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview must be scheduled in the future.';
    END IF;
    IF v_timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name
      WHERE timezone_name.name = v_timezone
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview timezone is invalid.';
    END IF;
    IF v_medium NOT IN ('video_call', 'phone', 'in_person') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview medium is invalid.';
    END IF;
    IF v_external_url IS NOT NULL AND (
      char_length(v_external_url) > 2048
      OR v_external_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview URL must use HTTPS.';
    END IF;

    INSERT INTO public.trainer_interviews (
      id,
      application_id,
      proposed_at,
      timezone,
      medium,
      external_url,
      status,
      public_note,
      internal_note,
      created_by
    ) VALUES (
      v_interview_id,
      v_application.id,
      v_proposed_at,
      v_timezone,
      v_medium,
      v_external_url,
      'scheduled',
      v_public_note,
      v_internal_note,
      p_actor_user_id
    );

    UPDATE public.trainer_applications
    SET status = 'interview_required', decided_at = NULL
    WHERE id = v_application.id;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, internal_note, actor_user_id, actor_role
    ) VALUES (
      v_application.id, v_application.status, 'interview_required', v_public_note, v_internal_note,
      p_actor_user_id, 'admin'
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      p_actor_user_id, v_application.user_id, 'trainer_application', v_application.id,
      'trainer_interview_scheduled', jsonb_build_object('interviewId', v_interview_id)
    );

    PERFORM public.create_product_notification(
      v_application.user_id,
      'trainer_application_status',
      'Entrevista programada',
      'Se ha programado una entrevista externa para tu solicitud.',
      v_notification_url,
      'trainer-interview:' || v_interview_id::TEXT || ':scheduled',
      jsonb_build_object(
        'applicationId', v_application.id,
        'status', 'interview_required',
        'interviewId', v_interview_id
      )
    );

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'status', 'interview_required',
      'transitioned', TRUE,
      'event_id', v_event_id,
      'interview_id', v_interview_id
    );
  END IF;

  IF p_action = 'record_interview_outcome' THEN
    IF v_application.status <> 'interview_required' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application has no interview awaiting outcome.';
    END IF;
    IF COALESCE(p_payload->>'interview_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview identifier is invalid.';
    END IF;
    v_interview_id := (p_payload->>'interview_id')::UUID;
    v_interview_status := NULLIF(btrim(COALESCE(p_payload->>'interview_status', '')), '');
    v_outcome := NULLIF(btrim(COALESCE(p_payload->>'outcome', '')), '');
    IF v_interview_status NOT IN ('completed', 'cancelled')
      OR char_length(COALESCE(v_outcome, '')) NOT BETWEEN 3 AND 1000
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview outcome is invalid.';
    END IF;

    SELECT interview.*
    INTO v_interview
    FROM public.trainer_interviews interview
    WHERE interview.id = v_interview_id
      AND interview.application_id = v_application.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview unavailable.';
    END IF;

    IF v_interview.status = v_interview_status AND v_interview.outcome = v_outcome THEN
      SELECT event.id
      INTO v_event_id
      FROM public.trainer_application_events event
      WHERE event.application_id = v_application.id
        AND event.from_status = 'interview_required'
        AND event.to_status = 'interview_required'
        AND event.actor_role = 'admin'
      ORDER BY event.created_at DESC, event.id DESC
      LIMIT 1;
      RETURN jsonb_build_object(
        'application_id', v_application.id,
        'status', v_application.status,
        'transitioned', FALSE,
        'event_id', v_event_id,
        'interview_id', v_interview.id
      );
    END IF;
    IF v_interview.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview outcome is already final.';
    END IF;

    UPDATE public.trainer_interviews
    SET status = v_interview_status,
        outcome = v_outcome,
        public_note = COALESCE(v_public_note, public_note),
        internal_note = COALESCE(v_internal_note, internal_note)
    WHERE id = v_interview.id;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, internal_note, actor_user_id, actor_role
    ) VALUES (
      v_application.id, 'interview_required', 'interview_required', v_public_note, v_internal_note,
      p_actor_user_id, 'admin'
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      p_actor_user_id, v_application.user_id, 'trainer_interview', v_interview.id,
      'trainer_interview_outcome_recorded',
      jsonb_build_object('applicationId', v_application.id, 'status', v_interview_status)
    );

    PERFORM public.create_product_notification(
      v_application.user_id,
      'trainer_application_status',
      'Entrevista actualizada',
      CASE WHEN v_interview_status = 'completed'
        THEN 'El resultado de tu entrevista ha sido registrado.'
        ELSE 'La entrevista de tu solicitud ha sido cancelada.'
      END,
      v_notification_url,
      'trainer-interview:' || v_interview.id::TEXT || ':' || v_interview_status,
      jsonb_build_object(
        'applicationId', v_application.id,
        'status', 'interview_required',
        'interviewId', v_interview.id,
        'interviewStatus', v_interview_status
      )
    );

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'status', v_application.status,
      'transitioned', TRUE,
      'event_id', v_event_id,
      'interview_id', v_interview.id
    );
  END IF;

  v_target_status := CASE p_action
    WHEN 'start_review' THEN 'under_review'
    WHEN 'request_changes' THEN 'changes_requested'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
  END;

  IF p_action IN ('request_changes', 'reject')
    AND char_length(COALESCE(v_public_note, '')) NOT BETWEEN 3 AND 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A public note is required.';
  END IF;

  IF v_application.status = v_target_status THEN
    SELECT event.id
    INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_application.id
      AND event.to_status = v_target_status
      AND event.actor_role = 'admin'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;
    IF v_target_status = 'approved' THEN
      SELECT profile.id INTO v_profile_id
      FROM public.trainer_profiles profile
      WHERE profile.user_id = v_application.user_id
        AND profile.status = 'active';
    END IF;
    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'status', v_application.status,
      'transitioned', FALSE,
      'event_id', v_event_id,
      'profile_id', v_profile_id
    );
  END IF;

  IF (p_action = 'start_review' AND v_application.status <> 'submitted')
    OR (p_action IN ('request_changes', 'approve', 'reject')
      AND v_application.status NOT IN ('under_review', 'interview_required'))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid administrative transition.';
  END IF;

  IF v_target_status = 'approved'
    AND (
      (
        v_application.application_kind = 'initial'
        AND NOT public.trainer_application_has_eligible_credentials(
          v_application.id,
          v_application.user_id
        )
      )
      OR (
        v_application.application_kind = 'profile_update'
        AND (
          v_application.credential_source_application_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.trainer_applications credential_source
            WHERE credential_source.id = v_application.credential_source_application_id
              AND credential_source.user_id = v_application.user_id
              AND credential_source.status = 'approved'
          )
          OR NOT public.trainer_application_has_eligible_credentials(
            v_application.credential_source_application_id,
            v_application.user_id
          )
        )
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application credentials are unavailable.';
  END IF;

  IF v_target_status = 'approved' AND v_application.application_kind = 'profile_update' THEN
    SELECT profile.* INTO v_existing_profile
    FROM public.trainer_profiles profile
    WHERE profile.id = v_application.source_profile_id
      AND profile.user_id = v_application.user_id
      AND profile.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active trainer profile required for profile update approval.';
    END IF;

    v_profile_id := v_existing_profile.id;
  ELSIF v_target_status = 'approved' AND v_application.application_kind = 'initial' THEN
    SELECT profile.* INTO v_existing_profile
    FROM public.trainer_profiles profile
    WHERE profile.user_id = v_application.user_id
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'An existing trainer profile must be updated through the profile review flow.';
    END IF;
  END IF;

  IF v_target_status = 'approved'
    AND v_application.modalities && ARRAY['in_person', 'hybrid']::TEXT[]
    AND NULLIF(btrim(COALESCE(
      CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN v_existing_profile.general_location
        ELSE v_application.general_location
      END,
      ''
    )), '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Add a general location before approving in-person or hybrid coaching modalities.';
  END IF;

  UPDATE public.trainer_applications
  SET status = v_target_status,
      decided_at = CASE WHEN v_target_status IN ('approved', 'rejected') THEN NOW() ELSE NULL END
  WHERE id = v_application.id;

  IF v_target_status = 'approved' THEN
    INSERT INTO public.trainer_profiles (
      user_id,
      source_application_id,
      slug,
      status,
      professional_name,
      professional_photo_url,
      bio,
      specialties,
      modalities,
      experience_summary,
      general_location,
      languages,
      verified_at
    ) VALUES (
      v_application.user_id,
      v_application.id,
      'trainer-' || replace(v_application.user_id::TEXT, '-', ''),
      'active',
      v_application.professional_name,
      v_application.professional_photo_url,
      v_application.bio,
      v_application.specialties,
      v_application.modalities,
      v_application.experience_summary,
      v_application.general_location,
      v_application.languages,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      source_application_id = EXCLUDED.source_application_id,
      status = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.status
        ELSE 'active'
      END,
      professional_name = EXCLUDED.professional_name,
      professional_photo_url = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.professional_photo_url
        ELSE EXCLUDED.professional_photo_url
      END,
      bio = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.bio
        ELSE EXCLUDED.bio
      END,
      specialties = EXCLUDED.specialties,
      modalities = EXCLUDED.modalities,
      experience_summary = EXCLUDED.experience_summary,
      general_location = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.general_location
        ELSE EXCLUDED.general_location
      END,
      languages = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.languages
        ELSE EXCLUDED.languages
      END,
      verified_at = NOW()
    RETURNING id INTO v_profile_id;
  END IF;

  INSERT INTO public.trainer_application_events (
    application_id, from_status, to_status, public_note, internal_note, actor_user_id, actor_role
  ) VALUES (
    v_application.id, v_application.status, v_target_status, v_public_note, v_internal_note,
    p_actor_user_id, 'admin'
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    p_actor_user_id,
    v_application.user_id,
    'trainer_application',
    v_application.id,
    'trainer_application_' || v_target_status,
    jsonb_build_object('fromStatus', v_application.status, 'toStatus', v_target_status)
  );

  v_notification_title := CASE v_target_status
    WHEN 'under_review' THEN 'Solicitud en revision'
    WHEN 'changes_requested' THEN 'Cambios solicitados'
    WHEN 'approved' THEN 'Solicitud aprobada'
    WHEN 'rejected' THEN 'Solicitud rechazada'
  END;
  v_notification_body := CASE v_target_status
    WHEN 'under_review' THEN 'La revision administrativa de tu solicitud ha comenzado.'
    WHEN 'changes_requested' THEN 'Tu solicitud necesita cambios antes de continuar.'
    WHEN 'approved' THEN 'Tu perfil profesional ha sido aprobado.'
    WHEN 'rejected' THEN 'Tu solicitud profesional no ha sido aprobada.'
  END;
  v_dedupe_key := CASE
    WHEN v_target_status IN ('approved', 'rejected')
      THEN 'trainer-application:' || v_application.id::TEXT || ':' || v_target_status
    ELSE 'trainer-application:' || v_application.id::TEXT || ':' || v_target_status || ':' || v_event_id::TEXT
  END;
  PERFORM public.create_product_notification(
    v_application.user_id,
    'trainer_application_status',
    v_notification_title,
    v_notification_body,
    v_notification_url,
    v_dedupe_key,
    jsonb_build_object('applicationId', v_application.id, 'status', v_target_status)
  );

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'status', v_target_status,
    'transitioned', TRUE,
    'event_id', v_event_id,
    'profile_id', v_profile_id
  );
END;
$$;

ALTER FUNCTION public.transition_trainer_application(UUID, UUID, TEXT, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transition_trainer_application(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_trainer_application(UUID, UUID, TEXT, JSONB)
  TO service_role;

ALTER TABLE public.trainer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_application_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_credential_storage_cleanup ENABLE ROW LEVEL SECURITY;
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
    AND application_kind = 'initial'
    AND status = 'draft'
    AND NOT EXISTS (
      SELECT 1
      FROM public.trainer_profiles trainer_profile
      WHERE trainer_profile.user_id = auth.uid()
    )
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
  USING (auth.uid() = user_id AND application_kind = 'initial' AND status IN ('draft', 'changes_requested'))
  WITH CHECK (auth.uid() = user_id AND application_kind = 'initial' AND status IN ('draft', 'changes_requested'));

DROP POLICY IF EXISTS "trainer_applications: delete own editable" ON public.trainer_applications;
CREATE POLICY "trainer_applications: delete own editable"
  ON public.trainer_applications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND application_kind = 'initial' AND status IN ('draft', 'changes_requested'));

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
      AND application.application_kind = 'initial'
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
      AND application.application_kind = 'initial'
      AND application.status IN ('draft', 'changes_requested')
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.id = application_id
      AND application.user_id = auth.uid()
      AND application.application_kind = 'initial'
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
      AND application.application_kind = 'initial'
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
REVOKE ALL ON TABLE public.trainer_credential_storage_cleanup FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_application_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_interviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.trainer_applications TO authenticated;
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
GRANT SELECT ON TABLE public.trainer_application_credentials TO authenticated;

GRANT SELECT ON TABLE public.trainer_profiles TO authenticated;

GRANT ALL ON TABLE public.trainer_applications TO service_role;
GRANT ALL ON TABLE public.trainer_application_credentials TO service_role;
GRANT ALL ON TABLE public.trainer_credential_storage_cleanup TO service_role;
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

DROP VIEW IF EXISTS public.trainer_interviews_applicant_public;
CREATE VIEW public.trainer_interviews_applicant_public
WITH (security_barrier = true)
AS
SELECT
  interview.id,
  interview.application_id,
  interview.proposed_at,
  interview.timezone,
  interview.medium,
  interview.external_url,
  interview.status,
  interview.public_note,
  interview.created_at,
  interview.updated_at
FROM public.trainer_interviews interview
JOIN public.trainer_applications application
  ON application.id = interview.application_id
WHERE application.user_id = auth.uid()
  AND public.is_account_active(auth.uid());

ALTER VIEW public.trainer_interviews_applicant_public OWNER TO postgres;
REVOKE ALL ON TABLE public.trainer_interviews_applicant_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trainer_interviews_applicant_public TO authenticated;
GRANT SELECT ON TABLE public.trainer_interviews_applicant_public TO service_role;

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
COMMENT ON VIEW public.trainer_interviews_applicant_public IS
  'Owner-filtered interview schedule for applicants; omits outcome, internal_note and creator identity.';
COMMENT ON TABLE public.trainer_interviews IS
  'Private proposed trainer interviews, external meeting details and outcomes.';
COMMENT ON TABLE public.trainer_profiles IS
  'Approved professional capability record; public discovery is intentionally deferred.';
