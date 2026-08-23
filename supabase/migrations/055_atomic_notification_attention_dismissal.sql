-- ============================================================
-- Migration 055: atomic notification-attention dismissal
-- ============================================================

DROP FUNCTION IF EXISTS public.dismiss_current_notification_attention(TEXT);
DROP FUNCTION IF EXISTS public.dismiss_current_notification_attention(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.dismiss_current_notification_attention(
  p_notice_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_notice_key TEXT := btrim(COALESCE(p_notice_key, ''));
  v_profile_time_zone TEXT;
  v_time_zone TEXT;
  v_last_check_in_at TIMESTAMPTZ;
  v_plan_id UUID;
  v_plan_ai_notes TEXT;
  v_plan_updated_at TIMESTAMPTZ;
  v_banner_status TEXT;
  v_banner_starts_on DATE;
  v_banner_ends_on DATE;
  v_banner_updated_at TIMESTAMPTZ;
  v_candidate_plan_id UUID;
  v_candidate_timestamp TIMESTAMPTZ;
  v_plan_visibility_threshold TIMESTAMPTZ;
  v_today DATE;
BEGIN
  IF v_user_id IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  IF char_length(v_notice_key) NOT BETWEEN 1 AND 160 THEN
    RETURN FALSE;
  END IF;

  -- Plan lifecycle RPCs and triggers use this same per-user lock. Row locks
  -- below serialize profile and banner changes that do not use that contract.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT profile.timezone, profile.last_check_in_at
  INTO v_profile_time_zone, v_last_check_in_at
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_profile_time_zone IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS zone
    WHERE zone.name = v_profile_time_zone
  ) THEN
    RETURN FALSE;
  END IF;
  v_time_zone := v_profile_time_zone;

  IF v_notice_key LIKE 'plan-update:%' THEN
    IF char_length(v_notice_key) < 50 OR substring(v_notice_key FROM 49 FOR 1) <> ':' THEN
      RETURN FALSE;
    END IF;

    v_candidate_plan_id := substring(v_notice_key FROM 13 FOR 36)::UUID;
    v_candidate_timestamp := substring(v_notice_key FROM 50)::TIMESTAMPTZ;

    SELECT plan.id, plan.ai_notes, plan.updated_at
    INTO v_plan_id, v_plan_ai_notes, v_plan_updated_at
    FROM public.workout_plans AS plan
    WHERE plan.user_id = v_user_id
      AND plan.is_active = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    v_plan_visibility_threshold := (
      (NOW() AT TIME ZONE v_time_zone) - INTERVAL '7 days'
    ) AT TIME ZONE v_time_zone;

    IF v_plan_ai_notes IS NULL
      OR v_plan_ai_notes = ''
      OR v_plan_updated_at <= v_plan_visibility_threshold
      OR v_candidate_plan_id <> v_plan_id
      OR v_candidate_timestamp <> v_plan_updated_at
    THEN
      RETURN FALSE;
    END IF;
  ELSIF v_notice_key LIKE 'check-in:%' THEN
    IF v_last_check_in_at IS NULL THEN
      IF v_notice_key <> 'check-in:never' THEN
        RETURN FALSE;
      END IF;
    ELSE
      v_candidate_timestamp := substring(v_notice_key FROM 10)::TIMESTAMPTZ;
      IF v_candidate_timestamp <> v_last_check_in_at
        OR NOW() - v_last_check_in_at < INTERVAL '28 days'
      THEN
        RETURN FALSE;
      END IF;
    END IF;
  ELSIF v_notice_key LIKE 'promo:dashboard-primary:%' THEN
    v_candidate_timestamp := substring(
      v_notice_key FROM char_length('promo:dashboard-primary:') + 1
    )::TIMESTAMPTZ;
    v_today := (NOW() AT TIME ZONE v_time_zone)::DATE;

    SELECT banner.status, banner.starts_on, banner.ends_on, banner.updated_at
    INTO v_banner_status, v_banner_starts_on, v_banner_ends_on, v_banner_updated_at
    FROM public.dashboard_banners AS banner
    WHERE banner.slot = 'dashboard-primary'
    FOR SHARE;

    IF NOT FOUND
      OR v_banner_status <> 'active'
      OR v_banner_starts_on > v_today
      OR v_banner_ends_on < v_today
      OR v_candidate_timestamp <> v_banner_updated_at
    THEN
      RETURN FALSE;
    END IF;
  ELSE
    RETURN FALSE;
  END IF;

  INSERT INTO public.notification_attention_dismissals (user_id, notice_key)
  VALUES (v_user_id, v_notice_key)
  ON CONFLICT (user_id, notice_key) DO NOTHING;

  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RETURN FALSE;
END;
$$;

ALTER FUNCTION public.dismiss_current_notification_attention(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dismiss_current_notification_attention(TEXT)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_current_notification_attention(TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.dismiss_current_notification_attention(TEXT) IS
  'Atomically persists an authenticated owner dismissal only while its plan, check-in, or promotion version remains visible.';
