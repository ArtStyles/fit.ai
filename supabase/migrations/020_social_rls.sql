-- 020_social_rls.sql
-- RLS para tablas sociales + vista public_profiles (no expone datos físicos).

ALTER TABLE posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks   ENABLE ROW LEVEL SECURITY;

-- POSTS: lectura pública (autenticados), visible si no removido y sin bloqueo mutuo
CREATE POLICY "posts: read visible" ON posts
  FOR SELECT TO authenticated
  USING (
    removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = posts.user_id)
         OR (b.blocker_id = posts.user_id AND b.blocked_id = auth.uid())
    )
  );
CREATE POLICY "posts: insert own" ON posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- (Sin política UPDATE para 'authenticated': no hay edición de posts en Fase 1.
--  Los contadores los actualiza un trigger SECURITY DEFINER (bypassa RLS) y
--  removed_at (moderación) se fija solo desde service-role. Así un autor no puede
--  des-ocultar su propio post moderado.)
CREATE POLICY "posts: delete own" ON posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LIKES: lectura autenticada; escritura/borrado propio
CREATE POLICY "post_likes: read" ON post_likes
  FOR SELECT TO authenticated USING (true);
-- INSERT valida también que el post sea visible (no removido y sin bloqueo mutuo),
-- porque las políticas SELECT de 'posts' no restringen los INSERT de otras tablas.
CREATE POLICY "post_likes: insert own" ON post_likes
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = post_likes.post_id
        AND p.removed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.user_id)
             OR (b.blocker_id = p.user_id AND b.blocked_id = auth.uid())
        )
    )
  );
CREATE POLICY "post_likes: delete own" ON post_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- COMENTARIOS: lectura visible (sin removidos ni bloqueos); escritura/borrado propio
-- Nota: removed_at (moderación) se fija solo desde Server Actions con service-role (bypass RLS).
CREATE POLICY "post_comments: read visible" ON post_comments
  FOR SELECT TO authenticated
  USING (
    removed_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = post_comments.user_id)
         OR (b.blocker_id = post_comments.user_id AND b.blocked_id = auth.uid())
    )
  );
CREATE POLICY "post_comments: insert own" ON post_comments
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = post_comments.post_id
        AND p.removed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.user_id)
             OR (b.blocker_id = p.user_id AND b.blocked_id = auth.uid())
        )
    )
  );
CREATE POLICY "post_comments: delete own" ON post_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- REPORTES: solo insertar como uno mismo; sin lectura desde cliente
CREATE POLICY "post_reports: insert own" ON post_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- BLOQUEOS: todo restringido al propio bloqueador
CREATE POLICY "user_blocks: own" ON user_blocks
  FOR ALL TO authenticated
  USING (auth.uid() = blocker_id) WITH CHECK (auth.uid() = blocker_id);

-- VISTA: perfiles públicos (solo columnas no sensibles)
-- Vista con seguridad de propietario (NO security_invoker): es intencional. Expone
-- solo 4 columnas no sensibles a cualquier autenticado, manteniendo el RLS solo-dueño
-- de 'profiles' para el resto de columnas (peso, altura, etc.). No ampliar la lista
-- de columnas sin revisar privacidad.
CREATE VIEW public_profiles AS
  SELECT id, username, full_name, avatar_url FROM profiles;
GRANT SELECT ON public_profiles TO authenticated;
