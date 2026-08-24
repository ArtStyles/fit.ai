# Vekira Exercise Visual Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and validate five original professional exercise posters plus one explicitly experimental motion preview without changing the live exercise catalog.

**Architecture:** Generated source images live in an isolated public pilot directory and are indexed by a typed JSON manifest. A pure TypeScript validator enforces the manifest contract, while a small CLI checks that every referenced asset exists; no Supabase or application UI integration occurs in this plan. Static visuals are generated with one shared Vekira visual bible, and the Arnold Press motion preview is built separately so its experimental quality cannot be confused with approved final animation.

**Tech Stack:** ChatGPT Images built-in generation, Next.js public assets, TypeScript, Vitest, TSX, Python 3.12 + Pillow 12.1.1 for deterministic PNG/WebP conversion.

**Spec:** `docs/superpowers/specs/2026-08-24-catalogo-visual-vekira-pilot-design.md`

## Global Constraints

- Do not use extracted Hevy illustrations as edit targets or project assets.
- Do not write to Supabase, modify the exercise seed, replace public catalog images, or change the database schema.
- The five required slugs are `sentadilla-trasera-barra`, `press-banca-barra`, `jalon-pecho-polea`, `arnold-press-mancuernas`, and `rueda-abdominal-rodillas`.
- Every poster uses the approved original Vekira language: anatomical 3D mannequin, coral muscle highlights, graphite equipment, warm ivory background, start left, finish right, no embedded text or branding.
- Store high-quality sources as PNG and optimized posters as WebP under `public/exercises/pilot/<slug>/`.
- Treat the Arnold Press motion asset as `experimental`; it must never receive `technique-approved` or `published` status in this plan.
- Preserve all pre-existing unrelated worktree changes.

---

### Task 1: Define and test the pilot manifest contract

**Files:**
- Create: `src/lib/exercises/visualPilot.ts`
- Create: `src/lib/exercises/__tests__/visualPilot.test.ts`

**Interfaces:**
- Produces: `PILOT_EXERCISE_SLUGS`, `PilotExerciseSlug`, `PilotReviewStatus`, `PilotExerciseEntry`, `PilotManifest`, and `validatePilotManifest(value: unknown): string[]`.
- Consumes: no project state or environment variables.

- [ ] **Step 1: Write the failing validator tests**

Create `src/lib/exercises/__tests__/visualPilot.test.ts` with a complete valid fixture and these assertions:

```ts
import { describe, expect, it } from 'vitest'
import { validatePilotManifest } from '../visualPilot'

const validManifest = {
  version: 1,
  generatedAt: '2026-08-24',
  visualStyle: 'vekira-anatomical-3d-v1',
  exercises: [
    {
      slug: 'arnold-press-mancuernas',
      nameEs: 'Arnold Press sentado con mancuernas',
      nameEn: 'Seated Arnold Dumbbell Press',
      pattern: 'empuje-vertical',
      equipment: ['mancuernas', 'banco'],
      primaryMuscles: ['deltoides anterior', 'deltoides lateral'],
      secondaryMuscles: ['tríceps'],
      startPosition: 'Sentado, mancuernas a la altura de los hombros y palmas hacia el cuerpo.',
      endPosition: 'Brazos elevados sobre la cabeza y palmas orientadas al frente.',
      techniqueChecks: ['Columna neutra', 'Pies apoyados', 'Rotación progresiva de las manos'],
      status: 'visual-approved',
      assets: {
        source: '/exercises/pilot/arnold-press-mancuernas/source.png',
        poster: '/exercises/pilot/arnold-press-mancuernas/poster.webp',
        motionPreview: '/exercises/pilot/arnold-press-mancuernas/motion-preview.webp',
      },
    },
  ],
}

describe('validatePilotManifest', () => {
  it('accepts a complete pilot manifest entry', () => {
    expect(validatePilotManifest(validManifest)).toEqual([])
  })

  it('rejects duplicate slugs and asset paths outside the pilot root', () => {
    const duplicate = {
      ...validManifest,
      exercises: [
        validManifest.exercises[0],
        {
          ...validManifest.exercises[0],
          assets: { ...validManifest.exercises[0].assets, poster: '/other/poster.webp' },
        },
      ],
    }

    expect(validatePilotManifest(duplicate)).toEqual(expect.arrayContaining([
      'exercises[1].slug must be unique',
      'exercises[1].assets.poster must start with /exercises/pilot/',
    ]))
  })

  it('rejects an experimental motion preview marked as published', () => {
    const published = {
      ...validManifest,
      exercises: [{ ...validManifest.exercises[0], status: 'published' }],
    }

    expect(validatePilotManifest(published)).toContain(
      'exercises[0] with motionPreview must remain draft or visual-approved in the pilot',
    )
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```powershell
pnpm test -- src/lib/exercises/__tests__/visualPilot.test.ts
```

Expected: FAIL because `../visualPilot` does not exist.

- [ ] **Step 3: Implement the pure contract and validator**

Create `src/lib/exercises/visualPilot.ts`. Define the five literal slugs, statuses
`draft | visual-approved | technique-approved | published`, the metadata fields shown in the
test, and a validator that:

```ts
export const PILOT_EXERCISE_SLUGS = [
  'sentadilla-trasera-barra',
  'press-banca-barra',
  'jalon-pecho-polea',
  'arnold-press-mancuernas',
  'rueda-abdominal-rodillas',
] as const

export type PilotExerciseSlug = typeof PILOT_EXERCISE_SLUGS[number]
export type PilotReviewStatus = 'draft' | 'visual-approved' | 'technique-approved' | 'published'

export type PilotExerciseEntry = {
  slug: PilotExerciseSlug
  nameEs: string
  nameEn: string
  pattern: string
  equipment: string[]
  primaryMuscles: string[]
  secondaryMuscles: string[]
  startPosition: string
  endPosition: string
  techniqueChecks: string[]
  status: PilotReviewStatus
  assets: { source: string; poster: string; motionPreview?: string }
}

export type PilotManifest = {
  version: 1
  generatedAt: string
  visualStyle: 'vekira-anatomical-3d-v1'
  exercises: PilotExerciseEntry[]
}
```

Use narrow runtime guards for objects, strings and string arrays. Return every validation error
instead of throwing. Require source paths ending in `/source.png`, poster paths ending in
`/poster.webp`, and all asset paths starting with `/exercises/pilot/`. Apply the experimental
motion status rule from the test.

- [ ] **Step 4: Run the focused test and type checker**

Run:

```powershell
pnpm test -- src/lib/exercises/__tests__/visualPilot.test.ts
pnpm type-check
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the manifest contract**

```powershell
git add -- src/lib/exercises/visualPilot.ts src/lib/exercises/__tests__/visualPilot.test.ts
git commit -m "feat: define exercise visual pilot manifest"
```

### Task 2: Add a filesystem validation command

**Files:**
- Create: `scripts/validate-exercise-visual-pilot.ts`
- Create: `scripts/__tests__/validateExerciseVisualPilot.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validatePilotManifest(value)` from Task 1 and the manifest path passed to the CLI.
- Produces: `validatePilotAssetFiles(manifest, publicRoot): string[]` and the command `pnpm validate:exercise-pilot`.

- [ ] **Step 1: Write failing filesystem tests**

Use `mkdtemp`, `mkdir`, and `writeFile` from `node:fs/promises` to create a temporary public
root. Assert that an existing source/poster pair returns `[]`, while a missing poster returns:

```ts
['missing asset: /exercises/pilot/arnold-press-mancuernas/poster.webp']
```

Import `validatePilotAssetFiles` from `../validate-exercise-visual-pilot`.

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
pnpm test -- scripts/__tests__/validateExerciseVisualPilot.test.ts
```

Expected: FAIL because the validation script does not exist.

- [ ] **Step 3: Implement the command without network or Supabase access**

Create `scripts/validate-exercise-visual-pilot.ts`. Export a synchronous or asynchronous
`validatePilotAssetFiles` that resolves each leading-slash asset under `publicRoot`, rejects
paths escaping that root, and checks existence with `stat`. Its CLI path must:

1. Read `public/exercises/pilot/manifest.json`.
2. Parse JSON.
3. Combine `validatePilotManifest` errors with asset-file errors.
4. Print errors to stderr and set `process.exitCode = 1`, or print
   `Exercise visual pilot is valid (5 exercises).` and exit 0.

Guard direct execution with `import.meta.url === pathToFileURL(process.argv[1]).href` so tests
can import the function without running the CLI.

Add this exact package script:

```json
"validate:exercise-pilot": "tsx scripts/validate-exercise-visual-pilot.ts"
```

- [ ] **Step 4: Run tests and observe the expected pre-asset command failure**

```powershell
pnpm test -- scripts/__tests__/validateExerciseVisualPilot.test.ts src/lib/exercises/__tests__/visualPilot.test.ts
pnpm validate:exercise-pilot
```

Expected: tests PASS; the validation command FAILS only because the pilot manifest/assets have
not been created yet.

- [ ] **Step 5: Commit the filesystem validator**

```powershell
git add -- package.json scripts/validate-exercise-visual-pilot.ts scripts/__tests__/validateExerciseVisualPilot.test.ts
git commit -m "test: validate exercise pilot assets"
```

### Task 3: Generate and curate the five static exercise posters

**Files:**
- Create: `public/exercises/pilot/sentadilla-trasera-barra/source.png`
- Create: `public/exercises/pilot/sentadilla-trasera-barra/poster.webp`
- Create: `public/exercises/pilot/press-banca-barra/source.png`
- Create: `public/exercises/pilot/press-banca-barra/poster.webp`
- Create: `public/exercises/pilot/jalon-pecho-polea/source.png`
- Create: `public/exercises/pilot/jalon-pecho-polea/poster.webp`
- Create: `public/exercises/pilot/arnold-press-mancuernas/source.png`
- Create: `public/exercises/pilot/arnold-press-mancuernas/poster.webp`
- Create: `public/exercises/pilot/rueda-abdominal-rodillas/source.png`
- Create: `public/exercises/pilot/rueda-abdominal-rodillas/poster.webp`

**Interfaces:**
- Consumes: the approved `vekira-anatomical-3d-v1` visual bible in the spec.
- Produces: five square PNG sources and five 1024×1024 WebP posters referenced by Task 4.

- [ ] **Step 1: Generate one source per exercise using the built-in image tool**

Use a separate generation call for each exercise. Keep this shared prompt verbatim, replacing
only the movement-specific subject block:

```text
Use case: scientific-educational
Asset type: professional exercise catalog poster for a mobile fitness app
Primary request: Create an original premium 3D anatomical instructional illustration showing two clearly separated sequential poses of the exact same athlete: starting position on the left and finishing position on the right.
Scene/backdrop: clean warm-ivory studio background, no UI and no card frame.
Style/medium: high-end polished 3D medical-fitness visualization; realistic anatomy but not a real identifiable person; consistent sculpted gender-neutral athletic character; graphite equipment; primary muscles in coral and secondary muscles in muted coral.
Composition/framing: square, full body and full equipment visible, identical camera angle and scale in both poses, readable as an 80 px mobile thumbnail.
Lighting/mood: soft professional studio lighting and subtle contact shadows.
Constraints: original Vekira visual identity; no Hevy artwork or branded asset as input; anatomically coherent start and finish; no logos, text, numbers, arrows, watermark, extra limbs, duplicated equipment, or cropped hands and feet.
```

Movement-specific subject blocks:

- **Sentadilla trasera:** three-quarter side view; barbell fixed across upper trapezius; start
  standing with neutral spine; finish with hips back/down, knees tracking toes and thighs near
  parallel; highlight quadriceps and gluteus maximus, with hamstrings muted.
- **Press de banca:** three-quarter side view; same flat bench and racked barbell; start bar
  controlled above mid-chest with arms extended; finish bar at mid-chest, forearms vertical,
  shoulder blades retracted and feet planted; highlight pectoralis major, with triceps and
  anterior deltoids muted.
- **Jalón al pecho:** three-quarter front view; same cable tower and wide straight bar; start
  seated with arms overhead and torso nearly vertical; finish bar at upper chest with elbows
  moving down/back, no excessive lean; highlight latissimus dorsi, with biceps and mid-back
  muted.
- **Arnold Press:** three-quarter front view; seated upright; start dumbbells at shoulder height
  with palms facing the torso and elbows forward; finish overhead with palms rotated forward;
  highlight anterior/lateral deltoids, with triceps muted.
- **Rueda abdominal:** side view; kneeling on a small neutral mat; start wheel below shoulders
  with hips slightly flexed; finish body extended in a straight line from knees through hips to
  shoulders without lumbar collapse; highlight rectus abdominis and transverse abdominal area,
  with lats muted.

- [ ] **Step 2: Inspect every source at original detail**

Use `view_image` on each generated file. Reject and regenerate only the affected exercise when
any of these appear: changed character between poses, extra/missing fingers or limbs, detached
weights, impossible joint angle, cropped equipment, incorrect muscle highlight, text/logo, or
movement that contradicts its subject block.

- [ ] **Step 3: Copy approved sources into the project without overwriting unrelated assets**

Create the five slug directories. Copy each selected built-in output to its exact `source.png`
path, leaving the original generated file intact.

- [ ] **Step 4: Convert deterministic WebP posters**

For each slug, use Pillow to open `source.png`, convert to RGB, resize to 1024×1024 using
`Image.Resampling.LANCZOS`, and save `poster.webp` with `format='WEBP'`, `quality=88`,
`method=6`. Do not crop; fit within a 1024×1024 warm-ivory canvas if the generated source is not
already square.

- [ ] **Step 5: Verify dimensions, formats and mobile readability**

Use Pillow to assert each PNG opens, each poster reports `format == 'WEBP'` and
`size == (1024, 1024)`. Create temporary 80×80 previews outside `public/` and inspect the five
previews with `view_image`; do not commit the temporary thumbnails.

- [ ] **Step 6: Commit the approved static assets**

```powershell
git add -- public/exercises/pilot/*/source.png public/exercises/pilot/*/poster.webp
git commit -m "feat: add Vekira exercise visual pilot posters"
```

### Task 4: Create the manifest and experimental motion preview

**Files:**
- Create: `public/exercises/pilot/manifest.json`
- Create: `public/exercises/pilot/arnold-press-mancuernas/motion-source.png`
- Create: `public/exercises/pilot/arnold-press-mancuernas/motion-preview.webp`
- Create: `scripts/build-exercise-motion-preview.py`

**Interfaces:**
- Consumes: the five approved Task 3 posters and a 3×2 Arnold Press motion sheet.
- Produces: a validated five-entry manifest and an animated WebP containing six frames.

- [ ] **Step 1: Create the five-entry manifest**

Create `manifest.json` with `version: 1`, `generatedAt: "2026-08-24"`,
`visualStyle: "vekira-anatomical-3d-v1"`, and exactly one entry per required slug. Populate
Spanish/English names, movement pattern, equipment, primary/secondary muscles, explicit start
and end positions, and three or more technique checks. Set every static entry to `draft`; set
Arnold Press to `visual-approved` only after its poster passes visual review.

- [ ] **Step 2: Generate one six-panel Arnold Press motion sheet**

Use the approved Arnold poster as a reference image and request a perfectly aligned 3×2 grid of
six sequential frames. Require the identical character, bench, dumbbells, camera, lighting and
scale in every cell; movement progresses start → partial rotation → mid press → upper press →
finish → mid return. Require equal cells, no gutters, no text, no arrows and no added objects.
Save the approved sheet as `motion-source.png`.

- [ ] **Step 3: Write the deterministic sprite-to-WebP builder**

Create `scripts/build-exercise-motion-preview.py` with `argparse` arguments `--input` and
`--output`. Use Pillow to:

1. Open and convert the sheet to RGB.
2. Crop six equal cells in row-major order from a 3×2 grid.
3. Fit each cell onto a 512×512 warm-ivory canvas without cropping the athlete.
4. Append the reversed interior sequence (`4,3,2,1`) after frames `0..5` for a smooth loop.
5. Save animated WebP with `duration=180`, `loop=0`, `quality=86`, and `method=6`.
6. Reopen the output and fail unless `is_animated` is true and `n_frames == 10`.

- [ ] **Step 4: Build and inspect the animation**

```powershell
python scripts/build-exercise-motion-preview.py --input public/exercises/pilot/arnold-press-mancuernas/motion-source.png --output public/exercises/pilot/arnold-press-mancuernas/motion-preview.webp
```

Inspect the animated WebP. If the character, equipment or anatomy jumps between frames, keep
the file only as an experimental proof and record the discontinuity in the Arnold Press
`techniqueChecks`; do not regenerate repeatedly in an attempt to imply final Blender quality.

- [ ] **Step 5: Run manifest and asset validation**

```powershell
pnpm validate:exercise-pilot
```

Expected: `Exercise visual pilot is valid (5 exercises).`

- [ ] **Step 6: Commit the manifest and experimental animation**

```powershell
git add -- public/exercises/pilot/manifest.json public/exercises/pilot/arnold-press-mancuernas/motion-source.png public/exercises/pilot/arnold-press-mancuernas/motion-preview.webp scripts/build-exercise-motion-preview.py
git commit -m "feat: add exercise pilot motion preview"
```

### Task 5: Run the complete pilot quality gate

**Files:**
- Verify only; modify a specific failed asset or its manifest entry if a gate identifies a defect.

**Interfaces:**
- Consumes: all outputs from Tasks 1–4.
- Produces: evidence that the pilot is structurally valid and ready for user visual review.

- [ ] **Step 1: Run focused automated checks**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualPilot.test.ts scripts/__tests__/validateExerciseVisualPilot.test.ts
pnpm validate:exercise-pilot
pnpm type-check
git diff --check
```

Expected: all commands exit 0 and the validator reports exactly five exercises.

- [ ] **Step 2: Inspect the final five posters at full resolution and 80×80**

Confirm the eight visual acceptance rules from the spec. Record any anatomy uncertainty in the
handoff; do not present a visually polished but technically uncertain exercise as
`technique-approved`.

- [ ] **Step 3: Verify scope isolation**

```powershell
git status --short
git diff --name-only HEAD~3..HEAD
```

Expected: pilot work touches only the plan/spec, pilot assets, manifest validator/tests, package
script and motion builder. Pre-existing coaching editor changes remain unstaged and unchanged.

- [ ] **Step 4: Present the pilot for user review**

Show the five poster images, label the Arnold motion preview as experimental, report the exact
validation commands and distinguish visual approval from professional technique validation.

