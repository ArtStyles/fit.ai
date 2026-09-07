# Catalogo de movimiento Vekira - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Entregar un piloto local y versionado de diez demostraciones WebP animadas, profesionales y originales de Vekira, con validacion determinista, reproduccion voluntaria en la ficha del ejercicio y contrato de datos preparado sin mutaciones remotas.

**Architecture:** La tuberia de assets convierte hojas supervisadas de seis celdas en previews WebP deterministas y los valida contra un objeto `motion` opcional del manifiesto V1. La ficha recibe dos URLs independientes: mantiene el poster optimizado como estado inicial/fallback y monta un `<img>` nativo solo tras la accion del usuario para preservar la animacion. Base de datos, tipos y mapping se preparan como contrato local; la migracion no se aplica y el mapping solo admite dry-run.

**Tech Stack:** Python 3 + Pillow, TypeScript, React/Next.js, Vitest, Playwright Chromium, Supabase SQL, pnpm, ImageGen.

**Spec:** `docs/superpowers/specs/2026-08-30-catalogo-movimiento-vekira-10-design.md`

## Global Constraints

- Trabajar solo en `D:\work\project\.worktrees\exercise-visual-pilot`, rama `codex/exercise-visual-pilot`.
- Antes de editar, confirmar `git status --short` y preservar cualquier cambio ajeno que aparezca.
- Usar `superpowers:test-driven-development` en las tareas 1-5 y `superpowers:verification-before-completion` en cada commit y en el gate final.
- Usar `imagegen` solo en las tareas 6-8, despues de leer su `SKILL.md`; las referencias permitidas son exclusivamente posters/sources Vekira aprobados.
- No usar capturas, imagenes, GIFs, marcas ni activos de Hevy o de terceros.
- No aplicar migraciones, no subir a Supabase Storage, no publicar, no hacer push y no fusionar la rama.
- Mantener los 50 ejercicios en estado global `visual-approved`; no crear `reviews.technique`, `technique-approved` ni `published`.
- Versionar solamente `public/exercises/catalog/v1/<slug>/motion-preview.webp`. Mantener hojas fuente, celdas, rechazos y contact sheets bajo `.artifacts/exercises/catalog-v1-motion/<slug>/`, ya ignorado por Git.
- Tratar 300 KB como objetivo de optimizacion y 500 KiB (`512000` bytes) como limite bloqueante.
- Una oleada no avanza si el controlador o el revisor visual independiente reportan un hallazgo Critical o Important.
- Los tres fallos temporales conocidos de notificaciones no forman parte de este alcance. La suite completa se ejecuta y se reporta honestamente; no se declara verde si continúan.
- Antes de cada commit ejecutar `git diff --check` y stagear solo los archivos de la tarea.

## Fixed Motion Contract

```ts
export const CATALOG_V1_MOTION_PILOT_SLUGS = [
  'arnold-press-mancuernas',
  'sentadilla-trasera-barra',
  'press-banca-barra',
  'peso-muerto-rumano-barra',
  'jalon-pecho-polea',
  'remo-sentado-polea',
  'elevacion-lateral-mancuernas',
  'curl-biceps-barra-ez',
  'extension-triceps-cuerda',
  'rueda-abdominal-rodillas',
] as const

export const CATALOG_V1_MOTION_SEQUENCE = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1] as const
export const CATALOG_V1_MOTION_FRAME_COUNT = 10 as const
export const CATALOG_V1_MOTION_FRAME_DURATION_MS = 180 as const
export const CATALOG_V1_MOTION_MAX_BYTES = 500 * 1024
```

Estas constantes son la unica fuente de verdad TypeScript para el gate del piloto. Python usa los mismos valores como constantes locales y sus pruebas comparan el contrato exacto.

---

### Task 1: Endurecer el constructor determinista de previews

**Files:**

- Modify: `scripts/build-exercise-motion-preview.py`
- Modify: `scripts/__tests__/test_build_exercise_motion_preview.py`

**Step 1: Escribir primero las pruebas que faltan**

Ampliar `BuildExerciseMotionPreviewTest` con casos que verifiquen:

```py
def test_rejects_a_non_square_sheet(self):
    # 300 x 180 debe fallar antes de recortar.
    self.assertIn("source sheet must be square", result.stderr)

def test_rejects_a_sheet_that_cannot_form_a_three_by_two_grid(self):
    # 302 x 302 no es divisible entre 3.
    self.assertIn("source sheet dimensions must be divisible by 3 and 2", result.stderr)

def test_writes_rgb_frames_with_exact_timing_and_size_budget(self):
    with Image.open(output) as animation:
        self.assertEqual(animation.n_frames, 10)
        for index in range(animation.n_frames):
            animation.seek(index)
            self.assertEqual(animation.mode, "RGB")
            self.assertEqual(animation.info["duration"], 180)
    self.assertLessEqual(output.stat().st_size, 500 * 1024)

def test_can_write_a_local_contact_sheet(self):
    self.assertTrue(contact_sheet.is_file())
    with Image.open(contact_sheet) as image:
        self.assertEqual(image.size, (5 * 256, 2 * 256))
```

Actualizar el test existente para comprobar tambien que la sexta celda no aparece en la secuencia y que el CLI ya no menciona Arnold Press.

**Step 2: Ejecutar el test y confirmar rojo**

Run:

```powershell
python -m unittest scripts.__tests__.test_build_exercise_motion_preview -v
```

Expected: FAIL porque el script acepta hojas invalidas, no comprueba duraciones/peso y no soporta `--contact-sheet`.

**Step 3: Generalizar el constructor**

Introducir y usar exactamente estas constantes:

```py
CANVAS_SIZE = (512, 512)
CANVAS_COLOR = (248, 243, 235)
CONTACT_TILE_SIZE = 256
ANIMATION_INDEXES = (0, 1, 2, 3, 4, 3, 2, 1, 0, 1)
FRAME_DURATION_MS = 180
MAX_PREVIEW_BYTES = 500 * 1024
```

Crear validaciones puras antes del recorte:

```py
def validate_source_sheet(sheet: Image.Image) -> None:
    if sheet.width != sheet.height:
        raise ValueError("source sheet must be square")
    if sheet.width % 3 != 0 or sheet.height % 2 != 0:
        raise ValueError("source sheet dimensions must be divisible by 3 and 2")
```

Crear `validate_motion_preview(output: Path) -> None` que abra el WebP y rechace formato distinto de WEBP, ausencia de animacion, tamaño distinto de 512 x 512, numero distinto de 10, duracion distinta de 180 ms en cualquier frame, frames no convertibles a RGB y peso superior a 512000 bytes.

Crear `build_contact_sheet(frames: list[Image.Image], output: Path) -> None` que use las diez poses del loop, cinco columnas, dos filas y tiles RGB de 256 x 256. El argumento CLI es opcional:

```py
parser = argparse.ArgumentParser(description="Build a deterministic Vekira exercise motion preview.")
parser.add_argument("--input", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--contact-sheet", type=Path)
```

Cambiar la firma a `build_motion_preview(source: Path, output: Path, contact_sheet: Path | None = None) -> None`. La funcion construye el contact sheet con los diez frames ya normalizados cuando recibe el tercer argumento, sin reabrir ni reinterpretar la fuente. Mantener WebP `quality=86`, `method=6`, `loop=0`, `save_all=True`.

**Step 4: Ejecutar las pruebas y el prototipo existente**

Run:

```powershell
python -m unittest scripts.__tests__.test_build_exercise_motion_preview -v
python scripts/build-exercise-motion-preview.py --input public/exercises/pilot/arnold-press-mancuernas/motion-source.png --output "$env:TEMP\vekira-arnold-motion-check.webp" --contact-sheet "$env:TEMP\vekira-arnold-motion-sheet.webp"
```

Expected: todos los tests PASS; los dos archivos temporales se crean y el preview queda por debajo de 512000 bytes.

**Step 5: Verificar y hacer commit**

Run:

```powershell
git diff --check
git add scripts/build-exercise-motion-preview.py scripts/__tests__/test_build_exercise_motion_preview.py
git diff --cached --check
git commit -m "feat: harden Vekira motion preview builder"
```

---

### Task 2: Añadir el contrato `motion` y sus validadores V1

**Files:**

- Modify: `src/lib/exercises/visualCatalogV1.ts`
- Modify: `src/lib/exercises/__tests__/visualCatalogV1.test.ts`
- Modify: `scripts/validate-exercise-visual-catalog-v1.ts`
- Modify: `scripts/__tests__/validateExerciseVisualCatalogV1.test.ts`
- Modify: `scripts/validate_exercise_visual_assets.py`
- Modify: `scripts/__tests__/test_exercise_visual_assets.py`
- Modify: `package.json`

**Step 1: Escribir pruebas rojas del contrato de manifiesto**

Agregar fixtures de motion validos y pruebas para:

- `motion` ausente sigue siendo valido.
- Ruta distinta de `/exercises/catalog/v1/<slug>/motion-preview.webp` falla.
- `status`, hashes lowercase SHA-256, `previewBytes`, `frameCount`, `frameDurationMs`, secuencia y review se validan.
- `previewBytes = 512001` falla y `512000` pasa.
- El gate del piloto exige exactamente los diez slugs fijos, todos `visual-approved`, y rechaza motion en cualquiera de los otros 40.
- El gate rechaza cualquier estado global distinto de `visual-approved` o cualquier `reviews.technique` en los 50 registros.

Usar una funcion separada y exportada para el gate:

```ts
expect(validateCatalogV1MotionPilot(manifest)).toEqual([])
expect(validateCatalogV1MotionPilot(withOnlyNine)).toContain(
  'motion pilot must contain exactly the 10 selected slugs',
)
```

**Step 2: Escribir pruebas rojas de archivos reales**

En TypeScript, ampliar `validateCatalogV1AssetFiles` para comprobar path seguro, archivo regular, hash y tamaño del preview declarado, ademas del hash del `motion-source.png` local. En Python, generar un WebP animado minimo con Pillow y probar:

```py
self.assertEqual(
    validate_motion_file(preview),
    [],
)
```

Añadir variantes que fallen por formato PNG, 511 x 512, 9 frames, 200 ms, archivo mayor de 512000 bytes y digest distinto. El test del CLI debe verificar que `--motion-pilot` falla con nueve assets y pasa con los diez exactos.

**Step 3: Ejecutar los tests y confirmar rojo**

Run:

```powershell
pnpm vitest run src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
```

Expected: FAIL por tipos, funciones y flags todavia inexistentes.

**Step 4: Implementar tipos y validacion semantica**

Agregar las constantes de `Fixed Motion Contract` y estos tipos:

```ts
export type CatalogV1MotionPilotSlug = (typeof CATALOG_V1_MOTION_PILOT_SLUGS)[number]

export type CatalogV1Motion = {
  status: 'visual-approved'
  preview: string
  previewSha256: string
  previewBytes: number
  sourceSha256: string
  frameCount: 10
  frameDurationMs: 180
  sequence: typeof CATALOG_V1_MOTION_SEQUENCE
  review: CatalogV1VisualReview
}
```

Agregar `motion?: CatalogV1Motion` directamente a `CatalogV1ExerciseEntry`, no dentro de `assets`. En `validateCatalogV1Manifest`, validar cualquier motion presente. Reutilizar `validateVisualReview`; no duplicar reglas de reviewer/notas.

Implementar:

```ts
export function validateCatalogV1MotionPilot(manifest: CatalogV1Manifest): string[]
```

La funcion compara sets exactos, comprueba que los otros 40 no tienen `motion`, exige `exercise.status === 'visual-approved'` para los 50 y rechaza `exercise.reviews.technique !== undefined`.

**Step 5: Implementar validacion de filesystem**

Extender opciones sin romper llamadas existentes:

```ts
type ValidationOptions = {
  complete?: boolean
  motionPilot?: boolean
  motionArtifactsRoot?: string
}
```

Todo `motion` presente se inspecciona incluso en modo parcial. `motionPilot: true` agrega el gate exacto. La ruta se resuelve dentro de `publicRoot` usando el mismo control de realpath del poster. Comparar `previewBytes`, digest real y limite. Resolver `.artifacts/exercises/catalog-v1-motion/<slug>/motion-source.png` dentro de `motionArtifactsRoot`, exigir archivo regular y comparar su digest real con `sourceSha256`. El CLI pasa explicitamente `path.resolve(root, '.artifacts', 'exercises', 'catalog-v1-motion')`.

En Python, crear:

```py
MOTION_SIZE = (512, 512)
MOTION_FRAME_COUNT = 10
MOTION_FRAME_DURATION_MS = 180
MOTION_MAX_BYTES = 500 * 1024

def validate_motion_file(path: Path) -> list[str]:
    ...
```

La implementacion recorre los diez frames con `seek`, comprueba duracion individual y exige `image.mode == "RGB"` en cada posicion. Extender `validate_catalog_assets` con `motion_artifacts_root: Path | None = None` y `motion_pilot: bool = False`; si no se pasa root, usar `artifacts_root.parent / "catalog-v1-motion"`. Inspeccionar todo `motion` presente, validar el digest del `motion-source.png` local y aplicar el set exacto al activar el flag.

**Step 6: Añadir el comando de gate**

Agregar a `package.json`:

```json
"validate:exercise-catalog-v1:motion-pilot": "tsx scripts/validate-exercise-visual-catalog-v1.ts --complete --motion-pilot && python scripts/validate_exercise_visual_assets.py --complete --motion-pilot"
```

Los dos CLI deben reconocer `--motion-pilot`. No cambiar el comportamiento de los comandos V1 existentes.

**Step 7: Ejecutar focused tests y compatibilidad estatica**

Run:

```powershell
pnpm vitest run src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
pnpm validate:exercise-catalog-v1
pnpm validate:exercise-catalog-v1:complete
```

Expected: PASS. No ejecutar todavia `:motion-pilot`, porque el manifiesto aun no contiene diez previews.

**Step 8: Verificar y hacer commit**

Run:

```powershell
git diff --check
git add package.json src/lib/exercises/visualCatalogV1.ts src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/validate-exercise-visual-catalog-v1.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts scripts/validate_exercise_visual_assets.py scripts/__tests__/test_exercise_visual_assets.py
git diff --cached --check
git commit -m "feat: validate Vekira motion catalog assets"
```

---

### Task 3: Preparar columna, RPC, tipos y mapping explicitamente seguro

**Files:**

- Create: `supabase/migrations/062_exercise_motion_previews.sql`
- Modify: `src/types/database.ts`
- Create: `src/lib/exercises/motionPreviewMapping.ts`
- Create: `src/lib/exercises/__tests__/motionPreviewMapping.test.ts`
- Create: `src/lib/exercises/__tests__/motionPreviewDatabaseContract.test.ts`
- Create: `scripts/map-exercise-motion-previews.ts`
- Create: `scripts/__tests__/mapExerciseMotionPreviews.test.ts`
- Modify: `package.json`

**Step 1: Confirmar el numero de migracion antes de crear el archivo**

Run:

```powershell
Get-ChildItem supabase/migrations -File | Sort-Object Name | Select-Object -Last 5 -ExpandProperty Name
```

Expected after integration with current `main`: `061_exercise_visual_sources_bucket.sql` is followed by `062_exercise_motion_previews.sql`; the earlier 056/057 numbers were renumbered because concurrent trainer migrations now occupy 056–060.

**Step 2: Escribir pruebas rojas del contrato SQL/tipos**

`motionPreviewDatabaseContract.test.ts` debe leer la migracion elegida y `src/types/database.ts` y afirmar:

```ts
expect(migration).toContain('ADD COLUMN IF NOT EXISTS motion_preview_url TEXT')
expect(migration).toContain('e.video_url, e.image_url, e.motion_preview_url')
expect(databaseTypes.match(/motion_preview_url[^\n]*/g)).toHaveLength(4)
```

Las cuatro apariciones requeridas son `exercises.Row`, `exercises.Insert`, `exercises.Update` y el objeto `get_exercise_detail_payload.Returns.exercise`.

**Step 3: Escribir pruebas rojas del mapping**

Definir pruebas para:

- exige exactamente los diez slugs del piloto;
- rechaza slug faltante, slug extra, UUID invalido y UUID duplicado;
- rechaza una fila inexistente o duplicada;
- produce diez planes ordenados como `CATALOG_V1_MOTION_PILOT_SLUGS`;
- usa exclusivamente `motion.preview` del manifiesto, nunca el nombre para asociar;
- el CLI dry-run no invoca `update`, `upsert` ni ninguna funcion de mutacion;
- `--execute` termina con error `--execute is intentionally unavailable in this phase`.

La salida pura esperada por registro es:

```ts
type MotionPreviewUpdatePlan = {
  slug: CatalogV1MotionPilotSlug
  exerciseId: string
  currentName: string
  currentImageUrl: string | null
  currentMotionPreviewUrl: string | null
  nextMotionPreviewUrl: string
}
```

**Step 4: Ejecutar tests y confirmar rojo**

Run:

```powershell
pnpm vitest run src/lib/exercises/__tests__/motionPreviewMapping.test.ts src/lib/exercises/__tests__/motionPreviewDatabaseContract.test.ts scripts/__tests__/mapExerciseMotionPreviews.test.ts
```

Expected: FAIL porque los archivos y la columna no existen.

**Step 5: Crear la migracion idempotente**

El archivo debe contener:

```sql
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS motion_preview_url TEXT;

CREATE OR REPLACE FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH preferred_language AS (
  SELECT COALESCE((SELECT language FROM profiles WHERE id = auth.uid()), 'es') AS value
), target_exercise AS (
  SELECT e.id,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.name_es, e.name) ELSE e.name END AS name,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.description_es, e.description) ELSE e.description END AS description,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.muscle_groups_es, e.muscle_groups) ELSE e.muscle_groups END AS muscle_groups,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.equipment_es, e.equipment) ELSE e.equipment END AS equipment,
    e.difficulty, e.exercise_type, e.is_compound,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.instructions_es, e.instructions) ELSE e.instructions END AS instructions,
    e.video_url, e.image_url, e.motion_preview_url
  FROM exercises e
  WHERE e.id = p_exercise_id AND e.is_public = true
  LIMIT 1
), exercise_rows AS (
  SELECT el.id, el.progress_log_id, el.sets_completed, el.reps_completed, el.weights_kg,
    el.rpe_values, el.notes,
    jsonb_build_object('id', pl.id, 'workout_id', pl.workout_id, 'completed_at', pl.completed_at,
      'duration_minutes', pl.duration_minutes, 'mood_rating', pl.mood_rating,
      'session_context_snapshot', pl.session_context_snapshot) AS progress_log,
    pl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
), workout_rows AS (
  SELECT DISTINCT w.id, w.name, w.focus
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid() AND w.id IS NOT NULL
)
SELECT jsonb_build_object(
  'exercise', (SELECT to_jsonb(te) FROM target_exercise te),
  'logs', COALESCE((SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC) FROM exercise_rows er), '[]'::jsonb),
  'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(wr) ORDER BY wr.name) FROM workout_rows wr), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_exercise_detail_payload(uuid) TO authenticated;
```

No añadir UPDATE de datos ni llamada remota.

**Step 6: Actualizar tipos de base de datos**

Agregar `motion_preview_url: string | null` a `Row` y al retorno RPC; agregar `motion_preview_url?: string | null` a `Insert` y `Update`.

**Step 7: Implementar el planificador puro**

Exportar:

```ts
export function validateMotionPreviewMapping(value: unknown): asserts value is MotionPreviewMapping
export function buildMotionPreviewUpdatePlan(input: {
  mapping: MotionPreviewMapping
  manifest: CatalogV1Manifest
  rows: ExerciseMotionRow[]
}): MotionPreviewUpdatePlan[]
```

Validar UUID con una expresion de UUID canonico, sets exactos y unicidad. Buscar registros solo por UUID. Para cada slug, exigir `entry.motion?.status === 'visual-approved'` y usar `entry.motion.preview` como `nextMotionPreviewUrl`.

**Step 8: Implementar CLI exclusivamente dry-run**

Agregar script de paquete:

```json
"map:exercise-motion-previews": "tsx --env-file-if-exists=.env.local scripts/map-exercise-motion-previews.ts"
```

El CLI exige `--mapping .artifacts/exercises/catalog-v1-motion/motion-preview-map.json`, lee el manifiesto versionado, crea un cliente Supabase solo para `select('id, name, image_url, motion_preview_url').in('id', ids)`, construye el plan y lo imprime como tabla/JSON. Si aparece `--execute`, falla antes de crear el cliente. No implementar ruta de escritura.

**Step 9: Ejecutar tests y chequeo de tipos**

Run:

```powershell
pnpm vitest run src/lib/exercises/__tests__/motionPreviewMapping.test.ts src/lib/exercises/__tests__/motionPreviewDatabaseContract.test.ts scripts/__tests__/mapExerciseMotionPreviews.test.ts
pnpm type-check
```

Expected: PASS.

**Step 10: Verificar y hacer commit**

Run con el numero de migracion realmente elegido:

```powershell
git diff --check
git add package.json supabase/migrations/062_exercise_motion_previews.sql src/types/database.ts src/lib/exercises/motionPreviewMapping.ts src/lib/exercises/__tests__/motionPreviewMapping.test.ts src/lib/exercises/__tests__/motionPreviewDatabaseContract.test.ts scripts/map-exercise-motion-previews.ts scripts/__tests__/mapExerciseMotionPreviews.test.ts
git diff --cached --check
git commit -m "feat: prepare Vekira motion preview data contract"
```

---

### Task 4: Crear el reproductor controlado y accesible

**Files:**

- Create: `src/components/exercises/ExerciseMotionPreview.tsx`
- Create: `src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx`

**Step 1: Escribir un fixture browser real antes del componente**

Seguir el patron Playwright + esbuild de `dismissibleAttentionNoticeInteraction.test.tsx`. Mockear solo `ExerciseImage` y `@/lib/utils`, montar el componente en Chromium y capturar solicitudes de imagen.

Casos exactos:

1. `motionSrc={null}`: existe el poster y no aparece `Ver movimiento`.
2. Con URL: poster primero; no existe `[data-motion-preview]` ni request a `motion-preview.webp` antes del click.
3. Click `Ver movimiento`: monta el `<img>`, muestra `Pausar movimiento` y etiqueta `Demostración visual`.
4. Click pausar: desmonta el `<img>` y restaura poster.
5. Segundo play: el nodo tiene una key/revision nueva y reinicia la carga.
6. Evento `error`: desmonta el movimiento, restaura poster y anuncia `No se pudo cargar la demostración visual.` en `aria-live="polite"`.
7. Con `matchMedia('(prefers-reduced-motion: reduce)')` verdadero y `navigator.connection.saveData = true`: no hay request antes de accion; un click deliberado sigue disponible.

**Step 2: Ejecutar el test y confirmar rojo**

Run:

```powershell
pnpm vitest run src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx
```

Expected: FAIL porque el componente no existe.

**Step 3: Implementar el componente**

Interfaz:

```ts
type ExerciseMotionPreviewProps = {
  posterSrc: string | null
  motionSrc: string | null
  alt: string
  language?: 'es' | 'en'
  className?: string
}
```

Estado minimo:

```ts
const [isPlaying, setIsPlaying] = useState(false)
const [revision, setRevision] = useState(0)
const [errorMessage, setErrorMessage] = useState('')
```

Reglas de render:

- Si `motionSrc` es null, devolver solo `ExerciseImage` con `variant="hero"` y `zoomable`.
- Si no reproduce, usar `ExerciseImage`; no crear `Image`, `link`, preload ni objeto `new Image()` para motion.
- Al reproducir, montar un `<img key={`${motionSrc}-${revision}`}>` nativo con `data-motion-preview`, `src={motionSrc}`, `alt={alt}`, dimensiones 512 x 512 y `object-contain`.
- Justificar localmente `@next/next/no-img-element`: Next Image no debe recomprimir ni destruir el WebP animado.
- Pausar ejecuta `setIsPlaying(false)`; volver a iniciar limpia error, incrementa revision y monta el asset.
- `onError` restaura poster y establece el mensaje accesible.
- Usar botones nativos de al menos 44 px, foco visible y `aria-pressed={isPlaying}`.
- Mostrar `Demostración visual`/`Visual demonstration`; no usar las palabras aprobación, técnica validada o correcto.

**Step 4: Ejecutar test, lint enfocado y typecheck**

Run:

```powershell
pnpm vitest run src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx
pnpm eslint src/components/exercises/ExerciseMotionPreview.tsx src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx
pnpm type-check
```

Expected: PASS.

**Step 5: Verificar y hacer commit**

Run:

```powershell
git diff --check
git add src/components/exercises/ExerciseMotionPreview.tsx src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx
git diff --cached --check
git commit -m "feat: add controlled exercise motion preview"
```

---

### Task 5: Integrar movimiento solamente en la ficha del ejercicio

**Files:**

- Modify: `src/app/(app)/exercises/[exerciseId]/page.tsx`
- Create: `src/components/exercises/__tests__/exerciseDetailMotionPreviewContract.test.ts`

**Step 1: Escribir prueba de integracion/source contract**

Leer la ficha, `ExerciseGrid.tsx`, la pagina de catalogo y `src/app/actions/exerciseCatalog.ts`. Comprobar:

```ts
expect(detailPage).toContain('motion_preview_url: string | null')
expect(detailPage).toContain('video_url, image_url, motion_preview_url')
expect(detailPage).toContain("import { ExerciseMotionPreview }")
expect(detailPage).toContain('posterSrc={exercise.image_url}')
expect(detailPage).toContain('motionSrc={exercise.motion_preview_url}')
expect(detailPage).not.toContain('<ExerciseImage src={exercise.image_url}')

for (const staticSurface of [grid, catalogPage, catalogAction]) {
  expect(staticSurface).not.toContain('ExerciseMotionPreview')
  expect(staticSurface).not.toContain('motion_preview_url')
}
```

**Step 2: Ejecutar y confirmar rojo**

Run:

```powershell
pnpm vitest run src/components/exercises/__tests__/exerciseDetailMotionPreviewContract.test.ts
```

Expected: FAIL porque la ficha aun no consulta ni renderiza motion.

**Step 3: Actualizar carga e interfaz de la ficha**

- Cambiar import de `ExerciseImage` por `ExerciseMotionPreview`.
- Agregar `motion_preview_url: string | null` a `ExerciseRow`.
- Agregar `motion_preview_url` al string del `.select(...)` fallback.
- El RPC ya queda cubierto por los tipos y la migracion de Task 3.
- Reemplazar exclusivamente el hero por:

```tsx
<ExerciseMotionPreview
  posterSrc={exercise.image_url}
  motionSrc={exercise.motion_preview_url}
  alt={exercise.name}
  language={language}
  className="h-full min-h-56 w-full border-t border-border/50 md:border-l md:border-t-0"
/>
```

No tocar `ExerciseGrid`, pickers, sesion activa ni historial.

**Step 4: Ejecutar pruebas de integracion e interaccion**

Run:

```powershell
pnpm vitest run src/components/exercises/__tests__/exerciseDetailMotionPreviewContract.test.ts src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx
pnpm type-check
```

Expected: PASS.

**Step 5: Verificar y hacer commit**

Run:

```powershell
git diff --check
git add -- 'src/app/(app)/exercises/[exerciseId]/page.tsx' src/components/exercises/__tests__/exerciseDetailMotionPreviewContract.test.ts
git diff --cached --check
git commit -m "feat: show motion previews on exercise details"
```

---

### Task 6: Producir y aprobar la calibracion (Arnold Press + sentadilla)

**Files:**

- Create local only: `.artifacts/exercises/catalog-v1-motion/arnold-press-mancuernas/motion-source.png`
- Create local only: `.artifacts/exercises/catalog-v1-motion/arnold-press-mancuernas/contact-sheet.webp`
- Create: `public/exercises/catalog/v1/arnold-press-mancuernas/motion-preview.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/sentadilla-trasera-barra/motion-source.png`
- Create local only: `.artifacts/exercises/catalog-v1-motion/sentadilla-trasera-barra/contact-sheet.webp`
- Create: `public/exercises/catalog/v1/sentadilla-trasera-barra/motion-preview.webp`
- Modify: `public/exercises/catalog/v1/manifest.json`

**Step 1: Leer la skill de imagen y preparar referencias propias**

Leer `imagegen/SKILL.md`. Inspeccionar en resolucion original:

```text
public/exercises/catalog/v1/arnold-press-mancuernas/poster.webp
public/exercises/catalog/v1/sentadilla-trasera-barra/poster.webp
```

El preview antiguo bajo `public/exercises/pilot/arnold-press-mancuernas/` es solo evidencia tecnica; no promoverlo ni copiarlo al V1.

**Step 2: Generar una hoja por ejercicio con ImageGen**

Usar como base este prompt compartido:

```text
Crea una hoja de movimiento cuadrada original de Vekira, 3 columnas por 2 filas, sin texto, logos ni marcas de agua. Mantén exactamente el mismo maniquí anatómico 3D, fondo marfil, cámara, lente, encuadre, escala corporal, materiales, ropa mínima neutra, equipo y mapa muscular rojo del póster Vekira adjunto. Las primeras cinco celdas deben mostrar cinco poses progresivas y claramente distintas, ordenadas de izquierda a derecha y luego en la fila inferior, desde la posición inicial hasta la posición final. La sexta celda es auxiliar y puede repetir una postura estable. No cambies de variante, no desconectes manos o pies del equipo, no agregues objetos y no interpoles anatomía. Estilo de lámina anatómica profesional, iluminación clínica suave y consistente, cuerpo completo y equipo completo dentro de cada celda.
```

Añadir exactamente una de estas clausulas:

- Arnold: `Ejercicio: press Arnold sentado con dos mancuernas; comienza con codos flexionados y palmas hacia el rostro, rota y eleva de forma progresiva hasta brazos extendidos sobre la cabeza, sin arquear el torso ni variar banco o mancuernas.`
- Sentadilla: `Ejercicio: sentadilla trasera con barra; barra estable sobre trapecios, pies plantados y simétricos, descenso progresivo coordinando cadera y rodillas hasta profundidad segura, talones apoyados y columna neutral.`

Guardar cada resultado original bajo el `motion-source.png` local indicado. Si ImageGen devuelve una hoja con una celda defectuosa, editar/regenerar esa celda usando la misma referencia y recomponer la hoja; conservar los intentos rechazados bajo `rejects/` local.

**Step 3: Construir previews y contact sheets**

Run:

```powershell
python scripts/build-exercise-motion-preview.py --input .artifacts/exercises/catalog-v1-motion/arnold-press-mancuernas/motion-source.png --output public/exercises/catalog/v1/arnold-press-mancuernas/motion-preview.webp --contact-sheet .artifacts/exercises/catalog-v1-motion/arnold-press-mancuernas/contact-sheet.webp
python scripts/build-exercise-motion-preview.py --input .artifacts/exercises/catalog-v1-motion/sentadilla-trasera-barra/motion-source.png --output public/exercises/catalog/v1/sentadilla-trasera-barra/motion-preview.webp --contact-sheet .artifacts/exercises/catalog-v1-motion/sentadilla-trasera-barra/contact-sheet.webp
```

Expected: dos WebP de 512 x 512, 10 frames, 180 ms/frame y <=512000 bytes.

**Step 4: Gate visual doble antes del manifiesto**

El controlador inspecciona source original, contact sheet y WebP animado de cada ejercicio. Luego un subagente nuevo, sin veredicto previo, repite la inspeccion. Ambos usan esta lista bloqueante:

- cámara/encuadre/escala/equipo estables;
- cinco poses distintas y progresivas;
- manos, pies y equipo conectados;
- articulaciones plausibles y misma variante;
- mapa muscular estable, sin parpadeo;
- loop sin salto, fondo pulsante ni artefactos;
- sin texto, logos, marcas de agua o recortes críticos.

Registrar por ejercicio `Critical`, `Important` y `Minor`. Si aparece Critical/Important, retirar el WebP de la promocion, regenerar y repetir los dos reviews. Los Minor se documentan en las notas del review visual.

**Step 5: Registrar metadata solo tras doble aprobacion**

Run para obtener valores reales:

```powershell
Get-FileHash -Algorithm SHA256 .artifacts/exercises/catalog-v1-motion/arnold-press-mancuernas/motion-source.png
Get-FileHash -Algorithm SHA256 public/exercises/catalog/v1/arnold-press-mancuernas/motion-preview.webp
(Get-Item public/exercises/catalog/v1/arnold-press-mancuernas/motion-preview.webp).Length
Get-FileHash -Algorithm SHA256 .artifacts/exercises/catalog-v1-motion/sentadilla-trasera-barra/motion-source.png
Get-FileHash -Algorithm SHA256 public/exercises/catalog/v1/sentadilla-trasera-barra/motion-preview.webp
(Get-Item public/exercises/catalog/v1/sentadilla-trasera-barra/motion-preview.webp).Length
```

Copiar exactamente hashes lowercase y bytes impresos al objeto `motion` de esos dos registros. Usar `status: "visual-approved"`, `frameCount: 10`, `frameDurationMs: 180`, la secuencia fija y un `review` con ambos roles y hallazgos reales. No tocar `status` global ni `reviews.technique`.

**Step 6: Validar calibracion**

Run:

```powershell
pnpm validate:exercise-catalog-v1
pnpm vitest run src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_build_exercise_motion_preview scripts.__tests__.test_exercise_visual_assets -v
pnpm type-check
```

Expected: PASS. `pnpm validate:exercise-catalog-v1:motion-pilot` debe seguir reservado para Task 8.

**Step 7: Verificar versionado y hacer commit**

Run:

```powershell
git status --short
git check-ignore .artifacts/exercises/catalog-v1-motion/arnold-press-mancuernas/motion-source.png .artifacts/exercises/catalog-v1-motion/sentadilla-trasera-barra/motion-source.png
git diff --check
git add public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/arnold-press-mancuernas/motion-preview.webp public/exercises/catalog/v1/sentadilla-trasera-barra/motion-preview.webp
git diff --cached --check
git commit -m "feat: add Vekira motion calibration previews"
```

Expected: `.artifacts` permanece sin stage; solo dos previews y manifest entran al commit.

---

### Task 7: Producir y aprobar la oleada intermedia de cuatro ejercicios

**Files:**

- Create local only: `.artifacts/exercises/catalog-v1-motion/press-banca-barra/motion-source.png` y `contact-sheet.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/peso-muerto-rumano-barra/motion-source.png` y `contact-sheet.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/jalon-pecho-polea/motion-source.png` y `contact-sheet.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/remo-sentado-polea/motion-source.png` y `contact-sheet.webp`
- Create: `public/exercises/catalog/v1/press-banca-barra/motion-preview.webp`
- Create: `public/exercises/catalog/v1/peso-muerto-rumano-barra/motion-preview.webp`
- Create: `public/exercises/catalog/v1/jalon-pecho-polea/motion-preview.webp`
- Create: `public/exercises/catalog/v1/remo-sentado-polea/motion-preview.webp`
- Modify: `public/exercises/catalog/v1/manifest.json`

**Step 1: Generar las cuatro hojas supervisadas**

Usar el mismo prompt compartido de Task 6 y la clausula exacta correspondiente:

- Press banca: `Ejercicio: press de banca plano con barra; cinco poses desde barra estable sobre el pecho medio con muñecas neutras hasta extensión controlada de codos, banco, soportes, discos, agarre y arco corporal idénticos en todas las celdas.`
- Peso muerto rumano: `Ejercicio: peso muerto rumano con barra; cinco poses desde bipedestación hasta bisagra de cadera controlada, barra rozando muslos y tibias, rodillas suavemente flexionadas, espalda neutral y pies inmóviles.`
- Jalón: `Ejercicio: jalón al pecho en polea; cinco poses sentado con muslos fijados, desde brazos elevados y cable tenso hasta barra frente al pecho alto, torso estable, mismo agarre, cable, polea, asiento y pads.`
- Remo: `Ejercicio: remo sentado en polea; cinco poses desde brazos extendidos y torso neutral hasta agarre junto al abdomen, codos hacia atrás, cable tenso, pies apoyados y misma máquina.`

Guardar cada fuente, sus correcciones y sus rechazos bajo la carpeta local de su slug listada en Files.

**Step 2: Construir los cuatro previews**

Run una vez por slug:

```powershell
$motionSlugs = @('press-banca-barra','peso-muerto-rumano-barra','jalon-pecho-polea','remo-sentado-polea')
foreach ($motionSlug in $motionSlugs) {
  python scripts/build-exercise-motion-preview.py --input ".artifacts/exercises/catalog-v1-motion/$motionSlug/motion-source.png" --output "public/exercises/catalog/v1/$motionSlug/motion-preview.webp" --contact-sheet ".artifacts/exercises/catalog-v1-motion/$motionSlug/contact-sheet.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

**Step 3: Ejecutar controller + fresh visual reviewer**

Aplicar exactamente el gate de Task 6 por ejercicio. No evaluar la oleada solo en mosaico: inspeccionar cada source original y cada animacion a 512 px. Regenerar cualquier Critical/Important antes de continuar.

**Step 4: Registrar hashes, bytes y reviews reales**

Run:

```powershell
$motionSlugs = @('press-banca-barra','peso-muerto-rumano-barra','jalon-pecho-polea','remo-sentado-polea')
foreach ($motionSlug in $motionSlugs) {
  Get-FileHash -Algorithm SHA256 ".artifacts/exercises/catalog-v1-motion/$motionSlug/motion-source.png"
  Get-FileHash -Algorithm SHA256 "public/exercises/catalog/v1/$motionSlug/motion-preview.webp"
  (Get-Item "public/exercises/catalog/v1/$motionSlug/motion-preview.webp").Length
}
```

Añadir `motion` solo a los cuatro aprobados. Tras esta tarea el manifiesto tiene exactamente seis objetos `motion`.

**Step 5: Validar y hacer commit**

Run:

```powershell
pnpm validate:exercise-catalog-v1
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
pnpm type-check
git diff --check
git add public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/press-banca-barra/motion-preview.webp public/exercises/catalog/v1/peso-muerto-rumano-barra/motion-preview.webp public/exercises/catalog/v1/jalon-pecho-polea/motion-preview.webp public/exercises/catalog/v1/remo-sentado-polea/motion-preview.webp
git diff --cached --check
git commit -m "feat: add Vekira motion preview wave 2"
```

Expected: todos los gates parciales PASS y solo seis previews V1 existen/versionan.

---

### Task 8: Producir y aprobar la oleada final y cerrar el gate de diez

**Files:**

- Create local only: `.artifacts/exercises/catalog-v1-motion/elevacion-lateral-mancuernas/motion-source.png` y `contact-sheet.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/curl-biceps-barra-ez/motion-source.png` y `contact-sheet.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/extension-triceps-cuerda/motion-source.png` y `contact-sheet.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/rueda-abdominal-rodillas/motion-source.png` y `contact-sheet.webp`
- Create: `public/exercises/catalog/v1/elevacion-lateral-mancuernas/motion-preview.webp`
- Create: `public/exercises/catalog/v1/curl-biceps-barra-ez/motion-preview.webp`
- Create: `public/exercises/catalog/v1/extension-triceps-cuerda/motion-preview.webp`
- Create: `public/exercises/catalog/v1/rueda-abdominal-rodillas/motion-preview.webp`
- Modify: `public/exercises/catalog/v1/manifest.json`

**Step 1: Generar las cuatro hojas supervisadas**

Usar el mismo prompt compartido de Task 6 y la clausula exacta correspondiente:

- Elevacion lateral: `Ejercicio: elevación lateral de pie con dos mancuernas; cinco poses desde brazos junto al cuerpo hasta mancuernas a altura de hombros, codos suavemente flexionados, torso y pies inmóviles, sin encoger hombros.`
- Curl EZ: `Ejercicio: curl de bíceps de pie con barra EZ; cinco poses desde codos extendidos hasta flexión controlada, agarre simétrico, codos pegados al torso, barra y pies idénticos, sin balanceo.`
- Triceps cuerda: `Ejercicio: extensión de tríceps en polea alta con cuerda; cinco poses desde codos flexionados hasta extensión completa y separación suave de puntas, codos fijos, cable tenso y polea estable.`
- Rueda abdominal: `Ejercicio: rueda abdominal desde rodillas; cinco poses desde rueda bajo hombros hasta extensión corporal controlada, rodillas apoyadas, columna neutral, manos conectadas a la misma rueda y retorno viable.`

**Step 2: Construir los cuatro previews**

Run:

```powershell
$motionSlugs = @('elevacion-lateral-mancuernas','curl-biceps-barra-ez','extension-triceps-cuerda','rueda-abdominal-rodillas')
foreach ($motionSlug in $motionSlugs) {
  python scripts/build-exercise-motion-preview.py --input ".artifacts/exercises/catalog-v1-motion/$motionSlug/motion-source.png" --output "public/exercises/catalog/v1/$motionSlug/motion-preview.webp" --contact-sheet ".artifacts/exercises/catalog-v1-motion/$motionSlug/contact-sheet.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

**Step 3: Ejecutar controller + fresh visual reviewer**

Aplicar el gate visual de Task 6. La rueda abdominal exige atencion adicional a contacto mano-rueda, apoyo de rodillas y continuidad de columna; triceps exige cable/anclaje continuo. Rechazar cualquier cambio de variante o equipo.

**Step 4: Registrar metadata real y cerrar exactamente diez**

Run:

```powershell
$motionSlugs = @('elevacion-lateral-mancuernas','curl-biceps-barra-ez','extension-triceps-cuerda','rueda-abdominal-rodillas')
foreach ($motionSlug in $motionSlugs) {
  Get-FileHash -Algorithm SHA256 ".artifacts/exercises/catalog-v1-motion/$motionSlug/motion-source.png"
  Get-FileHash -Algorithm SHA256 "public/exercises/catalog/v1/$motionSlug/motion-preview.webp"
  (Get-Item "public/exercises/catalog/v1/$motionSlug/motion-preview.webp").Length
}
```

Agregar los cuatro objetos `motion`. Confirmar programaticamente que existen diez y solo diez:

```powershell
@'
const manifest = require('./public/exercises/catalog/v1/manifest.json')
const motion = manifest.exercises.filter(exercise => exercise.motion).map(exercise => exercise.slug)
console.log(JSON.stringify({ count: motion.length, slugs: motion }, null, 2))
'@ | node -
```

Expected: `count` igual a 10 y lista igual al orden fijo del piloto.

**Step 5: Ejecutar el gate completo de motion**

Run:

```powershell
pnpm validate:exercise-catalog-v1:motion-pilot
pnpm vitest run src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_build_exercise_motion_preview scripts.__tests__.test_exercise_visual_assets -v
pnpm type-check
```

Expected: PASS en todos los comandos.

**Step 6: Verificar y hacer commit**

Run:

```powershell
git diff --check
git add public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/elevacion-lateral-mancuernas/motion-preview.webp public/exercises/catalog/v1/curl-biceps-barra-ez/motion-preview.webp public/exercises/catalog/v1/extension-triceps-cuerda/motion-preview.webp public/exercises/catalog/v1/rueda-abdominal-rodillas/motion-preview.webp
git diff --cached --check
git commit -m "feat: add Vekira motion preview wave 3"
```

---

### Task 9: Ejecutar release gate local y preparar handoff honesto

**Files:**

- Create local only: `.artifacts/exercises/catalog-v1-motion/final-review-512.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/final-review-80.webp`
- Create local only: `.artifacts/exercises/catalog-v1-motion/ui-mobile-poster.png`
- Create local only: `.artifacts/exercises/catalog-v1-motion/ui-mobile-motion.png`
- Create local only: `.artifacts/exercises/catalog-v1-motion/ui-desktop-motion.png`
- Create local only: `.artifacts/exercises/catalog-v1-motion/final-gate.md`
- Modify only if a gate encuentra un defecto dentro de alcance: los archivos responsables del defecto

**Step 1: Verificar scope, estado y ausencia de publicacion**

Run:

```powershell
git status --short
git log --oneline a121eae..HEAD
git diff --stat a121eae..HEAD
git diff --name-only a121eae..HEAD
git grep -n -E 'technique-approved|"published"' -- public/exercises/catalog/v1/manifest.json
git grep -n -F 'motion-preview.webp' -- 'src/app/(app)/exercises/ExerciseGrid.tsx' 'src/app/(app)/exercises/page.tsx' 'src/app/actions/exerciseCatalog.ts'
```

Expected: solo archivos de este plan; cero claims tecnicos/publicados; cero integracion motion en superficies estaticas.

**Step 2: Ejecutar todos los focused gates**

Run:

```powershell
python -m unittest scripts.__tests__.test_build_exercise_motion_preview scripts.__tests__.test_exercise_visual_assets -v
pnpm vitest run src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts src/lib/exercises/__tests__/motionPreviewMapping.test.ts src/lib/exercises/__tests__/motionPreviewDatabaseContract.test.ts scripts/__tests__/mapExerciseMotionPreviews.test.ts src/components/exercises/__tests__/ExerciseMotionPreviewInteraction.test.tsx src/components/exercises/__tests__/exerciseDetailMotionPreviewContract.test.ts
pnpm validate:exercise-pilot
pnpm validate:exercise-catalog-v1
pnpm validate:exercise-catalog-v1:complete
pnpm validate:exercise-catalog-v1:motion-pilot
pnpm type-check
```

Expected: PASS.

**Step 3: Probar los limites dry-run sin mutar remoto**

Ejecutar el archivo local de mapping solo si ya contiene diez UUID revisados. Si no existe, probar el CLI con el fixture de tests y registrar `mapping remoto pendiente de UUIDs revisados`; no inventar IDs ni buscar por nombre.

Run del archivo real cuando exista:

```powershell
pnpm map:exercise-motion-previews -- --mapping .artifacts/exercises/catalog-v1-motion/motion-preview-map.json
```

Expected: imprime diez filas con ID, nombre, imagen actual, motion actual y motion propuesto; no aparecen escrituras.

Run del archivo de sources exclusivamente en dry-run:

```powershell
pnpm archive:exercise-catalog-v1
```

Expected: lista 50 object keys con prefijo `[dry-run]`; no usar `--upload`.

**Step 4: Crear mosaicos agregados y repetir revision visual final**

Crear los mosaicos con este comando exacto, que conserva el orden fijo:

```powershell
@'
from pathlib import Path
from PIL import Image

root = Path("public/exercises/catalog/v1")
output = Path(".artifacts/exercises/catalog-v1-motion")
slugs = (
    "arnold-press-mancuernas", "sentadilla-trasera-barra", "press-banca-barra",
    "peso-muerto-rumano-barra", "jalon-pecho-polea", "remo-sentado-polea",
    "elevacion-lateral-mancuernas", "curl-biceps-barra-ez",
    "extension-triceps-cuerda", "rueda-abdominal-rodillas",
)
for tile_size in (512, 80):
    sheet = Image.new("RGB", (tile_size * 5, tile_size * 2), (248, 243, 235))
    for index, slug in enumerate(slugs):
        with Image.open(root / slug / "motion-preview.webp") as animation:
            animation.seek(0)
            tile = animation.convert("RGB").resize((tile_size, tile_size), Image.Resampling.LANCZOS)
        sheet.paste(tile, ((index % 5) * tile_size, (index // 5) * tile_size))
    sheet.save(output / f"final-review-{tile_size}.webp", "WEBP", quality=90, method=6)
'@ | python -
```

Ademas inspeccionar los diez WebP animados a 512 px. Un controlador y un nuevo subagente visual deben confirmar por slug:

- progresion y loop;
- estabilidad de anatomia/equipo/camara/mapa muscular;
- legibilidad a 512 y reconocimiento a 80;
- peso real y ausencia de texto/marca;
- resultado Critical/Important/Minor.

Escribir `.artifacts/exercises/catalog-v1-motion/final-gate.md` con los veinte veredictos (controller + reviewer). Cualquier Critical/Important reabre la tarea de generacion correspondiente y obliga a recalcular hashes/bytes y repetir todos los validadores.

Montar el fixture browser de `ExerciseMotionPreview` a 390 x 844 y 1280 x 800, capturar los tres estados locales listados en Files y revisar que no cambie el layout, el control tenga foco/contraste suficiente, el poster sea inicial y la animacion conserve encuadre completo. Cualquier defecto importante de responsive o accesibilidad reabre Task 4/5.

**Step 5: Ejecutar la suite completa y aislar limites preexistentes**

Run:

```powershell
pnpm test -- --maxWorkers=4
```

Expected: si pasan todos, registrar suite verde. Si reaparecen exactamente los tres fallos temporales conocidos de notificaciones, ejecutar esos archivos de prueba por separado y compararlos con base; registrar suite completa no verde por fallos preexistentes. Si aparece cualquier fallo nuevo o relacionado con motion, detener el handoff, depurarlo con `superpowers:systematic-debugging` y corregirlo antes de continuar.

**Step 6: Chequeo final de Git**

Run:

```powershell
git diff --check
git status --short
git log -9 --oneline
```

Expected: worktree limpio, ocho commits de implementacion despues del commit del plan, sin `.artifacts` versionado. El `git log -9` muestra esos ocho commits mas el plan. Si un arreglo de gate requirio cambios, crear un commit acotado con su propia prueba antes de repetir este paso.

**Step 7: Entregar handoff sin acciones remotas**

El reporte final debe incluir:

- diez slugs, dimensiones, frames, timing y rango de peso;
- resultados controller + fresh visual review y Minors conservados;
- estado de focused tests, validadores, typecheck y suite completa;
- confirmacion de que poster sigue siendo default/fallback y las otras superficies siguen estaticas;
- migracion preparada pero no aplicada;
- mapping dry-run ejecutado o bloqueado por falta de UUIDs explicitos;
- cero upload, cero publicacion, cero Supabase remoto mutado, cero push y cero merge;
- siguiente autorizacion necesaria para aplicar migracion/asociar UUIDs/subir/revisar tecnica.

No crear commit, push, PR ni merge durante el handoff.

---

## Plan Self-Review Checklist

- [ ] Las tareas 1-5 siguen rojo-verde-refactor y tienen comandos exactos.
- [ ] Las tareas 6-8 no promueven un asset antes de dos reviews visuales.
- [ ] Los diez slugs y solo esos diez cierran el gate de motion.
- [ ] `motion` es opcional y no rompe los otros 40 ejercicios.
- [ ] El poster permanece inicial, fallback y unica imagen de listas/grids/sesion.
- [ ] No existe heuristica por nombre ni ruta de escritura en el mapping.
- [ ] La migracion replica la ultima funcion RPC y solo agrega el campo nullable.
- [ ] No se versionan sources, rechazos, mapping ni contact sheets.
- [ ] No se usan activos de Hevy/terceros ni claims tecnicos.
- [ ] Ningun paso ejecuta upload, migracion remota, publicacion, push o merge.
- [ ] El gate final distingue PASS local de limites remotos/preexistentes.
