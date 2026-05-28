-- ============================================================
-- Migration 009: reset local test accounts
-- ============================================================
-- DEV/TEST ONLY.
--
-- Deletes selected auth users so the full signup -> onboarding ->
-- first-plan flow can be tested again with the same email addresses.
--
-- Cascades handled by schema:
--   auth.users -> profiles, workout_plans, workouts, progress_logs,
--   measurements, ai_conversations, and their dependent rows.
--
-- ai_usage_logs is deleted first because its user FK uses ON DELETE SET NULL.
-- ============================================================

DO $$
DECLARE
  target_emails TEXT[] := ARRAY[
    'hernandezfrankjames@gmail.com'
  ];
  target_user_ids UUID[];
  deleted_count INTEGER := 0;
BEGIN
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[])
  INTO target_user_ids
  FROM auth.users
  WHERE email = ANY(target_emails);

  IF COALESCE(ARRAY_LENGTH(target_user_ids, 1), 0) = 0 THEN
    RAISE NOTICE 'No matching test accounts found for reset.';
    RETURN;
  END IF;

  DELETE FROM public.ai_usage_logs
  WHERE user_id = ANY(target_user_ids);

  DELETE FROM auth.users
  WHERE id = ANY(target_user_ids);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Reset % test account(s): %', deleted_count, target_emails;
END $$;
