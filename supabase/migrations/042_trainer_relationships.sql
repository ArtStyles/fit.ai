-- Migration 042: trainer services, coaching relationships, and scoped consents
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trainer_service_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_profile_id UUID NOT NULL REFERENCES public.trainer_profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  modality TEXT NOT NULL CHECK (modality IN ('online', 'in_person', 'hybrid')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 4000),
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 1000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  billing_mode TEXT NOT NULL DEFAULT 'free_preview'
    CHECK (billing_mode = 'free_preview'),
  price_minor INTEGER,
  currency TEXT,
  billing_interval TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_service_offerings_free_preview_commercial_values_check CHECK (
    billing_mode <> 'free_preview' OR (
      price_minor IS NULL AND currency IS NULL AND billing_interval IS NULL
    )
  )
);

CREATE INDEX trainer_service_offerings_profile_active_idx
  ON public.trainer_service_offerings (trainer_profile_id, is_active, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.coaching_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.trainer_service_offerings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  trainer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  client_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 1000),
  training_profile_consent_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coaching_requests_client_trainer_distinct CHECK (client_user_id <> trainer_user_id)
);

CREATE UNIQUE INDEX coaching_requests_one_pending_equivalent
  ON public.coaching_requests (client_user_id, trainer_user_id, service_id)
  WHERE status = 'pending';

CREATE INDEX coaching_requests_trainer_pending_created_idx
  ON public.coaching_requests (trainer_user_id, created_at DESC, id DESC)
  WHERE status = 'pending';

CREATE INDEX coaching_requests_client_created_idx
  ON public.coaching_requests (client_user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.coaching_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_request_id UUID UNIQUE REFERENCES public.coaching_requests(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  service_id UUID NOT NULL REFERENCES public.trainer_service_offerings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  trainer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  client_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused_by_platform', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  end_reason TEXT CHECK (end_reason IS NULL OR char_length(end_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coaching_relationships_client_trainer_distinct CHECK (client_user_id <> trainer_user_id),
  CONSTRAINT coaching_relationships_end_state_check CHECK (
    (status = 'ended' AND ended_at IS NOT NULL)
    OR (status <> 'ended' AND ended_at IS NULL AND ended_by IS NULL AND end_reason IS NULL)
  )
);

CREATE UNIQUE INDEX coaching_relationships_one_active_client
  ON public.coaching_relationships(client_user_id)
  WHERE status = 'active';

CREATE INDEX coaching_relationships_trainer_status_idx
  ON public.coaching_relationships (trainer_user_id, status, created_at DESC, id DESC);

CREATE INDEX coaching_relationships_client_status_idx
  ON public.coaching_relationships (client_user_id, status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.coaching_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES public.coaching_relationships(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  scope TEXT NOT NULL CHECK (scope IN ('training_profile', 'body_measurements')),
  text_version TEXT NOT NULL CHECK (char_length(btrim(text_version)) BETWEEN 1 AND 160),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  granted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coaching_consents_revocation_actor_check CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  ),
  UNIQUE (relationship_id, scope)
);

CREATE INDEX coaching_consents_active_scope_idx
  ON public.coaching_consents (relationship_id, scope)
  WHERE revoked_at IS NULL;

ALTER TABLE public.trainer_service_offerings OWNER TO postgres;
ALTER TABLE public.coaching_requests OWNER TO postgres;
ALTER TABLE public.coaching_relationships OWNER TO postgres;
ALTER TABLE public.coaching_consents OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.touch_coaching_relationships_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_active_trainer_service_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.id = NEW.trainer_profile_id
      AND trainer_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_TRAINER_PROFILE_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_active_coaching_trainer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.user_id = NEW.trainer_user_id
      AND trainer_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_TRAINER_PROFILE_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_no_active_coaching_relationship_for_pending_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1
    FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = NEW.client_user_id
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_coaching_service_trainer_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainer_service_offerings service
    JOIN public.trainer_profiles trainer_profile ON trainer_profile.id = service.trainer_profile_id
    WHERE service.id = NEW.service_id
      AND trainer_profile.user_id = NEW.trainer_user_id
      AND trainer_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_SERVICE_TRAINER_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trainer_service_offerings_updated_at ON public.trainer_service_offerings;
CREATE TRIGGER trg_trainer_service_offerings_updated_at
  BEFORE UPDATE ON public.trainer_service_offerings
  FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();

DROP TRIGGER IF EXISTS trg_coaching_requests_updated_at ON public.coaching_requests;
CREATE TRIGGER trg_coaching_requests_updated_at
  BEFORE UPDATE ON public.coaching_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();

DROP TRIGGER IF EXISTS trg_coaching_relationships_updated_at ON public.coaching_relationships;
CREATE TRIGGER trg_coaching_relationships_updated_at
  BEFORE UPDATE ON public.coaching_relationships
  FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();

DROP TRIGGER IF EXISTS trg_coaching_consents_updated_at ON public.coaching_consents;
CREATE TRIGGER trg_coaching_consents_updated_at
  BEFORE UPDATE ON public.coaching_consents
  FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();

DROP TRIGGER IF EXISTS trg_trainer_service_offerings_active_profile ON public.trainer_service_offerings;
CREATE TRIGGER trg_trainer_service_offerings_active_profile
  BEFORE INSERT OR UPDATE OF trainer_profile_id ON public.trainer_service_offerings
  FOR EACH ROW EXECUTE FUNCTION public.require_active_trainer_service_profile();

DROP TRIGGER IF EXISTS trg_coaching_requests_active_trainer ON public.coaching_requests;
CREATE TRIGGER trg_coaching_requests_active_trainer
  BEFORE INSERT OR UPDATE OF trainer_user_id ON public.coaching_requests
  FOR EACH ROW EXECUTE FUNCTION public.require_active_coaching_trainer();

DROP TRIGGER IF EXISTS trg_coaching_requests_no_active_relationship ON public.coaching_requests;
CREATE TRIGGER trg_coaching_requests_no_active_relationship
  BEFORE INSERT OR UPDATE OF client_user_id, status ON public.coaching_requests
  FOR EACH ROW EXECUTE FUNCTION public.require_no_active_coaching_relationship_for_pending_request();

DROP TRIGGER IF EXISTS trg_coaching_requests_service_trainer_match ON public.coaching_requests;
CREATE TRIGGER trg_coaching_requests_service_trainer_match
  BEFORE INSERT OR UPDATE OF service_id, trainer_user_id ON public.coaching_requests
  FOR EACH ROW EXECUTE FUNCTION public.require_coaching_service_trainer_match();

DROP TRIGGER IF EXISTS trg_coaching_relationships_active_trainer ON public.coaching_relationships;
CREATE TRIGGER trg_coaching_relationships_active_trainer
  BEFORE INSERT OR UPDATE OF trainer_user_id ON public.coaching_relationships
  FOR EACH ROW EXECUTE FUNCTION public.require_active_coaching_trainer();

DROP TRIGGER IF EXISTS trg_coaching_relationships_service_trainer_match ON public.coaching_relationships;
CREATE TRIGGER trg_coaching_relationships_service_trainer_match
  BEFORE INSERT OR UPDATE OF service_id, trainer_user_id ON public.coaching_relationships
  FOR EACH ROW EXECUTE FUNCTION public.require_coaching_service_trainer_match();

CREATE OR REPLACE FUNCTION public.has_active_coaching_scope(
  p_trainer_id UUID,
  p_client_id UUID,
  p_scope TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND auth.uid() = p_trainer_id
    AND EXISTS (
      SELECT 1
      FROM public.trainer_profiles trainer_profile
      JOIN public.coaching_relationships relationship
        ON relationship.trainer_user_id = trainer_profile.user_id
      JOIN public.coaching_consents training_consent
        ON training_consent.relationship_id = relationship.id
      JOIN public.coaching_consents consent
        ON consent.relationship_id = relationship.id
      WHERE trainer_profile.user_id = p_trainer_id
        AND trainer_profile.status = 'active'
        AND relationship.client_user_id = p_client_id
        AND relationship.status = 'active'
        AND training_consent.scope = 'training_profile'
        AND training_consent.revoked_at IS NULL
        AND consent.scope = p_scope
        AND consent.revoked_at IS NULL
    ),
    FALSE
  );
$$;

ALTER FUNCTION public.touch_coaching_relationships_updated_at() OWNER TO postgres;
ALTER FUNCTION public.require_active_trainer_service_profile() OWNER TO postgres;
ALTER FUNCTION public.require_active_coaching_trainer() OWNER TO postgres;
ALTER FUNCTION public.require_no_active_coaching_relationship_for_pending_request() OWNER TO postgres;
ALTER FUNCTION public.require_coaching_service_trainer_match() OWNER TO postgres;
ALTER FUNCTION public.has_active_coaching_scope(UUID, UUID, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.touch_coaching_relationships_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_active_trainer_service_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_active_coaching_trainer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_no_active_coaching_relationship_for_pending_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_coaching_service_trainer_match() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_coaching_scope(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_coaching_scope(UUID, UUID, TEXT) TO authenticated;

ALTER TABLE public.trainer_service_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coaching_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer_service_offerings: read active trainer services" ON public.trainer_service_offerings;
CREATE POLICY "trainer_service_offerings: read active trainer services"
  ON public.trainer_service_offerings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.id = trainer_profile_id
      AND trainer_profile.status = 'active'
  ));

DROP POLICY IF EXISTS "trainer_service_offerings: manage own active profile" ON public.trainer_service_offerings;
CREATE POLICY "trainer_service_offerings: manage own active profile"
  ON public.trainer_service_offerings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.id = trainer_profile_id
      AND trainer_profile.user_id = auth.uid()
      AND trainer_profile.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.id = trainer_profile_id
      AND trainer_profile.user_id = auth.uid()
      AND trainer_profile.status = 'active'
  ));

DROP POLICY IF EXISTS "coaching_requests: read participant" ON public.coaching_requests;
CREATE POLICY "coaching_requests: read participant"
  ON public.coaching_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = client_user_id OR auth.uid() = trainer_user_id);

DROP POLICY IF EXISTS "coaching_relationships: read participant" ON public.coaching_relationships;
CREATE POLICY "coaching_relationships: read participant"
  ON public.coaching_relationships
  FOR SELECT TO authenticated
  USING (auth.uid() = client_user_id OR auth.uid() = trainer_user_id);

DROP POLICY IF EXISTS "coaching_consents: read participant" ON public.coaching_consents;
CREATE POLICY "coaching_consents: read participant"
  ON public.coaching_consents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.coaching_relationships relationship
    WHERE relationship.id = relationship_id
      AND (relationship.client_user_id = auth.uid() OR relationship.trainer_user_id = auth.uid())
  ));

REVOKE ALL ON TABLE public.trainer_service_offerings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coaching_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coaching_relationships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coaching_consents FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.trainer_service_offerings TO authenticated;
GRANT INSERT (trainer_profile_id, name, description, modality, duration_minutes, content, capacity, is_active)
  ON TABLE public.trainer_service_offerings TO authenticated;
GRANT UPDATE (name, description, modality, duration_minutes, content, capacity, is_active)
  ON TABLE public.trainer_service_offerings TO authenticated;
GRANT DELETE ON TABLE public.trainer_service_offerings TO authenticated;
GRANT SELECT ON TABLE public.coaching_requests TO authenticated;
GRANT SELECT ON TABLE public.coaching_relationships TO authenticated;
GRANT SELECT ON TABLE public.coaching_consents TO authenticated;

GRANT ALL ON TABLE public.trainer_service_offerings TO service_role;
GRANT ALL ON TABLE public.coaching_requests TO service_role;
GRANT ALL ON TABLE public.coaching_relationships TO service_role;
GRANT ALL ON TABLE public.coaching_consents TO service_role;
