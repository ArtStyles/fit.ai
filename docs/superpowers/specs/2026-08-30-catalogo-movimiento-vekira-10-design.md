# Catálogo de movimiento Vekira — piloto de 10 ejercicios

**Fecha:** 2026-08-30
**Estado:** diseño aprobado por el propietario; pendiente de plan de implementación
**Rama de trabajo:** `codex/exercise-visual-pilot`

## Contexto

Vekira ya dispone de 50 ejercicios del catálogo V1 con pósteres anatómicos estáticos y estado exclusivamente `visual-approved`. La aplicación, sin embargo, sólo consume `image_url` y no tiene un contrato estable para demostraciones animadas. Existe un prototipo aislado de Arnold Press: una hoja de seis celdas, un script que construye un WebP animado de diez fotogramas y un campo opcional en el manifiesto antiguo del piloto. Ese prototipo demuestra viabilidad, pero no ofrece todavía validación de movimiento, integración con el catálogo V1 ni reproducción controlada en la ficha real.

El objetivo es crear una primera tanda profesional de diez demostraciones animadas con herramientas de bajo costo, sin reutilizar imágenes de Hevy ni activos de competidores. Se usará el estilo Vekira ya aprobado como identidad visual y `image_gen` únicamente para producir o corregir fotogramas originales.

## Objetivos

- Producir diez WebP animados profesionales y coherentes con `vekira-anatomical-3d-v1`.
- Mantener cámara, anatomía, equipo, materiales y mapa muscular estables durante todo el recorrido.
- Mostrar movimiento únicamente bajo acción explícita en la ficha del ejercicio.
- Conservar el póster como contenido inicial, fallback de error y alternativa sin movimiento.
- Separar aprobación visual de movimiento de cualquier aprobación técnica o publicación.
- Preparar el contrato de base de datos y el flujo local de asociación sin mutar Supabase remoto.
- Establecer una tubería reutilizable para ampliar después el catálogo sin rehacer la integración.

## Fuera de alcance

- Animar los 50 ejercicios en esta fase.
- Autoplay, precarga o animaciones en tarjetas, listas, selectores o sesiones.
- Generar movimiento mediante morphing automático entre dos imágenes.
- Declarar una animación como técnicamente aprobada o sustituir revisión profesional.
- Aplicar migraciones en Supabase remoto, cargar Storage, publicar assets, hacer push o merge.
- Incorporar vídeo, audio, modelos 3D o activos de terceros con licencia no verificada.

## Selección de ejercicios y oleadas

La tanda cubre patrones, regiones y equipos clásicos sin intentar representar todavía todo el catálogo.

### Calibración

1. `arnold-press-mancuernas` — aprovecha el prototipo existente para validar compatibilidad y elevar su calidad.
2. `sentadilla-trasera-barra` — prueba cuerpo completo, barra, discos y trayectoria de cadera/rodillas.

### Oleada intermedia

3. `press-banca-barra`
4. `peso-muerto-rumano-barra`
5. `jalon-pecho-polea`
6. `remo-sentado-polea`

### Oleada final

7. `elevacion-lateral-mancuernas`
8. `curl-biceps-barra-ez`
9. `extension-triceps-cuerda`
10. `rueda-abdominal-rodillas`

Cada oleada se detiene tras QA del controlador y revisión visual independiente. Ninguna oleada posterior comienza si queda un hallazgo crítico o importante.

## Método de producción híbrido

### Fuente supervisada

Cada ejercicio parte del póster/source V1 aprobado y del contrato canónico de posiciones inicial/final. Se genera una hoja cuadrada de seis celdas con cinco poses progresivas utilizables y una sexta celda auxiliar. Las cinco poses válidas deben representar un recorrido monótono desde inicio hasta final.

La hoja completa se revisa antes de construir la animación. Si una sola celda deriva, se regenera o edita únicamente esa celda y se recompone la hoja localmente; no se acepta una secuencia por la calidad promedio del conjunto. Todos los intentos y rechazos permanecen en `.artifacts/exercises/catalog-v1-motion/<slug>/`.

### Construcción determinista

El constructor local recorta y normaliza las cinco poses aprobadas a lienzos RGB de 512 × 512. El bucle usa exactamente la secuencia:

```text
0, 1, 2, 3, 4, 3, 2, 1, 0, 1
```

Cada fotograma dura 180 ms, para un ciclo total de 1.8 s. El resultado es WebP animado con loop continuo, calidad objetivo 86 y sin interpolación sintética entre poses. La aplicación controla la reproducción montando o desmontando el asset; el archivo no necesita controles internos.

### Presupuesto de peso

- Objetivo: menos de 300 KB por preview.
- Límite bloqueante: 500 KB por preview.
- Dimensión fija: 512 × 512.
- Fotogramas: exactamente 10.
- Modo: RGB.
- Formato: WebP animado.

Sólo `motion-preview.webp` aprobado se versiona bajo `public/exercises/catalog/v1/<slug>/`. Las hojas fuente, celdas corregidas, rechazos y contact sheets siguen ignorados localmente.

## Contrato del manifiesto V1

Cada ejercicio puede incorporar un objeto opcional `motion`. El objeto sólo entra al manifiesto cuando el preview supera ambos gates visuales; la ausencia de `motion` significa que el ejercicio usa únicamente el póster.

```ts
type CatalogV1Motion = {
  status: 'visual-approved'
  preview: string
  previewSha256: string
  previewBytes: number
  sourceSha256: string
  frameCount: 10
  frameDurationMs: 180
  sequence: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1]
  review: CatalogV1VisualReview
}
```

Reglas:

- `preview` debe ser `/exercises/catalog/v1/<slug>/motion-preview.webp`.
- Hashes deben ser SHA-256 hexadecimales en minúscula.
- `previewBytes` debe ser positivo y no superar 500 KB.
- El archivo real debe coincidir con ruta, hash, peso, formato, dimensiones, modo, fotogramas y tiempos declarados.
- `motion.review` documenta QA visual de movimiento, no revisión técnica.
- El `status` general del ejercicio permanece `visual-approved`; no se añade `reviews.technique`.

El validador parcial acepta ejercicios sin `motion`. El gate completo de esta fase exige exactamente los diez slugs seleccionados con `motion.status = visual-approved` y los otros 40 sin movimiento.

## Base de datos y asociación segura

La tabla `exercises` recibirá una columna nullable `motion_preview_url TEXT`. La implementación debe volver a inspeccionar el último número de migración antes de crear el archivo; en esta rama el siguiente disponible es actualmente 057. La migración se versiona, pero no se aplica remotamente.

Los diez registros V1 no tienen actualmente `legacyExternalId`, por lo que queda prohibido asociarlos mediante coincidencia heurística de nombres. El flujo seguro usa un archivo local ignorado con pares explícitos `catalogSlug -> exerciseId` y un comando dry-run que:

1. valida que existan exactamente diez slugs y diez UUID únicos;
2. consulta cada fila y muestra nombre/imagen actuales para revisión humana;
3. calcula el valor de `motion_preview_url` que se escribiría;
4. no actualiza ni sube nada sin una opción de ejecución explícita fuera del alcance de esta fase.

Se puede probar el componente y la consulta de la ficha con fixtures/local Supabase. El handoff remoto debe entregar la migración, el mapping esperado y el reporte dry-run, pero no ejecutarlos.

## Experiencia de reproducción

La ficha del ejercicio continúa mostrando el póster en el hero. Si `motion_preview_url` existe, aparece un control accesible **“Ver movimiento”** y la etiqueta neutral **“Demostración visual”**.

Al activar el control:

- se carga el WebP sólo en ese momento;
- el preview sustituye al póster dentro del mismo marco, sin alterar layout;
- el control cambia a **“Pausar movimiento”**;
- pausar desmonta el preview y restaura inmediatamente el póster;
- volver a reproducir remonta el asset y reinicia el ciclo;
- cerrar el diálogo, navegar o perder el componente detiene la animación.

No se muestra el control si no hay URL. Un error de carga restaura el póster, desactiva el estado de reproducción y comunica un mensaje discreto mediante `aria-live`. Nunca se deja un marco vacío.

`prefers-reduced-motion` y `Save-Data` mantienen siempre el póster inicial y evitan cualquier precarga. La animación sólo comienza por una acción deliberada; el usuario conserva la posibilidad de pausarla inmediatamente.

La animación se reproduce con un elemento que preserve WebP animado sin transformación destructiva. El póster continúa usando el flujo optimizado actual. Listas, grids, pickers y cabeceras de sesión siguen consumiendo exclusivamente `image_url`.

## Componentes y responsabilidades

- `build-exercise-motion-preview.py`: convierte una hoja supervisada en el WebP determinista y verifica el resultado.
- Validador de motion assets: comprueba contrato, hashes, dimensiones, peso, frames y duración.
- Manifiesto V1: registra únicamente previews aprobados y su revisión visual.
- `ExerciseMotionPreview`: controla carga bajo demanda, play/pause, fallback y accesibilidad.
- Ficha de ejercicio: selecciona póster y URL de movimiento sin trasladar esta lógica a otras superficies.
- Migración/tipos de Supabase: exponen `motion_preview_url` nullable.
- Script de asociación dry-run: exige mapping UUID explícito y no realiza mutación por defecto.

Cada unidad mantiene una interfaz aislada: la tubería de assets no depende de React ni Supabase; el componente no interpreta el manifiesto; la ficha sólo pasa URLs; el script de asociación no genera ni publica archivos.

## QA visual

Cada fuente se inspecciona en resolución original y cada WebP se inspecciona animado a 512 px. Son bloqueantes:

- cámara, encuadre, escala, equipo o identidad del maniquí inestables;
- poses duplicadas, orden incorrecto o salto no progresivo;
- manos, pies, barras, discos, bancos, pads, cables o anclajes desconectados;
- articulaciones imposibles, trayectoria insegura o cambio de variante;
- mapa muscular que parpadea, desaparece o cambia de músculo sin justificación;
- bucle con salto evidente, fondo pulsante o artefactos visuales;
- texto, logos, marcas de agua o recortes críticos.

La revisión independiente puede registrar hallazgos menores no bloqueantes, pero cualquier hallazgo crítico/importante devuelve el ejercicio a generación y evita añadir `motion` al manifiesto.

## Pruebas y gates

### Python/assets

- Recorte correcto de seis celdas y uso de las cinco aprobadas.
- Orden exacto de diez fotogramas.
- 512 × 512, RGB, WebP animado, diez frames y 180 ms por frame.
- Error claro ante hoja inválida, número incorrecto de celdas o archivo corrupto.
- Límite de 500 KB y hash real.

### TypeScript/manifiesto

- `motion` opcional no rompe los 40 registros estáticos.
- Rechazo de ruta ajena al slug, hash/peso/frames/duración/secuencia inválidos o review ausente.
- Gate de fase: exactamente diez previews aprobados.
- El estado general permanece visual-only y no aparecen claims técnicos.

### UI

- Sin URL: no existe control de movimiento.
- Con URL: el póster se renderiza primero y el WebP no se solicita antes del toque.
- Tocar reproduce; pausar restaura el póster; volver a tocar reinicia.
- Error mantiene póster y feedback accesible.
- Reduced motion/Save-Data no provocan autoplay ni preload.
- Otras superficies siguen estáticas.

### Integración

- Consulta de ficha incluye `motion_preview_url` tanto en RPC como en fallback.
- Tipos de base de datos aceptan la columna nullable.
- Migración y script se verifican localmente/dry-run; no se toca remoto.
- Focused tests, validadores del piloto y V1, typecheck, diff-check y suite completa.
- Si la suite completa conserva los tres fallos temporales de notificaciones ya documentados, se vuelven a aislar y se reportan como no verdes; no se corrigen dentro de este alcance.

## Seguridad, derechos y límites operativos

- No se usan imágenes, GIFs ni capturas de Hevy como input o output.
- Los únicos referentes visuales son assets Vekira propios ya aprobados.
- No se incorporan modelos o secuencias de terceros.
- Ningún comando de esta fase aplica migraciones remotas, ejecuta uploads, publica, hace push o merge.
- La técnica, el archivo remoto y la activación de datos requieren autorización y gate separados.

## Criterios de aceptación

La fase está lista para handoff cuando:

1. los diez previews cumplen contrato y peso;
2. las tres oleadas superan controller + fresh visual review;
3. el manifiesto contiene diez `motion.visual-approved` y conserva 50 ejercicios `visual-approved` sin técnica/publicación;
4. la ficha reproduce únicamente bajo acción y siempre conserva fallback;
5. migración, tipos y asociación dry-run están preparados sin mutación remota;
6. los gates automatizados y visuales están documentados con límites honestos;
7. el worktree está limpio y no hubo upload, Supabase remoto, publicación, push ni merge.

## Handoff posterior

Una fase posterior, expresamente autorizada, podrá aplicar la migración, asociar UUIDs revisados, subir sources/previews a Storage, solicitar revisión técnica, habilitar datos remotos y ampliar los otros 40 ejercicios. Ninguna de esas acciones se infiere de la aprobación de este diseño.
