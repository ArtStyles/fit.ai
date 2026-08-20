-- ============================================================
-- Migration 052: persistent, user-owned attention dismissals
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_attention_dismissals (
  user_id UUID NOT NULL DEFAULT auth.uid()
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  notice_key TEXT NOT NULL
    CHECK (char_length(notice_key) BETWEEN 1 AND 160),
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notice_key)
);

ALTER TABLE public.notification_attention_dismissals OWNER TO postgres;
ALTER TABLE public.notification_attention_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_attention_dismissals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_attention_dismissals: read own"
  ON public.notification_attention_dismissals;
CREATE POLICY "notification_attention_dismissals: read own"
  ON public.notification_attention_dismissals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_attention_dismissals: insert own"
  ON public.notification_attention_dismissals;
CREATE POLICY "notification_attention_dismissals: insert own"
  ON public.notification_attention_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.notification_attention_dismissals
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_attention_dismissals TO authenticated;
GRANT INSERT (notice_key)
  ON TABLE public.notification_attention_dismissals TO authenticated;

COMMENT ON TABLE public.notification_attention_dismissals IS
  'Immutable acknowledgement keys for derived user attention notices.';
COMMENT ON COLUMN public.notification_attention_dismissals.notice_key IS
  'Stable notice version key such as plan-update:<plan-id>:<updated-at>.';
