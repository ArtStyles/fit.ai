# Imágenes de ejercicios (Fase 1) — Diseño

**Fecha:** 2026-06-06
**Estado:** Aprobado para planificación

## Problema

FitAI es una app fitness y muchos usuarios no conocen los ejercicios por su nombre; necesitan
apoyo visual. La tabla `exercises` **ya tiene un campo `image_url`** y el seed desde wger
(`scripts/seed-exercises.ts`) **ya guarda la imagen principal** de cada ejercicio, pero
**ninguna vista la muestra**:

- `/exercises` (grid + modal, `src/app/(app)/exercises/ExerciseGrid.tsx`): solo un emoji.
- Ficha `/exercises/[id]` (`src/app/(app)/exercises/[exerciseId]/page.tsx`): ícono de mancuerna;
  ni siquiera selecciona `image_url`.
- Vista de sesión (`src/components/session/ExerciseCard.tsx`): solo texto.

## Objetivo (Fase 1)

Mostrar de inmediato las imágenes **estáticas** que ya existen, re-alojadas en almacenamiento
propio, en las tres vistas, con un placeholder cuidado para los ejercicios sin imagen. Los
**GIFs animados quedan para una Fase 2** (fuera de alcance).

## Decisiones tomadas (durante brainstorming)

- **Tipo de visual:** estático ahora (fases: animado después).
- **Vistas:** catálogo (tarjetas + modal), ficha de detalle, y sesión (vista + selectores).
- **Hosting:** re-alojar en Supabase Storage (no hotlink a wger).
- **Placeholder:** ícono de mancuerna (lucide `Dumbbell`) sobre degradado sutil.

## Enfoque elegido

**Componente `<ExerciseImage>` reutilizable + re-hosting en el seed.** Un único componente con
la lógica de imagen/placeholder/fallback, usado en las tres vistas (DRY); el seed se extiende
para descargar de wger, subir a Supabase Storage y guardar la URL propia. Se descartaron:
(B) imagen inline por vista — duplica lógica de placeholder/error; (C) tabla `exercise_images`
con varias imágenes por ejercicio — sobre-ingeniería para una sola imagen principal (es la
extensión natural de la Fase 2).

## 1. Almacenamiento y migración de imágenes

- Bucket público nuevo en Supabase Storage: **`exercise-images`**.
- Extender `scripts/seed-exercises.ts`: por cada ejercicio con imagen principal en wger →
  descargar el binario, subir como `exercise-images/{wger_id}.{ext}` (extensión derivada de la
  URL/_content-type_), y guardar en `image_url` la **URL pública de Supabase**.
- **Idempotente:** si `image_url` ya apunta a Supabase Storage, se omite la descarga/subida.
- Ejercicios sin imagen en wger → `image_url = null`.
- Migración = re-ejecutar `pnpm seed:exercises` (con `SUPABASE_SERVICE_ROLE_KEY`).

## 2. Componente compartido `ExerciseImage`

- Ubicación: `src/components/exercises/ExerciseImage.tsx`.
- Props: `src: string | null`, `alt: string`, `variant: 'thumb' | 'hero'` (tamaños/clases),
  y opcional `className`.
- Si hay `src` → renderiza `next/image`. Si `src` es `null` **o** la imagen falla al cargar
  (`onError`) → **placeholder**: ícono `Dumbbell` centrado sobre un degradado sutil
  (consistente con el lenguaje visual oscuro actual). Nunca se muestra un hueco roto.
- Añadir el host de Supabase Storage a `images.remotePatterns` en `next.config`.
- La decisión "src real vs placeholder" se extrae a un helper puro testeable
  (p. ej. `resolveExerciseImage(src): { kind: 'image' | 'placeholder'; src?: string }`).

## 3. Dónde se muestra

- **Catálogo `/exercises`** (`ExerciseGrid.tsx`): miniatura (`thumb`) arriba de cada tarjeta,
  en lugar del bloque de emoji actual; imagen `hero` en el header del modal de detalle.
- **Ficha `/exercises/[id]`** (`[exerciseId]/page.tsx`): imagen `hero` cerca del título.
  Requiere **añadir `image_url`** al `SELECT` del fallback y al payload del RPC
  `get_exercise_detail_payload` (hoy no lo traen) y a los tipos `ExerciseRow`.
- **Sesión** (`ExerciseCard.tsx` de sesión + `SessionExercisePicker`/`ExercisePicker`):
  miniatura junto a cada ejercicio. **Parte más laboriosa**: hay que propagar `image_url`
  por el `sessionStore` (tipos `SessionExerciseDraft` / `ExerciseSession`) y por donde se
  construyen los drafts (generación de plan / carga de la sesión).

## 4. Fallback / cobertura

- Todo ejercicio sin imagen, o con carga fallida, muestra el placeholder de mancuerna.
- **Caveat:** la cobertura de imágenes en wger es parcial; en la Fase 1 una parte del catálogo
  se verá con placeholder. Mejorar cobertura (más fuentes/curaduría) queda **fuera de alcance**
  (Fase 2, junto con los GIFs).

## 5. Secuencia sugerida (sub-fases dentro de la Fase 1)

1. **Storage + seed re-hosting** (base de datos lista con URLs propias).
2. **Componente `ExerciseImage` + catálogo + ficha** (cambios contenidos, entrega visible).
3. **Integración en sesión** (plumbing por el store; la pieza más pesada).

## 6. Pruebas

- **Unitario (vitest, entorno node, funciones puras — convención del repo):**
  - Helper `resolveExerciseImage` (decide imagen vs placeholder).
  - Lógica pura del re-hosting: construir la ruta `exercise-images/{wger_id}.{ext}`, derivar la
    extensión, y detectar si una URL ya está en Supabase Storage (para idempotencia).
- **Manual:** las 3 vistas con (a) imagen presente, (b) ausente → placeholder de mancuerna,
  (c) URL rota → placeholder.

## Fuera de alcance

- GIFs / demostraciones animadas (Fase 2).
- Mejorar la cobertura de imágenes con fuentes adicionales o curaduría manual.
- Varias imágenes por ejercicio / tabla `exercise_images`.
- Cambios en login, registro u otros flujos no relacionados.
