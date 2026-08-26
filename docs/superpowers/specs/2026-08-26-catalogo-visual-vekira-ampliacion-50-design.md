# Catálogo visual Vekira V1 — ampliación de 25 a 50 ejercicios

**Fecha:** 2026-08-26

**Estado:** diseño conversacional aprobado; especificación escrita pendiente de revisión del propietario

**Identidad visual:** `vekira-anatomical-3d-v1`

## Contexto

El catálogo visual V1 contiene 25 ejercicios con pósteres aprobados visualmente, fuentes PNG
locales, hashes reproducibles y destinos preparados para un archivo privado. Ninguno está
`technique-approved` ni `published`, y el catálogo aún no modifica filas de `exercises`, la UI,
las sesiones ni Supabase remoto.

El objetivo editorial continúa siendo un catálogo propio de 120–150 ejercicios clásicos. Esta
fase añade 25 ejercicios y lleva V1 a 50. A partir de esta decisión, `version: 1` representa el
esquema editorial y `vekira-anatomical-3d-v1` la identidad visual; no representa un límite de 25
activos. Las siguientes ampliaciones añadirán grupos nuevos dentro de V1 mientras se conserve el
mismo contrato y estilo.

## Objetivos

1. Aplicar primero las mejoras técnicas identificadas durante la revisión del lote inicial.
2. Ampliar el manifiesto V1 de 25 a 50 ejercicios sin alterar silenciosamente los 25 anteriores.
3. Generar 25 pósteres originales con la identidad visual aprobada, en cinco grupos de cinco.
4. Conservar la separación estricta entre aprobación visual, revisión técnica y publicación.
5. Mantener preparado el vínculo con el catálogo legado sin modificar la base de datos.

## Decisiones aprobadas

- V1 será un catálogo editorial vivo. Cada nueva ola ampliará el mismo manifiesto y usará grupos
  numéricos consecutivos.
- Los 25 ejercicios nuevos formarán los grupos 5–9.
- Los 25 ejercicios existentes conservarán sus rutas, fuentes, hashes, revisiones y estados.
- La lista de grupos será la definición versionada del conjunto permitido; validadores y tipos se
  derivarán de ella para evitar supuestos rígidos como “exactamente 25”.
- Los validadores parciales inspeccionarán cualquier estado distinto de `draft`.
- Una propiedad `reviews.technique` presente deberá contener una revisión completa y válida,
  incluso cuando el estado todavía sea `visual-approved`. `null`, `{}` y revisiones parciales se
  rechazarán.
- Una nota de QA visual no podrá afirmar aprobación o validación técnica sin una revisión técnica
  válida.
- No se duplicará toda la prosa editorial en una fixture de tests. Se protegerán las identidades,
  grupos, campos estructurales y activos inmutables; la redacción descriptiva seguirá siendo la
  fuente de verdad del manifiesto y podrá corregirse mediante revisión explícita.
- No se usarán imágenes de Hevy ni de otro competidor como entrada de edición o generación.
- Esta fase no publicará, no cargará fuentes, no aplicará migraciones remotas y no cambiará la UI.

## Arquitectura del contrato ampliable

`src/lib/exercises/visualCatalogV1.ts` conservará las interfaces públicas actuales, pero la lista
plana y el tipo de grupo se derivarán de `CATALOG_V1_BATCHES`: una definición agrupada y literal
con diez entradas (`pilot` y grupos 1–9), cada una con exactamente sus cinco slugs aprobados.

De esta definición se derivarán:

- `CatalogV1ExerciseSlug`.
- `CatalogV1Batch`.
- `CATALOG_V1_EXERCISE_SLUGS` en el orden editorial oficial.
- La correspondencia slug → grupo esperada.
- El número esperado de entradas y la redacción dinámica de errores.

El manifiesto deberá contener todos y solo los slugs registrados, en el orden editorial oficial,
sin duplicados. Para una ampliación futura se añadirá una entrada de grupo y sus cinco fichas; no
será necesario reescribir la lógica del validador.

El contrato admitirá las referencias opcionales:

```ts
legacySource?: 'free-exercise-db'
legacyExternalId?: string
```

Ambas deberán aparecer juntas. `legacyExternalId` será único dentro de V1. Solo se registrará
cuando la correspondencia entre ejercicio, variante y equipo sea inequívoca; una coincidencia
aproximada se dejará sin vínculo para evitar actualizar el UUID equivocado durante la futura
integración.

## Mejoras técnicas previas

### Validación de activos elevados

Los validadores TypeScript y Python usarán esta regla:

```text
complete = true  → validar todos los activos
complete = false → validar activos de cualquier entrada cuyo status != draft
```

Así, un ejercicio que avance a `technique-approved` o `published` no quedará excluido del control
parcial.

### Forma de las revisiones técnicas

El validador de manifiesto aplicará dos controles separados:

1. Si `reviews.technique` existe, debe pasar toda la validación de responsable, fecha, notas,
   cualificación y referencias.
2. Los estados `technique-approved` y `published` exigen que esa revisión válida exista.

Las notas visuales se analizarán mediante una regla semántica que detecte afirmaciones de
aprobación o validación técnica. La afirmación solo será válida cuando haya una revisión técnica
completa; un objeto vacío no bastará.

### Protección del lote anterior

Una fixture de regresión conservará para los primeros 25 ejercicios únicamente el contrato que
debe permanecer inmutable durante esta ampliación:

- slug y grupo;
- status y revisiones;
- ruta del póster;
- `posterSha256`, `sourceSha256` y `sourceObjectKey`.

La prueba comparará esos campos contra el manifiesto ampliado. No congelará nombres, músculos,
posiciones ni controles técnicos palabra por palabra, porque hacerlo duplicaría la fuente de
verdad y convertiría correcciones editoriales legítimas en fallos opacos.

## Composición de los grupos 5–9

### Grupo 5 — clásicos fundamentales

| Slug | Nombre canónico | Vínculo legado seguro |
|---|---|---|
| `peso-muerto-convencional-barra` | Peso muerto convencional con barra | `Barbell_Deadlift` |
| `press-plano-mancuernas` | Press plano con mancuernas | `Dumbbell_Bench_Press` |
| `flexiones-pecho` | Flexiones de pecho | `Pushups` |
| `dominadas-pronas` | Dominadas libres pronas | `Pullups` |
| `press-militar-pie-barra` | Press militar de pie con barra | `Standing_Military_Press` |

### Grupo 6 — piernas

| Slug | Nombre canónico | Vínculo legado seguro |
|---|---|---|
| `sentadilla-goblet-kettlebell` | Sentadilla goblet con kettlebell | `Goblet_Squat` |
| `sentadilla-bulgara-mancuernas` | Sentadilla búlgara con mancuernas | Sin vínculo: la variante legado no especifica elevación búlgara |
| `zancadas-caminando-mancuernas` | Zancadas caminando con mancuernas | Sin vínculo: no existe coincidencia exacta de variante y equipo |
| `extension-cuadriceps-maquina` | Extensión de cuádriceps en máquina | `Leg_Extensions` |
| `elevacion-gemelos-pie-maquina` | Elevación de gemelos de pie en máquina | `Standing_Calf_Raises` |

### Grupo 7 — pecho y espalda

| Slug | Nombre canónico | Vínculo legado seguro |
|---|---|---|
| `aperturas-pecho-maquina` | Aperturas de pecho en máquina | `Butterfly` |
| `fondos-paralelas-pecho` | Fondos en paralelas para pecho | `Dips_-_Chest_Version` |
| `remo-inclinado-barra` | Remo inclinado con barra | `Bent_Over_Barbell_Row` |
| `remo-t-agarre` | Remo T con agarre | `T-Bar_Row_with_Handle` |
| `jalon-brazos-rectos-polea` | Jalón con brazos rectos en polea | `Straight-Arm_Pulldown` |

### Grupo 8 — hombros y brazos

| Slug | Nombre canónico | Vínculo legado seguro |
|---|---|---|
| `face-pull-polea` | Face pull en polea | `Face_Pull` |
| `elevacion-frontal-mancuernas` | Elevación frontal con mancuernas | `Front_Dumbbell_Raise` |
| `curl-biceps-barra-recta` | Curl de bíceps con barra recta | `Barbell_Curl` |
| `curl-predicador-barra-ez` | Curl predicador con barra EZ | Sin vínculo: la entrada legado no fija barra EZ |
| `curl-biceps-polea-pie` | Curl de bíceps de pie en polea | `Standing_Biceps_Cable_Curl` |

### Grupo 9 — tríceps, core y cardio

| Slug | Nombre canónico | Vínculo legado seguro |
|---|---|---|
| `press-frances-tumbado-barra-ez` | Press francés tumbado con barra EZ | `Lying_Triceps_Press` |
| `elevacion-rodillas-colgado` | Elevación de rodillas colgado | Sin vínculo: legado solo ofrece elevación de piernas |
| `plancha-lateral` | Plancha lateral | `Side_Bridge` |
| `eliptica` | Entrenamiento en elíptica | `Elliptical_Trainer` |
| `remo-estacionario` | Remo estacionario | `Rowing_Stationary` |

## Fichas editoriales nuevas

Cada ficha incluirá nombres en español e inglés, alias de búsqueda, región, dificultad, patrones,
equipo, músculos principales y secundarios, posición inicial y final, al menos tres controles
técnicos, grupo, status, revisiones y activos. Las 25 fichas comenzarán en `draft`.

Las descripciones deberán diferenciar variantes visualmente próximas. Por ejemplo:

- peso muerto convencional frente al peso muerto rumano existente;
- press plano con mancuernas frente al press inclinado existente;
- dominada libre frente a dominada asistida;
- apertura de pecho en máquina frente a apertura inversa;
- curl con barra recta frente a barra EZ;
- elevación de rodillas frente a elevación completa de piernas.

No se inferirá una revisión técnica a partir de la fuente legado. Sus datos servirán para
correspondencia editorial; la aprobación técnica de Vekira seguirá siendo humana y separada.

## Flujo de producción visual

```text
mejoras técnicas y tests verdes
  → 25 fichas draft
  → generación individual de source.png
  → revisión original de anatomía, equipo y encuadre
  → poster.webp determinista
  → validación automática y hashes
  → hojas de contacto de grupo a 512 px y 80 px
  → revisión visual independiente
  → visual-approved
  → siguiente grupo
```

La plantilla conservará:

- maniquí anatómico 3D gris opaco;
- músculos principales en coral y secundarios en coral tenue;
- equipo grafito;
- fondo marfil limpio;
- posición inicial a la izquierda y final a la derecha;
- cuerpo y equipo completos;
- cámara, proporciones, materiales e iluminación coherentes;
- ausencia de texto, flechas, logos, marcas de agua o ambiente de gimnasio.

Las fuentes vivirán en `.artifacts/exercises/catalog-v1/<slug>/source.png`. Los pósteres
versionados vivirán en `public/exercises/catalog/v1/<slug>/poster.webp`, serán WebP de
1024 × 1024 px y no superarán 100 KB. Las claves privadas conservarán el formato
`v1/<slug>/<sourceSha256>.png`.

## Revisión y manejo de fallos

- Un activo rechazado mantiene o recupera `draft`; los demás no retroceden.
- Un ejercicio aprobado nunca se sustituye silenciosamente.
- Tras dos intentos incorrectos se detiene la regeneración automática y se revisan cámara,
  equipo, postura y prompt antes de un tercer intento.
- Equipo incompleto, agarres imposibles, cables discontinuos, apoyos flotantes, anatomía
  deformada o músculos incorrectos son fallos bloqueantes.
- La legibilidad a 80 px exige reconocer ejercicio y equipo; detalles pequeños se confirman en
  la fuente y la hoja de 512 px.
- Un fallo al construir o validar el póster no borra la fuente.
- No se ejecutará `--upload`, una migración remota, un push o un merge como parte de la
  producción visual.

## Hojas de revisión

Se producirán, como archivos ignorados:

- una hoja de 512 px y otra de 80 px por cada grupo 5–9;
- una hoja de los 25 ejercicios nuevos a ambos tamaños;
- una hoja final de los 50 ejercicios a ambos tamaños.

El orden de las hojas seguirá el manifiesto. La revisión final comprobará continuidad de la
identidad, diversidad de equipo, ausencia de duplicados visuales y legibilidad de todos los
ejercicios.

## Estrategia de pruebas

Las mejoras técnicas se implementarán mediante TDD antes de añadir los 25 borradores. La suite
enfocada cubrirá:

- `technique-approved` y `published` en validadores parciales TypeScript y Python;
- `reviews.technique` nulo, vacío, parcial y completo;
- afirmaciones técnicas no respaldadas en notas visuales;
- definición agrupada, lista derivada, orden, número dinámico y grupos 5–9;
- referencias legado emparejadas y únicas;
- fixture inmutable de los activos/revisiones de los primeros 25;
- campos editoriales obligatorios, slugs y rutas de los 25 nuevos;
- activos cruzados, escapes, archivos no regulares, formato, dimensiones, peso y hashes;
- modo parcial durante producción y modo completo al cerrar los 50.

La compuerta final ejecutará:

1. pruebas TypeScript enfocadas;
2. pruebas Python del pipeline;
3. validador completo de los 50 ejercicios;
4. `pnpm type-check`;
5. `pnpm test -- --maxWorkers=4`;
6. `git diff --check` y auditoría de alcance;
7. revisión independiente de las hojas finales.

## Límites de esta fase

Queda fuera de alcance:

- modificar o insertar filas de `exercises`;
- cambiar `ExerciseImage`, catálogo, picker, plan, sesión o historial;
- aplicar la migración 056 en Supabase remoto;
- cargar las 50 fuentes al bucket privado;
- marcar ejercicios como `technique-approved` o `published`;
- generar animaciones definitivas, GIFs, WebM o un pipeline Blender;
- borrar, ocultar o resetear ejercicios legado.

## Criterios de aceptación

1. Los tres endurecimientos técnicos están protegidos por pruebas que fallaron antes de la
   implementación y luego pasaron.
2. El contrato V1 deriva slugs y grupos de una definición ampliable y admite exactamente los 50
   ejercicios aprobados.
3. Los primeros 25 conservan status, revisiones, rutas y hashes.
4. Las 25 fichas nuevas están completas, pertenecen a los grupos 5–9 y solo registran vínculos
   legado inequívocos.
5. Cada ejercicio nuevo tiene fuente PNG, póster WebP, hashes y clave privada reproducible.
6. Los cinco grupos fueron revisados secuencialmente y los 25 nuevos están, como máximo, en
   `visual-approved`.
7. Las hojas de los grupos, de la nueva ola y de los 50 ejercicios pasan la revisión visual a
   tamaño completo y 80 px.
8. Los validadores, type-check, suite completa y auditoría de alcance pasan sobre el commit final.
9. No se realizó ninguna publicación, mutación de base de datos, carga remota, push ni merge.

Al cumplir estos criterios, V1 quedará preparado para nuevas ampliaciones mediante el mismo
patrón de grupos de cinco, sin crear V2 mientras se conserve el esquema y la identidad visual.
