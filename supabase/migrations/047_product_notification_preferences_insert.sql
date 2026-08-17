DROP POLICY IF EXISTS "product_notification_preferences: insert own"
  ON public.product_notification_preferences;
CREATE POLICY "product_notification_preferences: insert own"
  ON public.product_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.product_notification_preferences
  ALTER COLUMN user_id SET DEFAULT auth.uid();

REVOKE INSERT (user_id)
  ON TABLE public.product_notification_preferences FROM authenticated;
GRANT INSERT (professional_enabled, push_enabled)
  ON TABLE public.product_notification_preferences TO authenticated;
