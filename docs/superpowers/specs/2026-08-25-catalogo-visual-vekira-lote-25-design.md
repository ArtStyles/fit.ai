# Catálogo visual Vekira V1 — diseño del lote de 25 ejercicios

**Fecha:** 2026-08-25

**Estado:** Diseño conversacional aprobado; pendiente revisión final de esta especificación

**Identidad visual:** `vekira-anatomical-3d-v1`

## Contexto

El piloto visual de cinco ejercicios validó una identidad original para Vekira: maniquí
anatómico 3D gris opaco, músculos activos en coral, equipo grafito, fondo marfil y dos
posiciones claramente separadas. El catálogo actual ya dispone de paginación, filtros,
`ExerciseImage`, `image_url` y `video_url`; el problema siguiente es editorial y de producción,
no un rediseño inicial de la interfaz.

El objetivo a largo plazo es un catálogo propio de 120–150 ejercicios clásicos. Producirlo
completo en una sola operación elevaría el costo de corrección y repetiría errores de estilo o
técnica. Esta especificación define el primer incremento de producción: 25 ejercicios
profesionales, compuesto por los cinco del piloto y veinte ejercicios nuevos.

## Decisiones aprobadas

- El catálogo V1 será equilibrado y estará orientado principalmente a usuarios principiantes e
  intermedios.
- Se aplicará un método híbrido: imágenes generadas bajo una dirección artística estricta ahora;
  personaje 3D articulado y animaciones reutilizables en un subproyecto posterior.
- Los veinte ejercicios nuevos se producirán en cuatro grupos de cinco, con revisión entre
  grupos.
- Los cinco ejercicios del piloto se promoverán sin regenerarlos.
- Ningún ejercicio se publicará por su acabado visual solamente. `technique-approved` exige una
  validación humana competente.
- Esta fase no modifica registros de `exercises`, no sustituye imágenes en producción y no
  cambia la UI.
- No se reinicia ni borra el catálogo actual. La integración posterior preservará los UUID
  usados por rutinas e historial.

## Alcance de este subproyecto

### Incluido

- Manifiesto maestro versionado con las 25 fichas editoriales.
- Promoción de los cinco posters aprobados del piloto a la estructura V1, sin regeneración.
- Plantilla de producción derivada de `vekira-anatomical-3d-v1`.
- Generación y revisión de veinte láminas nuevas.
- Posters WebP optimizados para la aplicación.
- Validación automática del manifiesto y de los activos.
- Hojas de contacto para revisar consistencia y legibilidad a tamaño pequeño.
- Definición de un archivo privado para las fuentes PNG de alta resolución.
- Herramienta o comando de carga al archivo privado, sin asumir que la migración o la carga ya
  se aplicaron al proyecto remoto.

### Fuera de alcance

- Escribir o actualizar filas de `exercises` en Supabase.
- Ocultar o borrar ejercicios de `free-exercise-db`.
- Cambiar el catálogo, picker, ficha, sesión o componente `ExerciseImage`.
- Marcar automáticamente ejercicios como `technique-approved`.
- Publicar el catálogo V1.
- Generar animaciones definitivas, integrar un reproductor o instalar Blender.
- Producir los 120–150 ejercicios completos.

La integración con `exercises`, la publicación del lote y el sistema 3D son subproyectos
separados. Esta separación impide que un problema artístico modifique datos usados por rutinas
reales.

## Composición del catálogo V1

### Cinco ejercicios promovidos del piloto

1. Sentadilla trasera con barra.
2. Press de banca con barra.
3. Jalón al pecho en polea.
4. Arnold Press sentado con mancuernas.
5. Rueda abdominal desde las rodillas.

Sus posters se copiarán a la estructura V1 y volverán a pasar las validaciones automáticas. Los
activos originales del piloto permanecerán intactos para conservar el historial. La prueba de
movimiento del Arnold Press seguirá siendo experimental y no formará parte del catálogo V1.

### Veinte ejercicios nuevos

#### Piernas

1. Peso muerto rumano con barra.
2. Prensa de piernas a 45°.
3. Hip thrust con barra.
4. Curl femoral tumbado en máquina.

#### Pecho

5. Press inclinado con mancuernas.
6. Press de pecho en máquina.
7. Aperturas de pecho en polea.

#### Espalda

8. Remo sentado en polea.
9. Remo con mancuerna a una mano.
10. Dominada asistida en máquina.

#### Hombros

11. Elevación lateral con mancuernas.
12. Apertura inversa en máquina.

#### Brazos

13. Curl de bíceps con barra EZ.
14. Curl martillo con mancuernas.
15. Extensión de tríceps con cuerda.
16. Extensión de tríceps sobre la cabeza en polea.

#### Core

17. Plancha frontal.
18. Crunch en polea de rodillas.

#### Cardio

19. Bicicleta estática.
20. Caminata en cinta.

## Contrato editorial

El manifiesto será la fuente de verdad del lote. Cada entrada incluirá como mínimo:

- `slug` estable y único.
- Nombre canónico en español e inglés.
- Alias de búsqueda en español e inglés.
- Grupo, patrón de movimiento y dificultad.
- Equipo necesario.
- Músculos principales y secundarios.
- Descripción de la posición inicial y final.
- Controles técnicos y errores que la imagen no debe sugerir.
- Grupo de producción del 1 al 4, o `pilot` para los cinco promovidos.
- Estado editorial.
- Rutas, claves de archivo y sumas de verificación disponibles.

Los estados admitidos y sus transiciones son:

```text
draft → visual-approved → technique-approved → published
```

- `draft`: ficha o activo todavía incompleto, rechazado o pendiente de revisión.
- `visual-approved`: poster consistente con la identidad y sin defectos visibles.
- `technique-approved`: movimiento y posiciones validados por una persona competente.
- `published`: estado reservado para el subproyecto de integración.

Esta fase puede terminar con ejercicios en `visual-approved`; no fingirá una aprobación técnica
que no haya ocurrido.

## Arquitectura de archivos y almacenamiento

La estructura versionada será:

```text
public/exercises/catalog/v1/
  manifest.json
  <exercise-slug>/
    poster.webp

.artifacts/exercises/catalog-v1/       # ignorado por Git
  <exercise-slug>/
    source.png
```

- Git contendrá el manifiesto y los posters WebP usados para revisión e integración futura.
- `.artifacts` será un área de producción local, nunca la única copia definitiva.
- Las fuentes se archivarán en un bucket privado `exercise-visual-sources`, bajo claves
  inmutables `v1/<slug>/<sha256>.png`.
- El manifiesto podrá registrar `sourceObjectKey`, `sourceSha256` y `posterSha256`, pero nunca
  una URL firmada ni credenciales.
- Ninguna fuente local se eliminará automáticamente después de una carga. El archivo remoto se
  verificará antes de proponer cualquier limpieza manual.
- Las futuras animaciones WebM vivirán en Storage y no en Git.

La implementación preparará la configuración reproducible del bucket privado y el comando de
carga. Aplicar esa configuración y cargar archivos en el Supabase remoto requerirá credenciales
válidas y se reportará como una verificación externa separada; un archivo local no contará como
remotamente archivado.

## Flujo de producción

```text
ficha draft
  → generación de source.png
  → revisión visual de alta resolución
  → optimización de poster.webp
  → validación automática
  → hoja de contacto del grupo
  → visual-approved
  → revisión técnica humana posterior
```

La plantilla de generación fijará personaje, materiales, paleta, fondo, cámara, orden
inicio/final, anatomía activa y restricciones negativas. La ficha de cada ejercicio añadirá
solamente postura, equipo, músculos y controles técnicos específicos.

No se usarán activos de Hevy como entrada de edición. Las referencias competitivas describen
únicamente cualidades generales —claridad, consistencia y legibilidad— y no poses, personajes o
composiciones copiadas.

## Orden de los grupos

### Grupo 1 — calibración visual

1. Peso muerto rumano con barra.
2. Press inclinado con mancuernas.
3. Remo sentado en polea.
4. Elevación lateral con mancuernas.
5. Plancha frontal.

Este grupo prueba barra, mancuernas, banco, polea y peso corporal antes de fijar la plantilla
para los siguientes quince ejercicios.

### Grupo 2 — máquinas y cardio

1. Prensa de piernas a 45°.
2. Press de pecho en máquina.
3. Remo con mancuerna a una mano.
4. Curl de bíceps con barra EZ.
5. Bicicleta estática.

### Grupo 3 — equipos complejos

1. Hip thrust con barra.
2. Aperturas de pecho en polea.
3. Dominada asistida en máquina.
4. Apertura inversa en máquina.
5. Extensión de tríceps con cuerda.

### Grupo 4 — cierre del catálogo

1. Curl femoral tumbado en máquina.
2. Curl martillo con mancuernas.
3. Extensión de tríceps sobre la cabeza en polea.
4. Crunch en polea de rodillas.
5. Caminata en cinta.

No comenzará un grupo nuevo hasta revisar la hoja de contacto del anterior. Una corrección de la
plantilla se aplicará a grupos posteriores; los activos ya aprobados solo se regenerarán si la
revisión identifica un defecto real.

## Control de calidad

### Validación automática

- El manifiesto contiene exactamente los 25 slugs acordados, sin duplicados.
- Todos los campos editoriales obligatorios están completos.
- Las rutas pertenecen al slug de su entrada y no escapan del directorio permitido.
- Cada poster existe, es WebP, es cuadrado, mide al menos 1024 × 1024 px y pesa como máximo
  100 KB.
- Cada fuente disponible existe, es PNG cuadrado de al menos 1024 × 1024 px y tiene una suma
  SHA-256 registrada antes de archivarse.
- Los estados y grupos pertenecen a los valores admitidos.
- Una entrada `visual-approved` no puede carecer de poster ni de la revisión visual requerida.
- `technique-approved` no puede asignarse mediante generación o validación automática.

### Revisión visual

- El maniquí, proporciones, materiales, fondo e iluminación son consistentes.
- La posición inicial está a la izquierda y la final a la derecha.
- El cuerpo y el equipo aparecen completos dentro del encuadre.
- Manos, pies, articulaciones, barras, cables y apoyos no presentan deformaciones visibles.
- Los músculos principales usan coral medio y los secundarios un coral menos intenso.
- No hay texto incrustado, flechas, logos, marcas de agua ni fondos de gimnasio.
- El ejercicio sigue siendo reconocible en una miniatura de 80 × 80 px.

### Revisión técnica

- Posición inicial, posición final y trayectoria son compatibles con la ficha.
- La imagen no sugiere colapso articular, rango imposible o colocación peligrosa del equipo.
- Los músculos destacados corresponden al ejercicio.
- La revisión queda registrada con responsable y fecha.

## Manejo de fallos

- Un ejercicio rechazado vuelve a `draft`; los demás ejercicios del grupo conservan su estado.
- Un activo aprobado nunca se sustituye silenciosamente.
- Después de dos intentos incorrectos del mismo ejercicio, se detiene la regeneración ciega y se
  revisan cámara, equipo y descripción técnica antes de un nuevo intento.
- Si un ejercicio continúa bloqueado, se documenta el motivo y el grupo no se presenta como
  completo. No se introduce un ejercicio sustituto sin una nueva decisión editorial.
- Un error al optimizar o validar no borra la fuente generada.
- Un fallo de carga remota mantiene la fuente local y no marca el archivo como archivado.

## Pruebas y revisión

- Pruebas unitarias del esquema, estados, grupos y lista exacta de ejercicios.
- Pruebas del validador de rutas, extensiones, MIME, dimensiones, peso y sumas SHA-256.
- Casos negativos para slugs duplicados, activos cruzados, rutas inseguras, campos vacíos y
  transiciones inválidas.
- Comando reproducible que valida el manifiesto y todos los archivos antes de un commit.
- Hoja de contacto de cada grupo a tamaño normal y a 80 × 80 px.
- `pnpm type-check` y las pruebas enfocadas del catálogo visual.
- Suite general del proyecto antes de declarar completa la implementación; cualquier fallo no
  relacionado se aislará y documentará con evidencia.

No habrá pruebas de integración con Supabase `exercises` ni pruebas de UI nuevas porque ambas
áreas están fuera del alcance de este subproyecto.

## Contrato para la integración posterior

El manifiesto podrá conservar una referencia opcional al registro legado mediante
`legacySource` y `legacyExternalId`. El futuro publicador resolverá esa referencia y actualizará
el registro existente para preservar su UUID. Solo insertará un registro `vekira-curated-v1`
cuando no exista una correspondencia segura. Nunca realizará un reset destructivo.

La publicación del catálogo V1 requerirá los 25 ejercicios completos y `technique-approved`.
Los ejercicios actuales no curados permanecerán disponibles hasta que un diseño posterior defina
su retirada gradual.

## Criterios de aceptación

1. El manifiesto contiene las 25 fichas exactas y pasa todas las validaciones.
2. Los cinco posters del piloto están promovidos sin regeneración y conservan sus originales.
3. Los veinte ejercicios nuevos tienen fuente, poster y revisión visual documentada.
4. Los veinte posters respetan `vekira-anatomical-3d-v1`, son legibles a 80 px y cumplen el
   límite de 100 KB.
5. Cada grupo fue revisado antes de comenzar el siguiente.
6. Las fuentes tienen suma SHA-256 y un destino privado reproducible; el estado de cualquier
   carga remota se reporta explícitamente.
7. Ninguna fila de `exercises`, rutina, historial o imagen pública de producción fue modificada.
8. Ningún ejercicio se marca `technique-approved` o `published` sin la revisión correspondiente.
9. Las pruebas enfocadas y el type-check pasan; el resultado de la suite general queda
   registrado.

Al cumplir estos criterios, el siguiente subproyecto podrá validar técnicamente y publicar el
catálogo V1 sin rehacer la producción visual.
