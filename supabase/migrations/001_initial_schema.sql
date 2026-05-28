-- ============================================================
-- FitAI — Initial Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ─────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- HELPER: auto-update updated_at
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────
-- 1. PROFILES
--    One row per auth.users row.
--    Created automatically on signup via trigger.
-- ─────────────────────────────────────────
CREATE TABLE profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT        UNIQUE,
  full_name       TEXT,
  avatar_url      TEXT,
  -- body metrics
  height_cm       NUMERIC(5,1),
  weight_kg       NUMERIC(5,1),
  date_of_birth   DATE,
  gender          TEXT        CHECK (gender IN ('male','female','other','prefer_not_to_say')),
  -- fitness profile
  fitness_level   TEXT        CHECK (fitness_level IN ('beginner','intermediate','advanced')),
  primary_goal    TEXT        CHECK (primary_goal IN ('lose_weight','build_muscle','improve_endurance','stay_active','other')),
  -- onboarding
  onboarding_done BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─────────────────────────────────────────
-- 2. EXERCISE LIBRARY  (shared, admin-managed)
-- ─────────────────────────────────────────
CREATE TABLE exercises (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  description    TEXT,
  muscle_groups  TEXT[]      NOT NULL DEFAULT '{}',
  equipment      TEXT[]               DEFAULT '{}',
  difficulty     TEXT        CHECK (difficulty IN ('beginner','intermediate','advanced')),
  exercise_type  TEXT        CHECK (exercise_type IN ('strength','cardio','flexibility','balance','hiit')),
  instructions   TEXT,
  video_url      TEXT,
  image_url      TEXT,
  is_public      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exercises_type       ON exercises(exercise_type);
CREATE INDEX idx_exercises_difficulty ON exercises(difficulty);
CREATE INDEX idx_exercises_muscles    ON exercises USING GIN(muscle_groups);


-- ─────────────────────────────────────────
-- 3. WORKOUT PLANS
-- ─────────────────────────────────────────
CREATE TABLE workout_plans (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  goal             TEXT,
  duration_weeks   INTEGER,
  days_per_week    INTEGER     CHECK (days_per_week BETWEEN 1 AND 7),
  difficulty       TEXT        CHECK (difficulty IN ('beginner','intermediate','advanced')),
  is_active        BOOLEAN     NOT NULL DEFAULT FALSE,
  -- AI generation metadata
  generated_by_ai  BOOLEAN     NOT NULL DEFAULT FALSE,
  ai_prompt        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_workout_plans_updated_at
  BEFORE UPDATE ON workout_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_workout_plans_user ON workout_plans(user_id);


-- ─────────────────────────────────────────
-- 4. WORKOUTS  (sessions within a plan)
-- ─────────────────────────────────────────
CREATE TABLE workouts (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                     UUID        REFERENCES workout_plans(id) ON DELETE SET NULL,
  user_id                     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                        TEXT        NOT NULL,
  day_of_week                 INTEGER     CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  order_in_plan               INTEGER,
  estimated_duration_minutes  INTEGER,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workouts_user ON workouts(user_id);
CREATE INDEX idx_workouts_plan ON workouts(plan_id);


-- ─────────────────────────────────────────
-- 5. WORKOUT EXERCISES  (exercises within a workout)
-- ─────────────────────────────────────────
CREATE TABLE workout_exercises (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id       UUID        NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id      UUID        NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  order_index      INTEGER     NOT NULL DEFAULT 0,
  sets             INTEGER              DEFAULT 3,
  reps             INTEGER,
  duration_seconds INTEGER,                   -- for timed exercises
  rest_seconds     INTEGER              DEFAULT 60,
  weight_kg        NUMERIC(6,2),
  notes            TEXT
);

CREATE INDEX idx_workout_exercises_workout   ON workout_exercises(workout_id);
CREATE INDEX idx_workout_exercises_exercise  ON workout_exercises(exercise_id);


-- ─────────────────────────────────────────
-- 6. PROGRESS LOGS  (completed sessions)
-- ─────────────────────────────────────────
CREATE TABLE progress_logs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id         UUID        REFERENCES workouts(id) ON DELETE SET NULL,
  completed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes   INTEGER,
  notes              TEXT,
  mood_rating        INTEGER     CHECK (mood_rating BETWEEN 1 AND 5),
  energy_rating      INTEGER     CHECK (energy_rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_progress_logs_user         ON progress_logs(user_id);
CREATE INDEX idx_progress_logs_completed_at ON progress_logs(completed_at DESC);


-- ─────────────────────────────────────────
-- 7. EXERCISE LOGS  (per-exercise data in a session)
-- ─────────────────────────────────────────
CREATE TABLE exercise_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_log_id  UUID        NOT NULL REFERENCES progress_logs(id) ON DELETE CASCADE,
  exercise_id      UUID        NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  sets_completed   INTEGER,
  reps_completed   INTEGER[],       -- per-set array, e.g. {12,10,8}
  weights_kg       NUMERIC(6,2)[],  -- per-set array
  duration_seconds INTEGER,
  notes            TEXT
);

CREATE INDEX idx_exercise_logs_progress ON exercise_logs(progress_log_id);
CREATE INDEX idx_exercise_logs_exercise ON exercise_logs(exercise_id);


-- ─────────────────────────────────────────
-- 8. BODY MEASUREMENTS
-- ─────────────────────────────────────────
CREATE TABLE measurements (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_kg            NUMERIC(5,1),
  body_fat_percentage  NUMERIC(4,1),
  muscle_mass_kg       NUMERIC(5,1),
  -- optional circumferences (cm)
  chest_cm             NUMERIC(5,1),
  waist_cm             NUMERIC(5,1),
  hips_cm              NUMERIC(5,1),
  arms_cm              NUMERIC(5,1),
  legs_cm              NUMERIC(5,1),
  notes                TEXT
);

CREATE INDEX idx_measurements_user        ON measurements(user_id);
CREATE INDEX idx_measurements_recorded_at ON measurements(recorded_at DESC);


-- ─────────────────────────────────────────
-- 9. AI CONVERSATIONS
-- ─────────────────────────────────────────
CREATE TABLE ai_conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'Nueva conversación',
  context    TEXT        CHECK (context IN ('general','workout_plan','nutrition','progress')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);


CREATE TABLE ai_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user','assistant')),
  content          TEXT        NOT NULL,
  -- optional: plan/workout generated in this message
  generated_plan_id UUID       REFERENCES workout_plans(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id);


-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────

ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises   ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages         ENABLE ROW LEVEL SECURITY;

-- profiles: users can only read/write their own row
CREATE POLICY "profiles: own row" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- exercises: public read, no write from client
CREATE POLICY "exercises: public read" ON exercises
  FOR SELECT USING (is_public = TRUE);

-- workout_plans
CREATE POLICY "workout_plans: own" ON workout_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- workouts
CREATE POLICY "workouts: own" ON workouts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- workout_exercises: access via parent workout
CREATE POLICY "workout_exercises: own" ON workout_exercises
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workouts w
      WHERE w.id = workout_exercises.workout_id
        AND w.user_id = auth.uid()
    )
  );

-- progress_logs
CREATE POLICY "progress_logs: own" ON progress_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- exercise_logs: access via parent progress_log
CREATE POLICY "exercise_logs: own" ON exercise_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM progress_logs pl
      WHERE pl.id = exercise_logs.progress_log_id
        AND pl.user_id = auth.uid()
    )
  );

-- measurements
CREATE POLICY "measurements: own" ON measurements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_conversations
CREATE POLICY "ai_conversations: own" ON ai_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ai_messages: access via parent conversation
CREATE POLICY "ai_messages: own" ON ai_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────
-- SEED: exercise library (básico)
-- ─────────────────────────────────────────
INSERT INTO exercises (name, description, muscle_groups, equipment, difficulty, exercise_type, instructions) VALUES
  ('Sentadilla',          'Ejercicio compuesto para tren inferior.',      ARRAY['cuádriceps','glúteos','isquiotibiales'], ARRAY['ninguno'],         'beginner',     'strength',     'De pie con pies a la anchura de hombros. Baja como si fueras a sentarte. Mantén la espalda recta.'),
  ('Press de banca',      'Ejercicio compuesto para pecho.',             ARRAY['pecho','tríceps','deltoides anterior'],  ARRAY['barra','banco'],   'intermediate', 'strength',     'Tumbado en el banco, agarra la barra a la anchura de hombros. Baja hasta el pecho y sube explosivamente.'),
  ('Peso muerto',         'Ejercicio compuesto fundamental.',            ARRAY['isquiotibiales','glúteos','espalda baja','trapecio'], ARRAY['barra'], 'intermediate', 'strength',     'Pies bajo la barra, agarre doble. Espalda neutral, empuja el suelo y extiende caderas y rodillas.'),
  ('Dominadas',           'Jala tu propio peso.',                        ARRAY['dorsal','bíceps','romboides'],           ARRAY['barra dominadas'], 'intermediate', 'strength',     'Cuelga de la barra con agarre prono. Lleva el pecho hacia la barra.'),
  ('Press militar',       'Press de hombros con barra.',                 ARRAY['deltoides','tríceps','trapecio'],        ARRAY['barra'],           'intermediate', 'strength',     'De pie, barra a la altura de los hombros. Empuja hacia arriba hasta extender los brazos.'),
  ('Curl de bíceps',      'Aislamiento de bíceps.',                      ARRAY['bíceps'],                               ARRAY['mancuernas'],      'beginner',     'strength',     'De pie, codos pegados al cuerpo. Sube las mancuernas girando el antebrazo.'),
  ('Extensión tríceps',   'Aislamiento de tríceps en polea.',            ARRAY['tríceps'],                              ARRAY['polea'],           'beginner',     'strength',     'Agarra la cuerda en polea alta. Extiende los codos hasta bloquear.'),
  ('Zancadas',            'Ejercicio unilateral para tren inferior.',    ARRAY['cuádriceps','glúteos','isquiotibiales'], ARRAY['ninguno'],         'beginner',     'strength',     'Un paso adelante, baja la rodilla trasera al suelo. Alterna piernas.'),
  ('Hip thrust',          'Aislamiento de glúteos.',                     ARRAY['glúteos','isquiotibiales'],             ARRAY['banco','barra'],   'beginner',     'strength',     'Hombros en el banco, barra en caderas. Empuja las caderas hacia arriba.'),
  ('Plancha',             'Core estático.',                              ARRAY['core','hombros'],                       ARRAY['ninguno'],         'beginner',     'strength',     'Apóyate en antebrazos y puntas de pies. Cuerpo en línea recta. Aguanta.'),
  ('Burpees',             'Ejercicio de cuerpo completo de alta intensidad.', ARRAY['cuerpo completo'],              ARRAY['ninguno'],         'intermediate', 'hiit',         'Desde de pie: agáchate, salta los pies atrás, flexión, vuelve y salta arriba.'),
  ('Carrera (cinta)',     'Cardio en cinta de correr.',                  ARRAY['piernas','cardiovascular'],             ARRAY['cinta'],           'beginner',     'cardio',       'Ajusta la velocidad y corre manteniendo una postura erguida.'),
  ('Remo con mancuerna',  'Remo unilateral para espalda.',               ARRAY['dorsal','romboides','bíceps'],          ARRAY['mancuernas','banco'], 'beginner',  'strength',     'Rodilla y mano en el banco. Tira la mancuerna hacia la cadera.'),
  ('Elevaciones laterales','Hombros laterales.',                         ARRAY['deltoides lateral'],                    ARRAY['mancuernas'],      'beginner',     'strength',     'De pie, levanta las mancuernas hacia los lados hasta la altura de los hombros.'),
  ('Sentadilla búlgara',  'Sentadilla unilateral elevada.',              ARRAY['cuádriceps','glúteos'],                 ARRAY['banco','mancuernas'],'advanced',   'strength',     'Pie trasero elevado en banco, baja la rodilla delantera al suelo.');
