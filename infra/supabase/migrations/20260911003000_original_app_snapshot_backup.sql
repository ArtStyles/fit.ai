-- Private full-state backup for the original application bundled in Android.
-- This is additive: no canonical web/trainer/session tables are changed or written.
BEGIN;

CREATE TABLE public.original_app_snapshots (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revision uuid NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT original_app_snapshot_size CHECK (
    jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 104857600
  )
);
CREATE TABLE public.original_app_snapshot_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id text NOT NULL CHECK (operation_id ~ '^[0-9a-f]{64}$'),
  expected_revision uuid,
  payload_hash bytea NOT NULL,
  revision uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);

ALTER TABLE public.original_app_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.original_app_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.original_app_snapshot_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.original_app_snapshot_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.original_app_snapshots, public.original_app_snapshot_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.original_app_snapshots TO authenticated;
CREATE POLICY original_app_snapshot_owner_read ON public.original_app_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_account_active(auth.uid()));

CREATE FUNCTION public.original_app_snapshot_read_v1()
RETURNS TABLE(revision uuid, payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.is_account_active(v_user) THEN
    RAISE EXCEPTION 'ORIGINAL_SNAPSHOT_AUTH_REQUIRED';
  END IF;
  RETURN QUERY SELECT s.revision, s.payload FROM public.original_app_snapshots s WHERE s.user_id = v_user;
END;
$$;

CREATE FUNCTION public.original_app_snapshot_push_v1(
  p_expected_revision uuid,
  p_operation_id text,
  p_payload jsonb
)
RETURNS TABLE(revision uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_operation public.original_app_snapshot_operations%ROWTYPE;
  v_current uuid;
  v_next uuid;
  v_hash bytea;
BEGIN
  IF v_user IS NULL OR NOT public.is_account_active(v_user) THEN
    RAISE EXCEPTION 'ORIGINAL_SNAPSHOT_AUTH_REQUIRED';
  END IF;
  IF p_operation_id IS NULL OR p_operation_id !~ '^[0-9a-f]{64}$'
    OR p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text) > 104857600
    OR p_payload->'version' IS DISTINCT FROM '1'::jsonb
    OR p_payload->>'accountId' IS DISTINCT FROM v_user::text
    OR p_payload->>'remoteUserId' IS DISTINCT FROM v_user::text
    OR jsonb_typeof(p_payload->'email') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_payload->'tables') IS DISTINCT FROM 'object'
    OR p_payload->'remoteRevision' IS DISTINCT FROM 'null'::jsonb
    OR p_payload->'lastSyncedRevision' IS DISTINCT FROM '0'::jsonb
    OR jsonb_typeof(p_payload->'revision') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'ORIGINAL_SNAPSHOT_INVALID_PAYLOAD'; END IF;
  IF (p_payload->>'revision')::numeric < 0
    OR (p_payload->>'revision')::numeric > 9007199254740991
    OR trunc((p_payload->>'revision')::numeric) <> (p_payload->>'revision')::numeric
  THEN RAISE EXCEPTION 'ORIGINAL_SNAPSHOT_INVALID_PAYLOAD'; END IF;

  -- Serialize owners independently; checking then inserting without this lock
  -- would permit two first uploads to both pass a null expected revision.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 9110030));
  v_hash := sha256(convert_to(p_payload::text, 'UTF8'));
  SELECT * INTO v_operation FROM public.original_app_snapshot_operations o
    WHERE o.user_id = v_user AND o.operation_id = p_operation_id;
  IF FOUND THEN
    IF v_operation.expected_revision IS DISTINCT FROM p_expected_revision
      OR v_operation.payload_hash IS DISTINCT FROM v_hash
    THEN RAISE EXCEPTION 'ORIGINAL_SNAPSHOT_IDEMPOTENCY_MISMATCH'; END IF;
    RETURN QUERY SELECT v_operation.revision;
    RETURN;
  END IF;

  SELECT s.revision INTO v_current FROM public.original_app_snapshots s WHERE s.user_id = v_user;
  IF v_current IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'ORIGINAL_SNAPSHOT_CONFLICT';
  END IF;
  v_next := gen_random_uuid();
  INSERT INTO public.original_app_snapshots(user_id, revision, payload)
    VALUES (v_user, v_next, p_payload)
    ON CONFLICT (user_id) DO UPDATE SET revision = EXCLUDED.revision, payload = EXCLUDED.payload, updated_at = now();
  INSERT INTO public.original_app_snapshot_operations(user_id, operation_id, expected_revision, payload_hash, revision)
    VALUES (v_user, p_operation_id, p_expected_revision, v_hash, v_next);
  RETURN QUERY SELECT v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.original_app_snapshot_read_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.original_app_snapshot_push_v1(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.original_app_snapshot_read_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.original_app_snapshot_push_v1(uuid, text, jsonb) TO authenticated;

COMMIT;
