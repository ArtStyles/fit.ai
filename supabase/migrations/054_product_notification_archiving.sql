-- ============================================================
-- Migration 054: soft-archive product notifications
-- ============================================================

ALTER TABLE public.product_notifications
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS product_notifications_user_visible_created_idx
  ON public.product_notifications (user_id, created_at DESC, id DESC)
  WHERE dismissed_at IS NULL;

REVOKE UPDATE (dismissed_at)
  ON public.product_notifications FROM authenticated;
GRANT UPDATE (dismissed_at)
  ON public.product_notifications TO authenticated;

COMMENT ON COLUMN public.product_notifications.dismissed_at IS
  'Owner-controlled soft-archive timestamp; archived rows remain durable evidence.';
