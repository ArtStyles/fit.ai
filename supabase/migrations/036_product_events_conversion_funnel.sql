ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_event_name_check,
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
    'second_session_completed',
    'plan_adjustment_used',
    'organic_page_cta_clicked',
    'paywall_viewed',
    'checkout_started',
    'pro_interest_submitted'
  ));

ALTER TABLE public.product_events
  DROP CONSTRAINT IF EXISTS product_events_path_check,
  ADD CONSTRAINT product_events_path_check CHECK (
    path IS NULL
    OR path IN ('/', '/es', '/en', '/register', '/onboarding', '/pricing', '/session')
  );
