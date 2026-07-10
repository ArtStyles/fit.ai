CREATE TABLE public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_name TEXT NOT NULL CHECK (event_name IN (
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
  )),
  anonymous_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locale TEXT CHECK (locale IN ('es', 'en')),
  path TEXT CHECK (path IS NULL OR path IN ('/', '/es', '/en', '/register', '/onboarding', '/pricing', '/session')),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
-- Deliberately no anon/authenticated policies: only the server service role writes events.

CREATE INDEX product_events_occurred_at_idx
  ON public.product_events (occurred_at DESC);
CREATE INDEX product_events_name_idx
  ON public.product_events (event_name, occurred_at DESC);
