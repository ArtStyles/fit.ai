# Migración del catálogo de ejercicios a free-exercise-db — Diseño

**Fecha:** 2026-06-06
**Estado:** Aprobado para planificación

## Problema

El catálogo actual proviene de **wger** (851 ejercicios), pero wger solo tiene imagen para
~26% (~220 ejercicios). El resto se muestra con placeholder, lo que vacía de sentido el apoyo
visual en una app fitness. Es un problema de **fuente de datos**, no de código: las vistas
(catálogo, ficha, sesión) y el componente `ExerciseImage` ya funcionan.

## Objetivo

Reemplazar el catálogo por **free-exercise-db** (yuhonas/free-exercise-db, ~800 ejercicios,
dominio público / Unlicense), donde **cada ejercicio trae imágenes** + instrucciones + músculos
+ equipo. Esto sube la cobertura de imágenes de ~26% a prácticamente todo el catálogo, sin
costo ni API key, reutilizando el pipeline de imágenes ya construido (bucket
`exercise-images`, `ExerciseImage`, catálogo/ficha/sesión).

## Decisiones tomadas (brainstorming)

- **Reemplazo total** del catálogo (pre-lanzamiento; todos los datos de la BD son de prueba).
- **Se puede borrar todo**: workouts, planes, historial y ejercicios actuales.
- **Una imagen por ejercicio** en Fase 1 (`images[0]`). Mostrar las dos (inicio/fin del
  movimiento) queda para una Fase 2.

## Fuente de datos

- Dataset combinado del repo `yuhonas/free-exercise-db` (un solo JSON con todos los
  ejercicios; URL exacta del `dist/` se fija en el plan).
- Imágenes en el CDN raw de GitHub, patrón
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg`.
  Son **URLs absolutas** → sin el problema de URLs relativas que tenía wger.
- Forma de cada ejercicio: `id`, `name`, `force`, `level`, `mechanic`, `equipment` (string),
  `primaryMuscles[]`, `secondaryMuscles[]`, `instructions[]`, `category`, `images[]`.

## 1. Esquema (migración nueva)

Añadir a `exercises`:
- `source TEXT` (p. ej. `'free-exercise-db'`)
- `external_id TEXT`
- Índice **UNIQUE (source, external_id)** como nueva clave de dedup del seed.

`wger_id` queda nullable y sin uso nuevo (no se elimina, para no romper migraciones previas).

## 2. Reset de datos (pre-lanzamiento)

Las FKs `workout_exercises.exercise_id` y `exercise_logs.exercise_id` son
`ON DELETE RESTRICT`, así que el reemplazo limpio vacía las tablas en orden de dependencia
antes de re-sembrar. **Esto borra todos los datos de prueba** (workouts, planes, historial):

```
exercise_logs → progress_logs → workout_exercises → workouts → plans → exercises
```

Se ejecuta mediante un paso explícito de reset (TRUNCATE … RESTART IDENTITY CASCADE, o
borrado ordenado) que el dueño confirma antes de correr el seed. El orden y las tablas exactas
se fijan en el plan tras verificar el grafo de FKs en `001_initial_schema.sql`.

## 3. Nuevo seed `free-exercise-db`

Script nuevo (sustituye al de wger). Pasos:
1. Descargar el dataset (un fetch del JSON combinado). Sin API key.
2. Resetear el catálogo y datos dependientes (paso 2).
3. Por cada ejercicio, insertar mapeando:
   - `name` → `name`
   - `primaryMuscles` + `secondaryMuscles` → `muscle_groups` (text[])
   - `[equipment]` → `equipment` (text[]); `null`/`"body only"` → `[]`
   - `mechanic === 'compound'` → `is_compound` (null → false)
   - `instructions` (array) → `instructions` (texto unido); `description` = null
   - `level` → `difficulty`: `beginner`→beginner, `intermediate`→intermediate,
     `expert`→**advanced**
   - `category` → `exercise_type`: `strength`/`powerlifting`/`strongman`/
     `olympic weightlifting`→**strength**, `stretching`→**flexibility**, `cardio`→**cardio**,
     `plyometrics`→**hiit**
   - `source = 'free-exercise-db'`, `external_id = <id del dataset>`
   - `is_public = true`
4. **Imágenes:** re-alojar `images[0]` al bucket `exercise-images` (idempotente, como el seed
   actual: listar claves existentes, descargar, subir, guardar URL pública). La clave del
   objeto usa `external_id` (string) en vez de `wger_id`.

Los mapeadores (`level→difficulty`, `category→exercise_type`, `equipment`, `is_compound`,
`instructions→texto`) se implementan como **funciones puras testeables**.

## 4. Generador de planes con IA (`src/lib/ai/filter.ts`)

Adaptar el vocabulario de equipamiento al de free-exercise-db (hoy está afinado a wger):
- `BODYWEIGHT_TERMS`: añadir `'body only'` (y mantener los genéricos).
- `EQUIPMENT_MAP`: mapear el equipo del onboarding a los términos del dataset
  (`dumbbell`, `barbell`, `kettlebell`, `cable`, `machine`, `bands`, `medicine ball`,
  `exercise ball`, `e-z curl bar`, `foam roll`, `other`).

El resto del generador no cambia: sigue seleccionando por columnas y referenciando por
`id`/`name`.

## 5. UI

Sin cambios. `ExerciseImage`, catálogo (`ExerciseGrid`), ficha (`[exerciseId]/page.tsx`) y
sesión (`ExerciseCard`, `SessionExercisePicker`) ya consumen `image_url`/`imageUrl`. Solo
cambia el origen de los datos; la cobertura sube a casi todo el catálogo.

## 6. Retiro de wger

- Retirar el seed de wger (`scripts/seed-exercises.ts`) y el cliente `src/lib/wger/client.ts`
  (queda sin uso). Decisión de borrar vs. dejar marcado como deprecated, en el plan.
- `src/lib/wger/imageStorage.ts` (helpers `extensionFromUrl`, `storageObjectKey`) **se
  conserva y reutiliza** en el nuevo seed.
- Actualizar el script `seed:exercises` de `package.json` para apuntar al nuevo seed.

## 7. Pruebas

- **Unitario (vitest, entorno node, funciones puras):** los mapeadores del nuevo seed
  (`level→difficulty`, `category→exercise_type`, `equipment`, `is_compound`,
  `instructions→texto`) y la construcción de la clave de Storage con `external_id`.
- **Manual:** tras correr migración + reset + seed, verificar catálogo/ficha/sesión con
  imágenes reales; generar un plan con IA y confirmar que el filtro de equipo funciona con el
  nuevo vocabulario.

## Fuera de alcance

- Mostrar dos imágenes (inicio/fin del movimiento) — Fase 2.
- GIFs animados (ExerciseDB.io) — Fase 2 premium.
- Cambios en login/registro u otros flujos no relacionados.

## Pasos manuales (los hace el dueño)

1. Ejecutar la migración del esquema (`source`/`external_id`) en Supabase.
2. Ejecutar el reset + nuevo seed (`pnpm seed:exercises`) con `SUPABASE_SERVICE_ROLE_KEY`.
