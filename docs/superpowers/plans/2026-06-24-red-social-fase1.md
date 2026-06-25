# Red Social FitAI — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir los cimientos de una red social a FitAI — publicar (foto/sesión/rutina/texto), likes, comentarios, feed Descubrir global, perfiles públicos, clonar rutinas y moderación base — sin tocar el código nativo.

**Architecture:** Tablas nuevas en Supabase con RLS de lectura pública (autenticados) y escritura solo-dueño; el contenido compartido se guarda como **snapshot `jsonb`** para no exponer las tablas privadas. La lógica pura (snapshots, clonado, paginación) vive en `src/lib/social/` con tests vitest; las Server Actions en `src/app/actions/` siguen el patrón existente (`createClient` para usuario, `createServiceClient` para storage/bypass). La UI en `src/components/social/` y rutas bajo `src/app/(app)/`.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + RLS + Storage), TypeScript, Tailwind, Radix UI, framer-motion, vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-24-red-social-fase1-design.md`

---

## Estructura de archivos

**Migraciones** (`supabase/migrations/`)
- `019_social_posts.sql` — tablas `posts`, `post_likes`, `post_comments`, `post_reports`, `user_blocks` + índices + triggers de contadores.
- `020_social_rls.sql` — políticas RLS de las 5 tablas + vista `public_profiles`.
- `021_posts_bucket.sql` — bucket público `posts`.

**Tipos**
- `src/types/database.ts` — añadir Row/Insert/Update de las 5 tablas + `public_profiles`.

**Lógica pura (TDD)** — `src/lib/social/`
- `snapshots.ts` — `buildSessionSnapshot`, `buildRoutineSnapshot` + tipos.
- `clone.ts` — `buildPlanInsert`, `buildWorkoutInsert`, `buildWorkoutExerciseInserts`.
- `feed.ts` — `encodeCursor`, `decodeCursor`, `FEED_PAGE_SIZE`.
- `types.ts` — tipos compartidos (`PostAuthor`, `FeedPost`, `FeedPage`, `PostCommentView`).
- `__tests__/snapshots.test.ts`, `__tests__/clone.test.ts`, `__tests__/feed.test.ts`.
- `src/lib/images/post.ts` (+ `__tests__/post.test.ts`) — validación/ruta de fotos.

**Server Actions** — `src/app/actions/`
- `posts.ts` — `createPost`, `createPostFromSession`, `deletePost`, `clonePlanFromPost`.
- `feed.ts` — `getDiscoverFeed`, `getUserPosts`, `getPostDetail`.
- `engagement.ts` — `toggleLike`, `addComment`, `deleteComment`.
- `moderation.ts` — `reportContent`, `blockUser`, `unblockUser`.

**UI** — `src/components/social/`
- `PostCard.tsx`, `PostMedia.tsx`, `SessionCard.tsx`, `RoutineCard.tsx`, `LikeButton.tsx`,
  `CommentList.tsx`, `CommentInput.tsx`, `PostComposer.tsx`, `PostMenu.tsx`, `ReportDialog.tsx`,
  `DiscoverFeed.tsx`.

**Rutas** — `src/app/(app)/`
- `feed/page.tsx`, `feed/new/page.tsx`, `u/[username]/page.tsx`, `post/[id]/page.tsx`.

**Navegación**
- `src/components/navigation/BottomNav.tsx` — añadir pestaña "Comunidad".

---

## Notas de ejecución

- **Gestor de paquetes: `pnpm`** (npm falla con ERESOLVE).
- Las migraciones SQL se aplican manualmente en **Supabase → SQL Editor** (igual que las existentes). "Verificar" = ejecutar el SQL y correr el `SELECT` de comprobación indicado.
- Type-check: `pnpm type-check`. Tests: `pnpm test`.
- Las queries en este repo castean con `(supabase.from('x') as any)`; se mantiene ese estilo.

---

## Task 1: Migración de tablas sociales

**Files:**
- Create: `supabase/migrations/019_social_posts.sql`

- [ ] **Step 1: Escribir la migración**

```sql
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
```

- [ ] **Step 2: Aplicar y verificar**

Aplicar el SQL en Supabase → SQL Editor. Verificar:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('posts','post_likes','post_comments','post_reports','user_blocks')
ORDER BY table_name;
```
Esperado: 5 filas.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/019_social_posts.sql
git commit -m "feat(social): migración de tablas posts/likes/comentarios/reportes/bloqueos"
```

---

## Task 2: Migración de RLS + vista de perfiles públicos

**Files:**
- Create: `supabase/migrations/020_social_rls.sql`

- [ ] **Step 1: Escribir la migración**

```sql
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
```

- [ ] **Step 2: Aplicar y verificar**

Aplicar en SQL Editor. Verificar políticas y vista:

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('posts','post_likes','post_comments','post_reports','user_blocks')
ORDER BY tablename, policyname;

SELECT column_name FROM information_schema.columns
WHERE table_name='public_profiles' ORDER BY column_name;
```
Esperado: las políticas listadas y la vista con exactamente `avatar_url, full_name, id, username` (sin peso/altura/fecha).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/020_social_rls.sql
git commit -m "feat(social): RLS de tablas sociales y vista public_profiles"
```

---

## Task 3: Migración del bucket de fotos

**Files:**
- Create: `supabase/migrations/021_posts_bucket.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- 021_posts_bucket.sql
-- Bucket público para fotos de publicaciones. Lectura pública; las escrituras
-- se hacen solo desde Server Actions con service-role (ruta {userId}/{postId}/{n}.webp).

INSERT INTO storage.buckets (id, name, public)
VALUES ('posts', 'posts', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Aplicar y verificar**

```sql
SELECT id, public FROM storage.buckets WHERE id='posts';
```
Esperado: 1 fila, `public = true`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_posts_bucket.sql
git commit -m "feat(social): bucket de almacenamiento posts"
```

---

## Task 4: Tipos de base de datos

**Files:**
- Modify: `src/types/database.ts` (añadir 5 tablas dentro de `Tables` y `public_profiles`)

- [ ] **Step 1: Añadir los tipos**

Dentro de `Database['public']['Tables']`, añadir (junto a las tablas existentes):

```ts
      posts: {
        Row: {
          id: string
          user_id: string
          body: string | null
          photo_urls: string[]
          session_snapshot: Json | null
          routine_snapshot: Json | null
          like_count: number
          comment_count: number
          removed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          body?: string | null
          photo_urls?: string[]
          session_snapshot?: Json | null
          routine_snapshot?: Json | null
          like_count?: number
          comment_count?: number
          removed_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['posts']['Insert']>
        Relationships: []
      }
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string }
        Insert: { post_id: string; user_id: string; created_at?: string }
        Update: Partial<{ post_id: string; user_id: string; created_at: string }>
        Relationships: []
      }
      post_comments: {
        Row: { id: string; post_id: string; user_id: string; body: string; removed_at: string | null; created_at: string }
        Insert: { id?: string; post_id: string; user_id: string; body: string; removed_at?: string | null; created_at?: string }
        Update: Partial<{ id: string; post_id: string; user_id: string; body: string; removed_at: string | null; created_at: string }>
        Relationships: []
      }
      post_reports: {
        Row: { id: string; post_id: string | null; comment_id: string | null; reporter_id: string; reason: string; created_at: string }
        Insert: { id?: string; post_id?: string | null; comment_id?: string | null; reporter_id: string; reason: string; created_at?: string }
        Update: Partial<{ id: string; post_id: string | null; comment_id: string | null; reporter_id: string; reason: string; created_at: string }>
        Relationships: []
      }
      user_blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string }
        Insert: { blocker_id: string; blocked_id: string; created_at?: string }
        Update: Partial<{ blocker_id: string; blocked_id: string; created_at: string }>
        Relationships: []
      }
      // Vista de solo lectura (se trata como tabla para tipado de queries):
      public_profiles: {
        Row: { id: string; username: string | null; full_name: string | null; avatar_url: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS (sin errores nuevos).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(social): tipos de DB para tablas sociales y public_profiles"
```

---

## Task 5: Snapshots de sesión y rutina (lógica pura, TDD)

**Files:**
- Create: `src/lib/social/snapshots.ts`
- Test: `src/lib/social/__tests__/snapshots.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { buildSessionSnapshot, buildRoutineSnapshot } from '../snapshots'

describe('buildSessionSnapshot', () => {
  const names = new Map([['e1', 'Press de banca'], ['e2', 'Sentadilla']])

  it('arma sets por serie y suma el volumen total', () => {
    const snap = buildSessionSnapshot(
      { completed_at: '2026-06-24T18:00:00Z', duration_minutes: 60 },
      'Push A',
      [
        { exercise_id: 'e1', reps_completed: [8, 8], weights_kg: [80, 80] }, // 1280
        { exercise_id: 'e2', reps_completed: [10], weights_kg: [100] },      // 1000
      ],
      names,
      new Set(['e1']),
    )
    expect(snap.workout_name).toBe('Push A')
    expect(snap.duration_minutes).toBe(60)
    expect(snap.total_volume_kg).toBe(2280)
    expect(snap.exercises[0]).toEqual({
      name: 'Press de banca',
      sets: [{ reps: 8, weight_kg: 80 }, { reps: 8, weight_kg: 80 }],
      is_pr: true,
    })
    expect(snap.exercises[1].is_pr).toBe(false)
  })

  it('tolera arrays null y pesos sin valor', () => {
    const snap = buildSessionSnapshot(
      { completed_at: '2026-06-24T18:00:00Z', duration_minutes: null },
      'Cardio',
      [{ exercise_id: 'e1', reps_completed: null, weights_kg: null }],
      names,
    )
    expect(snap.total_volume_kg).toBe(0)
    expect(snap.exercises[0].sets).toEqual([])
    expect(snap.exercises[0].is_pr).toBe(false)
  })
})

describe('buildRoutineSnapshot', () => {
  it('ordena workouts por order_in_plan y ejercicios por order_index', () => {
    const plan = { name: 'Full Body', goal: 'build_muscle', days_per_week: 3, difficulty: 'intermediate' }
    const workouts = [
      { id: 'w2', name: 'Día B', day_of_week: 3, order_in_plan: 1 },
      { id: 'w1', name: 'Día A', day_of_week: 1, order_in_plan: 0 },
    ]
    const byWorkout = new Map([
      ['w1', [
        { exercise_id: 'e2', name: 'Sentadilla', order_index: 1, sets: 4, reps: 8, rest_seconds: 120, weight_kg: null },
        { exercise_id: 'e1', name: 'Press', order_index: 0, sets: 3, reps: 10, rest_seconds: 90, weight_kg: 60 },
      ]],
      ['w2', []],
    ])
    const snap = buildRoutineSnapshot(plan, workouts, byWorkout)
    expect(snap.name).toBe('Full Body')
    expect(snap.workouts.map(w => w.name)).toEqual(['Día A', 'Día B'])
    expect(snap.workouts[0].exercises.map(e => e.name)).toEqual(['Press', 'Sentadilla'])
  })
})
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `pnpm test src/lib/social/__tests__/snapshots.test.ts`
Expected: FAIL — "Failed to resolve import '../snapshots'".

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/snapshots.ts
// Constructores puros de los snapshots que viajan dentro de un post.

export interface SessionSnapshotSet { reps: number; weight_kg: number | null }
export interface SessionSnapshotExercise { name: string; sets: SessionSnapshotSet[]; is_pr: boolean }
export interface SessionSnapshot {
  workout_name: string
  completed_at: string
  duration_minutes: number | null
  total_volume_kg: number
  exercises: SessionSnapshotExercise[]
}

interface RawExerciseLog {
  exercise_id: string
  reps_completed: number[] | null
  weights_kg: number[] | null
}

export function buildSessionSnapshot(
  log: { completed_at: string; duration_minutes: number | null },
  workoutName: string,
  exerciseLogs: RawExerciseLog[],
  exerciseNames: Map<string, string>,
  prExerciseIds: Set<string> = new Set(),
): SessionSnapshot {
  const exercises: SessionSnapshotExercise[] = exerciseLogs.map(el => {
    const reps = el.reps_completed ?? []
    const weights = el.weights_kg ?? []
    const sets: SessionSnapshotSet[] = reps.map((r, i) => ({
      reps: Number(r),
      weight_kg: weights[i] != null ? Number(weights[i]) : null,
    }))
    return {
      name: exerciseNames.get(el.exercise_id) ?? 'Ejercicio',
      sets,
      is_pr: prExerciseIds.has(el.exercise_id),
    }
  })
  const total_volume_kg = Math.round(
    exercises.reduce(
      (sum, ex) => sum + ex.sets.reduce((s, set) => s + (set.weight_kg ?? 0) * set.reps, 0),
      0,
    ),
  )
  return {
    workout_name: workoutName,
    completed_at: log.completed_at,
    duration_minutes: log.duration_minutes,
    total_volume_kg,
    exercises,
  }
}

export interface RoutineSnapshotExercise {
  exercise_id: string
  name: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
}
export interface RoutineSnapshotWorkout {
  name: string
  day_of_week: number | null
  exercises: RoutineSnapshotExercise[]
}
export interface RoutineSnapshot {
  name: string
  goal: string | null
  days_per_week: number | null
  difficulty: string | null
  workouts: RoutineSnapshotWorkout[]
}

export function buildRoutineSnapshot(
  plan: { name: string; goal: string | null; days_per_week: number | null; difficulty: string | null },
  workouts: { id: string; name: string; day_of_week: number | null; order_in_plan: number | null }[],
  exercisesByWorkout: Map<string, RoutineSnapshotExercise[]>,
): RoutineSnapshot {
  const sorted = [...workouts].sort((a, b) => (a.order_in_plan ?? 0) - (b.order_in_plan ?? 0))
  return {
    name: plan.name,
    goal: plan.goal,
    days_per_week: plan.days_per_week,
    difficulty: plan.difficulty,
    workouts: sorted.map(w => ({
      name: w.name,
      day_of_week: w.day_of_week,
      exercises: [...(exercisesByWorkout.get(w.id) ?? [])].sort((a, b) => a.order_index - b.order_index),
    })),
  }
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `pnpm test src/lib/social/__tests__/snapshots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/snapshots.ts src/lib/social/__tests__/snapshots.test.ts
git commit -m "feat(social): constructores puros de snapshots de sesión y rutina"
```

---

## Task 6: Mapeo de clonado de rutina (lógica pura, TDD)

**Files:**
- Create: `src/lib/social/clone.ts`
- Test: `src/lib/social/__tests__/clone.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { buildPlanInsert, buildWorkoutInsert, buildWorkoutExerciseInserts } from '../clone'
import type { RoutineSnapshot } from '../snapshots'

const snap: RoutineSnapshot = {
  name: 'Full Body', goal: 'build_muscle', days_per_week: 3, difficulty: 'intermediate',
  workouts: [
    { name: 'Día A', day_of_week: 1, exercises: [
      { exercise_id: 'e1', name: 'Press', order_index: 0, sets: 3, reps: 10, rest_seconds: 90, weight_kg: 60 },
    ]},
  ],
}

describe('buildPlanInsert', () => {
  it('crea un plan inactivo y no-IA para el usuario', () => {
    expect(buildPlanInsert(snap, 'u1')).toEqual({
      user_id: 'u1', name: 'Full Body', goal: 'build_muscle',
      days_per_week: 3, difficulty: 'intermediate',
      generated_by_ai: false, is_active: false,
    })
  })
})

describe('buildWorkoutInsert', () => {
  it('asocia el workout al plan y al usuario con su orden', () => {
    expect(buildWorkoutInsert(snap.workouts[0], 'plan1', 'u1', 0)).toEqual({
      plan_id: 'plan1', user_id: 'u1', name: 'Día A', day_of_week: 1, order_in_plan: 0,
    })
  })
})

describe('buildWorkoutExerciseInserts', () => {
  it('re-enlaza exercise_id de la librería pública conservando series/reps', () => {
    expect(buildWorkoutExerciseInserts(snap.workouts[0], 'w1')).toEqual([
      { workout_id: 'w1', exercise_id: 'e1', order_index: 0, sets: 3, reps: 10, rest_seconds: 90, weight_kg: 60 },
    ])
  })
})
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `pnpm test src/lib/social/__tests__/clone.test.ts`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/clone.ts
// Construye los payloads de inserción para clonar una rutina (snapshot) a las
// tablas del usuario. Puro: la Server Action orquesta las inserciones reales.

import type { RoutineSnapshot, RoutineSnapshotWorkout } from './snapshots'

export interface PlanInsert {
  user_id: string
  name: string
  goal: string | null
  days_per_week: number | null
  difficulty: string | null
  generated_by_ai: boolean
  is_active: boolean
}
export interface WorkoutInsert {
  plan_id: string
  user_id: string
  name: string
  day_of_week: number | null
  order_in_plan: number
}
export interface WorkoutExerciseInsert {
  workout_id: string
  exercise_id: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
}

export function buildPlanInsert(snapshot: RoutineSnapshot, userId: string): PlanInsert {
  return {
    user_id: userId,
    name: snapshot.name,
    goal: snapshot.goal,
    days_per_week: snapshot.days_per_week,
    difficulty: snapshot.difficulty,
    generated_by_ai: false,
    is_active: false,
  }
}

export function buildWorkoutInsert(
  workout: RoutineSnapshotWorkout,
  planId: string,
  userId: string,
  orderInPlan: number,
): WorkoutInsert {
  return {
    plan_id: planId,
    user_id: userId,
    name: workout.name,
    day_of_week: workout.day_of_week,
    order_in_plan: orderInPlan,
  }
}

export function buildWorkoutExerciseInserts(
  workout: RoutineSnapshotWorkout,
  workoutId: string,
): WorkoutExerciseInsert[] {
  return workout.exercises.map(e => ({
    workout_id: workoutId,
    exercise_id: e.exercise_id,
    order_index: e.order_index,
    sets: e.sets,
    reps: e.reps,
    rest_seconds: e.rest_seconds,
    weight_kg: e.weight_kg,
  }))
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `pnpm test src/lib/social/__tests__/clone.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/clone.ts src/lib/social/__tests__/clone.test.ts
git commit -m "feat(social): mapeo puro para clonar rutinas desde snapshot"
```

---

## Task 7: Cursor de paginación del feed (lógica pura, TDD)

**Files:**
- Create: `src/lib/social/feed.ts`
- Test: `src/lib/social/__tests__/feed.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, FEED_PAGE_SIZE } from '../feed'

describe('cursor del feed', () => {
  it('codifica y decodifica ida y vuelta', () => {
    const c = { createdAt: '2026-06-24T18:00:00Z', id: 'abc-123' }
    const token = encodeCursor(c)
    expect(typeof token).toBe('string')
    expect(decodeCursor(token)).toEqual(c)
  })

  it('devuelve null para tokens vacíos o corruptos', () => {
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor('@@no-base64@@')).toBeNull()
  })

  it('expone un tamaño de página', () => {
    expect(FEED_PAGE_SIZE).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `pnpm test src/lib/social/__tests__/feed.test.ts`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

```ts
// src/lib/social/feed.ts
// Paginación keyset del feed: el cursor codifica (created_at, id) del último post.

export const FEED_PAGE_SIZE = 10

export interface FeedCursor { createdAt: string; id: string }

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(`${c.createdAt}|${c.id}`, 'utf8').toString('base64url')
}

export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const sep = decoded.indexOf('|')
    if (sep <= 0) return null
    const createdAt = decoded.slice(0, sep)
    const id = decoded.slice(sep + 1)
    if (!createdAt || !id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `pnpm test src/lib/social/__tests__/feed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/feed.ts src/lib/social/__tests__/feed.test.ts
git commit -m "feat(social): cursor keyset para paginación del feed"
```

---

## Task 8: Helpers de imagen para fotos de post (TDD)

**Files:**
- Create: `src/lib/images/post.ts`
- Test: `src/lib/images/__tests__/post.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { validatePostImage, postStoragePath, MAX_POST_IMAGE_BYTES } from '../post'

describe('validatePostImage', () => {
  it('acepta una imagen válida', () => {
    expect(validatePostImage('image/jpeg', 1024)).toEqual({ ok: true })
  })
  it('rechaza no-imágenes, vacías y demasiado grandes', () => {
    expect(validatePostImage('application/pdf', 1024).ok).toBe(false)
    expect(validatePostImage('image/png', 0).ok).toBe(false)
    expect(validatePostImage('image/png', MAX_POST_IMAGE_BYTES + 1).ok).toBe(false)
  })
})

describe('postStoragePath', () => {
  it('construye {userId}/{postId}/{index}.webp', () => {
    expect(postStoragePath('u1', 'p1', 0)).toBe('u1/p1/0.webp')
    expect(postStoragePath('u1', 'p1', 2)).toBe('u1/p1/2.webp')
  })
})
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `pnpm test src/lib/images/__tests__/post.test.ts`
Expected: FAIL — import no resuelto.

- [ ] **Step 3: Implementar**

```ts
// src/lib/images/post.ts
// Helpers para fotos de publicaciones. validate/path son puros (testeables);
// resizePostImage usa <canvas> (solo cliente, no se testea).

export const MAX_POST_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB
export const MAX_POST_IMAGES = 4

export type PostImageValidation = { ok: true } | { ok: false; error: string }

export function validatePostImage(
  type: string,
  size: number,
  maxBytes = MAX_POST_IMAGE_BYTES,
): PostImageValidation {
  if (!type.startsWith('image/')) return { ok: false, error: 'El archivo debe ser una imagen.' }
  if (size <= 0) return { ok: false, error: 'El archivo está vacío.' }
  if (size > maxBytes) return { ok: false, error: 'La imagen supera el tamaño máximo (8 MB).' }
  return { ok: true }
}

export function postStoragePath(userId: string, postId: string, index: number): string {
  return `${userId}/${postId}/${index}.webp`
}

// Reescala manteniendo proporción a un ancho máximo y exporta webp (o jpeg). Solo cliente.
export async function resizePostImage(
  file: File,
  maxWidth = 1080,
  quality = 0.85,
): Promise<{ blob: Blob; contentType: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el contexto de canvas.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const toBlob = (mime: string) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mime, quality))

  let contentType = 'image/webp'
  let blob = await toBlob(contentType)
  if (!blob) {
    contentType = 'image/jpeg'
    blob = await toBlob(contentType)
  }
  if (!blob) throw new Error('No se pudo procesar la imagen.')
  return { blob, contentType }
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `pnpm test src/lib/images/__tests__/post.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/images/post.ts src/lib/images/__tests__/post.test.ts
git commit -m "feat(social): helpers de imagen para fotos de publicaciones"
```

---

## Task 9: Tipos compartidos del dominio social

**Files:**
- Create: `src/lib/social/types.ts`

- [ ] **Step 1: Crear los tipos**

```ts
// src/lib/social/types.ts
// Tipos compartidos entre Server Actions y UI.

import type { SessionSnapshot, RoutineSnapshot } from './snapshots'

export interface PostAuthor {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

export interface FeedPost {
  id: string
  author: PostAuthor
  body: string | null
  photo_urls: string[]
  session_snapshot: SessionSnapshot | null
  routine_snapshot: RoutineSnapshot | null
  like_count: number
  comment_count: number
  liked_by_me: boolean
  is_mine: boolean
  created_at: string
}

export interface FeedPage {
  posts: FeedPost[]
  nextCursor: string | null
}

export interface PostCommentView {
  id: string
  author: PostAuthor
  body: string
  created_at: string
  is_mine: boolean
}

export interface PostDetail {
  post: FeedPost
  comments: PostCommentView[]
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/types.ts
git commit -m "feat(social): tipos compartidos del dominio social"
```

---

## Task 10: Server Actions de publicaciones

**Files:**
- Create: `src/app/actions/posts.ts`

Reutiliza el patrón de `src/app/actions/avatar.ts` (usuario + service-role) y los constructores puros de Tasks 5/6.

- [ ] **Step 1: Implementar las acciones**

```ts
// src/app/actions/posts.ts
'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildSessionSnapshot } from '@/lib/social/snapshots'
import {
  buildPlanInsert, buildWorkoutInsert, buildWorkoutExerciseInserts,
} from '@/lib/social/clone'
import type { RoutineSnapshot, SessionSnapshot } from '@/lib/social/snapshots'
import { postStoragePath } from '@/lib/images/post'

const BUCKET = 'posts'

export type ActionResult<T = void> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export interface CreatePostInput {
  body?: string | null
  photoCount?: number               // nº de fotos en el FormData (file0..fileN)
  routineSnapshot?: RoutineSnapshot | null
}

// Crea un post con texto + fotos + (opcional) snapshot de rutina ya construido en cliente.
export async function createPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const body = (String(formData.get('body') ?? '').trim()) || null
  const routineRaw = formData.get('routineSnapshot')
  const routineSnapshot: RoutineSnapshot | null =
    typeof routineRaw === 'string' && routineRaw ? JSON.parse(routineRaw) : null

  const files = formData.getAll('file').filter((f): f is File => f instanceof File)

  if (!body && files.length === 0 && !routineSnapshot) {
    return { ok: false, error: 'La publicación está vacía.' }
  }

  const service = createServiceClient()
  const postId = randomUUID()

  // Subir fotos (ya reescaladas en cliente a webp).
  const photo_urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const path = postStoragePath(user.id, postId, i)
    const { error } = await service.storage
      .from(BUCKET)
      .upload(path, files[i], { contentType: files[i].type, upsert: true, cacheControl: '3600' })
    if (error) return { ok: false, error: 'No se pudo subir una imagen.' }
    photo_urls.push(service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
  }

  const { error: insErr } = await (service.from('posts') as any).insert({
    id: postId,
    user_id: user.id,
    body,
    photo_urls,
    routine_snapshot: routineSnapshot,
  })
  if (insErr) return { ok: false, error: 'No se pudo crear la publicación.' }

  revalidatePath('/feed')
  return { ok: true, id: postId }
}

// Comparte una sesión completada propia: construye el session_snapshot desde sus logs.
export async function createPostFromSession(
  progressLogId: string,
  body?: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  // Log propio + nombre del workout.
  const { data: log } = await (supabase.from('progress_logs') as any)
    .select('id, completed_at, duration_minutes, workout_id, user_id')
    .eq('id', progressLogId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string; completed_at: string; duration_minutes: number | null; workout_id: string | null } | null }
  if (!log) return { ok: false, error: 'Sesión no encontrada.' }

  let workoutName = 'Entrenamiento'
  if (log.workout_id) {
    const { data: w } = await (supabase.from('workouts') as any)
      .select('name').eq('id', log.workout_id).maybeSingle() as { data: { name: string } | null }
    if (w?.name) workoutName = w.name
  }

  const { data: exLogs } = await (supabase.from('exercise_logs') as any)
    .select('exercise_id, reps_completed, weights_kg')
    .eq('progress_log_id', progressLogId) as {
      data: { exercise_id: string; reps_completed: number[] | null; weights_kg: number[] | null }[] | null
    }

  const ids = [...new Set((exLogs ?? []).map(e => e.exercise_id))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: exs } = await (supabase.from('exercises') as any)
      .select('id, name').in('id', ids) as { data: { id: string; name: string }[] | null }
    for (const e of exs ?? []) names.set(e.id, e.name)
  }

  const snapshot: SessionSnapshot = buildSessionSnapshot(log, workoutName, exLogs ?? [], names)

  const service = createServiceClient()
  const postId = randomUUID()
  const { error } = await (service.from('posts') as any).insert({
    id: postId,
    user_id: user.id,
    body: (body?.trim()) || null,
    session_snapshot: snapshot,
  })
  if (error) return { ok: false, error: 'No se pudo compartir la sesión.' }

  revalidatePath('/feed')
  return { ok: true, id: postId }
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  // RLS garantiza que solo borra los propios; igualmente filtramos por user_id.
  const { error } = await (supabase.from('posts') as any)
    .delete().eq('id', postId).eq('user_id', user.id)
  if (error) return { ok: false, error: 'No se pudo eliminar.' }

  // Limpieza best-effort de las fotos del post.
  const service = createServiceClient()
  const { data: files } = await service.storage.from(BUCKET).list(`${user.id}/${postId}`)
  if (files?.length) {
    await service.storage.from(BUCKET).remove(files.map(f => `${user.id}/${postId}/${f.name}`))
  }

  revalidatePath('/feed')
  return { ok: true }
}

// Clona la rutina de un post a las tablas del usuario actual.
export async function clonePlanFromPost(postId: string): Promise<ActionResult<{ planId: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { data: post } = await (supabase.from('posts') as any)
    .select('routine_snapshot').eq('id', postId).maybeSingle() as {
      data: { routine_snapshot: RoutineSnapshot | null } | null
    }
  if (!post?.routine_snapshot) return { ok: false, error: 'Esta publicación no tiene rutina.' }
  const snapshot = post.routine_snapshot

  // Inserta plan → workouts → ejercicios (cliente de usuario: RLS solo-dueño).
  const { data: plan, error: planErr } = await (supabase.from('workout_plans') as any)
    .insert(buildPlanInsert(snapshot, user.id)).select('id').single() as {
      data: { id: string } | null; error: unknown
    }
  if (planErr || !plan) return { ok: false, error: 'No se pudo crear el plan.' }

  const planId = plan.id
  const userId = user.id

  // Limpieza compensatoria si una inserción falla a medio clonar: evita planes huérfanos.
  // workouts.plan_id es ON DELETE SET NULL, así que borramos los workouts explícitamente
  // (cascada a workout_exercises) y luego el plan.
  async function rollback(): Promise<void> {
    await (supabase.from('workouts') as any).delete().eq('plan_id', planId).eq('user_id', userId)
    await (supabase.from('workout_plans') as any).delete().eq('id', planId).eq('user_id', userId)
  }

  for (let i = 0; i < snapshot.workouts.length; i++) {
    const sw = snapshot.workouts[i]
    const { data: w, error: wErr } = await (supabase.from('workouts') as any)
      .insert(buildWorkoutInsert(sw, planId, userId, i)).select('id').single() as {
        data: { id: string } | null; error: unknown
      }
    if (wErr || !w) { await rollback(); return { ok: false, error: 'No se pudo clonar un día.' } }

    const exInserts = buildWorkoutExerciseInserts(sw, w.id)
    if (exInserts.length) {
      const { error: exErr } = await (supabase.from('workout_exercises') as any).insert(exInserts)
      if (exErr) { await rollback(); return { ok: false, error: 'No se pudieron clonar los ejercicios.' } }
    }
  }

  revalidatePath('/plan')
  return { ok: true, planId }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/posts.ts
git commit -m "feat(social): server actions de crear/compartir/eliminar/clonar publicaciones"
```

---

## Task 11: Server Actions de engagement (likes y comentarios)

**Files:**
- Create: `src/app/actions/engagement.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/actions/engagement.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './posts'

export async function toggleLike(postId: string): Promise<ActionResult<{ liked: boolean }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { data: existing } = await (supabase.from('post_likes') as any)
    .select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle() as {
      data: { post_id: string } | null
    }

  if (existing) {
    const { error } = await (supabase.from('post_likes') as any)
      .delete().eq('post_id', postId).eq('user_id', user.id)
    if (error) return { ok: false, error: 'No se pudo quitar el like.' }
    return { ok: true, liked: false }
  }

  const { error } = await (supabase.from('post_likes') as any)
    .insert({ post_id: postId, user_id: user.id })
  if (error) return { ok: false, error: 'No se pudo dar like.' }
  return { ok: true, liked: true }
}

export async function addComment(postId: string, body: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const text = body.trim()
  if (text.length < 1 || text.length > 1000) return { ok: false, error: 'Comentario fuera de rango (1–1000).' }

  const { data, error } = await (supabase.from('post_comments') as any)
    .insert({ post_id: postId, user_id: user.id, body: text }).select('id').single() as {
      data: { id: string } | null; error: unknown
    }
  if (error || !data) return { ok: false, error: 'No se pudo comentar.' }

  revalidatePath(`/post/${postId}`)
  return { ok: true, id: data.id }
}

export async function deleteComment(commentId: string, postId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('post_comments') as any)
    .delete().eq('id', commentId).eq('user_id', user.id)
  if (error) return { ok: false, error: 'No se pudo eliminar el comentario.' }

  revalidatePath(`/post/${postId}`)
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/engagement.ts
git commit -m "feat(social): server actions de likes y comentarios"
```

---

## Task 12: Server Actions de moderación (reportar y bloquear)

**Files:**
- Create: `src/app/actions/moderation.ts`

- [ ] **Step 1: Implementar**

```ts
// src/app/actions/moderation.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './posts'

export interface ReportInput {
  postId?: string
  commentId?: string
  reason: string
}

export async function reportContent(input: ReportInput): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const targets = [input.postId, input.commentId].filter(Boolean)
  if (targets.length !== 1) return { ok: false, error: 'Reporte inválido.' }
  if (!input.reason.trim()) return { ok: false, error: 'Indica un motivo.' }

  const { error } = await (supabase.from('post_reports') as any).insert({
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    reporter_id: user.id,
    reason: input.reason.trim(),
  })
  if (error) return { ok: false, error: 'No se pudo enviar el reporte.' }
  return { ok: true }
}

export async function blockUser(blockedId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (blockedId === user.id) return { ok: false, error: 'No puedes bloquearte a ti mismo.' }

  const { error } = await (supabase.from('user_blocks') as any)
    .upsert({ blocker_id: user.id, blocked_id: blockedId })
  if (error) return { ok: false, error: 'No se pudo bloquear.' }

  revalidatePath('/feed')
  return { ok: true }
}

export async function unblockUser(blockedId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('user_blocks') as any)
    .delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
  if (error) return { ok: false, error: 'No se pudo desbloquear.' }

  revalidatePath('/feed')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/moderation.ts
git commit -m "feat(social): server actions de reporte y bloqueo"
```

---

## Task 13: Server Actions de lectura (feed, perfil, detalle)

**Files:**
- Create: `src/app/actions/feed.ts`

Construye los `FeedPost` mezclando posts + autores (vía `public_profiles`) + likes propios. El filtrado de bloqueos/removidos lo aplica RLS.

- [ ] **Step 1: Implementar**

```ts
// src/app/actions/feed.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { decodeCursor, encodeCursor, FEED_PAGE_SIZE } from '@/lib/social/feed'
import type { FeedPage, FeedPost, PostAuthor, PostCommentView, PostDetail } from '@/lib/social/types'
import type { RoutineSnapshot, SessionSnapshot } from '@/lib/social/snapshots'

interface PostRow {
  id: string
  user_id: string
  body: string | null
  photo_urls: string[]
  session_snapshot: SessionSnapshot | null
  routine_snapshot: RoutineSnapshot | null
  like_count: number
  comment_count: number
  created_at: string
}

async function loadAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, PostAuthor>> {
  const map = new Map<string, PostAuthor>()
  if (!ids.length) return map
  const { data } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url').in('id', ids) as { data: PostAuthor[] | null }
  for (const a of data ?? []) map.set(a.id, a)
  return map
}

async function loadMyLikes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  postIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>()
  if (!postIds.length) return set
  const { data } = await (supabase.from('post_likes') as any)
    .select('post_id').eq('user_id', userId).in('post_id', postIds) as {
      data: { post_id: string }[] | null
    }
  for (const l of data ?? []) set.add(l.post_id)
  return set
}

function toFeedPost(
  row: PostRow, authors: Map<string, PostAuthor>, likedSet: Set<string>, meId: string,
): FeedPost {
  return {
    id: row.id,
    author: authors.get(row.user_id) ?? { id: row.user_id, username: null, full_name: null, avatar_url: null },
    body: row.body,
    photo_urls: row.photo_urls ?? [],
    session_snapshot: row.session_snapshot,
    routine_snapshot: row.routine_snapshot,
    like_count: row.like_count,
    comment_count: row.comment_count,
    liked_by_me: likedSet.has(row.id),
    is_mine: row.user_id === meId,
    created_at: row.created_at,
  }
}

const POST_COLS = 'id, user_id, body, photo_urls, session_snapshot, routine_snapshot, like_count, comment_count, created_at'

export async function getDiscoverFeed(cursorToken?: string | null): Promise<FeedPage> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const cursor = decodeCursor(cursorToken)
  let query = (supabase.from('posts') as any)
    .select(POST_COLS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE + 1)

  if (cursor) {
    // Keyset: (created_at, id) < (cursor.createdAt, cursor.id)
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data: rows } = await query as { data: PostRow[] | null }
  const page = rows ?? []
  const hasMore = page.length > FEED_PAGE_SIZE
  const visible = hasMore ? page.slice(0, FEED_PAGE_SIZE) : page

  const authors = await loadAuthors(supabase, visible.map(r => r.user_id))
  const liked = await loadMyLikes(supabase, user.id, visible.map(r => r.id))
  const posts = visible.map(r => toFeedPost(r, authors, liked, user.id))

  const last = visible[visible.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  return { posts, nextCursor }
}

export async function getUserPosts(username: string): Promise<{ author: PostAuthor | null; posts: FeedPost[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { author: null, posts: [] }

  const { data: author } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url').eq('username', username).maybeSingle() as {
      data: PostAuthor | null
    }
  if (!author) return { author: null, posts: [] }

  const { data: rows } = await (supabase.from('posts') as any)
    .select(POST_COLS).eq('user_id', author.id)
    .order('created_at', { ascending: false }).limit(60) as { data: PostRow[] | null }
  const page = rows ?? []

  const authors = new Map([[author.id, author]])
  const liked = await loadMyLikes(supabase, user.id, page.map(r => r.id))
  return { author, posts: page.map(r => toFeedPost(r, authors, liked, user.id)) }
}

export async function getPostDetail(postId: string): Promise<PostDetail | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: row } = await (supabase.from('posts') as any)
    .select(POST_COLS).eq('id', postId).maybeSingle() as { data: PostRow | null }
  if (!row) return null

  const { data: commentRows } = await (supabase.from('post_comments') as any)
    .select('id, user_id, body, created_at').eq('post_id', postId)
    .order('created_at', { ascending: true }).limit(200) as {
      data: { id: string; user_id: string; body: string; created_at: string }[] | null
    }
  const comments = commentRows ?? []

  const authorIds = [...new Set([row.user_id, ...comments.map(c => c.user_id)])]
  const authors = await loadAuthors(supabase, authorIds)
  const liked = await loadMyLikes(supabase, user.id, [row.id])

  const post = toFeedPost(row, authors, liked, user.id)
  const commentViews: PostCommentView[] = comments.map(c => ({
    id: c.id,
    author: authors.get(c.user_id) ?? { id: c.user_id, username: null, full_name: null, avatar_url: null },
    body: c.body,
    created_at: c.created_at,
    is_mine: c.user_id === user.id,
  }))
  return { post, comments: commentViews }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/feed.ts
git commit -m "feat(social): server actions de lectura (feed, perfil, detalle)"
```

---

## Task 14: Componentes de tarjeta de contenido (sesión, rutina, media)

**Files:**
- Create: `src/components/social/SessionCard.tsx`
- Create: `src/components/social/RoutineCard.tsx`
- Create: `src/components/social/PostMedia.tsx`

- [ ] **Step 1: Implementar `PostMedia`**

```tsx
// src/components/social/PostMedia.tsx
import { cn } from '@/lib/utils'

export function PostMedia({ urls }: { urls: string[] }) {
  if (!urls.length) return null
  return (
    <div className={cn('grid gap-1 overflow-hidden rounded-xl', urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={url}
          alt={`Foto ${i + 1}`}
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Implementar `SessionCard`**

```tsx
// src/components/social/SessionCard.tsx
import { Dumbbell, Clock, TrendingUp } from 'lucide-react'
import type { SessionSnapshot } from '@/lib/social/snapshots'

export function SessionCard({ snap }: { snap: SessionSnapshot }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Dumbbell className="h-4 w-4 text-primary" />
        {snap.workout_name}
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {snap.duration_minutes != null && (
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{snap.duration_minutes} min</span>
        )}
        <span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />{snap.total_volume_kg.toLocaleString()} kg</span>
      </div>
      <ul className="space-y-1 text-sm">
        {snap.exercises.slice(0, 6).map((ex, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{ex.name}{ex.is_pr && <span className="ml-1 text-xs text-primary">PR</span>}</span>
            <span className="shrink-0 text-muted-foreground">{ex.sets.length}×</span>
          </li>
        ))}
        {snap.exercises.length > 6 && (
          <li className="text-xs text-muted-foreground">+{snap.exercises.length - 6} más</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Implementar `RoutineCard`**

```tsx
// src/components/social/RoutineCard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Copy, Loader2 } from 'lucide-react'
import type { RoutineSnapshot } from '@/lib/social/snapshots'
import { clonePlanFromPost } from '@/app/actions/posts'
import { useToast } from '@/components/feedback/ToastProvider'

export function RoutineCard({ snap, postId }: { snap: RoutineSnapshot; postId: string }) {
  const [pending, startTransition] = useTransition()
  const [cloned, setCloned] = useState(false)
  const router = useRouter()
  const { showToast } = useToast()

  function onClone() {
    startTransition(async () => {
      const res = await clonePlanFromPost(postId)
      if (res.ok) {
        setCloned(true)
        showToast({ title: 'Rutina clonada a tu cuenta.', variant: 'success' })
        router.push('/plan')
      } else {
        showToast({ title: res.error, variant: 'error' })
      }
    })
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ClipboardList className="h-4 w-4 text-primary" />
        {snap.name}
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {snap.days_per_week != null && <span>{snap.days_per_week} días/sem</span>}
        {snap.difficulty && <span>{snap.difficulty}</span>}
        <span>{snap.workouts.length} sesiones</span>
      </div>
      <button
        type="button"
        onClick={onClone}
        disabled={pending || cloned}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
        {cloned ? 'Clonada' : 'Clonar rutina'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/social/SessionCard.tsx src/components/social/RoutineCard.tsx src/components/social/PostMedia.tsx
git commit -m "feat(social): tarjetas de sesión, rutina y media"
```

---

## Task 15: Like, menú de moderación y diálogo de reporte

**Files:**
- Create: `src/components/social/LikeButton.tsx`
- Create: `src/components/social/PostMenu.tsx`
- Create: `src/components/social/ReportDialog.tsx`

- [ ] **Step 1: Implementar `LikeButton` (optimista)**

```tsx
// src/components/social/LikeButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleLike } from '@/app/actions/engagement'

export function LikeButton({ postId, initialLiked, initialCount }: {
  postId: string; initialLiked: boolean; initialCount: number
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [, startTransition] = useTransition()

  function onToggle() {
    const next = !liked
    setLiked(next)
    setCount(c => c + (next ? 1 : -1))
    startTransition(async () => {
      const res = await toggleLike(postId)
      if (!res.ok) {
        setLiked(!next)
        setCount(c => c + (next ? -1 : 1))
      } else if (res.liked !== next) {
        // El servidor terminó en un estado distinto al optimista (p.ej. desync entre
        // pestañas): reconcilia el like y corrige el contador quitando el delta optimista
        // y aplicando el real.
        setLiked(res.liked)
        setCount(c => c + (res.liked ? 1 : -1) - (next ? 1 : -1))
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={liked}
      className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground"
    >
      <Heart className={cn('h-5 w-5 transition-colors', liked && 'fill-red-500 text-red-500')} />
      {count > 0 && <span>{count}</span>}
    </button>
  )
}
```

- [ ] **Step 2: Implementar `ReportDialog`**

```tsx
// src/components/social/ReportDialog.tsx
'use client'

import { useState, useTransition } from 'react'
import { reportContent } from '@/app/actions/moderation'
import { useToast } from '@/components/feedback/ToastProvider'

export function ReportDialog({ postId, commentId, onClose }: {
  postId?: string; commentId?: string; onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()
  const { showToast } = useToast()

  function submit() {
    startTransition(async () => {
      const res = await reportContent({ postId, commentId, reason })
      if (res.ok) { showToast({ title: 'Reporte enviado. Gracias.', variant: 'success' }); onClose() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-4" onClick={e => e.stopPropagation()}>
        <h2 className="mb-2 text-base font-semibold">Reportar contenido</h2>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Motivo del reporte"
          className="mb-3 h-24 w-full rounded-lg border border-border bg-card/40 p-2 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-11 rounded-lg px-4 text-sm text-muted-foreground">Cancelar</button>
          <button onClick={submit} disabled={pending || !reason.trim()}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implementar `PostMenu`**

```tsx
// src/components/social/PostMenu.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Flag, Ban, Trash2 } from 'lucide-react'
import { blockUser } from '@/app/actions/moderation'
import { deletePost } from '@/app/actions/posts'
import { ReportDialog } from './ReportDialog'
import { useToast } from '@/components/feedback/ToastProvider'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export function PostMenu({ postId, authorId, isMine }: {
  postId: string; authorId: string; isMine: boolean
}) {
  const [report, setReport] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function onBlock() {
    startTransition(async () => {
      const res = await blockUser(authorId)
      showToast({ title: res.ok ? 'Usuario bloqueado.' : res.error, variant: res.ok ? 'success' : 'error' })
      if (res.ok) router.refresh()
    })
  }
  function onDelete() {
    startTransition(async () => {
      const res = await deletePost(postId)
      showToast({ title: res.ok ? 'Publicación eliminada.' : res.error, variant: res.ok ? 'success' : 'error' })
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Más opciones"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {isMine ? (
            <DropdownMenuItem
              onSelect={onDelete}
              className="gap-2 text-red-400 focus:text-red-400"
            >
              <Trash2 className="h-4 w-4" /> Eliminar
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onSelect={() => setReport(true)} className="gap-2">
                <Flag className="h-4 w-4" /> Reportar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onBlock} className="gap-2">
                <Ban className="h-4 w-4" /> Bloquear usuario
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {report && <ReportDialog postId={postId} onClose={() => setReport(false)} />}
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/social/LikeButton.tsx src/components/social/PostMenu.tsx src/components/social/ReportDialog.tsx
git commit -m "feat(social): botón like, menú de moderación y diálogo de reporte"
```

---

## Task 16: `PostCard`

**Files:**
- Create: `src/components/social/PostCard.tsx`

- [ ] **Step 1: Implementar**

```tsx
// src/components/social/PostCard.tsx
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import type { FeedPost } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PostMedia } from './PostMedia'
import { SessionCard } from './SessionCard'
import { RoutineCard } from './RoutineCard'
import { LikeButton } from './LikeButton'
import { PostMenu } from './PostMenu'

export function PostCard({ post }: { post: FeedPost }) {
  const name = post.author.full_name || post.author.username || 'Usuario'
  const handle = post.author.username

  return (
    <article className="border-b border-border/40 px-4 py-4">
      <header className="mb-3 flex items-center gap-3">
        <Link href={handle ? `/u/${handle}` : '#'} className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {post.author.avatar_url && <AvatarImage src={post.author.avatar_url} alt={name} />}
            <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{name}</p>
            {handle && <p className="text-xs text-muted-foreground">@{handle}</p>}
          </div>
        </Link>
        <div className="ml-auto">
          <PostMenu postId={post.id} authorId={post.author.id} isMine={post.is_mine} />
        </div>
      </header>

      {post.body && <p className="mb-3 whitespace-pre-wrap text-sm">{post.body}</p>}
      {post.photo_urls.length > 0 && <div className="mb-3"><PostMedia urls={post.photo_urls} /></div>}
      {post.session_snapshot && <div className="mb-3"><SessionCard snap={post.session_snapshot} /></div>}
      {post.routine_snapshot && <div className="mb-3"><RoutineCard snap={post.routine_snapshot} postId={post.id} /></div>}

      <footer className="flex items-center gap-4">
        <LikeButton postId={post.id} initialLiked={post.liked_by_me} initialCount={post.like_count} />
        <Link href={`/post/${post.id}`} className="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground">
          <MessageCircle className="h-5 w-5" />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </Link>
      </footer>
    </article>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/social/PostCard.tsx
git commit -m "feat(social): componente PostCard"
```

---

## Task 17: Feed Descubrir con scroll infinito + ruta `/feed`

**Files:**
- Create: `src/components/social/DiscoverFeed.tsx`
- Create: `src/app/(app)/feed/page.tsx`

- [ ] **Step 1: Implementar `DiscoverFeed` (cliente)**

```tsx
// src/components/social/DiscoverFeed.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FeedPost } from '@/lib/social/types'
import { getDiscoverFeed } from '@/app/actions/feed'
import { PostCard } from './PostCard'

export function DiscoverFeed({ initialPosts, initialCursor }: {
  initialPosts: FeedPost[]; initialCursor: string | null
}) {
  const [posts, setPosts] = useState(initialPosts)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return
    setLoading(true)
    const page = await getDiscoverFeed(cursor)
    setPosts(prev => [...prev, ...page.posts])
    setCursor(page.nextCursor)
    setLoading(false)
  }, [cursor, loading])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '300px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  if (posts.length === 0) {
    return <p className="px-4 py-16 text-center text-sm text-muted-foreground">Aún no hay publicaciones. ¡Sé el primero!</p>
  }

  return (
    <div>
      {posts.map(p => <PostCard key={p.id} post={p} />)}
      <div ref={sentinel} aria-live="polite" className="flex h-12 items-center justify-center">
        {loading && (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="sr-only">Cargando más publicaciones</span>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implementar la página `/feed`**

```tsx
// src/app/(app)/feed/page.tsx
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import { getDiscoverFeed } from '@/app/actions/feed'
import { DiscoverFeed } from '@/components/social/DiscoverFeed'

export default async function FeedPage() {
  const { posts, nextCursor } = await getDiscoverFeed()

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <h1 className="text-lg font-bold">Comunidad</h1>
        <Link href="/feed/new" aria-label="Nueva publicación" className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-primary">
          <PlusCircle className="h-5 w-5" /> Publicar
        </Link>
      </header>
      <DiscoverFeed initialPosts={posts} initialCursor={nextCursor} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar build/tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/DiscoverFeed.tsx "src/app/(app)/feed/page.tsx"
git commit -m "feat(social): feed Descubrir con scroll infinito y ruta /feed"
```

---

## Task 18: Compositor de publicaciones + ruta `/feed/new`

**Files:**
- Create: `src/components/social/PostComposer.tsx`
- Create: `src/app/(app)/feed/new/page.tsx`

- [ ] **Step 1: Implementar `PostComposer`**

```tsx
// src/components/social/PostComposer.tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { createPost } from '@/app/actions/posts'
import { validatePostImage, resizePostImage, MAX_POST_IMAGES } from '@/lib/images/post'
import { useToast } from '@/components/feedback/ToastProvider'

export function PostComposer() {
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  // Genera las miniaturas a partir de los archivos y revoca las URLs al cambiar
  // o al desmontar (evita fugas de blob URLs). Mismo patrón que AvatarUploader.
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    const valid: File[] = []
    let rejected = false
    for (const f of picked) {
      if (validatePostImage(f.type, f.size).ok) valid.push(f)
      else rejected = true
    }
    if (rejected) showToast({ title: 'Alguna imagen no es válida o supera 8 MB.', variant: 'error' })
    if (valid.length) setFiles(prev => [...prev, ...valid].slice(0, MAX_POST_IMAGES))
    e.target.value = ''
  }

  function removeAt(i: number) {
    setFiles(prev => prev.filter((_, idx) => idx !== i))
  }

  function submit() {
    if (!body.trim() && files.length === 0) {
      showToast({ title: 'Escribe algo o añade una foto.', variant: 'error' }); return
    }
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('body', body)
        for (const f of files) {
          const { blob, contentType } = await resizePostImage(f)
          const ext = contentType === 'image/webp' ? 'webp' : 'jpg'
          fd.append('file', new File([blob], `photo.${ext}`, { type: contentType }))
        }
        const res = await createPost(fd)
        if (res.ok) { showToast({ title: 'Publicado.', variant: 'success' }); router.push('/feed'); router.refresh() }
        else showToast({ title: res.error, variant: 'error' })
      } catch {
        showToast({ title: 'No se pudo procesar una imagen. Inténtalo de nuevo.', variant: 'error' })
      }
    })
  }

  return (
    <div className="space-y-4 p-4">
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="¿Qué quieres compartir con la comunidad?"
        aria-label="Contenido de la publicación"
        className="h-32 w-full rounded-xl border border-border bg-card/40 p-3 text-sm"
      />
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" />
              <button onClick={() => removeAt(i)} aria-label="Quitar foto"
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <ImagePlus className="h-5 w-5" /> Añadir foto
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
        </label>
        <button onClick={submit} disabled={pending}
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implementar la página `/feed/new`**

```tsx
// src/app/(app)/feed/new/page.tsx
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostComposer } from '@/components/social/PostComposer'

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Nueva publicación</h1>
      </header>
      <PostComposer />
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/PostComposer.tsx "src/app/(app)/feed/new/page.tsx"
git commit -m "feat(social): compositor de publicaciones y ruta /feed/new"
```

---

## Task 19: Comentarios + ruta de detalle `/post/[id]`

**Files:**
- Create: `src/components/social/CommentInput.tsx`
- Create: `src/components/social/CommentList.tsx`
- Create: `src/app/(app)/post/[id]/page.tsx`

- [ ] **Step 1: Implementar `CommentInput`**

```tsx
// src/components/social/CommentInput.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { addComment } from '@/app/actions/engagement'
import { useToast } from '@/components/feedback/ToastProvider'

export function CommentInput({ postId }: { postId: string }) {
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  function submit() {
    const body = text.trim()
    if (!body) return
    startTransition(async () => {
      const res = await addComment(postId, body)
      if (res.ok) { setText(''); router.refresh() }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <div className="sticky bottom-16 flex items-center gap-2 border-t border-border/40 bg-background/95 px-4 py-3 backdrop-blur-md">
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="Escribe un comentario…"
        maxLength={1000}
        className="h-11 flex-1 rounded-full border border-border bg-card/40 px-4 text-sm"
      />
      <button onClick={submit} disabled={pending || !text.trim()} aria-label="Enviar comentario"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60">
        <Send className="h-5 w-5" />
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Implementar `CommentList`**

```tsx
// src/components/social/CommentList.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import type { PostCommentView } from '@/lib/social/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { deleteComment } from '@/app/actions/engagement'
import { useToast } from '@/components/feedback/ToastProvider'

export function CommentList({ comments, postId }: { comments: PostCommentView[]; postId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { showToast } = useToast()

  if (!comments.length) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sé el primero en comentar.</p>
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteComment(id, postId)
      if (res.ok) router.refresh()
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <ul className="divide-y divide-border/30">
      {comments.map(c => {
        const name = c.author.full_name || c.author.username || 'Usuario'
        return (
          <li key={c.id} className="flex gap-3 px-4 py-3">
            <Avatar className="h-8 w-8">
              {c.author.avatar_url && <AvatarImage src={c.author.avatar_url} alt={name} />}
              <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm"><span className="font-semibold">{name}</span></p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.body}</p>
            </div>
            {c.is_mine && (
              <button
                onClick={() => remove(c.id)}
                aria-label="Eliminar comentario"
                disabled={pending}
                className="text-muted-foreground hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 3: Implementar la página `/post/[id]`**

```tsx
// src/app/(app)/post/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPostDetail } from '@/app/actions/feed'
import { PostCard } from '@/components/social/PostCard'
import { CommentList } from '@/components/social/CommentList'
import { CommentInput } from '@/components/social/CommentInput'

export default async function PostDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const detail = await getPostDetail(id)
  if (!detail) notFound()

  return (
    <div className="mx-auto max-w-lg pb-32">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-md">
        <Link href="/feed" aria-label="Volver" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/5">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold">Publicación</h1>
      </header>
      <PostCard post={detail.post} />
      <CommentList comments={detail.comments} postId={detail.post.id} />
      <CommentInput postId={detail.post.id} />
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/social/CommentInput.tsx src/components/social/CommentList.tsx "src/app/(app)/post/[id]/page.tsx"
git commit -m "feat(social): comentarios y ruta de detalle /post/[id]"
```

---

## Task 20: Perfil público `/u/[username]`

**Files:**
- Create: `src/app/(app)/u/[username]/page.tsx`

- [ ] **Step 1: Implementar**

```tsx
// src/app/(app)/u/[username]/page.tsx
import { notFound } from 'next/navigation'
import { getUserPosts } from '@/app/actions/feed'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { PostCard } from '@/components/social/PostCard'

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const { username } = params
  const { author, posts } = await getUserPosts(username)
  if (!author) notFound()

  const name = author.full_name || author.username || 'Usuario'

  return (
    <div className="mx-auto max-w-lg pb-24">
      <header className="flex flex-col items-center gap-3 border-b border-border/40 px-4 py-8">
        <Avatar className="h-20 w-20">
          {author.avatar_url && <AvatarImage src={author.avatar_url} alt={name} />}
          <AvatarFallback className="text-2xl">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="text-center">
          <h1 className="text-xl font-bold">{name}</h1>
          {author.username && <p className="text-sm text-muted-foreground">@{author.username}</p>}
        </div>
        <p className="text-sm text-muted-foreground">{posts.length} publicaciones</p>
      </header>
      {posts.length === 0
        ? <p className="px-4 py-16 text-center text-sm text-muted-foreground">Sin publicaciones todavía.</p>
        : posts.map(p => <PostCard key={p.id} post={p} />)}
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/u/[username]/page.tsx"
git commit -m "feat(social): perfil público /u/[username]"
```

---

## Task 21: Entrada de navegación "Comunidad"

**Files:**
- Modify: `src/components/navigation/BottomNav.tsx`

- [ ] **Step 1: Añadir la pestaña**

En `src/components/navigation/BottomNav.tsx`, importar el icono `Users` y añadir la pestaña al array `TABS`:

```tsx
import { BarChart2, CalendarDays, Home, Settings, Users } from 'lucide-react'
```

```tsx
const TABS: Tab[] = [
  { href: '/dashboard', label: 'Inicio',     icon: Home         },
  { href: '/plan',      label: 'Plan',       icon: CalendarDays },
  { href: '/feed',      label: 'Comunidad',  icon: Users        },
  { href: '/settings',  label: 'Ajustes',    icon: Settings     },
  { href: '/history',   label: 'Historial',  icon: BarChart2    },
]
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/navigation/BottomNav.tsx
git commit -m "feat(social): pestaña Comunidad en la navegación"
```

---

## Task 22: Botón "Compartir sesión" en el historial

**Files:**
- Modify: `src/app/(app)/history/[logId]/page.tsx` (añadir un botón que llame a `createPostFromSession`)
- Create: `src/components/social/ShareSessionButton.tsx`

- [ ] **Step 1: Implementar `ShareSessionButton`**

```tsx
// src/components/social/ShareSessionButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Share2, Loader2 } from 'lucide-react'
import { createPostFromSession } from '@/app/actions/posts'
import { useToast } from '@/components/feedback/ToastProvider'

export function ShareSessionButton({ progressLogId }: { progressLogId: string }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const router = useRouter()
  const { showToast } = useToast()

  function share() {
    startTransition(async () => {
      const res = await createPostFromSession(progressLogId)
      if (res.ok) { setDone(true); showToast({ title: 'Sesión compartida en Comunidad.', variant: 'success' }); router.push(`/post/${res.id}`) }
      else showToast({ title: res.error, variant: 'error' })
    })
  }

  return (
    <button onClick={share} disabled={pending || done}
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      {done ? 'Compartida' : 'Compartir sesión'}
    </button>
  )
}
```

- [ ] **Step 2: Insertar el botón en la página de detalle del historial**

Abrir `src/app/(app)/history/[logId]/page.tsx`. Esta página es un Server Component con `params: { logId: string }` (params **síncronos**, Next 14.2) y usa `requireAppUserContext()`. Importar el componente y renderizarlo en la cabecera de la sesión, pasando `params.logId`:

```tsx
import { ShareSessionButton } from '@/components/social/ShareSessionButton'
// …dentro de <header>, junto al título del workout:
<div className="mt-4">
  <ShareSessionButton progressLogId={params.logId} />
</div>
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/social/ShareSessionButton.tsx "src/app/(app)/history/[logId]/page.tsx"
git commit -m "feat(social): compartir una sesión completada desde el historial"
```

---

## Task 23: Suite completa + verificación manual de RLS

**Files:** (sin cambios de código; verificación)

- [ ] **Step 1: Correr toda la suite y el type-check**

Run: `pnpm test && pnpm type-check`
Expected: todos los tests PASS, sin errores de tipos.

- [ ] **Step 2: Checklist manual de RLS** (con dos cuentas de prueba A y B en la app desplegada o en local)

- [ ] A publica un post → B lo ve en `/feed`.
- [ ] B da like y comenta → los contadores suben en el post de A.
- [ ] B clona una rutina de A → aparece en el `/plan` de B; el plan de A no cambia.
- [ ] A bloquea a B → A deja de ver los posts de B y B deja de ver los de A.
- [ ] B intenta abrir el `/post/[id]` de un post de A tras bloqueo mutuo → no se muestra (404/oculto).
- [ ] Verificar en SQL que `public_profiles` no expone `weight_kg`/`height_cm`/`date_of_birth`/`gender`:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='public_profiles';
```
Esperado: solo `id, username, full_name, avatar_url`.

- [ ] B no puede borrar un post ni un comentario de A (el menú no ofrece "Eliminar" y la acción filtra por `user_id`).

- [ ] **Step 3: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "test(social): verificación de suite y checklist RLS de Fase 1"
```

---

## Self-Review (cobertura del spec)

- Modelo de datos (posts/likes/comments/reports/blocks + snapshots) → Tasks 1, 4, 5.
- RLS + `public_profiles` → Task 2; verificación → Task 23.
- Bucket de fotos → Task 3; helpers → Task 8; subida → Task 10.
- Snapshots de sesión/rutina → Task 5; clonado → Task 6, 10.
- Feed Descubrir + keyset → Tasks 7, 13, 17.
- Server Actions (crear/compartir/eliminar/clonar/like/comentar/reportar/bloquear) → Tasks 10–13.
- UI (PostCard, tarjetas, like, menú, reporte, compositor, comentarios, perfil) → Tasks 14–20, 22.
- Moderación (reportar/bloquear/ocultar/borrar propio) → Tasks 12, 15.
- Navegación → Task 21.
- Testing (unit + checklist RLS) → Tasks 5–8, 23.

**Fuera de alcance (Fase 2/3), correctamente excluido:** follows, feed "Siguiendo", notificaciones/push, cuentas privadas, comentarios anidados.
