# Vekira Visual Catalog V1 Expansion to 50 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the V1 editorial contract, append 25 approved classic exercises, and visually approve five new groups so the same living V1 catalog reaches 50 professional posters without touching production exercise flows.

**Architecture:** `CATALOG_V1_BATCHES` becomes the grouped, literal definition from which slugs, batch types, order, and expected counts are derived. The existing manifest remains the source of truth for editorial state; its first 25 asset/review tuples are protected by a stable regression digest while 25 new draft records advance group by group through the existing deterministic PNG → WebP → review-sheet pipeline. Partial validators cover every non-draft state, technique reviews are validated whenever present, and all remote/database/UI boundaries remain unchanged.

**Tech Stack:** TypeScript 5.3, Vitest 4, TSX, Node.js `crypto`/`fs`, Python 3.12, Pillow 12.1.1, ChatGPT Images, Git.

**Spec:** `docs/superpowers/specs/2026-08-26-catalogo-visual-vekira-ampliacion-50-design.md`

## Global Constraints

- Treat V1 as the living editorial catalog. `version: 1` identifies the schema and `vekira-anatomical-3d-v1` identifies the visual style; neither limits the catalog to 25 entries.
- Append exactly groups 5–9 and the 25 approved slugs in this plan. Every group has exactly five entries.
- Preserve the first 25 entries' slug, batch, status, reviews, poster path, `posterSha256`, `sourceSha256`, and `sourceObjectKey`; their regression projection digest is `829c098ec3690f56b9c9a3a404bf2f577dd74301bd757cb80a7077cead4ad63c`.
- Preserve the approved visual identity: opaque light-gray anatomical mannequin, coral primary muscles, muted-coral secondary muscles, matte graphite equipment, warm-ivory background, start left, finish right.
- Do not use Hevy images, screenshots, characters, poses, or compositions as generation/edit references or committed assets.
- Generate each exercise independently with the approved Vekira Arnold Press source as the style reference. A prior Vekira poster may be added only to clarify Vekira camera/equipment treatment.
- Keep every new entry at `draft` until its source, poster, hashes, group sheets, controller review, and fresh reviewer gate are clean.
- A rejected exercise remains or returns to `draft`; never replace an approved source/poster silently.
- After two incorrect generations for one exercise, stop blind retries and revise its camera, equipment description, or technical subject record before generating again.
- Never assign `technique-approved` or `published`; visual QA must not claim technical approval.
- Do not modify `exercises`, its seed, catalog UI, picker, plan, session, history, `ExerciseImage`, or any live publication path.
- Posters must be WebP, exactly 1024 × 1024 px, and at most 102400 bytes.
- Sources must be square PNG, at least 1024 × 1024 px, staged in the 25 exact `.artifacts/exercises/catalog-v1/{canonical-slug}/source.png` paths named by Tasks 5–9, and never deleted automatically.
- Commit only code, tests, documentation, `manifest.json`, and approved WebP posters. Keep sources and review sheets ignored.
- Run `pnpm archive:exercise-catalog-v1` only in its default dry-run mode. Do not use `--upload`, apply migration 056 remotely, push, or merge without new explicit owner authorization.
- Use `apply_patch` for tracked text edits and stage only files named by the task. Preserve unrelated user work.

## File and Interface Map

- Modify `src/lib/exercises/visualCatalogV1.ts`: grouped literal catalog definition, derived types/order, legacy-reference rules, review-state rules, and pure manifest validation.
- Modify `src/lib/exercises/__tests__/visualCatalogV1.test.ts`: review semantics, grouped contract, wave-1 immutability digest, exact new-wave membership, batch/order, and legacy-reference tests.
- Modify `scripts/validate-exercise-visual-catalog-v1.ts`: validate assets for all non-draft states in partial mode.
- Modify `scripts/__tests__/validateExerciseVisualCatalogV1.test.ts`: prove `technique-approved` and `published` assets are not skipped.
- Modify `scripts/validate_exercise_visual_assets.py`: apply the same non-draft partial rule in Pillow validation.
- Modify `scripts/__tests__/test_exercise_visual_assets.py`: prove both elevated states reach Pillow/hash validation.
- Modify `public/exercises/catalog/v1/manifest.json`: append 25 draft editorial records, then promote one approved group at a time.
- Create the 25 exact `public/exercises/catalog/v1/{canonical-slug}/poster.webp` paths listed by the `git add` commands in Tasks 5–9.
- Create the corresponding 25 local `.artifacts/exercises/catalog-v1/{canonical-slug}/source.png` generation masters.
- Create locally `group-5-full.webp`, `group-5-80.webp`, `group-6-full.webp`, `group-6-80.webp`, `group-7-full.webp`, `group-7-80.webp`, `group-8-full.webp`, `group-8-80.webp`, `group-9-full.webp`, and `group-9-80.webp` beneath `.artifacts/exercises/catalog-v1/reviews/`.
- Create locally `.artifacts/exercises/catalog-v1/reviews/wave-2-25-full.webp` and `.artifacts/exercises/catalog-v1/reviews/wave-2-25-80.webp` for the 25 new posters.
- Create locally `.artifacts/exercises/catalog-v1/reviews/final-50-full.webp` and `.artifacts/exercises/catalog-v1/reviews/final-50-80.webp` for complete V1 review.

## Canonical New-Wave Records

Use application-compatible movement keys: `squat`, `hinge`, `horizontal_push`, `horizontal_pull`, `vertical_push`, `vertical_pull`, `core`, `isolation`, and `locomotion`. Each record below is the exact editorial and image-generation subject contract.

### Group 5 — foundational classics

- `peso-muerto-convencional-barra`: English `Conventional Barbell Deadlift`; aliases ES `peso muerto clásico`, `deadlift con barra`; aliases EN `barbell deadlift`, `conventional deadlift`; region `legs`; difficulty `intermediate`; movement `hinge`; equipment `barra`, `discos`; primary `glúteo mayor`, `isquiotibiales`; secondary `erectores espinales`, `cuádriceps`, `trapecio`; legacy `free-exercise-db` / `Barbell_Deadlift`. Start: barra apoyada en el suelo sobre el mediopié, pies al ancho de las caderas, cadera y rodillas flexionadas, espalda neutra y hombros ligeramente delante de la barra. Finish: de pie con caderas y rodillas extendidas, barra junto a los muslos y torso vertical sin inclinarse hacia atrás. Checks: mantener la barra cerca del cuerpo; empujar el suelo con ambos pies; no redondear ni hiperextender la zona lumbar.
- `press-plano-mancuernas`: English `Flat Dumbbell Bench Press`; aliases ES `press de pecho con mancuernas`, `press plano`; aliases EN `dumbbell bench press`, `flat dumbbell press`; region `chest`; difficulty `beginner`; movement `horizontal_push`; equipment `mancuernas`, `banco plano`; primary `pectoral mayor`; secondary `tríceps`, `deltoides anterior`; legacy `free-exercise-db` / `Dumbbell_Bench_Press`. Start: tumbado en banco plano, pies apoyados, mancuernas junto al pecho medio y antebrazos verticales. Finish: mancuernas controladas sobre el pecho con brazos extendidos sin bloqueo forzado y escápulas apoyadas. Checks: mantener muñecas apiladas; no despegar hombros ni pelvis del banco; bajar las mancuernas de forma simétrica.
- `flexiones-pecho`: English `Push-Up`; aliases ES `flexiones`, `lagartijas`; aliases EN `push-up`, `bodyweight pushup`; region `chest`; difficulty `beginner`; movement `horizontal_push`; equipment `peso corporal`, `colchoneta`; primary `pectoral mayor`; secondary `tríceps`, `deltoides anterior`, `serrato anterior`; legacy `free-exercise-db` / `Pushups`. Start: plancha alta con manos algo más anchas que los hombros, brazos extendidos y cuerpo alineado de cabeza a talones. Finish: pecho descendido cerca del suelo, codos orientados aproximadamente 30–45° respecto al torso y cuerpo todavía alineado. Checks: evitar que se hunda la cadera; mantener cuello neutro; apoyar toda la mano y no abrir los codos a 90°.
- `dominadas-pronas`: English `Pronated-Grip Pull-Up`; aliases ES `dominadas`, `dominada libre`; aliases EN `pull-up`, `overhand pullup`; region `back`; difficulty `intermediate`; movement `vertical_pull`; equipment `barra de dominadas`; primary `dorsal ancho`; secondary `bíceps`, `redondo mayor`, `romboides`; legacy `free-exercise-db` / `Pullups`. Start: colgado con agarre prono algo más ancho que los hombros, brazos extendidos y escápulas controladas. Finish: pecho superior acercándose a la barra, codos abajo y atrás y piernas estables. Checks: no pasar la barra detrás del cuello; evitar balanceo o impulso; no forzar el mentón ni el cuello sobre la barra.
- `press-militar-pie-barra`: English `Standing Barbell Military Press`; aliases ES `press militar`, `press de hombros con barra`; aliases EN `standing military press`, `barbell overhead press`; region `shoulders`; difficulty `intermediate`; movement `vertical_push`; equipment `barra`, `discos`; primary `deltoides anterior`, `deltoides lateral`; secondary `tríceps`, `trapecio superior`; legacy `free-exercise-db` / `Standing_Military_Press`. Start: de pie con barra frente a la parte superior del pecho, manos algo más anchas que los hombros, muñecas apiladas y abdomen firme. Finish: barra sobre la cabeza alineada con el mediopié, brazos extendidos y cabeza neutra entre los brazos. Checks: no arquear la zona lumbar; mantener la trayectoria cerca del rostro; no convertirlo en push press con impulso de piernas.

### Group 6 — legs

- `sentadilla-goblet-kettlebell`: English `Kettlebell Goblet Squat`; aliases ES `sentadilla goblet`, `sentadilla copa`; aliases EN `goblet squat`, `kettlebell goblet squat`; region `legs`; difficulty `beginner`; movement `squat`; equipment `kettlebell`; primary `cuádriceps`, `glúteo mayor`; secondary `aductores`, `isquiotibiales`; legacy `free-exercise-db` / `Goblet_Squat`. Start: de pie con kettlebell pegada al pecho por las asas, pies algo más anchos que las caderas. Finish: cadera descendida entre los pies, rodillas alineadas con los dedos y torso erguido. Checks: mantener talones apoyados; sostener la kettlebell cerca del esternón; evitar que las rodillas colapsen hacia dentro.
- `sentadilla-bulgara-mancuernas`: English `Dumbbell Bulgarian Split Squat`; aliases ES `sentadilla búlgara`, `split squat búlgaro`; aliases EN `Bulgarian split squat`, `rear-foot-elevated split squat`; region `legs`; difficulty `intermediate`; movement `squat`; equipment `mancuernas`, `banco plano`; primary `cuádriceps`, `glúteo mayor`; secondary `aductores`, `isquiotibiales`; no legacy reference. Start: de pie en postura dividida con empeine trasero apoyado sobre un banco y mancuernas a los lados, pie delantero completamente apoyado. Finish: rodilla trasera descendida hacia el suelo y muslo delantero aproximándose a paralelo sin perder el equilibrio. Checks: mantener la rodilla delantera alineada con el pie; conservar el talón delantero apoyado; no empujar principalmente con la pierna elevada.
- `zancadas-caminando-mancuernas`: English `Dumbbell Walking Lunge`; aliases ES `zancadas caminando`, `lunges con mancuernas`; aliases EN `walking lunge`, `dumbbell walking lunge`; region `legs`; difficulty `beginner`; movement `squat`; equipment `mancuernas`; primary `cuádriceps`, `glúteo mayor`; secondary `isquiotibiales`, `aductores`; no legacy reference. Start: de pie con mancuernas a los lados y un paso controlado hacia delante. Finish: ambas rodillas flexionadas, rodilla trasera cerca del suelo y pie delantero totalmente apoyado antes de avanzar. Checks: mantener torso vertical; evitar que la rodilla delantera colapse hacia dentro; dar un paso suficientemente largo para apoyar el talón.
- `extension-cuadriceps-maquina`: English `Machine Leg Extension`; aliases ES `extensión de piernas`, `extensión de cuádriceps`; aliases EN `leg extension`, `machine knee extension`; region `legs`; difficulty `beginner`; movement `isolation`; equipment `máquina de extensión de cuádriceps`; primary `cuádriceps`; secondary `flexores de cadera`; legacy `free-exercise-db` / `Leg_Extensions`. Start: sentado con espalda apoyada, rodillas alineadas al pivote y almohadilla sobre la parte baja de las espinillas, rodillas flexionadas. Finish: piernas elevadas hasta casi extender las rodillas, sin separarse del asiento. Checks: alinear rodillas con el pivote; no bloquear con fuerza; controlar el descenso sin levantar la cadera.
- `elevacion-gemelos-pie-maquina`: English `Standing Machine Calf Raise`; aliases ES `gemelos de pie`, `elevación de talones en máquina`; aliases EN `standing calf raise`, `machine calf raise`; region `legs`; difficulty `beginner`; movement `isolation`; equipment `máquina de gemelos de pie`; primary `gastrocnemio`; secondary `sóleo`; legacy `free-exercise-db` / `Standing_Calf_Raises`. Start: hombros bajo las almohadillas, antepiés apoyados en el borde y talones descendidos de forma controlada, rodillas suaves. Finish: talones elevados al máximo cómodo manteniendo cuerpo vertical y pies paralelos. Checks: mover los tobillos sin rebotar; no bloquear las rodillas; mantener el antepié completamente apoyado.

### Group 7 — chest and back

- `aperturas-pecho-maquina`: English `Machine Pec Deck Fly`; aliases ES `pec deck`, `mariposa de pecho`; aliases EN `pec deck fly`, `machine chest fly`; region `chest`; difficulty `beginner`; movement `horizontal_push`; equipment `máquina pec deck`; primary `pectoral mayor`; secondary `deltoides anterior`; legacy `free-exercise-db` / `Butterfly`. Start: sentado de espaldas al respaldo, codos o antebrazos apoyados en las almohadillas y brazos abiertos a la altura del pecho. Finish: almohadillas reunidas frente al pecho sin separar espalda ni cabeza del respaldo. Checks: mostrar la máquina mirando hacia delante, no la variante inversa; mantener codos suaves; evitar elevar los hombros.
- `fondos-paralelas-pecho`: English `Parallel-Bar Chest Dip`; aliases ES `fondos de pecho`, `fondos en paralelas`; aliases EN `chest dip`, `parallel bar dip`; region `chest`; difficulty `intermediate`; movement `horizontal_push`; equipment `barras paralelas`; primary `pectoral mayor porción esternal`; secondary `tríceps`, `deltoides anterior`; legacy `free-exercise-db` / `Dips_-_Chest_Version`. Start: sostenido sobre barras paralelas con brazos extendidos, hombros controlados y torso ligeramente inclinado. Finish: codos flexionados y pecho descendido entre las barras dentro de un rango cómodo, piernas estables. Checks: no hundir los hombros; mantener la inclinación de pecho sin balanceo; no descender hasta una posición articular extrema.
- `remo-inclinado-barra`: English `Bent-Over Barbell Row`; aliases ES `remo con barra`, `remo inclinado`; aliases EN `barbell row`, `bent-over row`; region `back`; difficulty `intermediate`; movement `horizontal_pull`; equipment `barra`, `discos`; primary `dorsal ancho`, `romboides`; secondary `bíceps`, `deltoides posterior`, `erectores espinales`; legacy `free-exercise-db` / `Bent_Over_Barbell_Row`. Start: de pie con cadera atrás, torso inclinado, columna neutra y barra colgando bajo los hombros con brazos extendidos. Finish: barra acercada a las costillas inferiores, codos detrás del torso y ángulo de cadera estable. Checks: no convertir el remo en un levantamiento de torso; mantener la barra cerca; no redondear la espalda.
- `remo-t-agarre`: English `T-Bar Row with Handle`; aliases ES `remo T`, `remo landmine`; aliases EN `T-bar row`, `landmine row`; region `back`; difficulty `intermediate`; movement `horizontal_pull`; equipment `barra anclada`, `agarre T`, `discos`; primary `dorsal ancho`, `romboides`; secondary `bíceps`, `trapecio medio`, `deltoides posterior`; legacy `free-exercise-db` / `T-Bar_Row_with_Handle`. Start: barra anclada entre los pies, torso inclinado con columna neutra, agarre T sujeto y brazos extendidos. Finish: agarre llevado hacia el abdomen inferior, codos atrás y extremo anclado aún en el suelo. Checks: mostrar un único anclaje coherente; no levantar el torso durante el tirón; mantener discos, barra y agarre conectados.
- `jalon-brazos-rectos-polea`: English `Straight-Arm Cable Pulldown`; aliases ES `pullover en polea`, `jalón de brazos rectos`; aliases EN `straight-arm pulldown`, `cable pullover`; region `back`; difficulty `beginner`; movement `isolation`; equipment `polea alta`, `barra recta`; primary `dorsal ancho`; secondary `redondo mayor`, `tríceps cabeza larga`; legacy `free-exercise-db` / `Straight-Arm_Pulldown`. Start: de pie frente a polea alta, brazos casi extendidos por encima y delante de los hombros, cable bajo tensión. Finish: barra descendida frente a los muslos manteniendo codos casi fijos y torso estable. Checks: mantener cable y barra conectados; no convertirlo en jalón de tríceps; evitar balanceo del torso.

### Group 8 — shoulders and arms

- `face-pull-polea`: English `Cable Rope Face Pull`; aliases ES `face pull`, `tirón a la cara`; aliases EN `face pull`, `rope face pull`; region `shoulders`; difficulty `beginner`; movement `horizontal_pull`; equipment `polea alta`, `cuerda`; primary `deltoides posterior`, `trapecio medio`; secondary `romboides`, `manguito rotador`; legacy `free-exercise-db` / `Face_Pull`. Start: de pie frente a polea a la altura del rostro, brazos extendidos y cuerda bajo tensión. Finish: cuerda separada hacia ambos lados del rostro, codos altos pero controlados y escápulas retraídas. Checks: mantener cuerda, mosquetón y cable continuos; no tirar hacia el cuello; evitar arquear el torso.
- `elevacion-frontal-mancuernas`: English `Dumbbell Front Raise`; aliases ES `elevación frontal`, `frontales con mancuernas`; aliases EN `front raise`, `dumbbell front raise`; region `shoulders`; difficulty `beginner`; movement `isolation`; equipment `mancuernas`; primary `deltoides anterior`; secondary `deltoides lateral`, `pectoral mayor porción clavicular`; legacy `free-exercise-db` / `Front_Dumbbell_Raise`. Start: de pie con mancuernas frente a los muslos, codos ligeramente flexionados y torso erguido. Finish: mancuernas elevadas al frente hasta la altura de los hombros, muñecas neutras. Checks: no superar innecesariamente la altura de hombros; evitar impulso de cadera; mantener hombros lejos de las orejas.
- `curl-biceps-barra-recta`: English `Straight-Bar Biceps Curl`; aliases ES `curl con barra recta`, `curl de bíceps con barra`; aliases EN `barbell curl`, `straight bar curl`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `barra recta`, `discos`; primary `bíceps braquial`; secondary `braquial`, `braquiorradial`; legacy `free-exercise-db` / `Barbell_Curl`. Start: de pie con barra recta frente a los muslos, brazos extendidos y codos junto al torso. Finish: barra cerca del abdomen superior, codos flexionados y hombros estables. Checks: representar barra recta, no EZ; no inclinar el torso hacia atrás; mantener muñecas alineadas.
- `curl-predicador-barra-ez`: English `EZ-Bar Preacher Curl`; aliases ES `curl predicador`, `curl Scott`; aliases EN `preacher curl`, `EZ-bar preacher curl`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `barra EZ`, `banco predicador`; primary `bíceps braquial`; secondary `braquial`, `braquiorradial`; no legacy reference. Start: sentado con brazos superiores completamente apoyados en el banco predicador, barra EZ baja y codos suavemente extendidos. Finish: barra elevada hacia los hombros manteniendo brazos superiores sobre la almohadilla. Checks: mostrar barra EZ y banco predicador inequívocos; no despegar codos; no hiperextender los codos abajo.
- `curl-biceps-polea-pie`: English `Standing Cable Biceps Curl`; aliases ES `curl en polea baja`, `curl de bíceps en cable`; aliases EN `standing cable curl`, `cable biceps curl`; region `arms`; difficulty `beginner`; movement `isolation`; equipment `polea baja`, `barra recta`; primary `bíceps braquial`; secondary `braquial`, `braquiorradial`; legacy `free-exercise-db` / `Standing_Biceps_Cable_Curl`. Start: de pie frente a polea baja, barra frente a los muslos, brazos extendidos y cable bajo tensión. Finish: barra cerca del abdomen superior con codos flexionados y brazos superiores estables. Checks: mantener cable, mosquetón y barra conectados; no mover los codos hacia delante; evitar balanceo del cuerpo.

### Group 9 — triceps, core, and cardio

- `press-frances-tumbado-barra-ez`: English `Lying EZ-Bar Triceps Extension`; aliases ES `press francés tumbado`, `rompecráneos con barra EZ`; aliases EN `lying triceps extension`, `EZ-bar skull crusher`; region `arms`; difficulty `intermediate`; movement `isolation`; equipment `barra EZ`, `banco plano`; primary `tríceps braquial`; secondary `ancóneo`; legacy `free-exercise-db` / `Lying_Triceps_Press`. Start: tumbado en banco plano con barra EZ sobre el pecho, brazos extendidos y muñecas neutras. Finish: codos flexionados con barra descendida de forma controlada hacia la parte superior de la cabeza, brazos superiores casi verticales. Checks: mostrar barra EZ y banco completos; mantener codos orientados al frente; no llevar la barra al cuello ni abrir excesivamente los codos.
- `elevacion-rodillas-colgado`: English `Hanging Knee Raise`; aliases ES `rodillas al pecho colgado`, `elevación de rodillas`; aliases EN `hanging knee raise`, `hanging knees to chest`; region `core`; difficulty `intermediate`; movement `core`; equipment `barra de dominadas`; primary `recto abdominal`, `pared abdominal profunda`; secondary `flexores de cadera`, `oblicuos`; no legacy reference. Start: colgado de barra con brazos extendidos, piernas juntas y pelvis controlada. Finish: rodillas elevadas hacia el pecho con pelvis ligeramente enrollada y torso sin balanceo. Checks: representar rodillas flexionadas, no piernas rectas; evitar impulso; mantener hombros activos y agarre estable.
- `plancha-lateral`: English `Forearm Side Plank`; aliases ES `plancha de lado`, `plancha lateral en antebrazo`; aliases EN `side plank`, `forearm side bridge`; region `core`; difficulty `beginner`; movement `core`; equipment `colchoneta`; primary `oblicuos`, `cuadrado lumbar`; secondary `glúteo medio`, `transverso abdominal`; legacy `free-exercise-db` / `Side_Bridge`. Start: tumbado de lado con antebrazo bajo el hombro, rodillas flexionadas y cadera apoyada. Finish: cuerpo elevado en línea lateral estable desde cabeza hasta pies, apoyo sobre antebrazo y borde de los pies. Checks: mantener codo bajo el hombro; evitar que caiga la cadera; no rotar el torso hacia el suelo.
- `eliptica`: English `Elliptical Trainer`; aliases ES `máquina elíptica`, `cardio en elíptica`; aliases EN `elliptical`, `elliptical trainer`; region `cardio`; difficulty `beginner`; movement `locomotion`; equipment `máquina elíptica`; primary `cuádriceps`, `glúteos`; secondary `isquiotibiales`, `gemelos`; legacy `free-exercise-db` / `Elliptical_Trainer`. Start: un pedal adelantado y el opuesto retrasado, torso vertical y manos sobre los brazos móviles. Finish: fase opuesta con pedales y brazos intercambiados, pies siempre apoyados. Checks: mantener ambos pies sobre los pedales; mostrar brazos y pedales conectados a la máquina; evitar encorvarse sobre las asas.
- `remo-estacionario`: English `Stationary Rowing Machine`; aliases ES `remo indoor`, `máquina de remo`; aliases EN `stationary rowing`, `rowing ergometer`; region `cardio`; difficulty `beginner`; movement `locomotion`; equipment `máquina de remo`; primary `cuádriceps`, `dorsal ancho`; secondary `glúteos`, `isquiotibiales`, `bíceps`; legacy `free-exercise-db` / `Rowing_Stationary`. Start: posición de captura con rodillas flexionadas, asiento adelante, brazos extendidos y torso ligeramente inclinado. Finish: piernas extendidas, asiento atrás, asa cerca de las costillas inferiores y torso apenas inclinado hacia atrás. Checks: mantener asa, cadena y volante conectados; mostrar asiento sobre el riel; evitar redondeo lumbar o tirón excesivo con brazos.

## Shared Generation Prompt

For each named slug, make one independent image-generation call. Supply `public/exercises/pilot/arnold-press-mancuernas/source.png` as the style reference and concatenate this prompt with that slug's complete canonical record above after the marker `SUBJECT RECORD`:

```text
Use case: scientific-educational.
Asset type: original professional exercise-catalog poster for the Vekira mobile fitness app.
Create a premium square 3D anatomical instructional illustration showing the exact same approved Vekira mannequin in two clearly separated sequential poses: starting position on the left and finishing position on the right.
Keep the approved Vekira identity: opaque light-gray sculpted anatomical surface, realistic athletic proportions, coral primary muscles, lower-intensity coral secondary muscles, matte graphite equipment, clean warm-ivory studio background, soft contact shadows, identical camera angle and scale in both poses.
Show the full body and all equipment with enough separation to remain readable at 80 × 80 px. Use a three-quarter view unless the subject record explicitly requires a side view.
Follow the supplied start and finish positions, muscles, equipment, and safety checks exactly. The left and right figures must use identical equipment geometry and must depict the same exercise variant.
No text, arrows, numbers, logos, watermark, gym background, cropped hands or feet, extra limbs, duplicated equipment, detached cables, impossible joints, or identifiable real person.
The reference image controls only the original Vekira mannequin, materials, palette, lighting, and composition quality. Do not copy its Arnold Press pose into this exercise.
SUBJECT RECORD
```

The task's five slug names select the five canonical records. Do not paraphrase a record before generation; prompt revisions may clarify camera/equipment while preserving its movement contract.

---

### Task 1: Harden elevated-state and technique-review validation

**Files:**
- Modify: `src/lib/exercises/visualCatalogV1.ts`
- Modify: `src/lib/exercises/__tests__/visualCatalogV1.test.ts`
- Modify: `scripts/validate-exercise-visual-catalog-v1.ts`
- Modify: `scripts/__tests__/validateExerciseVisualCatalogV1.test.ts`
- Modify: `scripts/validate_exercise_visual_assets.py`
- Modify: `scripts/__tests__/test_exercise_visual_assets.py`

**Interfaces:**
- Consumes: existing `CatalogV1ReviewStatus`, `validateCatalogV1Manifest`, `validateCatalogV1AssetFiles`, and `validate_catalog_assets`.
- Produces: partial asset validation for all `status !== 'draft'`; full validation for every present `reviews.technique`; manifest error `exercises[n].reviews.visual.notes cannot claim technical approval without a valid technique review`.

- [ ] **Step 1: Write failing TypeScript manifest tests**

Add these cases inside the existing `describe('validateCatalogV1Manifest', () => { ... })` block:

```ts
it('rejects a present but invalid technique review before an elevated state', () => {
  const manifest = {
    ...valid,
    exercises: valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, reviews: { technique: null } }
      : exercise),
  }

  expect(validateCatalogV1Manifest(manifest)).toContain(
    'exercises[5].reviews.technique must be an object',
  )
})

it('rejects a technical approval claim in visual notes without a valid technique review', () => {
  const manifest = {
    ...valid,
    exercises: valid.exercises.map((exercise, index) => index === 5
      ? {
          ...exercise,
          reviews: {
            visual: {
              reviewer: 'Codex visual QA',
              reviewedAt: '2026-08-26',
              notes: ['Grupo 5 aprobado tras QA visual y técnica'],
            },
          },
        }
      : exercise),
  }

  expect(validateCatalogV1Manifest(manifest)).toContain(
    'exercises[5].reviews.visual.notes cannot claim technical approval without a valid technique review',
  )
})

it('allows a technical note only with a complete technique review', () => {
  const manifest = {
    ...valid,
    exercises: valid.exercises.map((exercise, index) => index === 5
      ? {
          ...exercise,
          reviews: {
            visual: {
              reviewer: 'Codex visual QA',
              reviewedAt: '2026-08-26',
              notes: ['Composición visual lista para revisión técnica'],
            },
            technique: {
              reviewer: 'Revisor clínico',
              reviewedAt: '2026-08-26',
              notes: ['Trayectoria revisada'],
              qualification: 'Fisioterapeuta colegiado',
              references: ['Registro interno de revisión técnica'],
            },
          },
        }
      : exercise),
  }

  expect(validateCatalogV1Manifest(manifest)).toEqual([])
})
```

The last note describes readiness, not approval. The production regex must continue allowing it; only approval/validation claims joined to `técnica` are blocked.

- [ ] **Step 2: Write failing TypeScript and Python elevated-asset tests**

In `scripts/__tests__/validateExerciseVisualCatalogV1.test.ts`, add:

```ts
it.each(['technique-approved', 'published'] as const)(
  'validates %s assets in partial mode',
  async status => {
    const { artifactsRoot, manifest, publicRoot } = await fixtureWithOneApprovedEntry()
    manifest.exercises[0].status = status
    manifest.exercises[0].assets.posterSha256 = '0'.repeat(64)

    await expect(validateCatalogV1AssetFiles(
      manifest,
      publicRoot,
      artifactsRoot,
      { complete: false },
    )).resolves.toContain('poster digest mismatch: sentadilla-trasera-barra')
  },
)
```

In `scripts/__tests__/test_exercise_visual_assets.py`, add a real PNG/WebP fixture and this assertion loop:

```py
def test_partial_validation_checks_every_non_draft_state(self):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        public_root = root / "public"
        artifacts_root = root / "artifacts"
        slug = "sentadilla-trasera-barra"
        poster = public_root / "exercises" / "catalog" / "v1" / slug / "poster.webp"
        source = artifacts_root / slug / "source.png"
        poster.parent.mkdir(parents=True)
        source.parent.mkdir(parents=True)
        Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")
        Image.new("RGB", (1254, 1254), "#f8f3eb").save(source, "PNG")
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()

        for status in ("technique-approved", "published"):
            manifest = {"exercises": [{
                "slug": slug,
                "status": status,
                "assets": {
                    "poster": f"/exercises/catalog/v1/{slug}/poster.webp",
                    "posterSha256": "0" * 64,
                    "sourceSha256": source_hash,
                    "sourceObjectKey": f"v1/{slug}/{source_hash}.png",
                },
            }]}
            with self.subTest(status=status):
                self.assertIn(
                    f"poster digest mismatch: {slug}",
                    validate_catalog_assets(manifest, public_root, artifacts_root, False),
                )
```

- [ ] **Step 3: Run the new tests and verify RED**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
```

Expected: the invalid-technique and unsupported-claim assertions fail because draft reviews are currently ignored; both elevated-asset cases fail because partial validators currently skip statuses other than `visual-approved`.

- [ ] **Step 4: Implement the minimal review and status rules**

In `scripts/validate-exercise-visual-catalog-v1.ts`, replace `requiresAssets` with:

```ts
function requiresAssets(entry: CatalogV1ExerciseEntry, complete: boolean): boolean {
  return complete || entry.status !== 'draft'
}
```

In `scripts/validate_exercise_visual_assets.py`, replace the partial skip with:

```py
if not complete and status == "draft":
    continue
```

In `visualCatalogV1.ts`, add the exact claim regex and helper signature below, validate `reviews.technique` whenever the property is present, and retain whether it was valid:

```ts
const TECHNICAL_APPROVAL_CLAIM = /(?:\b(?:aprobaci[oó]n|aprob(?:ado|ada)|validaci[oó]n|valid(?:ado|ada)|qa)\b[^.!?;]{0,80}\bt[eé]cnica\b|\bt[eé]cnica\b[^.!?;]{0,80}\b(?:aprobaci[oó]n|aprob(?:ado|ada)|validaci[oó]n|valid(?:ado|ada))\b)/i

function validateTechniqueReview(value: unknown, prefix: string, errors: string[]): boolean
```

Implement that helper with a body, not a declaration. Apply these exact rules:

```ts
const techniqueValue = isRecord(candidate.reviews)
  ? candidate.reviews.technique
  : undefined
let validTechniqueReview = false

if (techniqueValue !== undefined) {
  validTechniqueReview = validateTechniqueReview(
    techniqueValue,
    `${prefix}.reviews.technique`,
    errors,
  )
}

if (requiresTechniqueReview(candidate.status) && !validTechniqueReview) {
  errors.push(`${prefix}.reviews.technique is required for ${candidate.status}`)
}
```

`validateTechniqueReview` must call `validateVisualReview`, require non-empty `qualification` and `references`, and return `true` only when that review added no error. Inspect `reviews.visual.notes`; when any string matches the approval/validation-plus-technical regex and `validTechniqueReview` is false, add the exact unsupported-claim error once.

Remove the test-only production-manifest regex from `visualCatalogV1.test.ts`; the new pure-validator tests now exercise the actual contract.

- [ ] **Step 5: Verify GREEN and the unchanged 25-item catalog**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
pnpm validate:exercise-catalog-v1:complete
pnpm type-check
git diff --check
```

Expected: every command exits 0; the committed 25-entry manifest remains valid and unchanged.

- [ ] **Step 6: Commit the validation hardening**

```powershell
git add -- src/lib/exercises/visualCatalogV1.ts src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/validate-exercise-visual-catalog-v1.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts scripts/validate_exercise_visual_assets.py scripts/__tests__/test_exercise_visual_assets.py
git commit -m "fix: harden exercise visual review gates"
```

### Task 2: Make the existing V1 contract group-driven and protect wave 1

**Files:**
- Modify: `src/lib/exercises/visualCatalogV1.ts`
- Modify: `src/lib/exercises/__tests__/visualCatalogV1.test.ts`

**Interfaces:**
- Consumes: the existing five groups (`pilot`, 1, 2, 3, 4) and the current first-25 manifest projection.
- Produces: `CATALOG_V1_BATCHES`, derived `CATALOG_V1_EXERCISE_SLUGS`, derived `CatalogV1Batch`/`CatalogV1ExerciseSlug`, slug-to-batch validation, exact editorial order validation, and immutable wave-1 digest coverage.

- [ ] **Step 1: Write failing grouped-contract and immutability tests**

Add `createHash` to the imports and add:

```ts
import {
  CATALOG_V1_BATCHES,
  CATALOG_V1_EXERCISE_SLUGS,
  validateCatalogV1Manifest,
} from '../visualCatalogV1'

it('derives the V1 order from five literal groups of five', () => {
  expect(CATALOG_V1_BATCHES.map(group => group.batch)).toEqual(['pilot', 1, 2, 3, 4])
  expect(CATALOG_V1_BATCHES.every(group => group.slugs.length === 5)).toBe(true)
  expect(CATALOG_V1_BATCHES.flatMap(group => [...group.slugs])).toEqual(CATALOG_V1_EXERCISE_SLUGS)
})

it('preserves the immutable wave-1 asset and review contract', () => {
  const manifest = JSON.parse(readFileSync(
    path.resolve(process.cwd(), 'public/exercises/catalog/v1/manifest.json'),
    'utf8',
  ))
  const projection = manifest.exercises.slice(0, 25).map(({
    slug, batch, status, reviews, assets,
  }: {
    slug: string
    batch: unknown
    status: unknown
    reviews: unknown
    assets: unknown
  }) => ({ slug, batch, status, reviews, assets }))
  const digest = createHash('sha256').update(JSON.stringify(projection)).digest('hex')

  expect(digest).toBe('829c098ec3690f56b9c9a3a404bf2f577dd74301bd757cb80a7077cead4ad63c')
})

it('rejects an out-of-order manifest even when membership is unchanged', () => {
  const exercises = valid.exercises.map(exercise => ({ ...exercise }))
  ;[exercises[0], exercises[1]] = [exercises[1], exercises[0]]

  expect(validateCatalogV1Manifest({ ...valid, exercises })).toEqual(expect.arrayContaining([
    'exercises[0].slug must be sentadilla-trasera-barra',
    'exercises[1].slug must be press-banca-barra',
  ]))
})
```

- [ ] **Step 2: Run the contract test and verify RED**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
```

Expected: import/expectation failure because `CATALOG_V1_BATCHES` does not exist, followed by the order test failing under the old set-only validation.

- [ ] **Step 3: Replace fixed arrays/batches with the literal grouped definition**

Define the current five groups exactly:

```ts
export const CATALOG_V1_BATCHES = [
  { batch: 'pilot', slugs: [
    'sentadilla-trasera-barra',
    'press-banca-barra',
    'jalon-pecho-polea',
    'arnold-press-mancuernas',
    'rueda-abdominal-rodillas',
  ] },
  { batch: 1, slugs: [
    'peso-muerto-rumano-barra',
    'press-inclinado-mancuernas',
    'remo-sentado-polea',
    'elevacion-lateral-mancuernas',
    'plancha-frontal',
  ] },
  { batch: 2, slugs: [
    'prensa-piernas-45',
    'press-pecho-maquina',
    'remo-mancuerna-un-brazo',
    'curl-biceps-barra-ez',
    'bicicleta-estatica',
  ] },
  { batch: 3, slugs: [
    'hip-thrust-barra',
    'aperturas-pecho-polea',
    'dominada-asistida-maquina',
    'apertura-inversa-maquina',
    'extension-triceps-cuerda',
  ] },
  { batch: 4, slugs: [
    'curl-femoral-tumbado-maquina',
    'curl-martillo-mancuernas',
    'extension-triceps-sobre-cabeza-polea',
    'crunch-polea-rodillas',
    'caminata-cinta',
  ] },
] as const

export type CatalogV1Batch = (typeof CATALOG_V1_BATCHES)[number]['batch']
export type CatalogV1ExerciseSlug = (typeof CATALOG_V1_BATCHES)[number]['slugs'][number]
export const CATALOG_V1_EXERCISE_SLUGS: readonly CatalogV1ExerciseSlug[] =
  CATALOG_V1_BATCHES.flatMap(group => [...group.slugs])
```

Build a `Map<CatalogV1ExerciseSlug, CatalogV1Batch>` once at module load. Replace index arithmetic with slug lookup. Make the membership error dynamic:

```ts
`exercises must contain exactly the ${CATALOG_V1_EXERCISE_SLUGS.length} supported V1 slugs`
```

Update the existing missing-slug test to build the same expected string from `CATALOG_V1_EXERCISE_SLUGS.length`; it must not retain the literal number 25.

For every index where the candidate slug differs from `CATALOG_V1_EXERCISE_SLUGS[index]`, add the exact-order error. For a valid slug, compare `candidate.batch` against the slug-to-batch map rather than `Math.floor(index / 5)`.

- [ ] **Step 4: Verify GREEN and mutation sensitivity**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
pnpm validate:exercise-catalog-v1:complete
pnpm type-check
git diff --check
```

Expected: all commands exit 0. Temporarily changing one existing `posterSha256` must fail the digest test; restore it before commit.

- [ ] **Step 5: Commit the scalable current contract**

```powershell
git add -- src/lib/exercises/visualCatalogV1.ts src/lib/exercises/__tests__/visualCatalogV1.test.ts
git commit -m "refactor: make Vekira catalog groups extensible"
```

### Task 3: Add bounded grid contact sheets for 25 and 50-item review

**Files:**
- Modify: `scripts/exercise_visual_assets.py`
- Modify: `scripts/__tests__/test_exercise_visual_assets.py`

**Interfaces:**
- Consumes: existing `build_contact_sheet(posters: list[Path], output: Path, tile_size: int)` and the `contact-sheet` CLI.
- Produces: `build_contact_sheet(posters: list[Path], output: Path, tile_size: int, columns: int | None = None)`; optional CLI `--columns`; row-major grids that preserve the current one-row default.

- [ ] **Step 1: Write failing grid geometry tests**

Keep the existing horizontal test and add:

```py
def test_builds_a_row_major_contact_sheet_grid(self):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        posters = []
        for index in range(7):
            poster = root / f"poster-{index}.webp"
            Image.new("RGB", (1024, 1024), (20 * index, 40, 80)).save(poster, "WEBP")
            posters.append(poster)

        sheet = root / "grid.webp"
        build_contact_sheet(posters, sheet, 80, columns=3)

        with Image.open(sheet) as image:
            self.assertEqual(image.size, (264, 264))
            for actual, expected in zip(image.getpixel((4, 188)), (120, 40, 80), strict=True):
                self.assertAlmostEqual(actual, expected, delta=3)

def test_rejects_non_positive_contact_sheet_columns(self):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        poster = root / "poster.webp"
        Image.new("RGB", (1024, 1024), "#f8f3eb").save(poster, "WEBP")

        with self.assertRaisesRegex(ValueError, "columns must be positive"):
            build_contact_sheet([poster], root / "grid.webp", 80, columns=0)

        with self.assertRaisesRegex(ValueError, "posters must not be empty"):
            build_contact_sheet([], root / "empty.webp", 80, columns=3)
```

The pixel assertion identifies poster index 6 in row 3, column 1 and tolerates only the small channel change introduced by lossy WebP encoding.

- [ ] **Step 2: Run the Python test and verify RED**

```powershell
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
```

Expected: both new tests fail because `build_contact_sheet` does not accept `columns`.

- [ ] **Step 3: Implement bounded row-major layout and CLI parsing**

Add `import math`, then use `math.ceil` and these exact geometry rules:

```py
def build_contact_sheet(
    posters: list[Path],
    output: Path,
    tile_size: int,
    columns: int | None = None,
) -> None:
    if tile_size <= 0:
        raise ValueError("tile_size must be positive")
    if columns is not None and columns <= 0:
        raise ValueError("columns must be positive")
    if not posters:
        raise ValueError("posters must not be empty")

    gap = 12
    column_count = min(columns or len(posters), len(posters))
    row_count = math.ceil(len(posters) / column_count)
    width = tile_size * column_count + gap * (column_count - 1)
    height = tile_size * row_count + gap * (row_count - 1)
```

Update the function docstring from horizontal-only to row-major review sheets. Create the canvas at `(width, height)`. For each poster index, use `column = index % column_count` and `row = index // column_count`; add the existing centering offset within that tile. Add `sheet_parser.add_argument("--columns", type=int)` and pass `arguments.columns` to the function. The default `None` must preserve current horizontal dimensions and every existing caller.

- [ ] **Step 4: Verify GREEN and current pipeline compatibility**

```powershell
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
pnpm validate:exercise-catalog-v1:complete
git diff --check
```

Expected: Python tests and the current 25-entry complete catalog pass; existing group sheets retain horizontal behavior when `--columns` is omitted.

- [ ] **Step 5: Commit grid support**

```powershell
git add -- scripts/exercise_visual_assets.py scripts/__tests__/test_exercise_visual_assets.py
git commit -m "feat: support grid exercise review sheets"
```

### Task 4: Append groups 5–9 as complete draft editorial records

**Files:**
- Modify: `src/lib/exercises/visualCatalogV1.ts`
- Modify: `src/lib/exercises/__tests__/visualCatalogV1.test.ts`
- Modify: `public/exercises/catalog/v1/manifest.json`

**Interfaces:**
- Consumes: Task 2 grouped definition, Task 3 review-sheet support, and the 25 canonical records in this plan.
- Produces: exactly 50 supported slugs; `legacySource?: 'free-exercise-db'` and `legacyExternalId?: string`; 25 new draft manifest entries with canonical metadata and no false legacy mapping.

- [ ] **Step 1: Write failing exact-wave, legacy-pair, and batch tests**

Add this literal before the tests:

```ts
const NEW_WAVE_SLUGS = [
  'peso-muerto-convencional-barra',
  'press-plano-mancuernas',
  'flexiones-pecho',
  'dominadas-pronas',
  'press-militar-pie-barra',
  'sentadilla-goblet-kettlebell',
  'sentadilla-bulgara-mancuernas',
  'zancadas-caminando-mancuernas',
  'extension-cuadriceps-maquina',
  'elevacion-gemelos-pie-maquina',
  'aperturas-pecho-maquina',
  'fondos-paralelas-pecho',
  'remo-inclinado-barra',
  'remo-t-agarre',
  'jalon-brazos-rectos-polea',
  'face-pull-polea',
  'elevacion-frontal-mancuernas',
  'curl-biceps-barra-recta',
  'curl-predicador-barra-ez',
  'curl-biceps-polea-pie',
  'press-frances-tumbado-barra-ez',
  'elevacion-rodillas-colgado',
  'plancha-lateral',
  'eliptica',
  'remo-estacionario',
] as const
```

Replace the test factory's index arithmetic with the grouped contract so new fixtures receive groups 5–9:

```ts
const BATCH_BY_SLUG = new Map(CATALOG_V1_BATCHES.flatMap(group =>
  group.slugs.map(slug => [slug, group.batch] as const),
))

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
  batch: BATCH_BY_SLUG.get(slug),
  status: 'draft',
  reviews: {},
  assets: { poster: `/exercises/catalog/v1/${slug}/poster.webp` },
})
```

Rename the existing real-manifest case to `accepts the committed 50-entry V1 manifest`, expect length 50, preserve the allowed `draft`/`visual-approved` assertion, and expect five entries in each of `pilot`, 1, 2, 3, 4, 5, 6, 7, 8, and 9.

Add:

```ts
it('contains the approved 50-entry V1 catalog in ten groups of five', () => {
  const manifest = JSON.parse(readFileSync(
    path.resolve(process.cwd(), 'public/exercises/catalog/v1/manifest.json'),
    'utf8',
  ))

  expect(CATALOG_V1_BATCHES.map(group => group.batch)).toEqual([
    'pilot', 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ])
  expect(CATALOG_V1_BATCHES.every(group => group.slugs.length === 5)).toBe(true)
  expect(CATALOG_V1_EXERCISE_SLUGS.slice(25)).toEqual(NEW_WAVE_SLUGS)
  expect(manifest.exercises).toHaveLength(50)
  expect(manifest.exercises.slice(25).map((exercise: { slug: string }) => exercise.slug)).toEqual(NEW_WAVE_SLUGS)
  expect(manifest.exercises.slice(25).every((exercise: { status: string }) => exercise.status === 'draft')).toBe(true)
})

it('requires paired and unique legacy references', () => {
  const missingSource = {
    ...valid,
    exercises: valid.exercises.map((exercise, index) => index === 5
      ? { ...exercise, legacyExternalId: 'Barbell_Deadlift' }
      : exercise),
  }
  expect(validateCatalogV1Manifest(missingSource)).toContain(
    'exercises[5].legacySource and legacyExternalId must appear together',
  )

  const duplicateId = {
    ...valid,
    exercises: valid.exercises.map((exercise, index) => index === 5 || index === 6
      ? {
          ...exercise,
          legacySource: 'free-exercise-db',
          legacyExternalId: 'Barbell_Deadlift',
        }
      : exercise),
  }
  expect(validateCatalogV1Manifest(duplicateId)).toContain(
    'legacyExternalId must be unique: Barbell_Deadlift',
  )
})
```

- [ ] **Step 2: Run the exact-wave tests and verify RED**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
```

Expected: failures for missing groups 5–9, 25 rather than 50 entries, and unsupported legacy fields/rules.

- [ ] **Step 3: Extend the grouped definition and legacy contract**

Append these exact group objects to `CATALOG_V1_BATCHES`:

```ts
{ batch: 5, slugs: [
  'peso-muerto-convencional-barra', 'press-plano-mancuernas', 'flexiones-pecho',
  'dominadas-pronas', 'press-militar-pie-barra',
] },
{ batch: 6, slugs: [
  'sentadilla-goblet-kettlebell', 'sentadilla-bulgara-mancuernas',
  'zancadas-caminando-mancuernas', 'extension-cuadriceps-maquina',
  'elevacion-gemelos-pie-maquina',
] },
{ batch: 7, slugs: [
  'aperturas-pecho-maquina', 'fondos-paralelas-pecho', 'remo-inclinado-barra',
  'remo-t-agarre', 'jalon-brazos-rectos-polea',
] },
{ batch: 8, slugs: [
  'face-pull-polea', 'elevacion-frontal-mancuernas', 'curl-biceps-barra-recta',
  'curl-predicador-barra-ez', 'curl-biceps-polea-pie',
] },
{ batch: 9, slugs: [
  'press-frances-tumbado-barra-ez', 'elevacion-rodillas-colgado', 'plancha-lateral',
  'eliptica', 'remo-estacionario',
] },
```

Add the optional legacy fields to `CatalogV1ExerciseEntry`. Validate all-or-nothing pairing, exact source value `free-exercise-db`, non-empty external IDs, and uniqueness among present IDs.

- [ ] **Step 4: Append the 25 draft manifest records**

Update `generatedAt` to `2026-08-26`. Convert each canonical record above into its manifest object with the exact Spanish/English names, aliases, region, difficulty, movement, equipment, muscles, start/end, and checks. Every new record uses the following state, where `slug` is that record's literal canonical slug:

```ts
status: 'draft',
reviews: {},
assets: { poster: `/exercises/catalog/v1/${slug}/poster.webp` }
```

Write the resulting path as a literal JSON string in every object. Include `legacySource` and `legacyExternalId` only for the 21 records that list an exact legacy pair above; omit both for Bulgarian split squat, walking lunge, EZ preacher curl, and hanging knee raise. Preserve every value inside the first 25 entries; only the manifest-level `generatedAt` and the appended records may differ.

- [ ] **Step 5: Verify the 50-record partial catalog**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets -v
pnpm validate:exercise-catalog-v1
pnpm archive:exercise-catalog-v1
pnpm type-check
git diff --check
```

Expected: tests/type-check pass; partial validator checks the 25 existing approved assets and skips the 25 drafts; archive dry-run lists exactly the existing 25 sources and performs no upload; the wave-1 digest remains unchanged.

- [ ] **Step 6: Commit the draft expansion**

```powershell
git add -- src/lib/exercises/visualCatalogV1.ts src/lib/exercises/__tests__/visualCatalogV1.test.ts public/exercises/catalog/v1/manifest.json
git commit -m "feat: add Vekira catalog groups 5 through 9"
```

### Task 5: Produce and visually approve group 5

**Files:**
- Create locally: group-5 sources for `peso-muerto-convencional-barra`, `press-plano-mancuernas`, `flexiones-pecho`, `dominadas-pronas`, `press-militar-pie-barra`.
- Create: the five exact public poster paths listed in Step 8.
- Modify: `public/exercises/catalog/v1/manifest.json` only after visual approval.
- Create locally: `group-5-full.webp` and `group-5-80.webp`.

**Interfaces:**
- Consumes: Shared Generation Prompt, the five exact group-5 subject records, Task 4 drafts, and the immutable approved Arnold source.
- Produces: five group-5 `visual-approved` entries, 30 total approved entries, and a reviewer-approved group sheet.

- [ ] **Step 1: Confirm the group is draft and wave 1 remains immutable**

Run the focused manifest test and confirm all five group-5 entries are `draft`, have empty reviews, and have no hashes. Do not overwrite a pre-existing source unless its rejection is recorded in the task report.

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
git status --short
```

- [ ] **Step 2: Generate five independent high-resolution sources**

Read the imagegen skill before the first call. For each of the five slugs, call image generation separately with `public/exercises/pilot/arnold-press-mancuernas/source.png` as the local style reference and the Shared Generation Prompt concatenated with that slug's full canonical record. Save the returned square PNG in that slug's exact `.artifacts/exercises/catalog-v1/{canonical-slug}/source.png` path.

Reject these group-specific errors: conventional deadlift shown as an RDL with no floor start; inclined instead of flat bench; cropped push-up hands/feet; behind-neck or assisted pull-up; military press with leg drive, Smith rails, or disconnected bar plates.

- [ ] **Step 3: Inspect every source at original detail**

Use `view_image` with original detail on all five sources. Verify same mannequin/lighting, full equipment, start left, finish right, correct coral muscles, plausible joints, and exact variant. Permit two blind attempts maximum; every later attempt must state the diagnosed camera/equipment correction in the task report.

- [ ] **Step 4: Build posters and exact group sheets**

```powershell
$slugs = @('peso-muerto-convencional-barra','press-plano-mancuernas','flexiones-pecho','dominadas-pronas','press-militar-pie-barra')
foreach ($slug in $slugs) {
  python scripts/exercise_visual_assets.py poster --input ".artifacts/exercises/catalog-v1/$slug/source.png" --output "public/exercises/catalog/v1/$slug/poster.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$posters = @($slugs | ForEach-Object { "public/exercises/catalog/v1/$_/poster.webp" })
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --output .artifacts/exercises/catalog-v1/reviews/group-5-full.webp @posters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --output .artifacts/exercises/catalog-v1/reviews/group-5-80.webp @posters
```

- [ ] **Step 5: Pass controller and fresh-reviewer visual gates**

Inspect both sheets and all doubtful sources. A fresh reviewer must return no critical/important identity, equipment, anatomy, safety-composition, or 80 px legibility finding. Any rejected entry stays `draft`; do not promote a partial group as complete.

- [ ] **Step 6: Record hashes and visual-only approval**

For each approved slug, compute SHA-256 of `source.png` and `poster.webp`. Set `posterSha256`, `sourceSha256`, and the template-literal result ``sourceObjectKey: `v1/${slug}/${sourceSha256}.png` ``; set `status: "visual-approved"`; set:

```json
"visual": {
  "reviewer": "Codex visual QA",
  "reviewedAt": "2026-08-26",
  "notes": ["Grupo 5 aprobado tras QA visual"]
}
```

Do not add `reviews.technique`.

- [ ] **Step 7: Validate and dry-run the 30-source archive**

```powershell
pnpm validate:exercise-catalog-v1
pnpm archive:exercise-catalog-v1
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git diff --check
```

Expected: partial validation passes; archive emits 30 dry-run destinations and no upload; all tests pass.

- [ ] **Step 8: Commit group 5**

```powershell
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/peso-muerto-convencional-barra/poster.webp public/exercises/catalog/v1/press-plano-mancuernas/poster.webp public/exercises/catalog/v1/flexiones-pecho/poster.webp public/exercises/catalog/v1/dominadas-pronas/poster.webp public/exercises/catalog/v1/press-militar-pie-barra/poster.webp
git commit -m "feat: add Vekira visual catalog group 5"
```

### Task 6: Produce and visually approve group 6

**Files:**
- Create locally: five group-6 sources and two group-6 sheets.
- Create: five group-6 public posters.
- Modify: `public/exercises/catalog/v1/manifest.json` after visual approval.

**Interfaces:**
- Consumes: approved group-5 calibration and the five exact group-6 subject records.
- Produces: five group-6 `visual-approved` entries and 35 total approved entries.

- [ ] **Step 1: Generate the five exact group-6 sources independently**

Use one image-generation call per slug with the Shared Generation Prompt and Arnold source reference. Save to the exact `.artifacts` paths for `sentadilla-goblet-kettlebell`, `sentadilla-bulgara-mancuernas`, `zancadas-caminando-mancuernas`, `extension-cuadriceps-maquina`, and `elevacion-gemelos-pie-maquina`.

Reject: kettlebell held away from the chest; missing rear-foot bench or mismatched leg sides; static split squat instead of walking-lunge step; leg-extension knee/pivot or pad misalignment; calf machine without supported forefeet/shoulder pads or with bent-knee squat motion.

- [ ] **Step 2: Inspect original sources and correct diagnosed failures**

Use original-detail inspection for each source. Verify complete benches/machines, planted feet, knee tracking, matching dumbbells, and distinct endpoints. Stop blind retries after two failures.

- [ ] **Step 3: Build the exact posters and sheets**

```powershell
$slugs = @('sentadilla-goblet-kettlebell','sentadilla-bulgara-mancuernas','zancadas-caminando-mancuernas','extension-cuadriceps-maquina','elevacion-gemelos-pie-maquina')
foreach ($slug in $slugs) {
  python scripts/exercise_visual_assets.py poster --input ".artifacts/exercises/catalog-v1/$slug/source.png" --output "public/exercises/catalog/v1/$slug/poster.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$posters = @($slugs | ForEach-Object { "public/exercises/catalog/v1/$_/poster.webp" })
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --output .artifacts/exercises/catalog-v1/reviews/group-6-full.webp @posters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --output .artifacts/exercises/catalog-v1/reviews/group-6-80.webp @posters
```

- [ ] **Step 4: Pass controller and fresh-reviewer visual gates**

Require no blocking finding at original, 512 px, or 80 px detail. If one entry fails, keep the entire group's unapproved entries at `draft` until the correction and scoped re-review pass.

- [ ] **Step 5: Record visual-only approval metadata**

Compute real hashes/keys and promote only group 6. Use reviewer `Codex visual QA`, date `2026-08-26`, and note `Grupo 6 aprobado tras QA visual`. Do not add a technique review.

- [ ] **Step 6: Validate, dry-run, and commit group 6**

```powershell
pnpm validate:exercise-catalog-v1
pnpm archive:exercise-catalog-v1
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git diff --check
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/sentadilla-goblet-kettlebell/poster.webp public/exercises/catalog/v1/sentadilla-bulgara-mancuernas/poster.webp public/exercises/catalog/v1/zancadas-caminando-mancuernas/poster.webp public/exercises/catalog/v1/extension-cuadriceps-maquina/poster.webp public/exercises/catalog/v1/elevacion-gemelos-pie-maquina/poster.webp
git commit -m "feat: add Vekira visual catalog group 6"
```

Expected before commit: partial validator passes; archive lists 35 dry-run destinations and performs no upload.

### Task 7: Produce and visually approve group 7

**Files:**
- Create locally: five group-7 sources and two group-7 sheets.
- Create: five group-7 public posters.
- Modify: `public/exercises/catalog/v1/manifest.json` after visual approval.

**Interfaces:**
- Consumes: approved V1 style and the five exact group-7 subject records.
- Produces: five group-7 `visual-approved` entries and 40 total approved entries.

- [ ] **Step 1: Generate the five equipment-specific sources**

Generate `aperturas-pecho-maquina`, `fondos-paralelas-pecho`, `remo-inclinado-barra`, `remo-t-agarre`, and `jalon-brazos-rectos-polea` independently. Use the Arnold source for identity; an approved Vekira machine/cable poster may be an additional style reference only when it clarifies equipment rendering.

Reject: reverse-fly orientation instead of pec deck; triceps-upright dip rather than chest lean; torso rising between barbell-row endpoints; floating or duplicated T-bar anchor; bent-elbow pushdown or disconnected straight-arm cable.

- [ ] **Step 2: Inspect original sources and enforce equipment continuity**

At original detail, trace every bar, plate, handle, pulley, cable, pad, and support through both poses. Verify muscle emphasis and 80 px silhouette before promotion.

- [ ] **Step 3: Build posters and group sheets**

```powershell
$slugs = @('aperturas-pecho-maquina','fondos-paralelas-pecho','remo-inclinado-barra','remo-t-agarre','jalon-brazos-rectos-polea')
foreach ($slug in $slugs) {
  python scripts/exercise_visual_assets.py poster --input ".artifacts/exercises/catalog-v1/$slug/source.png" --output "public/exercises/catalog/v1/$slug/poster.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$posters = @($slugs | ForEach-Object { "public/exercises/catalog/v1/$_/poster.webp" })
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --output .artifacts/exercises/catalog-v1/reviews/group-7-full.webp @posters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --output .artifacts/exercises/catalog-v1/reviews/group-7-80.webp @posters
```

- [ ] **Step 4: Pass controller and fresh-reviewer gates**

No group entry advances while a machine direction, dip variant, bar path, anchor, cable, body joint, or miniature identity finding remains critical/important.

- [ ] **Step 5: Record hashes, validate 40 approved entries, and commit**

Use visual reviewer `Codex visual QA`, date `2026-08-26`, and note `Grupo 7 aprobado tras QA visual`. Then run:

```powershell
pnpm validate:exercise-catalog-v1
pnpm archive:exercise-catalog-v1
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git diff --check
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/aperturas-pecho-maquina/poster.webp public/exercises/catalog/v1/fondos-paralelas-pecho/poster.webp public/exercises/catalog/v1/remo-inclinado-barra/poster.webp public/exercises/catalog/v1/remo-t-agarre/poster.webp public/exercises/catalog/v1/jalon-brazos-rectos-polea/poster.webp
git commit -m "feat: add Vekira visual catalog group 7"
```

Expected: partial validator passes; archive lists 40 dry-run destinations; no remote mutation occurs.

### Task 8: Produce and visually approve group 8

**Files:**
- Create locally: five group-8 sources and two group-8 sheets.
- Create: five group-8 public posters.
- Modify: `public/exercises/catalog/v1/manifest.json` after visual approval.

**Interfaces:**
- Consumes: approved V1 style and the five exact group-8 subject records.
- Produces: five group-8 `visual-approved` entries and 45 total approved entries.

- [ ] **Step 1: Generate five independent shoulder/arm sources**

Generate `face-pull-polea`, `elevacion-frontal-mancuernas`, `curl-biceps-barra-recta`, `curl-predicador-barra-ez`, and `curl-biceps-polea-pie` with separate calls, exact records, and the Arnold identity reference.

Reject: face pull aimed at chest/neck or with a broken rope chain; lateral rather than frontal raise; EZ rather than straight standing curl bar; missing preacher pad or straight rather than EZ preacher bar; floating low-pulley cable or triceps-pushdown geometry in the cable curl.

- [ ] **Step 2: Inspect sources at original detail**

Trace hands, bars, cable, rope, carabiners, pulleys, preacher support, and elbow positions. Require identical equipment between endpoints, correct primary/secondary coral, complete framing, and clear 80 px identity.

- [ ] **Step 3: Build posters and group sheets**

```powershell
$slugs = @('face-pull-polea','elevacion-frontal-mancuernas','curl-biceps-barra-recta','curl-predicador-barra-ez','curl-biceps-polea-pie')
foreach ($slug in $slugs) {
  python scripts/exercise_visual_assets.py poster --input ".artifacts/exercises/catalog-v1/$slug/source.png" --output "public/exercises/catalog/v1/$slug/poster.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$posters = @($slugs | ForEach-Object { "public/exercises/catalog/v1/$_/poster.webp" })
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --output .artifacts/exercises/catalog-v1/reviews/group-8-full.webp @posters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --output .artifacts/exercises/catalog-v1/reviews/group-8-80.webp @posters
```

- [ ] **Step 4: Pass controller and fresh-reviewer gates**

Return any failed source to diagnosed regeneration. No reviewer may infer technical approval; this gate covers visual identity, obvious equipment/anatomy errors, variant fidelity, and thumbnail legibility only.

- [ ] **Step 5: Record hashes, validate 45 approved entries, and commit**

Use reviewer `Codex visual QA`, date `2026-08-26`, and note `Grupo 8 aprobado tras QA visual`. Set immutable source keys from the real SHA-256 values. Then run:

```powershell
pnpm validate:exercise-catalog-v1
pnpm archive:exercise-catalog-v1
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git diff --check
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/face-pull-polea/poster.webp public/exercises/catalog/v1/elevacion-frontal-mancuernas/poster.webp public/exercises/catalog/v1/curl-biceps-barra-recta/poster.webp public/exercises/catalog/v1/curl-predicador-barra-ez/poster.webp public/exercises/catalog/v1/curl-biceps-polea-pie/poster.webp
git commit -m "feat: add Vekira visual catalog group 8"
```

Expected: partial validator passes; archive lists 45 dry-run destinations; no upload occurs.

### Task 9: Produce and visually approve group 9

**Files:**
- Create locally: five group-9 sources and two group-9 sheets.
- Create: five group-9 public posters.
- Modify: `public/exercises/catalog/v1/manifest.json` after visual approval.

**Interfaces:**
- Consumes: approved V1 style and the five exact group-9 subject records.
- Produces: five group-9 `visual-approved` entries and a complete 50-entry visual catalog.

- [ ] **Step 1: Generate the final five independent sources**

Generate `press-frances-tumbado-barra-ez`, `elevacion-rodillas-colgado`, `plancha-lateral`, `eliptica`, and `remo-estacionario` separately with their exact records and Arnold identity reference.

Reject: straight bar or bar descending to neck in the lying triceps extension; straight-leg raise instead of bent-knee raise; front plank or rotated shoulder in side plank; disconnected/mismatched elliptical arms and pedals; floating rower handle/chain, seat off rail, or reversed catch/finish order.

- [ ] **Step 2: Inspect original sources and machine kinematics**

Verify bench/bar geometry, pull-up bar and bent knees, forearm/foot supports, opposing elliptical phases, and rower chain-seat-rail continuity. Inspect full sources before compression and record any post-second-attempt prompt diagnosis.

- [ ] **Step 3: Build posters and group sheets**

```powershell
$slugs = @('press-frances-tumbado-barra-ez','elevacion-rodillas-colgado','plancha-lateral','eliptica','remo-estacionario')
foreach ($slug in $slugs) {
  python scripts/exercise_visual_assets.py poster --input ".artifacts/exercises/catalog-v1/$slug/source.png" --output "public/exercises/catalog/v1/$slug/poster.webp"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$posters = @($slugs | ForEach-Object { "public/exercises/catalog/v1/$_/poster.webp" })
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --output .artifacts/exercises/catalog-v1/reviews/group-9-full.webp @posters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --output .artifacts/exercises/catalog-v1/reviews/group-9-80.webp @posters
```

- [ ] **Step 4: Pass controller and fresh-reviewer gates**

Require no critical/important finding at source, 512 px, or 80 px detail. A group-9 rejection leaves the complete validator intentionally red until the source is corrected and re-reviewed.

- [ ] **Step 5: Record hashes and visual-only approval**

Use reviewer `Codex visual QA`, date `2026-08-26`, and note `Grupo 9 aprobado tras QA visual`. Add real poster/source hashes and exact `v1/${slug}/${sourceSha256}.png` keys; do not add technique reviews.

- [ ] **Step 6: Validate all 50 entries and commit group 9**

```powershell
pnpm validate:exercise-catalog-v1:complete
pnpm archive:exercise-catalog-v1
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts
git diff --check
git add -- public/exercises/catalog/v1/manifest.json public/exercises/catalog/v1/press-frances-tumbado-barra-ez/poster.webp public/exercises/catalog/v1/elevacion-rodillas-colgado/poster.webp public/exercises/catalog/v1/plancha-lateral/poster.webp public/exercises/catalog/v1/eliptica/poster.webp public/exercises/catalog/v1/remo-estacionario/poster.webp
git commit -m "feat: add Vekira visual catalog group 9"
```

Expected: complete filesystem/Pillow validators pass for 50; archive lists 50 dry-run destinations; no remote mutation occurs.

### Task 10: Run the complete 50-exercise release gate

**Files:**
- Verify only. Modify and commit only a specific validator, manifest entry, source-derived poster, or test that fails a documented gate.
- Create locally: wave-2 and final-50 contact sheets.

**Interfaces:**
- Consumes: Tasks 1–9 and all 50 sources/posters.
- Produces: evidence that V1 has 50 visual-only approvals, preserved wave 1, no prohibited integration, and no remote mutation.

- [ ] **Step 1: Run focused TypeScript, Python, pilot, catalog, and type gates**

```powershell
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts scripts/__tests__/validateExerciseVisualCatalogV1.test.ts scripts/__tests__/archiveExerciseVisualSources.test.ts
python -m unittest scripts.__tests__.test_exercise_visual_assets scripts.__tests__.test_build_exercise_motion_preview -v
pnpm validate:exercise-pilot
pnpm validate:exercise-catalog-v1:complete
pnpm archive:exercise-catalog-v1
pnpm type-check
git diff --check
```

Expected: all commands exit 0; pilot remains valid with 5; V1 validates 50 filesystem/Pillow assets; archive prints exactly 50 dry-run destinations and never initializes an upload; the wave-1 digest test remains green.

- [ ] **Step 2: Run the complete project suite on the integration candidate**

```powershell
pnpm test -- --maxWorkers=4
```

Expected: exit 0 with final file/test counts recorded. If the runner reports a timeout, capture its full output and rerun the exact failing file in isolation; do not call the full suite green without a completed zero exit.

- [ ] **Step 3: Build exact wave-2 and complete-catalog sheets**

```powershell
$manifest = Get-Content -Raw -Encoding utf8 'public/exercises/catalog/v1/manifest.json' | ConvertFrom-Json
$allPosters = @($manifest.exercises | ForEach-Object { "public$($_.assets.poster)" })
$newPosters = @($allPosters | Select-Object -Skip 25)
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --columns 5 --output .artifacts/exercises/catalog-v1/reviews/wave-2-25-full.webp @newPosters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --columns 5 --output .artifacts/exercises/catalog-v1/reviews/wave-2-25-80.webp @newPosters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 512 --columns 10 --output .artifacts/exercises/catalog-v1/reviews/final-50-full.webp @allPosters
python scripts/exercise_visual_assets.py contact-sheet --tile-size 80 --columns 10 --output .artifacts/exercises/catalog-v1/reviews/final-50-80.webp @allPosters
```

Expected dimensions: wave-2 sheets `2608 × 2608` and `448 × 448`; final-50 sheets `5228 × 2608` and `908 × 448`.

- [ ] **Step 4: Perform controller and independent whole-catalog visual review**

Inspect wave-2 sheets, final-50 sheets, all five group sheets, and any ambiguous original source. Check identity drift, duplicate variants, muscles, hands/feet, bars, plates, pads, cables, anchors, machines, endpoint order, unsafe-looking composition, and 80 px recognition. A failed poster returns to its group and `draft`; rebuild every affected aggregate sheet after the fix.

- [ ] **Step 5: Audit manifest states and wave-1 immutability**

```powershell
$manifest = Get-Content -Raw -Encoding utf8 'public/exercises/catalog/v1/manifest.json' | ConvertFrom-Json
[pscustomobject]@{
  total = @($manifest.exercises).Count
  visualApproved = @($manifest.exercises | Where-Object status -eq 'visual-approved').Count
  techniqueApproved = @($manifest.exercises | Where-Object status -eq 'technique-approved').Count
  published = @($manifest.exercises | Where-Object status -eq 'published').Count
  techniqueReviews = @($manifest.exercises | Where-Object { $_.reviews.technique }).Count
  technicalClaims = @($manifest.exercises | Where-Object { ($_.reviews.visual.notes -join ' ') -match '(?i)aprob.*t[eé]cnic|valid.*t[eé]cnic|qa.*t[eé]cnic' }).Count
} | ConvertTo-Json
pnpm test -- src/lib/exercises/__tests__/visualCatalogV1.test.ts
```

Expected: total 50, visualApproved 50, all other counts 0, and immutable wave-1 digest green.

- [ ] **Step 6: Audit scope and external boundaries**

```powershell
git diff --name-only e1cade0..HEAD
git status --short
git check-ignore -v .artifacts/exercises/catalog-v1/reviews/final-50-full.webp .artifacts/exercises/catalog-v1/reviews/final-50-80.webp
```

Expected changed scope: the new plan, V1 contract/tests, two validators/tests, manifest, and 25 new poster paths only. No exercise seed, catalog UI, session UI, live migration, Storage upload, push, or merge. Worktree is clean and `.artifacts` remains ignored.

- [ ] **Step 7: Hand off the completed visual phase**

Show `wave-2-25-full.webp`, `wave-2-25-80.webp`, `final-50-full.webp`, and `final-50-80.webp`. Report exact verification counts, identify all 50 entries as `visual-approved` only, list any non-blocking review finding, and state explicitly that technique review, Supabase integration, publication, motion assets, remote archive, push, and merge remain separate owner-authorized work.
