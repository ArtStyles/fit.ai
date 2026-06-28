-- 025_social_push_notifications.sql
-- MVP de notificaciones push para eventos sociales.

CREATE TABLE social_push_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE,
  platform     TEXT        NOT NULL CHECK (platform IN ('android', 'ios')),
  device_id    TEXT,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_social_push_tokens_user_enabled
  ON social_push_tokens(user_id, enabled);

CREATE TABLE social_notification_preferences (
  user_id                 UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  likes_enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
  comments_enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
  follows_enabled         BOOLEAN     NOT NULL DEFAULT TRUE,
  follow_requests_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION touch_social_push_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_social_push_tokens_updated_at ON social_push_tokens;
CREATE TRIGGER trg_social_push_tokens_updated_at
  BEFORE UPDATE ON social_push_tokens
  FOR EACH ROW EXECUTE FUNCTION touch_social_push_updated_at();

DROP TRIGGER IF EXISTS trg_social_notification_preferences_updated_at ON social_notification_preferences;
CREATE TRIGGER trg_social_notification_preferences_updated_at
  BEFORE UPDATE ON social_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION touch_social_push_updated_at();

ALTER TABLE social_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "social_push_tokens: read own" ON social_push_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "social_push_tokens: insert own" ON social_push_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_push_tokens: update own" ON social_push_tokens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_push_tokens: delete own" ON social_push_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "social_notification_preferences: read own" ON social_notification_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "social_notification_preferences: insert own" ON social_notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "social_notification_preferences: update own" ON social_notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
