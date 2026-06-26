-- 024_private_accounts.sql
-- Cuentas privadas: is_private + post_count en profiles, status en follows,
-- RLS de posts por privacidad. Ejecutar en Supabase → SQL Editor.

-- 1) profiles: columnas
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS post_count INTEGER NOT NULL DEFAULT 0;

-- 2) follows: estado
ALTER TABLE follows ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('accepted','pending'));
CREATE INDEX IF NOT EXISTS idx_follows_following_status ON follows(following_id, status);

-- 3) backfill post_count
UPDATE profiles p SET post_count = (
  SELECT count(*) FROM posts po WHERE po.user_id = p.id AND po.removed_at IS NULL
);

-- 4) trigger post_count (SECURITY DEFINER, como los contadores de likes/comentarios)
CREATE OR REPLACE FUNCTION bump_profile_post_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE profiles SET post_count = post_count + 1 WHERE id = NEW.user_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_posts_profile_count ON posts;
CREATE TRIGGER trg_posts_profile_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION bump_profile_post_count();

-- 5) recrear public_profiles con las columnas nuevas (ANTES de la política de posts)
DROP VIEW IF EXISTS public_profiles;
CREATE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url, is_private, post_count FROM profiles;
GRANT SELECT ON public_profiles TO authenticated;

-- 6) RLS de posts: añade la regla de privacidad
DROP POLICY IF EXISTS "posts: read visible" ON posts;
CREATE POLICY "posts: read visible" ON posts
  FOR SELECT TO authenticated
  USING (
    removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.user_id)
         OR (b.blocker_id = posts.user_id AND b.blocked_id = auth.uid())
    )
    AND (
      auth.uid() = posts.user_id
      OR EXISTS (SELECT 1 FROM public_profiles pp WHERE pp.id = posts.user_id AND pp.is_private = FALSE)
      OR EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = auth.uid() AND f.following_id = posts.user_id AND f.status = 'accepted'
      )
    )
  );

-- 7) follows: el seguido puede aceptar (UPDATE) o rechazar (DELETE)
CREATE POLICY "follows: followed can accept" ON follows
  FOR UPDATE TO authenticated
  USING (auth.uid() = following_id) WITH CHECK (auth.uid() = following_id);
CREATE POLICY "follows: followed can reject" ON follows
  FOR DELETE TO authenticated USING (auth.uid() = following_id);
