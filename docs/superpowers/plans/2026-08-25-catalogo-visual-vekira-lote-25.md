# Vekira Visual Catalog V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and visually approve a versioned Vekira catalog of 25 professional exercise posters: five promoted pilot assets plus twenty new exercises produced in four reviewed batches.

**Architecture:** A new typed V1 manifest owns editorial metadata and review state without changing live `exercises` rows. Python/Pillow tooling deterministically turns staged PNG sources into small WebP posters and review sheets, while TypeScript and Python validators enforce metadata, paths, hashes, formats, dimensions, and size. High-resolution sources remain outside Git and can be archived through an explicit service-role command to a private Supabase Storage bucket.

**Tech Stack:** TypeScript 5.3, Vitest 4, TSX, Node.js `crypto`/`fs`, Python 3.12, Pillow 12.1.1, Supabase Storage, ChatGPT Images.

**Spec:** `docs/superpowers/specs/2026-08-25-catalogo-visual-vekira-lote-25-design.md`

## Global Constraints

- Preserve the approved identity `vekira-anatomical-3d-v1`: opaque light-gray anatomical mannequin, coral primary muscles, muted-coral secondary muscles, matte graphite equipment, warm-ivory background, start left, finish right.
- Do not use Hevy images as generation/edit references or project assets.
- Produce exactly the five promoted pilot exercises and twenty new exercises named in the spec.
- Keep new exercises at `draft` until their batch contact sheet receives explicit visual approval.
- A rejected exercise returns to `draft`; an approved asset is never overwritten silently.
- After two incorrect generations for one exercise, stop blind retries and revise its camera, equipment description, or technical subject block before another call.
- Never assign `technique-approved` or `published` in this plan.
- Do not write to `exercises`, change its seed, hide imported exercises, or modify catalog/session UI.
- Posters must be square WebP, exactly 1024 × 1024 px, and at most 102400 bytes.
- Sources must be square PNG, at least 1024 × 1024 px, staged beneath `.artifacts/exercises/catalog-v1/`, and never deleted automatically.
- Commit only the V1 manifest, optimized posters, code, tests, migration definition, and documentation; do not commit staged sources or contact sheets.
- Preserve unrelated user changes and stage only files named by the current task.
- Apply the private-bucket migration or perform remote uploads only when the owner explicitly authorizes that external step and valid service-role credentials are configured.

## File and Interface Map

- `src/lib/exercises/visualCatalogV1.ts`: literal slugs, manifest types, review-state rules, and pure runtime validation.
- `src/lib/exercises/__tests__/visualCatalogV1.test.ts`: exact-set, metadata, state, path, and hash contract tests.
- `public/exercises/catalog/v1/manifest.json`: source of truth for all 25 editorial records and committed poster references.
- `scripts/validate-exercise-visual-catalog-v1.ts`: safe-path, existence, byte-size, and SHA-256 validation for committed posters and staged sources.
- `scripts/__tests__/validateExerciseVisualCatalogV1.test.ts`: temporary-filesystem coverage for the TypeScript asset validator.
- `scripts/exercise_visual_assets.py`: deterministic source-to-poster conversion and group contact-sheet generation.
- `scripts/validate_exercise_visual_assets.py`: Pillow format/dimension validation for approved or complete entries.
- `scripts/__tests__/test_exercise_visual_assets.py`: Python unit tests for conversion, size enforcement, contact sheets, and invalid dimensions.
- `supabase/migrations/061_exercise_visual_sources_bucket.sql`: private PNG-only source archive definition; no `exercises` changes.
- `scripts/archive-exercise-visual-sources.ts`: dry-run-first, service-role-only uploader with remote digest verification and no deletion.
- `scripts/__tests__/archiveExerciseVisualSources.test.ts`: pure key/digest tests and mocked upload/download behavior.
- `.artifacts/exercises/catalog-v1/{slug}/source.png`: untracked production masters.
- `.artifacts/exercises/catalog-v1/reviews/group-{n}-full.webp`: untracked 512 px-per-exercise review sheet.
- `.artifacts/exercises/catalog-v1/reviews/group-{n}-80.webp`: untracked 80 px-per-exercise review sheet.

## Canonical Catalog Records

Use application-compatible movement keys: `squat`, `hinge`, `horizontal_push`, `horizontal_pull`, `vertical_push`, `vertical_pull`, `core`, `isolation`, and `locomotion`.

### Promoted pilot metadata

- `sentadilla-trasera-barra`: English `Barbell Back Squat`; aliases ES `sentadilla con barra`, `sentadilla trasera`; aliases EN `back squat`; region `legs`; difficulty `intermediate`; movement `squat`.
- `press-banca-barra`: English `Flat Barbell Bench Press`; aliases ES `press banca`, `press de pecho con barra`; aliases EN `barbell bench press`; region `chest`; difficulty `intermediate`; movement `horizontal_push`.
- `jalon-pecho-polea`: English `Wide-Grip Lat Pulldown`; aliases ES `jalón al pecho`, `jalón dorsal`; aliases EN `lat pulldown`; region `back`; difficulty `beginner`; movement `vertical_pull`.
- `arnold-press-mancuernas`: English `Seated Arnold Dumbbell Press`; aliases ES `press Arnold`, `Arnold press`; aliases EN `Arnold press`; region `shoulders`; difficulty `intermediate`; movement `vertical_push`.
- `rueda-abdominal-rodillas`: English `Kneeling Ab Wheel Rollout`; aliases ES `rueda abdominal`, `abdominales con rueda`; aliases EN `kneeling ab rollout`; region `core`; difficulty `intermediate`; movement `core`.

For these five, copy `equipment`, muscles, positions, and technique checks exactly from `public/exercises/pilot/manifest.json`; add the canonical fields above, set `batch: "pilot"`, and point the poster to `/exercises/catalog/v1/{slug}/poster.webp`.

### New batch 1 metadata and subject blocks

- `peso-muerto-rumano-barra`: English `Barbell Romanian Deadlift`; aliases ES `peso muerto rumano`, `RDL con barra`; aliases EN `Romanian deadlift`, `barbell RDL`; region `legs`; difficulty `intermediate`; movement `hinge`; equipment `barra`, `discos`; primary `isquiotibiales`, `glúteo mayor`; secondary `erectores espinales`, `aductores`. Start: upright with bar against the upper thighs, feet hip-width, knees softly flexed. Finish: hips pushed back, bar close to the legs below the knees, shins nearly vertical, neutral spine. Checks: keep bar close; move through the hips; do not round the lumbar spine.
- `press-inclinado-mancuernas`: English `Incline Dumbbell Bench Press`; aliases ES `press inclinado`, `press superior con mancuernas`; aliases EN `incline dumbbell press`; region `chest`; difficulty `intermediate`; movement `horizontal_push`; equipment `mancuernas`, `banco inclinado`; primary `pectoral mayor porción clavicular`; secondary `tríceps`, `deltoides anterior`. Start: seated against a 30–45° backrest with dumbbells beside the upper chest and forearms vertical. Finish: dumbbells controlled above the shoulders without forced elbow lockout. Checks: keep shoulder blades supported; keep wrists stacked; do not turn the movement into a vertical shoulder press.
- `remo-sentado-polea`: English `Seated Cable Row`; aliases ES `remo en polea baja`, `remo sentado`; aliases EN `seated row`, `cable row`; region `back`; difficulty `beginner`; movement `horizontal_pull`; equipment `polea baja`, `agarre neutro`, `banco`; primary `dorsal ancho`, `romboides`; secondary `bíceps`, `deltoides posterior`. Start: seated tall, feet supported, arms extended, cable under tension. Finish: handle near the lower ribs, elbows behind the torso, chest tall. Checks: avoid excessive torso swing; keep shoulders away from ears; keep the cable connected.
- `elevacion-lateral-mancuernas`: English `Dumbbell Lateral Raise`; aliases ES `elevaciones laterales`, `laterales con mancuernas`; aliases EN `lateral raise`; region `shoulders`; difficulty `beginner`; movement `isolation`; equipment `mancuernas`; primary `deltoides lateral`; secondary `supraespinoso`, `deltoides anterior`. Start: standing tall with dumbbells beside the thighs and elbows softly bent. Finish: arms raised in the scapular plane to shoulder height, wrists neutral. Checks: no body swing; do not raise shoulders toward ears; stop around shoulder height.
- `plancha-frontal`: English `Forearm Plank`; aliases ES `plancha abdominal`, `plancha en antebrazos`; aliases EN `forearm plank`; region `core`; difficulty `beginner`; movement `core`; equipment `colchoneta`; primary `pared abdominal profunda`, `recto abdominal`; secondary `glúteos`, `serrato anterior`. Start: kneeling setup with forearms parallel and elbows under shoulders. Finish: knees lifted into one line from head through heels. Checks: avoid lumbar sag; keep hips aligned; press the floor through the forearms.

### New batch 2 metadata and subject blocks

- `prensa-piernas-45`: English `45-Degree Leg Press`; aliases ES `prensa inclinada`, `prensa de piernas`; aliases EN `45 degree leg press`; region `legs`; difficulty `beginner`; movement `squat`; equipment `prensa 45 grados`, `discos`; primary `cuádriceps`, `glúteo mayor`; secondary `isquiotibiales`. Start: back and pelvis supported, feet shoulder-width, sled controlled with knees softly extended. Finish: sled lowered until knees approach 90° without pelvic lift. Checks: keep heels supported; track knees with toes; do not lock knees forcefully.
- `press-pecho-maquina`: English `Machine Chest Press`; aliases ES `press en máquina`, `máquina de pecho`; aliases EN `chest press machine`; region `chest`; difficulty `beginner`; movement `horizontal_push`; equipment `máquina de press de pecho`; primary `pectoral mayor`; secondary `tríceps`, `deltoides anterior`. Start: seated with back supported and handles level with mid-chest. Finish: handles pressed forward with shoulders still supported. Checks: keep wrists neutral; avoid shrugging; do not lift the back from the pad.
- `remo-mancuerna-un-brazo`: English `One-Arm Dumbbell Row`; aliases ES `remo unilateral`, `remo a una mano`; aliases EN `single-arm dumbbell row`; region `back`; difficulty `beginner`; movement `horizontal_pull`; equipment `mancuerna`, `banco plano`; primary `dorsal ancho`, `romboides`; secondary `bíceps`, `deltoides posterior`. Start: one hand and same-side knee supported, working arm extended below the shoulder. Finish: dumbbell pulled toward the hip/lower ribs with neutral spine. Checks: keep shoulders level; avoid rotating the torso; lead with the elbow.
- `curl-biceps-barra-ez`: English `EZ-Bar Biceps Curl`; aliases ES `curl barra Z`, `curl de bíceps EZ`; aliases EN `EZ bar curl`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `barra EZ`; primary `bíceps braquial`; secondary `braquial`, `braquiorradial`. Start: standing with bar near thighs, arms extended, elbows beside the torso. Finish: elbows flexed and bar near the upper abdomen without shoulder swing. Checks: keep elbows stable; keep wrists aligned; do not lean backward.
- `bicicleta-estatica`: English `Stationary Bike`; aliases ES `bicicleta fija`, `ciclismo indoor`; aliases EN `exercise bike`, `indoor cycling`; region `cardio`; difficulty `beginner`; movement `locomotion`; equipment `bicicleta estática`; primary `cuádriceps`, `glúteos`; secondary `isquiotibiales`, `gemelos`. Start: one pedal high and opposite pedal low with slight knee flexion at the bottom. Finish: opposite pedal phase with the same neutral torso and stable hips. Checks: set a safe saddle height; keep knees tracking forward; do not rock the pelvis.

### New batch 3 metadata and subject blocks

- `hip-thrust-barra`: English `Barbell Hip Thrust`; aliases ES `empuje de cadera`, `hip thrust`; aliases EN `barbell hip thrust`; region `legs`; difficulty `intermediate`; movement `hinge`; equipment `barra`, `discos`, `banco plano`, `almohadilla`; primary `glúteo mayor`; secondary `isquiotibiales`, `aductores`. Start: upper back supported on bench, padded bar over the hip crease, hips lowered. Finish: hips extended until torso and thighs align, shins near vertical. Checks: keep chin gently tucked; avoid lumbar hyperextension; keep feet planted.
- `aperturas-pecho-polea`: English `Cable Chest Fly`; aliases ES `cruce de poleas`, `aperturas en cable`; aliases EN `cable fly`, `cable crossover`; region `chest`; difficulty `beginner`; movement `horizontal_push`; equipment `polea doble`, `agarres individuales`; primary `pectoral mayor`; secondary `deltoides anterior`. Start: split stance between pulleys, arms open with soft elbows and cables under tension. Finish: hands meet in front of the mid-chest without crossing excessively. Checks: maintain elbow angle; avoid shoulder protraction; keep torso stable.
- `dominada-asistida-maquina`: English `Assisted Pull-Up`; aliases ES `dominada con asistencia`, `dominada asistida`; aliases EN `assisted pullup`; region `back`; difficulty `beginner`; movement `vertical_pull`; equipment `máquina de dominadas asistidas`; primary `dorsal ancho`; secondary `bíceps`, `redondo mayor`, `romboides`. Start: knees on assistance pad, arms extended, shoulders controlled. Finish: upper chest approaches the bar with elbows down and back. Checks: keep bar in front of the face; avoid swinging; do not force the neck over the bar.
- `apertura-inversa-maquina`: English `Reverse Pec Deck Fly`; aliases ES `pájaros en máquina`, `reverse fly`; aliases EN `reverse pec deck`, `machine reverse fly`; region `shoulders`; difficulty `beginner`; movement `horizontal_pull`; equipment `máquina de apertura inversa`; primary `deltoides posterior`; secondary `romboides`, `trapecio medio`. Start: chest supported, arms forward at shoulder height with soft elbows. Finish: arms opened to the sides without torso separation from the pad. Checks: avoid shrugging; keep elbows softly bent; stop before shoulder discomfort.
- `extension-triceps-cuerda`: English `Rope Triceps Pushdown`; aliases ES `jalón de tríceps con cuerda`, `tríceps en polea`; aliases EN `rope pushdown`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `polea alta`, `cuerda`; primary `tríceps braquial`; secondary `ancóneo`. Start: elbows flexed beside the ribs, rope near lower chest. Finish: elbows extended with rope ends separated beside the thighs. Checks: keep upper arms fixed; keep wrists neutral; avoid torso momentum.

### New batch 4 metadata and subject blocks

- `curl-femoral-tumbado-maquina`: English `Lying Leg Curl`; aliases ES `curl femoral acostado`, `flexión femoral en máquina`; aliases EN `lying hamstring curl`; region `legs`; difficulty `beginner`; movement `isolation`; equipment `máquina de curl femoral`; primary `isquiotibiales`; secondary `gemelos`. Start: prone with knees aligned to machine pivot and pad above the heels, legs extended. Finish: knees flexed with pad moving toward the glutes while hips remain supported. Checks: align knee with pivot; avoid lifting hips; control the return.
- `curl-martillo-mancuernas`: English `Dumbbell Hammer Curl`; aliases ES `curl neutro`, `martillo con mancuernas`; aliases EN `hammer curl`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `mancuernas`; primary `braquial`, `braquiorradial`; secondary `bíceps braquial`. Start: standing with palms facing the thighs and arms extended. Finish: dumbbells raised with neutral grip and elbows still beside the torso. Checks: avoid body swing; keep wrists neutral; do not move elbows forward excessively.
- `extension-triceps-sobre-cabeza-polea`: English `Overhead Cable Triceps Extension`; aliases ES `tríceps sobre cabeza con cuerda`, `extensión francesa en polea`; aliases EN `overhead rope triceps extension`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `polea`, `cuerda`; primary `tríceps braquial cabeza larga`; secondary `ancóneo`. Start: facing away from the low cable in split stance, rope behind the head, elbows flexed. Finish: arms extended overhead while upper arms remain stable. Checks: avoid lumbar arch; keep elbows aimed forward; maintain cable tension.
- `crunch-polea-rodillas`: English `Kneeling Cable Crunch`; aliases ES `crunch con cuerda`, `abdominal en polea`; aliases EN `cable crunch`; region `core`; difficulty `beginner`; movement `core`; equipment `polea alta`, `cuerda`, `colchoneta`; primary `recto abdominal`; secondary `oblicuos`. Start: kneeling with rope beside the temples and torso tall, cable under tension. Finish: ribs flexed toward the pelvis without sitting the hips onto the heels. Checks: flex the trunk rather than only the hips; keep rope position stable; control the return.
- `caminata-cinta`: English `Treadmill Walking`; aliases ES `caminar en caminadora`, `caminata en cinta`; aliases EN `treadmill walk`; region `cardio`; difficulty `beginner`; movement `locomotion`; equipment `cinta de correr`; primary `glúteos`, `cuádriceps`; secondary `isquiotibiales`, `gemelos`. Start: natural heel-contact walking phase with upright posture and relaxed arms. Finish: opposite stride phase with one foot pushing off and the other advancing. Checks: walk rather than run; avoid leaning on the rails; keep gaze forward.

## Shared Generation Prompt

For every new exercise, use the same approved Arnold Press source as a style reference and make one separate image-generation call. Append the exact subject block from the canonical record to this prompt:

```text
Use case: scientific-educational.
Asset type: original professional exercise-catalog poster for the Vekira mobile fitness app.
Create a premium square 3D anatomical instructional illustration showing the exact same approved Vekira mannequin in two clearly separated sequential poses: starting position on the left and finishing position on the right.
Keep the approved Vekira identity: opaque light-gray sculpted anatomical surface, realistic athletic proportions, coral primary muscles, lower-intensity coral secondary muscles, matte graphite equipment, clean warm-ivory studio background, soft contact shadows, identical camera angle and scale in both poses.
Show the full body and all equipment with enough separation to remain readable at 80 × 80 px. Use a three-quarter view unless the subject block explicitly requires a side view.
No text, arrows, numbers, logos, watermark, gym background, cropped hands or feet, extra limbs, duplicated equipment, detached cables, impossible joints, or identifiable real person.
The reference image controls only the original Vekira mannequin, materials, palette, lighting, and composition quality. Do not copy its Arnold Press pose into this exercise.
SUBJECT: Append verbatim the complete start, finish, muscles, equipment, and checks from the matching canonical record in this plan before sending the prompt.
```

---

### Task 1: Define the V1 manifest contract

**Files:**
- Create: `src/lib/exercises/visualCatalogV1.ts`
- Create: `src/lib/exercises/__tests__/visualCatalogV1.test.ts`

**Interfaces:**
- Produces: `CATALOG_V1_EXERCISE_SLUGS`, `CatalogV1ExerciseSlug`, `CatalogV1Batch`, `CatalogV1ReviewStatus`, `CatalogV1ExerciseEntry`, `CatalogV1Manifest`, and `validateCatalogV1Manifest(value: unknown): string[]`.
- Consumes: no filesystem, image decoder, database, or environment variables.

- [ ] **Step 1: Write the failing pure-validator tests**

Create a complete factory fixture for all 25 literal slugs and assert the exact-set, batch, path, and state rules:

```ts
import { describe, expect, it } from 'vitest'
import {
  CATALOG_V1_EXERCISE_SLUGS,
  validateCatalogV1Manifest,
} from '../visualCatalogV1'

const entry = (slug: string, index: number) => ({
  slug,
  nameEs: `Nombre ${index}`,
  nameEn: `Name ${index}`,
  aliasesEs: [`alias ${index}`],
  aliasesEn: [`alias en ${index}`],
  region: 'legs',
  difficulty: 'beginner',
  movementPatterns: ['isolation'],
  equipment: ['equipo'],
  primaryMuscles: ['principal'],
  secondaryMuscles: ['secundario'],
  startPosition: 'Posición inicial completa.',
  endPosition: 'Posición final completa.',
  techniqueChecks: ['Control técnico uno', 'Control técnico dos', 'Control técnico tres'],
  batch: index < 5 ? 'pilot' : Math.min(4, Math.floor((index - 5) / 5) + 1),
  status: 'draft',
  reviews: {},
  assets: { poster: `/exercises/catalog/v1/${slug}/poster.webp` },
})

const valid = {
  version: 1,
  generatedAt: '2026-08-25',
  visualStyle: 'vekira-anatomical-3d-v1',
  exercises: CATALOG_V1_EXERCISE_SLUGS.map(entry),
}

describe('validateCatalogV1Manifest', () => {
  it('accepts the exact V1 draft catalog', () => {
    expect(validateCatalogV1Manifest(valid)).toEqual([])
  })

  it('rejects a missing slug and a cross-exercise poster path', () => {
    const exercises = valid.exercises.slice(1)
    exercises[0] = { ...exercises[0], assets: { poster: '/exercises/catalog/v1/wrong/poster.webp' } }
    const errors = validateCatalogV1Manifest({ ...valid, exercises })
    expect(errors).toContain('exercises must contain exactly the 25 supported V1 slugs')
    expect(errors).toContain(`exercises[0].assets.poster must belong to ${exercises[0].slug}`)
  })

  it('requires hashes and a private source key before visual approval', () => {
    const exercises = valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, status: 'visual-approved' }
      : exercise)
    expect(validateCatalogV1Manifest({ ...valid, exercises })).toEqual(expect.arrayContaining([
      'exercises[5].assets.posterSha256 is required for visual-approved',
      'exercises[5].assets.sourceSha256 is required for visual-approved',
      'exercises[5].assets.sourceObjectKey is required for visual-approved',
    ]))
  })

  it('requires recorded human review before elevated states', () => {
    const exercises = valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, status: 'published' }
      : exercise)
    expect(validateCatalogV1Manifest({ ...valid, exercises })).toEqual(expect.arrayContaining([
      'exercises[5].reviews.visual is required for published',
      'exercises[5].reviews.technique is required for published',
    ]))
  })
})
```

- [ ] **Step 2: Run the test and confirm the red state**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
```

Expected: FAIL because `../visualCatalogV1` does not exist.

- [ ] **Step 3: Implement the typed contract and pure validator**

Use these exact public types:

```ts
export type CatalogV1Batch = 'pilot' | 1 | 2 | 3 | 4
export type CatalogV1ReviewStatus =
  | 'draft' | 'visual-approved' | 'technique-approved' | 'published'
export type CatalogV1Difficulty = 'beginner' | 'intermediate'
export type CatalogV1Region = 'legs' | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'cardio'
export type CatalogV1MovementPattern =
  | 'squat' | 'hinge' | 'horizontal_push' | 'horizontal_pull'
  | 'vertical_push' | 'vertical_pull' | 'core' | 'isolation' | 'locomotion'

export type CatalogV1Assets = {
  poster: string
  posterSha256?: string
  sourceObjectKey?: string
  sourceSha256?: string
}

export type CatalogV1VisualReview = {
  reviewer: string
  reviewedAt: string
  notes: string[]
}

export type CatalogV1TechniqueReview = CatalogV1VisualReview & {
  qualification: string
  references: string[]
}

export type CatalogV1ExerciseEntry = {
  slug: CatalogV1ExerciseSlug
  nameEs: string
  nameEn: string
  aliasesEs: string[]
  aliasesEn: string[]
  region: CatalogV1Region
  difficulty: CatalogV1Difficulty
  movementPatterns: CatalogV1MovementPattern[]
  equipment: string[]
  primaryMuscles: string[]
  secondaryMuscles: string[]
  startPosition: string
  endPosition: string
  techniqueChecks: string[]
  batch: CatalogV1Batch
  status: CatalogV1ReviewStatus
  reviews: {
    visual?: CatalogV1VisualReview
    technique?: CatalogV1TechniqueReview
  }
  assets: CatalogV1Assets
}
```

Define the 25 slugs in the spec order. Require exact membership, unique slugs and poster paths, three or more technique checks, non-empty arrays, a matching batch for each slug, `/exercises/catalog/v1/{slug}/poster.webp`, 64-character lowercase hex hashes, and `v1/{slug}/{sourceSha256}.png`. For `visual-approved`, `technique-approved`, or `published`, require all three asset metadata fields and `reviews.visual`. For `technique-approved` or `published`, additionally require `reviews.technique`, including non-empty qualification and references. Return every error rather than throwing. The plan's manifest data must still stop at `visual-approved` even though the durable contract supports later phases.

- [ ] **Step 4: Run focused tests and type-check**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
pnpm type-check
```

Expected: both exit 0.

- [ ] **Step 5: Commit the contract**

```powershell
git add -- src/lib/exercises/visualCatalogV1.ts src/lib/exercises/__tests__/visualCatalogV1.test.ts
git commit -m "feat: define Vekira visual catalog v1 contract"
```

### Task 2: Create the 25-entry editorial manifest

**Files:**
- Create: `public/exercises/catalog/v1/manifest.json`
- Modify: `src/lib/exercises/__tests__/visualCatalogV1.test.ts`

**Interfaces:**
- Consumes: `validateCatalogV1Manifest` and the canonical records in this plan.
- Produces: the exact 25-entry draft manifest consumed by every later task.

- [ ] **Step 1: Add a failing real-manifest test**

Load and parse `public/exercises/catalog/v1/manifest.json`. Assert validation returns `[]`, there are exactly 25 entries, the first five have `batch === 'pilot'`, every status is either `draft` or `visual-approved`, and batch counts are `pilot: 5`, `1: 5`, `2: 5`, `3: 5`, `4: 5`. This assertion remains valid as approved batches advance.

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'

it('accepts the committed 25-entry V1 manifest', () => {
  const manifest = JSON.parse(readFileSync(
    path.resolve(process.cwd(), 'public/exercises/catalog/v1/manifest.json'),
    'utf8',
  ))
  expect(validateCatalogV1Manifest(manifest)).toEqual([])
  expect(manifest.exercises).toHaveLength(25)
  expect(manifest.exercises.slice(0, 5).every((entry: { batch: unknown }) => entry.batch === 'pilot')).toBe(true)
  expect(manifest.exercises.every((entry: { status: unknown }) =>
    entry.status === 'draft' || entry.status === 'visual-approved',
  )).toBe(true)
  expect(Object.fromEntries(['pilot', 1, 2, 3, 4].map(batch => [
    batch,
    manifest.exercises.filter((entry: { batch: unknown }) => entry.batch === batch).length,
  ]))).toEqual({ pilot: 5, 1: 5, 2: 5, 3: 5, 4: 5 })
})
```

- [ ] **Step 2: Run the test and confirm the missing-file failure**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
```

Expected: FAIL with `ENOENT` for `public/exercises/catalog/v1/manifest.json`.

- [ ] **Step 3: Write the complete manifest**

Create version `1`, date `2026-08-25`, and visual style `vekira-anatomical-3d-v1`. Use all canonical data above. Copy the approved pilot descriptions and arrays exactly from the pilot manifest, then add the pilot canonical fields. Set all 25 entries to `draft` with `reviews: {}`. Assign poster paths now, but omit hashes and source keys until the matching asset exists.

- [ ] **Step 4: Run contract tests and the type checker**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
pnpm type-check
```

Expected: both exit 0.

- [ ] **Step 5: Commit the editorial manifest**

```powershell
git add -- public/exercises/catalog/v1/manifest.json src/lib/exercises/__tests__/visualCatalogV1.test.ts
git commit -m "feat: add Vekira catalog v1 editorial manifest"
```

### Task 3: Build and test the deterministic asset pipeline

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `scripts/exercise_visual_assets.py`
- Create: `scripts/validate_exercise_visual_assets.py`
- Create: `scripts/__tests__/test_exercise_visual_assets.py`
- Create: `scripts/validate-exercise-visual-catalog-v1.ts`
- Create: `scripts/__tests__/validateExerciseVisualCatalogV1.test.ts`

**Interfaces:**
- Consumes: V1 manifest, staged sources, and committed posters.
- Produces: `build_poster(source: Path, output: Path) -> str`, `build_contact_sheet(posters: list[Path], output: Path, tile_size: int) -> None`, `validateCatalogV1AssetFiles(manifest: CatalogV1Manifest, publicRoot: string, artifactsRoot: string, options?: { complete?: boolean }): Promise<string[]>`, and two package validation commands.

- [ ] **Step 1: Write failing Python asset tests**

Use `unittest` and temporary directories. Create a 1254 × 1254 synthetic PNG; assert `build_poster` creates a 1024 × 1024 WebP no larger than 102400 bytes and returns its SHA-256. Create five colored posters and assert 512 px and 80 px contact sheets contain five horizontal tiles. Assert the validator rejects a non-square PNG, a 900 × 900 poster, a poster over 102400 bytes, and a file whose Pillow format is not WebP.

```python
from scripts.exercise_visual_assets import build_contact_sheet, build_poster

class ExerciseVisualAssetsTest(unittest.TestCase):
    def test_builds_bounded_square_webp(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            poster = root / "poster.webp"
            Image.new("RGB", (1254, 1254), "#f8f3eb").save(source)
            digest = build_poster(source, poster)
            with Image.open(poster) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertEqual(image.size, (1024, 1024))
            self.assertLessEqual(poster.stat().st_size, 102400)
            self.assertEqual(digest, hashlib.sha256(poster.read_bytes()).hexdigest())
```

- [ ] **Step 2: Run Python tests and confirm the missing-module failure**

```powershell
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
```

Expected: FAIL because the asset scripts do not exist.

- [ ] **Step 3: Implement poster conversion and contact sheets**

`build_poster` must use `ImageOps.contain` with `Image.Resampling.LANCZOS`, center the result on a 1024 square `#f8f3eb` RGB canvas, and try WebP qualities `88`, `84`, `80`, `76`, `72` with `method=6`; keep the first output no larger than 102400 bytes and raise `ValueError` if none qualifies. `build_contact_sheet` uses one horizontal row, a 12 px ivory gap, and no labels. Add CLI subcommands:

```powershell
python scripts/exercise_visual_assets.py poster --input .artifacts/exercises/catalog-v1/peso-muerto-rumano-barra/source.png --output public/exercises/catalog/v1/peso-muerto-rumano-barra/poster.webp
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --output .artifacts/exercises/catalog-v1/reviews/group-1-full.webp public/exercises/catalog/v1/peso-muerto-rumano-barra/poster.webp public/exercises/catalog/v1/press-inclinado-mancuernas/poster.webp public/exercises/catalog/v1/remo-sentado-polea/poster.webp public/exercises/catalog/v1/elevacion-lateral-mancuernas/poster.webp public/exercises/catalog/v1/plancha-frontal/poster.webp
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --output .artifacts/exercises/catalog-v1/reviews/group-1-80.webp public/exercises/catalog/v1/peso-muerto-rumano-barra/poster.webp public/exercises/catalog/v1/press-inclinado-mancuernas/poster.webp public/exercises/catalog/v1/remo-sentado-polea/poster.webp public/exercises/catalog/v1/elevacion-lateral-mancuernas/poster.webp public/exercises/catalog/v1/plancha-frontal/poster.webp
```

- [ ] **Step 4: Write failing TypeScript filesystem tests**

With `mkdtemp`, create a partial manifest, one public poster, and one staged source. Assert safe matching paths and hashes return `[]`; assert missing files, `../` escapes, a poster over 102400 bytes, and digest mismatches return explicit errors. Assert `complete: false` skips draft entries without files and `complete: true` requires every entry.

```ts
it('rejects digest mismatches and skips unbuilt drafts in partial mode', async () => {
  const { manifest, publicRoot, artifactsRoot } = await fixtureWithOneApprovedEntry()
  manifest.exercises[0].assets.posterSha256 = '0'.repeat(64)
  const errors = await validateCatalogV1AssetFiles(
    manifest,
    publicRoot,
    artifactsRoot,
    { complete: false },
  )
  expect(errors).toContain('poster digest mismatch: sentadilla-trasera-barra')
  expect(errors).not.toContain('missing poster: peso-muerto-rumano-barra')
})
```

- [ ] **Step 5: Implement TypeScript and Pillow validation commands**

The TypeScript validator resolves paths under the supplied roots, uses `stat` and `createHash('sha256')`, and never follows a manifest path outside its root. The Python validator reads the manifest, validates `visual-approved` entries by default, validates all entries with `--complete`, and checks source/poster format, square dimensions, minimum dimensions, and poster byte size.

Add `.artifacts/` to `.gitignore` and these scripts:

```json
"validate:exercise-catalog-v1": "tsx scripts/validate-exercise-visual-catalog-v1.ts && python scripts/validate_exercise_visual_assets.py",
"validate:exercise-catalog-v1:complete": "tsx scripts/validate-exercise-visual-catalog-v1.ts --complete && python scripts/validate_exercise_visual_assets.py --complete"
```

- [ ] **Step 6: Run both test stacks and the partial validator**

```powershell
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
pnpm validate:exercise-catalog-v1
pnpm type-check
```

Expected: tests, partial validator, and type-check exit 0; drafts without assets are permitted.

- [ ] **Step 7: Commit the asset pipeline**

```powershell
git add -- .gitignore package.json scripts/exercise_visual_assets.py scripts/validate_exercise_visual_assets.py scripts/__tests__/test_exercise_visual_assets.py scripts/validate-exercise-visual-catalog-v1.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git commit -m "test: add Vekira visual catalog asset pipeline"
```

### Task 4: Promote the five approved pilot posters

**Files:**
- Create: `public/exercises/catalog/v1/sentadilla-trasera-barra/poster.webp`
- Create: `public/exercises/catalog/v1/press-banca-barra/poster.webp`
- Create: `public/exercises/catalog/v1/jalon-pecho-polea/poster.webp`
- Create: `public/exercises/catalog/v1/arnold-press-mancuernas/poster.webp`
- Create: `public/exercises/catalog/v1/rueda-abdominal-rodillas/poster.webp`
- Modify: `public/exercises/catalog/v1/manifest.json`
- Create locally only: one `.artifacts/exercises/catalog-v1/{pilot-slug}/source.png` for each of the five exact pilot slugs listed above.
- Create locally only: `.artifacts/exercises/catalog-v1/reviews/pilot-full.webp`
- Create locally only: `.artifacts/exercises/catalog-v1/reviews/pilot-80.webp`

**Interfaces:**
- Consumes: approved pilot source/poster pairs.
- Produces: five promoted `visual-approved` V1 entries with real hashes and private source keys.

- [ ] **Step 1: Copy without regenerating or deleting pilot assets**

Copy each pilot `source.png` to its `.artifacts` V1 path and each pilot `poster.webp` to its V1 public path. Do not move or overwrite the originals.

- [ ] **Step 2: Validate the promoted images and calculate hashes**

Run the Python validator directly against the five copied pairs. Calculate SHA-256 for each source and poster. Set each `sourceObjectKey` to `v1/{slug}/{sourceSha256}.png` using the exact digest printed for that source.

- [ ] **Step 3: Build and inspect both pilot contact sheets**

Build 512 px and 80 px sheets in the review directory. Inspect both with `view_image`; confirm they match the previously approved identity and remain recognizable at 80 px.

- [ ] **Step 4: Mark only the five promoted entries visual-approved**

Use `apply_patch` to add the exact printed hashes/object keys, change only these five statuses, and set `reviews.visual` to reviewer `owner`, date `2026-08-25`, and note `Identidad visual aprobada durante el piloto`. Leave all twenty new entries at `draft` with empty reviews.

- [ ] **Step 5: Run the partial gate**

```powershell
pnpm validate:exercise-catalog-v1
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git diff --check
```

Expected: all commands exit 0 and the validator reports five approved entries.

- [ ] **Step 6: Commit promoted posters and metadata**

```powershell
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/*/poster.webp
git commit -m "feat: promote exercise pilot into catalog v1"
```

### Task 5: Add the private source archive boundary

**Files:**
- Create: `supabase/migrations/061_exercise_visual_sources_bucket.sql`
- Create: `scripts/archive-exercise-visual-sources.ts`
- Create: `scripts/__tests__/archiveExerciseVisualSources.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: private bucket `exercise-visual-sources`, `buildSourceObjectKey(slug: CatalogV1ExerciseSlug, sha256: string): string`, `sha256File(path: string): Promise<string>`, `archiveSource(input: ArchiveSourceInput): Promise<'uploaded' | 'verified-existing'>`, and a dry-run-first archive CLI.
- Consumes: V1 manifest and staged sources; service-role credentials only with `--upload`.

- [ ] **Step 1: Write failing archive tests**

Assert `buildSourceObjectKey('plancha-frontal', 'a'.repeat(64))` returns `v1/plancha-frontal/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png`. Assert a local digest mismatch blocks upload, a new object uploads with `contentType: 'image/png'` and `upsert: false`, and a 409 downloads the existing object and accepts it only when its digest matches.

```ts
it('builds immutable source keys', () => {
  expect(buildSourceObjectKey('plancha-frontal', 'a'.repeat(64))).toBe(
    'v1/plancha-frontal/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
  )
})

it('refuses to archive a source whose local digest changed', async () => {
  await expect(archiveSource({
    slug: 'plancha-frontal',
    expectedSha256: 'a'.repeat(64),
    sourcePath: changedSourcePath,
    bucket: mockedBucket,
  })).rejects.toThrow('source digest mismatch: plancha-frontal')
  expect(mockedBucket.upload).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test and confirm failure**

```powershell
pnpm test -- scripts/__tests__/archiveExerciseVisualSources.test.ts
```

Expected: FAIL because the archive script does not exist.

- [ ] **Step 3: Define the private PNG-only bucket**

Create migration 056 with this idempotent definition and no anon/authenticated policies:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exercise-visual-sources',
  'exercise-visual-sources',
  false,
  10485760,
  ARRAY['image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
```

- [ ] **Step 4: Implement dry-run and explicit upload behavior**

Without `--upload`, verify every approved local file/digest and print the planned object keys without creating a client. With `--upload`, require `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, upload through the private bucket, verify existing objects by download/digest, print no secret, and never delete a local file.

Define the testable boundary explicitly:

```ts
export type ArchiveSourceInput = {
  slug: CatalogV1ExerciseSlug
  expectedSha256: string
  sourcePath: string
  bucket: {
    upload(path: string, body: Uint8Array, options: { contentType: 'image/png'; upsert: false }): Promise<{ error: { message: string; statusCode?: string } | null }>
    download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>
  }
}

export async function archiveSource(
  input: ArchiveSourceInput,
): Promise<'uploaded' | 'verified-existing'>
```

Add:

```json
"archive:exercise-catalog-v1": "tsx --env-file=.env.local scripts/archive-exercise-visual-sources.ts"
```

- [ ] **Step 5: Run tests and a local dry run**

```powershell
pnpm test -- scripts/__tests__/archiveExerciseVisualSources.test.ts
pnpm archive:exercise-catalog-v1
pnpm type-check
```

Expected: tests/type-check pass; dry run reports five planned pilot objects and performs no network mutation.

- [ ] **Step 6: Commit the archive boundary**

```powershell
git add -- supabase/migrations/061_exercise_visual_sources_bucket.sql scripts/archive-exercise-visual-sources.ts scripts/__tests__/archiveExerciseVisualSources.test.ts package.json
git commit -m "feat: add private exercise visual source archive"
```

### Task 6: Produce and review visual batch 1

**Files:**
- Create: five batch-1 staged `source.png` files.
- Create: five batch-1 public `poster.webp` files.
- Modify: `public/exercises/catalog/v1/manifest.json` after approval.
- Create locally only: group-1 full and 80 px contact sheets.

**Interfaces:**
- Consumes: Shared Generation Prompt and exact batch-1 subject blocks.
- Produces: five approved posters or a documented pause for any unresolved exercise.

- [ ] **Step 1: Generate five independent sources**

Use `image_gen` once per exercise with `public/exercises/pilot/arnold-press-mancuernas/source.png` as the style reference. Save outputs to the exact `.artifacts` slug paths. Do not include the Hevy screenshot.

- [ ] **Step 2: Inspect original sources one at a time**

Use `view_image` at original detail. Reject changed mannequins, cropped equipment, deformed hands/joints, wrong muscle highlights, text, logos, unsafe positions, or subject-block violations. Permit at most two blind generations per exercise; after that, revise the prompt/camera before another call.

- [ ] **Step 3: Build five deterministic posters and both contact sheets**

Run the poster CLI for every approved source, then build group-1 sheets at tile sizes 512 and 80.

- [ ] **Step 4: Present the group and wait for explicit visual approval**

Show the full and 80 px sheets. Do not change manifest statuses or begin Task 7 until the user approves this group.

- [ ] **Step 5: Record approval metadata and run the partial gate**

Insert real hashes/object keys, change these five entries to `visual-approved`, and record `reviews.visual` with reviewer `owner`, the current ISO date, and a concise note identifying group 1 approval. Then run:

```powershell
pnpm validate:exercise-catalog-v1
pnpm archive:exercise-catalog-v1
git diff --check
```

Expected: validator reports ten approved entries; archive command is dry-run only.

- [ ] **Step 6: Commit batch 1**

```powershell
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/peso-muerto-rumano-barra/poster.webp public/exercises/catalog/v1/press-inclinado-mancuernas/poster.webp public/exercises/catalog/v1/remo-sentado-polea/poster.webp public/exercises/catalog/v1/elevacion-lateral-mancuernas/poster.webp public/exercises/catalog/v1/plancha-frontal/poster.webp
git commit -m "feat: add Vekira visual catalog batch 1"
```

### Task 7: Produce and review visual batch 2

**Files:**
- Create: five batch-2 staged sources and five public posters.
- Modify: V1 manifest after approval.
- Create locally only: group-2 review sheets.

**Interfaces:**
- Consumes: approved batch-1 style calibration and exact batch-2 subject blocks.
- Produces: five additional approved posters.

- [ ] **Step 1: Generate and inspect the five batch-2 sources**

Use the Shared Generation Prompt separately for `prensa-piernas-45`, `press-pecho-maquina`, `remo-mancuerna-un-brazo`, `curl-biceps-barra-ez`, and `bicicleta-estatica`. Use the Arnold source as style reference and the approved batch-1 poster with the closest camera/equipment only when a second style reference materially clarifies the machine.

- [ ] **Step 2: Build posters and contact sheets**

Run the same deterministic poster/contact-sheet commands with the five exact batch-2 paths.

- [ ] **Step 3: Present the group and wait for approval**

Do not change statuses or start Task 8 until explicit approval.

- [ ] **Step 4: Record exact hashes, validate, and dry-run archive**

Change only batch-2 entries to `visual-approved`; record the same owner/date/group-specific visual review fields; expect fifteen approved entries from the partial validator.

- [ ] **Step 5: Commit batch 2**

```powershell
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/prensa-piernas-45/poster.webp public/exercises/catalog/v1/press-pecho-maquina/poster.webp public/exercises/catalog/v1/remo-mancuerna-un-brazo/poster.webp public/exercises/catalog/v1/curl-biceps-barra-ez/poster.webp public/exercises/catalog/v1/bicicleta-estatica/poster.webp
git commit -m "feat: add Vekira visual catalog batch 2"
```

### Task 8: Produce and review visual batch 3

**Files:**
- Create: five batch-3 staged sources and five public posters.
- Modify: V1 manifest after approval.
- Create locally only: group-3 review sheets.

**Interfaces:**
- Consumes: approved style calibration and exact batch-3 subject blocks.
- Produces: five additional approved posters.

- [ ] **Step 1: Generate and inspect the five equipment-heavy sources**

Use independent calls for `hip-thrust-barra`, `aperturas-pecho-polea`, `dominada-asistida-maquina`, `apertura-inversa-maquina`, and `extension-triceps-cuerda`. Reject detached cables, impossible weight stacks, missing pads, inconsistent benches, and any bar passing behind the neck.

- [ ] **Step 2: Build posters and both contact sheets**

Run the deterministic asset commands and inspect original, full-sheet, and 80 px views.

- [ ] **Step 3: Present the group and wait for approval**

Do not change statuses or start Task 9 until explicit approval.

- [ ] **Step 4: Record hashes, validate, and dry-run archive**

Change only batch-3 entries to `visual-approved`; record the same owner/date/group-specific visual review fields; expect twenty approved entries.

- [ ] **Step 5: Commit batch 3**

```powershell
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/hip-thrust-barra/poster.webp public/exercises/catalog/v1/aperturas-pecho-polea/poster.webp public/exercises/catalog/v1/dominada-asistida-maquina/poster.webp public/exercises/catalog/v1/apertura-inversa-maquina/poster.webp public/exercises/catalog/v1/extension-triceps-cuerda/poster.webp
git commit -m "feat: add Vekira visual catalog batch 3"
```

### Task 9: Produce and review visual batch 4

**Files:**
- Create: five batch-4 staged sources and five public posters.
- Modify: V1 manifest after approval.
- Create locally only: group-4 review sheets.

**Interfaces:**
- Consumes: approved style calibration and exact batch-4 subject blocks.
- Produces: the final five approved posters and a complete visual V1 manifest.

- [ ] **Step 1: Generate and inspect the five final sources**

Use independent calls for `curl-femoral-tumbado-maquina`, `curl-martillo-mancuernas`, `extension-triceps-sobre-cabeza-polea`, `crunch-polea-rodillas`, and `caminata-cinta`. For the treadmill, require walking rather than a running flight phase; for cable movements, require continuous attached cables.

- [ ] **Step 2: Build posters and both contact sheets**

Run the deterministic asset commands and inspect all views.

- [ ] **Step 3: Present the group and wait for approval**

Do not mark the catalog complete until explicit approval.

- [ ] **Step 4: Record hashes and run the complete validator**

Change batch-4 entries to `visual-approved`, record the same owner/date/group-specific visual review fields, then run:

```powershell
pnpm validate:exercise-catalog-v1:complete
pnpm archive:exercise-catalog-v1
```

Expected: complete validator reports 25 approved entries; dry-run reports 25 source objects and performs no network mutation.

- [ ] **Step 5: Commit batch 4**

```powershell
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/curl-femoral-tumbado-maquina/poster.webp public/exercises/catalog/v1/curl-martillo-mancuernas/poster.webp public/exercises/catalog/v1/extension-triceps-sobre-cabeza-polea/poster.webp public/exercises/catalog/v1/crunch-polea-rodillas/poster.webp public/exercises/catalog/v1/caminata-cinta/poster.webp
git commit -m "feat: add Vekira visual catalog batch 4"
```

### Task 10: Run the complete visual-catalog quality gate

**Files:**
- Verify only; modify only the specific manifest entry, validator, or asset that fails a gate.

**Interfaces:**
- Consumes: Tasks 1–9.
- Produces: evidence that visual V1 is complete but not technically approved, published, or integrated.

- [ ] **Step 1: Run focused TypeScript and Python checks**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts scripts/__tests__/archiveExerciseVisualSources.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets scripts.__tests__.test_build_exercise_motion_preview -v
pnpm validate:exercise-pilot
pnpm validate:exercise-catalog-v1:complete
pnpm type-check
git diff --check
```

Expected: every command exits 0; pilot still has five valid entries and V1 has 25 visual-approved entries.

- [ ] **Step 2: Run the project test suite with bounded parallelism**

```powershell
pnpm test -- --maxWorkers=4
```

Expected: exit 0. If an unrelated timeout occurs, rerun the exact failing file in isolation, record both outputs, and do not label the full suite green.

- [ ] **Step 3: Inspect a final 25-exercise contact sheet**

Build one 512 px-per-exercise sheet and one 80 px-per-exercise sheet in `.artifacts`. Inspect both for identity drift, repeated equipment errors, unreadable thumbnails, and any exercise that appears technically unsafe. A failed poster returns to its original batch and status `draft`.

- [ ] **Step 4: Verify no prohibited integration occurred**

```powershell
git diff --name-only ca5689e..HEAD
git status --short
```

Expected: no modifications to exercise seed, catalog UI, session UI, or live database scripts beyond migration 056's private bucket definition. `.artifacts` remains ignored.

- [ ] **Step 5: Offer the optional remote archive deployment separately**

If the owner authorizes remote Storage changes and confirms the migration is applied, run:

```powershell
pnpm archive:exercise-catalog-v1 -- --upload
```

Verify 25 successful or digest-matched objects. Otherwise report the migration and uploads as not remotely applied; retain every local source.

- [ ] **Step 6: Hand off the completed visual phase**

Show the final sheets, report exact command results, identify every entry as `visual-approved` only, and state that technique review, `exercises` integration, publication, motion playback, and Blender remain separate future work.
