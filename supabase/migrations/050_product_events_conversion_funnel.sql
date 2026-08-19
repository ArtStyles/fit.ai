-- ============================================================
-- Migration 050: privacy-safe conversion funnel events
-- ============================================================
-- Keep the immutable 034/044 history intact while extending the allowlists
-- used by the Pro beta and early-session confidence funnel.

BEGIN;

-- Block session inserts before taking any product-events lock. This closes the
-- deployment window between the history snapshot and trigger installation and
-- lets an already-installed trigger finish before a rerun proceeds.
LOCK TABLE public.progress_logs IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
    'landing_view',
    'primary_cta_clicked',
    'language_changed',
    'signup_started',
    'signup_completed',
    'onboarding_step_completed',
    'onboarding_abandoned',
    'plan_generated',
    'first_session_started',
    'first_session_completed',
    'plan_adjustment_used',
    'organic_page_cta_clicked',
    'coach_overview_viewed',
    'coach_client_insights_viewed',
    'coach_alert_filter_used',
    'second_session_completed',
    'paywall_viewed',
    'checkout_started',
    'pro_interest_submitted'
  )) NOT VALID;
ALTER TABLE public.product_events
  VALIDATE CONSTRAINT product_events_event_name_check;

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_path_check;
ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_path_check CHECK (
    path IS NULL OR path IN ('/', '/es', '/en', '/register', '/onboarding', '/pricing', '/session')
  ) NOT VALID;
ALTER TABLE public.product_events
  VALIDATE CONSTRAINT product_events_path_check;

-- Session completion ordinals belong to durable user history, not to a
-- browser. The private counter is initialized from existing logs and updated
-- atomically, so concurrent saves receive distinct ordinals without retaining
-- progress-log identifiers in analytics state or event properties.
CREATE TABLE IF NOT EXISTS private.session_completion_analytics_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_count BIGINT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE private.session_completion_analytics_state
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.session_completion_analytics_state (user_id, completed_count, updated_at)
SELECT history.user_id, COUNT(*), NOW()
FROM public.progress_logs AS history
GROUP BY history.user_id
ON CONFLICT (user_id) DO UPDATE
SET completed_count = EXCLUDED.completed_count,
    updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION private.capture_session_completion_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_completed_count BIGINT;
  v_duration_bucket TEXT;
  v_event_name TEXT;
BEGIN
  INSERT INTO private.session_completion_analytics_state AS milestone_state (
    user_id, completed_count, updated_at
  ) VALUES (
    NEW.user_id, 1, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET completed_count = milestone_state.completed_count + 1,
      updated_at = NOW()
  RETURNING completed_count INTO v_completed_count;

  IF v_completed_count = 1 THEN
    v_event_name := 'first_session_completed';
  ELSIF v_completed_count = 2 THEN
    v_event_name := 'second_session_completed';
  ELSE
    RETURN NEW;
  END IF;

  v_duration_bucket := CASE
    WHEN COALESCE(NEW.duration_minutes, 0) < 30 THEN 'short'
    WHEN NEW.duration_minutes <= 75 THEN 'medium'
    ELSE 'long'
  END;

  INSERT INTO public.product_events (
    event_name, anonymous_id, user_id, path, properties
  ) VALUES (
    v_event_name,
    gen_random_uuid(),
    NEW.user_id,
    '/session',
    jsonb_build_object(
      'path', '/session',
      'authenticated', TRUE,
      'duration_bucket', v_duration_bucket
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_session_completion_milestone()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_capture_session_completion_milestone ON public.progress_logs;
CREATE TRIGGER trg_capture_session_completion_milestone
AFTER INSERT ON public.progress_logs
FOR EACH ROW
EXECUTE FUNCTION private.capture_session_completion_milestone();

COMMIT;
