-- ============================================================
-- Migration 029: owner admin, subscriptions and account status
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'suspended'));

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id UUID       REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT        NOT NULL,
  reason        TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_created
  ON admin_audit_logs(target_user_id, created_at DESC);

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_audit_logs FROM anon, authenticated;
GRANT ALL ON admin_audit_logs TO service_role;

-- Protected profile fields can only be changed by service_role or by the
-- verified owner account. The owner row is always admin, Pro and active.
CREATE OR REPLACE FUNCTION enforce_protected_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_email TEXT;
  requester_email TEXT;
  requester_role TEXT;
BEGIN
  SELECT LOWER(email) INTO target_email FROM auth.users WHERE id = NEW.id;
  SELECT LOWER(email) INTO requester_email FROM auth.users WHERE id = auth.uid();
  requester_role := COALESCE(auth.role(), '');

  IF target_email = 'fejames07@gmail.com' THEN
    NEW.is_admin := TRUE;
    NEW.subscription_tier := 'pro';
    NEW.account_status := 'active';
    NEW.suspension_reason := NULL;
    NEW.suspended_at := NULL;
    NEW.suspended_until := NULL;
    NEW.suspended_by := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF requester_role <> 'service_role' AND requester_email <> 'fejames07@gmail.com' THEN
      NEW.is_admin := FALSE;
      NEW.subscription_tier := 'free';
      NEW.account_status := 'active';
      NEW.suspension_reason := NULL;
      NEW.suspended_at := NULL;
      NEW.suspended_until := NULL;
      NEW.suspended_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF requester_role <> 'service_role' AND requester_email <> 'fejames07@gmail.com' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.account_status := OLD.account_status;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.suspended_at := OLD.suspended_at;
    NEW.suspended_until := OLD.suspended_until;
    NEW.suspended_by := OLD.suspended_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_protected_profile_fields ON profiles;
CREATE TRIGGER trg_enforce_protected_profile_fields
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_protected_profile_fields();

-- A restrictive RLS gate is combined with each table's existing permissive
-- policies. This prevents suspended users from bypassing the application and
-- operating directly against Supabase with their authenticated token.
CREATE OR REPLACE FUNCTION is_account_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user_id
      AND (
        LOWER(u.email) = 'fejames07@gmail.com'
        OR p.account_status = 'active'
        OR (p.account_status = 'suspended' AND p.suspended_until <= NOW())
      )
  );
$$;

REVOKE ALL ON FUNCTION is_account_active(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_account_active(UUID) TO authenticated, service_role;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'exercises',
    'workout_plans',
    'workouts',
    'workout_exercises',
    'progress_logs',
    'exercise_logs',
    'measurements',
    'ai_conversations',
    'ai_messages',
    'posts',
    'post_likes',
    'post_comments',
    'post_reports',
    'user_blocks',
    'follows',
    'social_push_tokens',
    'social_notification_preferences'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "account must be active" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "account must be active" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()))',
      table_name
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "active account profile updates" ON profiles;
CREATE POLICY "active account profile updates"
  ON profiles AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

-- Backfill the existing owner account. The trigger also keeps this invariant
-- on every future update.
UPDATE profiles AS p
SET
  is_admin = TRUE,
  subscription_tier = 'pro',
  account_status = 'active',
  suspension_reason = NULL,
  suspended_at = NULL,
  suspended_until = NULL,
  suspended_by = NULL
FROM auth.users AS u
WHERE p.id = u.id
  AND LOWER(u.email) = 'fejames07@gmail.com';

COMMENT ON COLUMN profiles.is_admin IS
  'Administrative access flag. Protected by trg_enforce_protected_profile_fields.';
COMMENT ON COLUMN profiles.account_status IS
  'Access state managed by administrators: active or suspended.';
COMMENT ON TABLE admin_audit_logs IS
  'Immutable operational log for administrative account and subscription actions.';
