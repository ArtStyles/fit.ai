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
  idempotency_key UUID NOT NULL DEFAULT gen_random_uuid(),
  acceptance_idempotency_key UUID,
  acceptance_cancelled_request_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
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

ALTER TABLE public.coaching_requests
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE public.coaching_requests
  ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid();
UPDATE public.coaching_requests
SET idempotency_key = gen_random_uuid()
WHERE idempotency_key IS NULL;
ALTER TABLE public.coaching_requests
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX coaching_requests_client_idempotency_key
  ON public.coaching_requests (client_user_id, idempotency_key);

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
  ),
  CONSTRAINT coaching_relationships_pause_state_check CHECK (
    (status = 'paused_by_platform' AND paused_at IS NOT NULL)
    OR (status <> 'paused_by_platform' AND paused_at IS NULL)
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
  )
  -- Consent records are immutable grants. A new grant after revocation receives
  -- a new row so the historical decision remains auditable.
);

CREATE INDEX coaching_consents_active_scope_idx
  ON public.coaching_consents (relationship_id, scope)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX coaching_consents_one_active_scope
  ON public.coaching_consents (relationship_id, scope)
  WHERE revoked_at IS NULL;

ALTER TABLE public.coaching_consents
  DROP CONSTRAINT IF EXISTS coaching_consents_relationship_id_scope_key;
ALTER TABLE public.coaching_relationships
  DROP CONSTRAINT IF EXISTS coaching_relationships_pause_state_check;
ALTER TABLE public.coaching_relationships
  ADD CONSTRAINT coaching_relationships_pause_state_check CHECK (
    (status = 'paused_by_platform' AND paused_at IS NOT NULL)
    OR (status <> 'paused_by_platform' AND paused_at IS NULL)
  );

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
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND auth.uid() = p_trainer_id
    AND EXISTS (
      SELECT 1
      FROM public.trainer_profiles trainer_profile
      JOIN public.profiles trainer_account
        ON trainer_account.id = trainer_profile.user_id
      JOIN public.profiles client_account
        ON client_account.id = p_client_id
      JOIN public.coaching_relationships relationship
        ON relationship.trainer_user_id = trainer_profile.user_id
      JOIN public.coaching_consents training_consent
        ON training_consent.relationship_id = relationship.id
      JOIN public.coaching_consents consent
        ON consent.relationship_id = relationship.id
      WHERE trainer_profile.user_id = p_trainer_id
        AND trainer_profile.status = 'active'
        AND trainer_account.account_status = 'active'
        AND client_account.account_status = 'active'
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

CREATE OR REPLACE FUNCTION public.create_coaching_request(
  service_id UUID,
  message TEXT,
  consent_version TEXT,
  idempotency_key UUID
)
RETURNS TABLE (request_id UUID, created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_requested_service_id UUID := $1;
  v_message TEXT := $2;
  v_consent_version TEXT := $3;
  v_idempotency_key UUID := $4;
  v_service public.trainer_service_offerings%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_existing_request public.coaching_requests%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF v_requested_service_id IS NULL OR v_idempotency_key IS NULL OR v_message IS NULL OR char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'COACHING_REQUEST_INVALID';
  END IF;
  IF v_consent_version <> 'training-profile-v1' THEN
    RAISE EXCEPTION 'COACHING_CONSENT_VERSION_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  SELECT * INTO v_existing_request
  FROM public.coaching_requests request
  WHERE request.client_user_id = v_client_user_id
    AND request.idempotency_key = v_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_request.id, FALSE;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles client_profile
    WHERE client_profile.id = v_client_user_id
      AND client_profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_CLIENT_NOT_ACTIVE';
  END IF;

  SELECT service.* INTO v_service
  FROM public.trainer_service_offerings service
  WHERE service.id = v_requested_service_id
    AND service.is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_SERVICE_NOT_AVAILABLE';
  END IF;

  SELECT * INTO v_trainer_profile
  FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.id = v_service.trainer_profile_id
    AND trainer_profile.status = 'active';
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.profiles trainer_account
    WHERE trainer_account.id = v_trainer_profile.user_id
      AND trainer_account.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;
  IF v_client_user_id = v_trainer_profile.user_id THEN
    RAISE EXCEPTION 'COACHING_SELF_REQUEST_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = v_client_user_id
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_requests request
    WHERE request.client_user_id = v_client_user_id
      AND request.trainer_user_id = v_trainer_profile.user_id
      AND request.service_id = v_service.id
      AND request.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'COACHING_PENDING_REQUEST_EXISTS';
  END IF;

  INSERT INTO public.coaching_requests (
    service_id, trainer_user_id, client_user_id, message,
    training_profile_consent_version, idempotency_key, status
  ) VALUES (
    v_service.id, v_trainer_profile.user_id, v_client_user_id, v_message,
    v_consent_version, v_idempotency_key, 'pending'
  ) RETURNING * INTO v_existing_request;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_client_user_id, v_trainer_profile.user_id, 'coaching_request', v_existing_request.id,
    'created', jsonb_build_object('service_id', v_service.id, 'consent_version', v_consent_version, 'idempotency_key', v_idempotency_key)
  );
  PERFORM public.create_product_notification(
    v_trainer_profile.user_id,
    'coaching_request_created',
    'Nueva solicitud de acompañamiento',
    'Tienes una nueva solicitud para uno de tus servicios.',
    '/coach/requests',
    'coaching-request-created:' || v_existing_request.id::TEXT,
    jsonb_build_object('request_id', v_existing_request.id, 'service_id', v_service.id)
  );

  RETURN QUERY SELECT v_existing_request.id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_coaching_request(p_request_id UUID)
RETURNS TABLE (request_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_request public.coaching_requests%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.coaching_requests request
  WHERE request.id = cancel_coaching_request.p_request_id
    AND request.client_user_id = v_client_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_CANCELLABLE';
  END IF;

  UPDATE public.coaching_requests
  SET status = 'cancelled', decided_at = NOW()
  WHERE id = v_request.id;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_client_user_id, v_request.trainer_user_id, 'coaching_request', v_request.id,
    'cancelled', jsonb_build_object('service_id', v_request.service_id)
  );
  PERFORM public.create_product_notification(
    v_request.trainer_user_id,
    'coaching_request_cancelled',
    'Solicitud cancelada',
    'La persona retiró su solicitud de acompañamiento.',
    '/coach/requests',
    'coaching-request-cancelled:' || v_request.id::TEXT,
    jsonb_build_object('request_id', v_request.id, 'service_id', v_request.service_id)
  );

  RETURN QUERY SELECT v_request.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_coaching_request(
  request_id UUID,
  idempotency_key UUID
)
RETURNS TABLE (
  relationship_id UUID,
  accepted_request_id UUID,
  cancelled_request_ids UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_client_user_id UUID;
  v_request public.coaching_requests%ROWTYPE;
  v_service public.trainer_service_offerings%ROWTYPE;
  v_trainer_account public.profiles%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_cancelled_request_ids UUID[] := '{}'::UUID[];
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF $1 IS NULL OR $2 IS NULL THEN
    RAISE EXCEPTION 'COACHING_REQUEST_INVALID';
  END IF;

  -- This read intentionally reveals only the lock key; ownership is checked after locking.
  SELECT request.client_user_id INTO v_client_user_id
  FROM public.coaching_requests request
  WHERE request.id = $1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  -- All acceptors for a client serialize here before they can lock a request row.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  SELECT * INTO v_request
  FROM public.coaching_requests request
  WHERE request.id = $1
    AND request.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  IF v_request.status = 'accepted'
    AND v_request.acceptance_idempotency_key = $2 THEN
    SELECT * INTO v_relationship
    FROM public.coaching_relationships relationship
    WHERE relationship.source_request_id = v_request.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
    END IF;
    RETURN QUERY SELECT v_relationship.id, v_request.id, v_request.acceptance_cancelled_request_ids;
    RETURN;
  END IF;
  IF v_request.status <> 'pending' THEN
    IF EXISTS (
      SELECT 1 FROM public.coaching_relationships relationship
      WHERE relationship.client_user_id = v_request.client_user_id
        AND relationship.status = 'active'
    ) THEN
      RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
    END IF;
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  SELECT service.* INTO v_service
  FROM public.trainer_service_offerings service
  WHERE service.id = v_request.service_id
    AND service.is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_SERVICE_NOT_AVAILABLE';
  END IF;
  -- Keep the account -> professional-profile lock order used by administrative
  -- suspension. If an admin wins this lock race, the accept revalidates and fails.
  SELECT * INTO v_trainer_account
  FROM public.profiles account
  WHERE account.id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_account.account_status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;
  SELECT * INTO v_trainer_profile
  FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.id = v_service.trainer_profile_id
    AND trainer_profile.user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_profile.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles client_account
    WHERE client_account.id = v_request.client_user_id
      AND client_account.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_CLIENT_NOT_ACTIVE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = v_request.client_user_id
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
  END IF;

  INSERT INTO public.coaching_relationships (
    source_request_id, service_id, trainer_user_id, client_user_id, status
  ) VALUES (
    v_request.id, v_request.service_id, v_trainer_user_id, v_request.client_user_id, 'active'
  ) RETURNING * INTO v_relationship;

  UPDATE public.coaching_requests
  SET status = 'accepted', decided_at = NOW(), acceptance_idempotency_key = $2
  WHERE id = v_request.id;

  WITH cancelled AS (
    UPDATE public.coaching_requests request
    SET status = 'cancelled', decided_at = NOW()
    WHERE request.client_user_id = v_request.client_user_id
      AND request.id <> v_request.id
      AND request.status = 'pending'
    RETURNING request.id, request.trainer_user_id, request.service_id
  ), captured AS (
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::UUID[]) AS ids FROM cancelled
  )
  SELECT ids INTO v_cancelled_request_ids FROM captured;

  UPDATE public.coaching_requests
  SET acceptance_cancelled_request_ids = v_cancelled_request_ids
  WHERE id = v_request.id;

  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
  VALUES (v_relationship.id, 'training_profile', v_request.training_profile_consent_version, v_request.client_user_id);

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_request.client_user_id, 'coaching_request', v_request.id,
    'accepted', jsonb_build_object('relationship_id', v_relationship.id, 'service_id', v_request.service_id, 'cancelled_request_ids', v_cancelled_request_ids)
  );
  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  )
  SELECT v_trainer_user_id, cancelled.trainer_user_id, 'coaching_request', cancelled.id,
    'cancelled_after_acceptance', jsonb_build_object('accepted_request_id', v_request.id, 'service_id', cancelled.service_id)
  FROM public.coaching_requests cancelled
  WHERE cancelled.id = ANY(v_cancelled_request_ids);

  PERFORM public.create_product_notification(
    v_request.client_user_id, 'coaching_request_accepted', 'Solicitud aceptada',
    'Tu solicitud de acompaÃ±amiento fue aceptada.', '/coaching',
    'coaching-request-accepted:' || v_request.id::TEXT,
    jsonb_build_object('request_id', v_request.id, 'relationship_id', v_relationship.id)
  );
  PERFORM public.create_product_notification(
    cancelled.trainer_user_id, 'coaching_request_cancelled_after_acceptance', 'Solicitud cancelada',
    'La persona ya iniciÃ³ otro acompaÃ±amiento.', '/coach/requests',
    'coaching-request-cancelled-after-acceptance:' || cancelled.id::TEXT,
    jsonb_build_object('request_id', cancelled.id)
  )
  FROM public.coaching_requests cancelled
  WHERE cancelled.id = ANY(v_cancelled_request_ids);

  RETURN QUERY SELECT v_relationship.id, v_request.id, v_cancelled_request_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_coaching_request(
  request_id UUID,
  reason TEXT DEFAULT ''
)
RETURNS TABLE (declined_request_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_request public.coaching_requests%ROWTYPE;
  v_reason TEXT := COALESCE(btrim($2), '');
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF $1 IS NULL OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'COACHING_REQUEST_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.trainer_profiles trainer_profile
    JOIN public.profiles trainer_account ON trainer_account.id = trainer_profile.user_id
    WHERE trainer_profile.user_id = v_trainer_user_id
      AND trainer_profile.status = 'active'
      AND trainer_account.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_request
  FROM public.coaching_requests request
  WHERE request.id = $1
    AND request.trainer_user_id = v_trainer_user_id
    AND request.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  UPDATE public.coaching_requests
  SET status = 'declined', decided_at = NOW()
  WHERE id = v_request.id;
  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_request.client_user_id, 'coaching_request', v_request.id,
    'declined', jsonb_build_object('reason', v_reason, 'service_id', v_request.service_id)
  );
  PERFORM public.create_product_notification(
    v_request.client_user_id, 'coaching_request_declined', 'Solicitud no aceptada',
    'Esta solicitud no pudo ser aceptada en este momento.', '/coaching',
    'coaching-request-declined:' || v_request.id::TEXT,
    jsonb_build_object('request_id', v_request.id)
  );
  RETURN QUERY SELECT v_request.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_body_measurements_consent(
  p_relationship_id UUID, p_consent_version TEXT, p_idempotency_key UUID
)
RETURNS TABLE (relationship_id UUID, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
  v_consent public.coaching_consents%ROWTYPE;
  v_version TEXT := btrim($2);
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF $1 IS NULL OR $3 IS NULL OR char_length(v_version) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'COACHING_CONSENT_INVALID'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = $1 AND relationship.client_user_id = v_client_user_id FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  IF NOT public.is_account_active(v_client_user_id) OR NOT EXISTS (
    SELECT 1 FROM public.trainer_profiles trainer_profile
    JOIN public.profiles trainer_account ON trainer_account.id = trainer_profile.user_id
    WHERE trainer_profile.user_id = v_relationship.trainer_user_id
      AND trainer_profile.status = 'active' AND trainer_account.account_status = 'active'
  ) THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_consent FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'body_measurements'
    AND consent.revoked_at IS NULL
  FOR UPDATE;
  IF FOUND AND v_consent.revoked_at IS NULL THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
  VALUES (v_relationship.id, 'body_measurements', v_version, v_client_user_id);
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id,
    'body_measurements_consent_granted', jsonb_build_object('text_version', v_version, 'idempotency_key', $3));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_body_measurements_granted',
    'Consentimiento actualizado', 'La persona autorizó compartir sus medidas corporales.', '/coaching',
    'coaching-body-measurements-granted:' || v_relationship.id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id, 'scope', 'body_measurements'));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_body_measurements_consent(
  p_relationship_id UUID, p_idempotency_key UUID
)
RETURNS TABLE (relationship_id UUID, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
  v_consent public.coaching_consents%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF $1 IS NULL OR $2 IS NULL THEN RAISE EXCEPTION 'COACHING_CONSENT_INVALID'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = $1 AND relationship.client_user_id = v_client_user_id FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_consent FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'body_measurements'
    AND consent.revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_consent.revoked_at IS NOT NULL THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
  UPDATE public.coaching_consents SET revoked_at = NOW(), revoked_by = v_client_user_id WHERE id = v_consent.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id,
    'body_measurements_consent_revoked', jsonb_build_object('idempotency_key', $2));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_body_measurements_revoked',
    'Consentimiento actualizado', 'La persona dejó de compartir sus medidas corporales.', '/coaching',
    'coaching-body-measurements-revoked:' || v_relationship.id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id, 'scope', 'body_measurements'));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_training_profile_consent(
  p_relationship_id UUID, p_idempotency_key UUID
)
RETURNS TABLE (relationship_id UUID, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF $1 IS NULL OR $2 IS NULL THEN RAISE EXCEPTION 'COACHING_CONSENT_INVALID'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = $1 AND relationship.client_user_id = v_client_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  IF v_relationship.status = 'ended' THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
  IF v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  UPDATE public.coaching_consents consent SET revoked_at = NOW(), revoked_by = v_client_user_id
  WHERE consent.relationship_id = v_relationship.id AND consent.revoked_at IS NULL;
  UPDATE public.coaching_relationships SET status = 'ended', ended_at = NOW(), ended_by = v_client_user_id,
    end_reason = 'Consentimiento de datos de entrenamiento revocado' WHERE id = v_relationship.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id,
    'training_profile_consent_revoked', jsonb_build_object('idempotency_key', $2));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_training_profile_revoked',
    'Acompañamiento finalizado', 'La persona revocó los datos de entrenamiento y finalizó el acompañamiento.', '/coaching',
    'coaching-training-profile-revoked:' || v_relationship.id::TEXT, jsonb_build_object('relationship_id', v_relationship.id));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_coaching_relationship(
  p_relationship_id UUID, p_reason TEXT, p_idempotency_key UUID
)
RETURNS TABLE (relationship_id UUID, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_other_user_id UUID;
BEGIN
  IF v_actor_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF p_relationship_id IS NULL OR p_idempotency_key IS NULL OR char_length(COALESCE(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_END_INVALID';
  END IF;

  SELECT * INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
  FOR UPDATE;
  IF NOT FOUND OR (v_relationship.client_user_id <> v_actor_user_id AND v_relationship.trainer_user_id <> v_actor_user_id) THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;
  IF v_relationship.status = 'ended' THEN
    RETURN QUERY SELECT v_relationship.id, FALSE;
    RETURN;
  END IF;

  v_other_user_id := CASE WHEN v_actor_user_id = v_relationship.client_user_id
    THEN v_relationship.trainer_user_id ELSE v_relationship.client_user_id END;
  UPDATE public.coaching_consents consent
  SET revoked_at = NOW(), revoked_by = v_actor_user_id
  WHERE consent.relationship_id = v_relationship.id AND consent.revoked_at IS NULL;
  UPDATE public.coaching_relationships
  SET status = 'ended', ended_at = NOW(), ended_by = v_actor_user_id, end_reason = v_reason, paused_at = NULL
  WHERE id = v_relationship.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_actor_user_id, v_other_user_id, 'coaching_relationship', v_relationship.id, 'ended',
    jsonb_build_object('reason', v_reason, 'idempotency_key', p_idempotency_key));
  PERFORM public.create_product_notification(
    v_actor_user_id, 'coaching_relationship_ended', 'AcompaÃ±amiento finalizado',
    'El acompaÃ±amiento fue finalizado.', '/coaching',
    'coaching-relationship-ended:' || v_relationship.id::TEXT || ':' || v_actor_user_id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id));
  PERFORM public.create_product_notification(
    v_other_user_id, 'coaching_relationship_ended', 'AcompaÃ±amiento finalizado',
    'El acompaÃ±amiento fue finalizado.', '/coaching',
    'coaching-relationship-ended:' || v_relationship.id::TEXT || ':' || v_other_user_id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_paused_coaching_relationship(
  p_relationship_id UUID, p_idempotency_key UUID
)
RETURNS TABLE (relationship_id UUID, changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_trainer_user_id UUID;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_trainer_account public.profiles%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_service public.trainer_service_offerings%ROWTYPE;
  v_training_version TEXT;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF p_relationship_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_RESUME_INVALID'; END IF;

  -- Every operation that can create the sole active relationship takes this
  -- client lock first, preventing an accept and a resume from interleaving.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  -- This untrusted pre-read supplies only the trainer lock key. The relationship
  -- is re-read under lock below before any state is accepted or changed.
  SELECT relationship.trainer_user_id INTO v_trainer_user_id
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id AND relationship.client_user_id = v_client_user_id
  ;
  IF NOT FOUND THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND'; END IF;

  -- Suspension uses this same trainer lock before touching account/profile or
  -- relationships. Taking it before the relationship row prevents the former
  -- account -> relationship / relationship -> account deadlock cycle.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  IF NOT public.is_account_active(v_client_user_id) THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  -- Match suspension's account -> profile order before checking resumability.
  SELECT * INTO v_trainer_account FROM public.profiles account
  WHERE account.id = v_trainer_user_id FOR UPDATE;
  IF NOT FOUND OR v_trainer_account.account_status <> 'active' THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  SELECT * INTO v_trainer_profile FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.user_id = v_trainer_user_id FOR UPDATE;
  IF NOT FOUND OR v_trainer_profile.status <> 'active' THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;

  SELECT * INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.client_user_id = v_client_user_id
    AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND'; END IF;
  IF v_relationship.status <> 'paused_by_platform' THEN
    IF v_relationship.status = 'active' THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_PAUSED';
  END IF;
  SELECT * INTO v_service FROM public.trainer_service_offerings service
  WHERE service.id = v_relationship.service_id
    AND service.trainer_profile_id = v_trainer_profile.id FOR UPDATE;
  IF NOT FOUND OR v_service.is_active <> TRUE THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = v_client_user_id
      AND relationship.status = 'active'
      AND relationship.id <> v_relationship.id
  ) THEN RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS'; END IF;
  SELECT consent.text_version INTO v_training_version
  FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id AND consent.scope = 'training_profile'
  ORDER BY consent.granted_at DESC, consent.id DESC
  LIMIT 1;
  IF v_training_version IS NULL THEN RAISE EXCEPTION 'COACHING_TRAINING_CONSENT_REQUIRED'; END IF;

  UPDATE public.coaching_relationships
  SET status = 'active', paused_at = NULL
  WHERE id = v_relationship.id;
  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
  VALUES (v_relationship.id, 'training_profile', v_training_version, v_client_user_id);
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id, 'resumed',
    jsonb_build_object('idempotency_key', p_idempotency_key));
  PERFORM public.create_product_notification(
    v_client_user_id, 'coaching_relationship_resumed', 'AcompaÃ±amiento reanudado',
    'Confirmaste la reanudaciÃ³n del acompaÃ±amiento.', '/coaching',
    'coaching-relationship-resumed:' || v_relationship.id::TEXT || ':' || v_client_user_id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id));
  PERFORM public.create_product_notification(
    v_relationship.trainer_user_id, 'coaching_relationship_resumed', 'AcompaÃ±amiento reanudado',
    'La persona confirmÃ³ la reanudaciÃ³n del acompaÃ±amiento.', '/coach/requests',
    'coaching-relationship-resumed:' || v_relationship.id::TEXT || ':' || v_relationship.trainer_user_id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;

ALTER FUNCTION public.create_coaching_request(UUID, TEXT, TEXT, UUID) OWNER TO postgres;
ALTER FUNCTION public.cancel_coaching_request(UUID) OWNER TO postgres;
ALTER FUNCTION public.accept_coaching_request(UUID, UUID) OWNER TO postgres;
ALTER FUNCTION public.decline_coaching_request(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.grant_body_measurements_consent(UUID, TEXT, UUID) OWNER TO postgres;
ALTER FUNCTION public.revoke_body_measurements_consent(UUID, UUID) OWNER TO postgres;
ALTER FUNCTION public.revoke_training_profile_consent(UUID, UUID) OWNER TO postgres;
ALTER FUNCTION public.end_coaching_relationship(UUID, TEXT, UUID) OWNER TO postgres;
ALTER FUNCTION public.resume_paused_coaching_relationship(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_coaching_request(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_coaching_request(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_coaching_request(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.decline_coaching_request(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.grant_body_measurements_consent(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_body_measurements_consent(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_training_profile_consent(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.end_coaching_relationship(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resume_paused_coaching_relationship(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_coaching_request(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_coaching_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_coaching_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_coaching_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_body_measurements_consent(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_body_measurements_consent(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_training_profile_consent(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_coaching_relationship(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_paused_coaching_relationship(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_requestable_trainer_services(trainer_slug TEXT)
RETURNS TABLE (
  service_id UUID,
  name TEXT,
  description TEXT,
  modality TEXT,
  duration_minutes INTEGER,
  content TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT service.id, service.name, service.description, service.modality, service.duration_minutes, service.content
  FROM public.trainer_service_offerings service
  JOIN public.trainer_profiles trainer_profile ON trainer_profile.id = service.trainer_profile_id
  WHERE trainer_profile.slug = get_requestable_trainer_services.trainer_slug
    AND trainer_profile.status = 'active'
    AND service.is_active = TRUE
  ORDER BY service.created_at ASC, service.id ASC;
END;
$$;

ALTER FUNCTION public.get_requestable_trainer_services(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_requestable_trainer_services(TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_requestable_trainer_services(TEXT) TO authenticated;

GRANT ALL ON TABLE public.trainer_service_offerings TO service_role;
GRANT ALL ON TABLE public.coaching_requests TO service_role;
GRANT ALL ON TABLE public.coaching_relationships TO service_role;
GRANT ALL ON TABLE public.coaching_consents TO service_role;

-- The directory is the only discovery projection. It deliberately runs with its
-- owner privileges so callers do not need (and must not receive) direct access
-- to trainer_profiles or trainer_service_offerings.
DROP VIEW IF EXISTS public.active_trainer_directory;
CREATE VIEW public.active_trainer_directory
WITH (security_barrier = true)
AS
SELECT
  trainer_profile.user_id,
  trainer_profile.slug,
  trainer_profile.professional_name,
  trainer_profile.professional_photo_url,
  trainer_profile.bio,
  trainer_profile.specialties,
  trainer_profile.modalities,
  trainer_profile.experience_summary,
  trainer_profile.general_location,
  trainer_profile.languages,
  trainer_profile.verified_at,
  lower(concat_ws(' ',
    trainer_profile.professional_name,
    trainer_profile.bio,
    trainer_profile.experience_summary,
    trainer_profile.general_location,
    array_to_string(trainer_profile.specialties, ' '),
    array_to_string(trainer_profile.languages, ' ')
  )) AS directory_search,
  lower(array_to_string(trainer_profile.specialties, ' ')) AS specialties_search,
  lower(array_to_string(trainer_profile.languages, ' ')) AS languages_search,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', service.name,
        'description', service.description,
        'modality', service.modality,
        'duration_minutes', service.duration_minutes,
        'content', service.content
      )
      ORDER BY service.created_at ASC, service.id ASC
    ) FILTER (WHERE service.id IS NOT NULL),
    '[]'::jsonb
  ) AS active_services
FROM public.trainer_profiles AS trainer_profile
LEFT JOIN public.trainer_service_offerings AS service
  ON service.trainer_profile_id = trainer_profile.id
  AND service.is_active = TRUE
JOIN public.profiles AS trainer_account
  ON trainer_account.id = trainer_profile.user_id
WHERE trainer_profile.status = 'active'
  AND public.is_account_active(trainer_profile.user_id)
GROUP BY
  trainer_profile.user_id,
  trainer_profile.slug,
  trainer_profile.professional_name,
  trainer_profile.professional_photo_url,
  trainer_profile.bio,
  trainer_profile.specialties,
  trainer_profile.modalities,
  trainer_profile.experience_summary,
  trainer_profile.general_location,
  trainer_profile.languages,
  trainer_profile.verified_at;

ALTER VIEW public.active_trainer_directory OWNER TO postgres;
REVOKE ALL ON TABLE public.active_trainer_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.active_trainer_directory TO authenticated;
GRANT SELECT ON TABLE public.active_trainer_directory TO service_role;

COMMENT ON VIEW public.active_trainer_directory IS
  'Authenticated discovery projection of active trainer profiles and their active non-commercial services only.';

-- Administrative requests arrive either from an authenticated admin directly
-- or through the server-side service client after requireAdminUserContext has
-- already validated the session. Never let an authenticated caller nominate a
-- different administrator in the legacy p_admin_id parameter.
CREATE OR REPLACE FUNCTION public.require_active_coaching_admin(p_admin_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_authenticated_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_ADMIN_REQUIRED';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_authenticated_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_ADMIN_REQUIRED'; END IF;
    IF v_authenticated_user_id <> p_admin_id THEN RAISE EXCEPTION 'COACHING_ADMIN_ACTOR_MISMATCH'; END IF;
  END IF;

  SELECT profile.is_admin AND public.is_account_active(profile.id)
  INTO v_is_admin
  FROM public.profiles profile
  WHERE profile.id = p_admin_id;
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'COACHING_ADMIN_REQUIRED';
  END IF;
  RETURN p_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_account_and_professional(
  p_user_id UUID, p_admin_id UUID, p_reason TEXT, p_until TIMESTAMPTZ
)
RETURNS TABLE (account_suspended BOOLEAN, trainer_profile_suspended BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_user_id UUID;
  v_target_account public.profiles%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_relationship RECORD;
  v_profile_changed BOOLEAN := FALSE;
BEGIN
  v_admin_user_id := public.require_active_coaching_admin(p_admin_id);
  IF p_user_id IS NULL OR v_reason IS NULL OR char_length(v_reason) < 4 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'COACHING_SUSPENSION_INVALID';
  END IF;
  IF p_until IS NOT NULL AND p_until <= NOW() THEN
    RAISE EXCEPTION 'COACHING_SUSPENSION_INVALID';
  END IF;

  -- Coordinate with any client-side activation operation before reading account state.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT * INTO v_target_account FROM public.profiles profile
  WHERE profile.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_ACCOUNT_NOT_FOUND';
  END IF;
  IF v_target_account.account_status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, FALSE;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET account_status = 'suspended', suspension_reason = v_reason,
      suspended_at = NOW(), suspended_until = p_until, suspended_by = v_admin_user_id
  WHERE id = p_user_id;

  -- Always take the profile row lock after the account lock, even for a client
  -- with no professional profile, to match accept/resume's trainer lock order.
  PERFORM 1 FROM public.trainer_profiles profile
  WHERE profile.user_id = p_user_id
  FOR UPDATE;
  UPDATE public.trainer_profiles
  SET status = 'suspended'
  WHERE user_id = p_user_id AND status <> 'suspended';
  v_profile_changed := FOUND;

  -- A suspended professional must immediately lose all live client scopes.
  -- Returning the changed rows keeps notifications scoped to this operation.
  FOR v_relationship IN
    UPDATE public.coaching_relationships relationship
    SET status = 'paused_by_platform', paused_at = NOW()
    WHERE (relationship.trainer_user_id = p_user_id OR relationship.client_user_id = p_user_id)
      AND relationship.status = 'active'
    RETURNING relationship.id, relationship.trainer_user_id, relationship.client_user_id
  LOOP
    UPDATE public.coaching_consents consent
    SET revoked_at = NOW(), revoked_by = v_admin_user_id
    WHERE consent.relationship_id = v_relationship.id
      AND consent.revoked_at IS NULL;
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      v_admin_user_id, p_user_id, 'coaching_relationship', v_relationship.id,
      'paused_due_to_account_suspension', jsonb_build_object(
        'trainer_user_id', v_relationship.trainer_user_id,
        'client_user_id', v_relationship.client_user_id
      )
    );
    IF v_relationship.trainer_user_id = p_user_id THEN
      PERFORM public.create_product_notification(
        p_user_id, 'coaching_trainer_suspended', 'Perfil profesional suspendido',
        'El acceso profesional fue suspendido por administraciÃ³n.', '/coach',
        'coaching-trainer-suspended:' || v_relationship.id::TEXT || ':' || p_user_id::TEXT,
        jsonb_build_object('relationship_id', v_relationship.id));
      IF v_relationship.client_user_id <> p_user_id THEN
        PERFORM public.create_product_notification(
          v_relationship.client_user_id, 'coaching_trainer_suspended', 'AcompaÃ±amiento pausado',
          'Tu acompaÃ±amiento fue pausado por una revisiÃ³n administrativa.', '/coaching',
          'coaching-trainer-suspended:' || v_relationship.id::TEXT || ':' || v_relationship.client_user_id::TEXT,
          jsonb_build_object('relationship_id', v_relationship.id));
      END IF;
    ELSE
      PERFORM public.create_product_notification(
        p_user_id, 'coaching_account_suspended', 'Cuenta suspendida',
        'Tu acceso fue suspendido por administraciÃ³n y el acompaÃ±amiento quedó pausado.', '/coaching',
        'coaching-account-suspended:' || v_relationship.id::TEXT || ':' || p_user_id::TEXT,
        jsonb_build_object('relationship_id', v_relationship.id));
      IF v_relationship.trainer_user_id <> p_user_id THEN
        PERFORM public.create_product_notification(
          v_relationship.trainer_user_id, 'coaching_client_suspended', 'AcompaÃ±amiento pausado',
          'El acompañamiento fue pausado por una revisión administrativa.', '/coach/requests',
          'coaching-account-suspended:' || v_relationship.id::TEXT || ':' || v_relationship.trainer_user_id::TEXT,
          jsonb_build_object('relationship_id', v_relationship.id));
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, reason, metadata)
  VALUES (v_admin_user_id, p_user_id, 'account_suspended', v_reason,
    jsonb_build_object('suspended_until', p_until, 'trainer_profile_suspended', v_profile_changed));
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_admin_user_id, p_user_id, 'trainer_account', p_user_id, 'suspended',
    jsonb_build_object('trainer_profile_suspended', v_profile_changed));
  RETURN QUERY SELECT TRUE, v_profile_changed;
END;
$$;

CREATE OR REPLACE FUNCTION public.reinstate_trainer_profile(p_user_id UUID, p_admin_id UUID)
RETURNS TABLE (profile_reinstated BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_user_id UUID;
  v_profile public.trainer_profiles%ROWTYPE;
BEGIN
  v_admin_user_id := public.require_active_coaching_admin(p_admin_id);
  IF p_user_id IS NULL OR NOT public.is_account_active(p_user_id) THEN
    RAISE EXCEPTION 'COACHING_ACCOUNT_NOT_ACTIVE';
  END IF;
  SELECT * INTO v_profile FROM public.trainer_profiles profile
  WHERE profile.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.status = 'active' THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  UPDATE public.trainer_profiles SET status = 'active' WHERE id = v_profile.id;
  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  VALUES (v_admin_user_id, p_user_id, 'trainer_profile_reinstated',
    jsonb_build_object('trainer_profile_id', v_profile.id));
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action)
  VALUES (v_admin_user_id, p_user_id, 'trainer_profile', v_profile.id, 'reinstated');
  PERFORM public.create_product_notification(
    p_user_id, 'trainer_profile_reinstated', 'Perfil profesional restablecido',
    'Tu perfil profesional fue restablecido. Los acompaÃ±amientos pausados requieren confirmaciÃ³n del cliente.', '/coach',
    'trainer-profile-reinstated:' || p_user_id::TEXT,
    jsonb_build_object('trainer_profile_id', v_profile.id));
  RETURN QUERY SELECT TRUE;
END;
$$;

ALTER FUNCTION public.require_active_coaching_admin(UUID) OWNER TO postgres;
ALTER FUNCTION public.suspend_account_and_professional(UUID, UUID, TEXT, TIMESTAMPTZ) OWNER TO postgres;
ALTER FUNCTION public.reinstate_trainer_profile(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.require_active_coaching_admin(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.suspend_account_and_professional(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reinstate_trainer_profile(UUID, UUID) FROM PUBLIC, anon, authenticated;
-- The only public caller is the server action, which validates the session
-- before using its service-role client. This is necessary because migration
-- 029 intentionally prevents ordinary authenticated callers from changing
-- protected profile fields, even inside a definer RPC.
GRANT EXECUTE ON FUNCTION public.suspend_account_and_professional(UUID, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.reinstate_trainer_profile(UUID, UUID) TO service_role;
