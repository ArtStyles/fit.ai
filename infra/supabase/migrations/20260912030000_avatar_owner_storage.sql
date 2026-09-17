-- Android uploads through the signed-in account, without a server service key.
-- Match the stable path used by the web too: legacy uploads can have no owner_id.
-- Keep public delivery; enforce the same size limit as the avatar form at Storage.
BEGIN;

UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/webp','image/jpeg','image/png']
WHERE id = 'avatars';

DROP POLICY IF EXISTS "avatars: active owner select" ON storage.objects;
CREATE POLICY "avatars: active owner select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name = (SELECT auth.uid())::text || '/avatar.webp'
    AND public.is_account_active((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "avatars: active owner insert" ON storage.objects;
CREATE POLICY "avatars: active owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name = (SELECT auth.uid())::text || '/avatar.webp'
    AND public.is_account_active((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "avatars: active owner update" ON storage.objects;
CREATE POLICY "avatars: active owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name = (SELECT auth.uid())::text || '/avatar.webp'
    AND public.is_account_active((SELECT auth.uid()))
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND name = (SELECT auth.uid())::text || '/avatar.webp'
    AND public.is_account_active((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "avatars: active owner delete" ON storage.objects;
CREATE POLICY "avatars: active owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND name = (SELECT auth.uid())::text || '/avatar.webp'
    AND public.is_account_active((SELECT auth.uid()))
  );

COMMIT;
