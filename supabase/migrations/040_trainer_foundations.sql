-- ============================================================
-- Migration 040: product notifications and professional audit foundation
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  dedupe_key TEXT NOT NULL CHECK (dedupe_key <> ''),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_notifications_user_dedupe_key_unique UNIQUE (user_id, dedupe_key),
  CONSTRAINT product_notifications_internal_url_check CHECK (url IS NULL OR url LIKE '/%'),
  CONSTRAINT product_notifications_read_after_create_check CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX IF NOT EXISTS product_notifications_user_created_idx
  ON public.product_notifications (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS product_notifications_user_unread_idx
  ON public.product_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.product_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (token <> ''),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  device_id TEXT NOT NULL CHECK (device_id <> ''),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_push_tokens_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS product_push_tokens_user_enabled_idx
  ON public.product_push_tokens (user_id, enabled, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.product_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  professional_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.professional_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  subject_user_id UUID,
  entity_type TEXT NOT NULL CHECK (entity_type <> ''),
  entity_id UUID,
  action TEXT NOT NULL CHECK (action <> ''),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS professional_audit_logs_subject_created_idx
  ON public.professional_audit_logs (subject_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS professional_audit_logs_entity_created_idx
  ON public.professional_audit_logs (entity_type, entity_id, created_at DESC);

ALTER TABLE public.product_notifications OWNER TO postgres;
ALTER TABLE public.product_push_tokens OWNER TO postgres;
ALTER TABLE public.product_notification_preferences OWNER TO postgres;
ALTER TABLE public.professional_audit_logs OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.touch_product_notification_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_push_tokens_updated_at ON public.product_push_tokens;
CREATE TRIGGER trg_product_push_tokens_updated_at
  BEFORE UPDATE ON public.product_push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.touch_product_notification_updated_at();

DROP TRIGGER IF EXISTS trg_product_notification_preferences_updated_at ON public.product_notification_preferences;
CREATE TRIGGER trg_product_notification_preferences_updated_at
  BEFORE UPDATE ON public.product_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_product_notification_updated_at();

CREATE OR REPLACE FUNCTION public.provision_product_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.product_notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_product_notification_preferences ON public.profiles;
CREATE TRIGGER trg_provision_product_notification_preferences
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.provision_product_notification_preferences();

INSERT INTO public.product_notification_preferences (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.product_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_notifications: read own" ON public.product_notifications;
CREATE POLICY "product_notifications: read own"
  ON public.product_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_notifications: update own read state" ON public.product_notifications;
CREATE POLICY "product_notifications: update own read state"
  ON public.product_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_push_tokens: read own" ON public.product_push_tokens;
CREATE POLICY "product_push_tokens: read own"
  ON public.product_push_tokens
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_push_tokens: insert own" ON public.product_push_tokens;
CREATE POLICY "product_push_tokens: insert own"
  ON public.product_push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_push_tokens: update own" ON public.product_push_tokens;
CREATE POLICY "product_push_tokens: update own"
  ON public.product_push_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_notification_preferences: read own" ON public.product_notification_preferences;
CREATE POLICY "product_notification_preferences: read own"
  ON public.product_notification_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "product_notification_preferences: update own" ON public.product_notification_preferences;
CREATE POLICY "product_notification_preferences: update own"
  ON public.product_notification_preferences
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.product_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_push_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_notification_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.professional_audit_logs FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.product_notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.product_notifications TO authenticated;

GRANT SELECT, INSERT ON TABLE public.product_push_tokens TO authenticated;
GRANT UPDATE (token, platform, device_id, enabled, last_seen_at)
  ON TABLE public.product_push_tokens TO authenticated;

GRANT SELECT ON TABLE public.product_notification_preferences TO authenticated;
GRANT UPDATE (professional_enabled, push_enabled)
  ON TABLE public.product_notification_preferences TO authenticated;

GRANT ALL ON TABLE public.product_notifications TO service_role;
GRANT ALL ON TABLE public.product_push_tokens TO service_role;
GRANT ALL ON TABLE public.product_notification_preferences TO service_role;
GRANT ALL ON TABLE public.professional_audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.create_product_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_url TEXT,
  p_dedupe_key TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS public.product_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  notification public.product_notifications%ROWTYPE;
BEGIN
  INSERT INTO public.product_notifications (
    user_id,
    type,
    title,
    body,
    url,
    payload,
    dedupe_key
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_body,
    p_url,
    COALESCE(p_payload, '{}'::JSONB),
    p_dedupe_key
  )
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING * INTO notification;

  IF notification.id IS NULL THEN
    SELECT * INTO STRICT notification
    FROM public.product_notifications
    WHERE user_id = p_user_id
      AND dedupe_key = p_dedupe_key;
  END IF;

  RETURN notification;
END;
$$;

ALTER FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

COMMENT ON TABLE public.product_notifications IS
  'Persistent in-app notifications for product and professional workflows.';
COMMENT ON TABLE public.product_push_tokens IS
  'Private per-device delivery tokens for general product notifications.';
COMMENT ON TABLE public.product_notification_preferences IS
  'Per-user opt-in state for professional and native product notifications.';
COMMENT ON TABLE public.professional_audit_logs IS
  'Private append-oriented audit evidence for professional workflow changes.';
