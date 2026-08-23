BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(21);

SELECT has_function(
  'public',
  'dismiss_current_notification_attention',
  ARRAY['text'],
  'atomic attention-dismissal RPC exists'
);
SELECT is(
  (
    SELECT procedure.prosecdef
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure.proname = 'dismiss_current_notification_attention'
      AND pg_get_function_identity_arguments(procedure.oid) = 'p_notice_key text'
  ),
  TRUE,
  'attention-dismissal RPC is security definer with an explicit owner scope'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.dismiss_current_notification_attention(text)',
    'EXECUTE'
  ),
  'authenticated users can execute the attention-dismissal RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.dismiss_current_notification_attention(text)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the attention-dismissal RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.dismiss_current_notification_attention(text)',
    'EXECUTE'
  ),
  'service role cannot forge a user attention dismissal'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('99999999-9999-4999-8999-999999999991', 'attention-owner@example.test', '{}'::jsonb),
  ('99999999-9999-4999-8999-999999999992', 'attention-other@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, timezone, last_check_in_at)
VALUES
  ('99999999-9999-4999-8999-999999999991', 'UTC', NOW() - INTERVAL '29 days'),
  ('99999999-9999-4999-8999-999999999992', 'UTC', NOW());
INSERT INTO public.workout_plans (id, user_id, is_active, ai_notes, updated_at)
VALUES
  (
    '99999999-9999-4999-8999-999999999901',
    '99999999-9999-4999-8999-999999999991',
    TRUE,
    'Current atomic plan notice.',
    NOW() - INTERVAL '1 day'
  ),
  (
    '99999999-9999-4999-8999-999999999902',
    '99999999-9999-4999-8999-999999999992',
    TRUE,
    'Other owner notice.',
    NOW() - INTERVAL '1 day'
  );
INSERT INTO public.dashboard_banners (slot, status, starts_on, ends_on, updated_at)
VALUES ('dashboard-primary', 'active', NULL, NULL, NOW() - INTERVAL '2 hours');

SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999991', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  public.dismiss_current_notification_attention((
    SELECT format(
      'plan-update:%s:%s',
      plan_row.id,
      to_char(plan_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )
    FROM public.workout_plans plan_row
    WHERE plan_row.id = '99999999-9999-4999-8999-999999999901'
  )),
  'current visible plan notice is dismissed atomically'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notification_attention_dismissals
    WHERE user_id = '99999999-9999-4999-8999-999999999991'
      AND notice_key LIKE 'plan-update:%'
  ),
  1::bigint,
  'current plan dismissal persists exactly one owner key'
);
SELECT ok(
  public.dismiss_current_notification_attention((
    SELECT notice_key
    FROM public.notification_attention_dismissals
    WHERE user_id = '99999999-9999-4999-8999-999999999991'
      AND notice_key LIKE 'plan-update:%'
  )),
  'repeating a current dismissal remains idempotent'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notification_attention_dismissals
    WHERE user_id = '99999999-9999-4999-8999-999999999991'
      AND notice_key LIKE 'plan-update:%'
  ),
  1::bigint,
  'repeated plan dismissal does not duplicate history'
);

RESET ROLE;
UPDATE public.workout_plans
SET ai_notes = NULL, updated_at = NOW()
WHERE id = '99999999-9999-4999-8999-999999999901';
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.dismiss_current_notification_attention((
    SELECT format(
      'plan-update:%s:%s',
      plan_row.id,
      to_char(plan_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )
    FROM public.workout_plans plan_row
    WHERE plan_row.id = '99999999-9999-4999-8999-999999999901'
  )),
  'plan without AI notes cannot persist a hidden notice key'
);

RESET ROLE;
UPDATE public.workout_plans
SET ai_notes = 'Expired notice.', updated_at = NOW() - INTERVAL '8 days'
WHERE id = '99999999-9999-4999-8999-999999999901';
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.dismiss_current_notification_attention((
    SELECT format(
      'plan-update:%s:%s',
      plan_row.id,
      to_char(plan_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )
    FROM public.workout_plans plan_row
    WHERE plan_row.id = '99999999-9999-4999-8999-999999999901'
  )),
  'expired plan notice cannot be dismissed'
);

RESET ROLE;
UPDATE public.workout_plans
SET ai_notes = 'New version.', updated_at = NOW()
WHERE id = '99999999-9999-4999-8999-999999999901';
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.dismiss_current_notification_attention(
    'plan-update:99999999-9999-4999-8999-999999999901:2026-08-01T00:00:00.000Z'
  ),
  'stale plan version is rejected at commit'
);
SELECT ok(
  NOT public.dismiss_current_notification_attention((
    SELECT format(
      'plan-update:%s:%s',
      plan_row.id,
      to_char(plan_row.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    )
    FROM public.workout_plans plan_row
    WHERE plan_row.id = '99999999-9999-4999-8999-999999999902'
  )),
  'another owner plan version cannot be dismissed'
);

SELECT ok(
  public.dismiss_current_notification_attention((
    SELECT 'check-in:' || to_char(
      profile.last_check_in_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
    FROM public.profiles profile
    WHERE profile.id = '99999999-9999-4999-8999-999999999991'
  )),
  'currently due check-in version is dismissed atomically'
);
RESET ROLE;
UPDATE public.profiles
SET last_check_in_at = NOW()
WHERE id = '99999999-9999-4999-8999-999999999991';
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.dismiss_current_notification_attention((
    SELECT 'check-in:' || to_char(
      profile.last_check_in_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
    FROM public.profiles profile
    WHERE profile.id = '99999999-9999-4999-8999-999999999991'
  )),
  'non-due check-in version is rejected'
);

SELECT ok(
  public.dismiss_current_notification_attention((
    SELECT 'promo:dashboard-primary:' || to_char(
      banner.updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
    FROM public.dashboard_banners banner
    WHERE banner.slot = 'dashboard-primary'
  )),
  'current visible promotion is dismissed atomically'
);
RESET ROLE;
UPDATE public.dashboard_banners SET status = 'paused' WHERE slot = 'dashboard-primary';
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.dismiss_current_notification_attention((
    SELECT 'promo:dashboard-primary:' || to_char(
      banner.updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
    FROM public.dashboard_banners banner
    WHERE banner.slot = 'dashboard-primary'
  )),
  'invisible promotion cannot be dismissed'
);
SELECT ok(
  NOT public.dismiss_current_notification_attention('not-a-notice-key'),
  'malformed notice key is rejected without persistence'
);

RESET ROLE;
UPDATE public.profiles
SET timezone = NULL
WHERE id = '99999999-9999-4999-8999-999999999991';
UPDATE public.dashboard_banners
SET status = 'active', starts_on = NULL, ends_on = NULL, updated_at = clock_timestamp()
WHERE slot = 'dashboard-primary';
SET LOCAL ROLE authenticated;
SELECT ok(
  NOT public.dismiss_current_notification_attention((
    SELECT 'promo:dashboard-primary:' || to_char(
      banner.updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
    FROM public.dashboard_banners banner
    WHERE banner.slot = 'dashboard-primary'
  )),
  'direct RPC rejects a profile without a canonical timezone'
);
RESET ROLE;
UPDATE public.profiles
SET timezone = 'Pacific/Kiritimati'
WHERE id = '99999999-9999-4999-8999-999999999991';
SET LOCAL ROLE authenticated;
SELECT ok(
  public.dismiss_current_notification_attention((
    SELECT 'promo:dashboard-primary:' || to_char(
      banner.updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
    FROM public.dashboard_banners banner
    WHERE banner.slot = 'dashboard-primary'
  )),
  'persisted non-Havana fallback becomes the canonical profile timezone'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.notification_attention_dismissals
    WHERE user_id = '99999999-9999-4999-8999-999999999991'
  ),
  4::bigint,
  'only the four current visible notice versions were persisted'
);

SELECT * FROM finish();
ROLLBACK;
