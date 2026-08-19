BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(16);

SELECT lives_ok(
  $$INSERT INTO public.product_events (event_name, anonymous_id, path) VALUES
      ('second_session_completed', gen_random_uuid(), '/session'),
      ('paywall_viewed', gen_random_uuid(), '/pricing'),
      ('checkout_started', gen_random_uuid(), '/pricing'),
      ('pro_interest_submitted', gen_random_uuid(), '/pricing')$$,
  'all exact conversion funnel events are accepted'
);

SELECT lives_ok(
  $$INSERT INTO public.product_events (event_name, anonymous_id, path) VALUES
      ('landing_view', gen_random_uuid(), '/'),
      ('primary_cta_clicked', gen_random_uuid(), '/es'),
      ('language_changed', gen_random_uuid(), '/en'),
      ('signup_started', gen_random_uuid(), '/register'),
      ('signup_completed', gen_random_uuid(), '/register'),
      ('onboarding_step_completed', gen_random_uuid(), '/onboarding'),
      ('onboarding_abandoned', gen_random_uuid(), '/onboarding'),
      ('plan_generated', gen_random_uuid(), '/onboarding'),
      ('first_session_started', gen_random_uuid(), NULL),
      ('first_session_completed', gen_random_uuid(), NULL),
      ('plan_adjustment_used', gen_random_uuid(), NULL),
      ('organic_page_cta_clicked', gen_random_uuid(), '/'),
      ('coach_overview_viewed', gen_random_uuid(), NULL),
      ('coach_client_insights_viewed', gen_random_uuid(), NULL),
      ('coach_alert_filter_used', gen_random_uuid(), NULL)$$,
  'every pre-050 event and path remains accepted'
);

SELECT throws_ok(
  $$INSERT INTO public.product_events (event_name, anonymous_id) VALUES
      ('conversion_unknown', gen_random_uuid())$$,
  '23514', NULL,
  'an unknown conversion event remains rejected'
);

SELECT lives_ok(
  $$INSERT INTO public.product_events (event_name, anonymous_id, path) VALUES
      ('paywall_viewed', gen_random_uuid(), '/pricing')$$,
  'the normalized pricing path is accepted'
);

SELECT lives_ok(
  $$INSERT INTO public.product_events (event_name, anonymous_id, path) VALUES
      ('second_session_completed', gen_random_uuid(), '/session')$$,
  'the normalized session path is accepted'
);

SELECT throws_ok(
  $$INSERT INTO public.product_events (event_name, anonymous_id, path) VALUES
      ('second_session_completed', gen_random_uuid(), '/session/private-id')$$,
  '23514', NULL,
  'a session identifier cannot enter the analytics path'
);

SELECT ok(
  (SELECT bool_and(convalidated)
   FROM pg_constraint
   WHERE conrelid = 'public.product_events'::regclass
     AND conname IN ('product_events_event_name_check', 'product_events_path_check')),
  'both conversion allowlist constraints are validated'
);

SELECT is(
  (SELECT completed_count::INTEGER
   FROM private.session_completion_analytics_state
   WHERE user_id = 'f5000000-0000-4000-8000-000000000001'),
  1,
  'migration 050 initializes the private ordinal from existing session history'
);

SELECT lives_ok(
  $$INSERT INTO public.progress_logs (id, user_id, completed_at, duration_minutes) VALUES
      ('f5000000-0000-4000-8000-000000000102', 'f5000000-0000-4000-8000-000000000001', NOW(), 42)$$,
  'an existing user can commit the authoritative second session'
);

SELECT is(
  (SELECT event_name
   FROM public.product_events
   WHERE user_id = 'f5000000-0000-4000-8000-000000000001'),
  'second_session_completed',
  'existing history emits the real second milestone instead of a browser-local first'
);

SELECT lives_ok(
  $$INSERT INTO public.progress_logs (id, user_id, completed_at, duration_minutes) VALUES
      ('f5000000-0000-4000-8000-000000000103', 'f5000000-0000-4000-8000-000000000001', NOW(), 80)$$,
  'sessions beyond the second remain writable'
);

SELECT is(
  (SELECT COUNT(*)::INTEGER
   FROM public.product_events
   WHERE user_id = 'f5000000-0000-4000-8000-000000000001'),
  1,
  'the third completion does not emit another early-session milestone'
);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('f5000000-0000-4000-8000-000000000002', 'conversion-new@example.test', '{}'::JSONB);
INSERT INTO public.profiles (id, full_name, onboarding_done, account_status) VALUES
  ('f5000000-0000-4000-8000-000000000002', 'Conversion new user', TRUE, 'active');

SELECT lives_ok(
  $$INSERT INTO public.progress_logs (id, user_id, completed_at, duration_minutes) VALUES
      ('f5000000-0000-4000-8000-000000000201', 'f5000000-0000-4000-8000-000000000002', NOW() - INTERVAL '2 minutes', 12),
      ('f5000000-0000-4000-8000-000000000202', 'f5000000-0000-4000-8000-000000000002', NOW() - INTERVAL '1 minute', 55),
      ('f5000000-0000-4000-8000-000000000203', 'f5000000-0000-4000-8000-000000000002', NOW(), 90)$$,
  'a new user can commit three sessions through the serialized counter'
);

SELECT is(
  (SELECT ARRAY_AGG(event_name ORDER BY occurred_at, event_name)
   FROM public.product_events
   WHERE user_id = 'f5000000-0000-4000-8000-000000000002'),
  ARRAY['first_session_completed', 'second_session_completed'],
  'only the authoritative first and second milestones are emitted'
);

SELECT ok(
  (SELECT BOOL_AND(
      path = '/session'
      AND properties - ARRAY['path', 'authenticated', 'duration_bucket'] = '{}'::JSONB
      AND properties->>'path' = '/session'
      AND properties->>'authenticated' = 'true'
      AND properties->>'duration_bucket' IN ('short', 'medium', 'long')
      AND properties::TEXT NOT LIKE '%f5000000-%'
    )
   FROM public.product_events
   WHERE user_id = 'f5000000-0000-4000-8000-000000000002'),
  'milestone payloads are canonical and contain no session or progress identifiers'
);

SELECT ok(
  NOT has_table_privilege('anon', 'private.session_completion_analytics_state', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'private.session_completion_analytics_state', 'SELECT')
  AND NOT has_table_privilege('service_role', 'private.session_completion_analytics_state', 'SELECT'),
  'the authoritative ordinal state has no API-role read surface'
);

SELECT * FROM finish();
ROLLBACK;
