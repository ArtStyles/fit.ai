-- 022_follows.sql
-- Red social Fase 2: grafo de seguidores.
-- Ejecutar en: Supabase Dashboard > SQL Editor

CREATE TABLE follows (
  follower_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- La PK cubre la dirección "a quién sigo" (follower_id); este índice cubre
-- "quién me sigue" (following_id), usado por el contador de seguidores.
CREATE INDEX idx_follows_following ON follows(following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follows: read" ON follows
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "follows: insert own" ON follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "follows: delete own" ON follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);
