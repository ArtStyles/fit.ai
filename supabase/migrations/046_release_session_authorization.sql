-- Release an abandoned, unconsumed workout authorization so it does not hold
-- the user's daily reservation. The operation is intentionally idempotent and
-- cannot release another user's lease or a session that was already saved.

CREATE OR REPLACE FUNCTION public.release_session_authorization(
  p_client_session_id UUID,
  p_workout_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  IF p_client_session_id IS NULL OR p_workout_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_INVALID_ID';
  END IF;

  -- Serialize with authorization and atomic save. If save consumes the lease
  -- first, the consumed_at predicate protects the completed session.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  UPDATE public.session_authorizations
  SET released_at = COALESCE(released_at, NOW())
  WHERE client_session_id = p_client_session_id
    AND workout_id = p_workout_id
    AND user_id = v_user_id
    AND consumed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.release_session_authorization(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_session_authorization(UUID, UUID) TO authenticated;
