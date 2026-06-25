-- 019_social_posts.sql
-- Red social Fase 1: posts, likes, comentarios, reportes, bloqueos.
-- Ejecutar en: Supabase Dashboard > SQL Editor

-- ─── POSTS ────────────────────────────────────────────────
CREATE TABLE posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body             TEXT,
  photo_urls       TEXT[]      NOT NULL DEFAULT '{}',
  session_snapshot JSONB,
  routine_snapshot JSONB,
  like_count       INTEGER     NOT NULL DEFAULT 0,
  comment_count    INTEGER     NOT NULL DEFAULT 0,
  removed_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT posts_has_content CHECK (
    body IS NOT NULL
    OR array_length(photo_urls, 1) IS NOT NULL
    OR session_snapshot IS NOT NULL
    OR routine_snapshot IS NOT NULL
  )
);
CREATE INDEX idx_posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX idx_posts_user    ON posts(user_id);

-- ─── LIKES ────────────────────────────────────────────────
CREATE TABLE post_likes (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ─── COMENTARIOS ──────────────────────────────────────────
CREATE TABLE post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_post_comments_post ON post_comments(post_id, created_at);

-- ─── REPORTES ─────────────────────────────────────────────
CREATE TABLE post_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  comment_id  UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT report_target CHECK (num_nonnulls(post_id, comment_id) = 1)
);

-- ─── BLOQUEOS ─────────────────────────────────────────────
CREATE TABLE user_blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- Índice para la dirección inversa del predicado de bloqueo (la PK cubre
-- blocker_id; esto cubre blocked_id, usado en cada política de visibilidad).
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id, blocker_id);

-- ─── CONTADORES (triggers) ────────────────────────────────
CREATE OR REPLACE FUNCTION bump_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_post_likes_count
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION bump_post_like_count();

CREATE OR REPLACE FUNCTION bump_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON post_comments
  FOR EACH ROW EXECUTE FUNCTION bump_post_comment_count();
