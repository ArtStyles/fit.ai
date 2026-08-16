DROP POLICY IF EXISTS "product_notification_preferences: insert own"
  ON public.product_notification_preferences;
CREATE POLICY "product_notification_preferences: insert own"
  ON public.product_notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

GRANT INSERT (user_id, professional_enabled, push_enabled)
  ON TABLE public.product_notification_preferences TO authenticated;
