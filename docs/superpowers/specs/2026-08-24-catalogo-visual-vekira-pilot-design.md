# Catálogo visual original de Vekira — diseño del piloto

**Fecha:** 2026-08-24
**Estado:** Aprobado para prototipo visual

## Contexto

El catálogo actual tiene buena cobertura de imágenes gracias a `free-exercise-db`, pero su
calidad, nomenclatura y utilidad didáctica son irregulares. El objetivo no es copiar el
catálogo ni los activos de Hevy, sino alcanzar un nivel profesional comparable mediante una
identidad visual original y un sistema de producción que pueda escalar a 120–150 ejercicios
clásicos con presupuesto bajo.

El usuario aprobó como dirección visual el piloto de Arnold Press generado el 2026-08-24:
modelo anatómico 3D, músculos activos en coral, equipo grafito, fondo marfil y posiciones de
inicio/fin claramente separadas.

## Objetivo del piloto

Validar el estilo, la legibilidad móvil, la precisión técnica y la viabilidad de animación
antes de modificar el catálogo público o producir los 120–150 ejercicios.

El piloto cubre cinco patrones y tipos de equipo distintos:

1. Sentadilla trasera con barra.
2. Press de banca con barra.
3. Jalón al pecho en polea.
4. Arnold Press sentado con mancuernas.
5. Rueda abdominal desde las rodillas.

## Alcance del entregable

Para cada ejercicio:

- Una lámina cuadrada de alta calidad con inicio y final, sin texto incrustado.
- Una versión WebP optimizada para revisar su uso como miniatura y hero.
- Metadatos de producción: nombre canónico en español, equipo, músculos principales y
  secundarios, descripción de las dos posiciones y observaciones de control técnico.

Además:

- Una prueba de movimiento del Arnold Press para evaluar continuidad visual.
- Un manifiesto del piloto que relacione cada ejercicio con sus activos.
- Ninguna escritura en Supabase, ningún cambio del seed y ninguna sustitución de imágenes
  públicas durante el piloto.

## Biblia visual

### Personaje

- Maniquí anatómico 3D original, no identificable como persona real.
- Proporciones atléticas realistas, sin exageración de culturismo.
- Misma edad visual, rostro neutro, anatomía, tono y proporciones en todo el catálogo.
- Superficie anatómica marfil/gris claro con definición muscular legible.

### Color y materiales

- Fondo marfil cálido uniforme.
- Equipamiento grafito mate.
- Músculos principales en coral medio.
- Músculos secundarios en coral apagado y de menor intensidad.
- Sombras de contacto suaves; sin fondos de gimnasio ni elementos decorativos.

### Cámara y composición

- Encuadre de cuerpo completo y equipo completo.
- Cámara a altura media, perspectiva natural y escala estable.
- Vista frontal a tres cuartos por defecto; lateral solo cuando explique mejor el movimiento.
- Inicio a la izquierda y final a la derecha.
- Suficiente separación y margen para que la imagen siga siendo comprensible a 80 px.
- Sin texto, flechas, números, marcas, logos ni marcas de agua dentro de la imagen.

## Método de producción

### Etapa 1 — piloto con generación de imágenes

ChatGPT Images produce las cinco láminas originales mediante una plantilla de prompt común.
Cada resultado se inspecciona por consistencia del personaje, integridad del equipo, manos,
articulaciones y músculos resaltados. Una variación se rechaza si cambia de identidad visual o
presenta errores anatómicos evidentes.

Esta etapa prueba la dirección artística, pero no se considera todavía el sistema definitivo
para animaciones.

### Etapa 2 — sistema híbrido para escalar

Tras aprobar el piloto, la lámina maestra se usa como referencia para crear un único personaje
3D articulado en Blender. El modelo, el rig, los materiales, las luces y las cámaras se
reutilizan para todo el catálogo. Blender no está instalado actualmente en el entorno, por lo
que su preparación queda después de aprobar los activos estáticos; no se instalará ni
descargará software sin una acción explícita de implementación.

La generación de imágenes seguirá siendo útil para dirección artística, pruebas y revisión,
pero los bucles finales se renderizarán desde el rig para evitar parpadeo, cambios de cuerpo,
equipamiento deformado o trayectorias anatómicamente imposibles.

### Prueba de animación del piloto

La prueba del Arnold Press puede usar cuadros generados de forma controlada para comprobar el
formato y la percepción dentro de la aplicación. Debe etiquetarse como experimental y no se
publicará como demostración técnica definitiva si hay discontinuidades. El resultado final del
catálogo será un bucle renderizado desde el modelo articulado.

## Formato y almacenamiento

Los archivos del piloto vivirán aislados en:

```text
public/exercises/pilot/
  manifest.json
  <exercise-slug>/
    source.png
    poster.webp
    motion-preview.webp   # solo cuando exista una prueba animada
```

- `source.png`: fuente de alta calidad para revisión y futuras derivaciones.
- `poster.webp`: versión optimizada para web.
- `motion-preview.webp`: animación experimental; no implica publicación.

Para el catálogo definitivo se reutilizarán las capacidades existentes:

- `image_url` apuntará al poster alojado en `exercise-images`.
- `video_url` podrá apuntar al bucle de movimiento alojado por Vekira.
- La UI deberá mostrar el movimiento inline en vez de tratar `video_url` únicamente como un
  enlace externo; ese cambio queda fuera del piloto y requerirá su propio plan.

Aunque el usuario se refiera a “GIF”, la entrega final preferirá WebM o MP4 para reducir peso y
mejorar fluidez. Un GIF o WebP animado se conservará únicamente cuando sea necesario por
compatibilidad.

## Control técnico y editorial

Cada ejercicio tendrá una ficha de revisión con:

- Nombre canónico y variantes de búsqueda.
- Patrón de movimiento y equipamiento.
- Posición inicial y final.
- Trayectoria de articulaciones y respiración básica.
- Músculos principales y secundarios.
- Errores frecuentes que la imagen no debe sugerir.
- Estado: `draft`, `visual-approved`, `technique-approved` o `published`.

Una imagen profesional no se considerará aprobada solo por su acabado: debe superar la revisión
de técnica. Para el piloto, la revisión puede detectar y documentar problemas; para publicar el
catálogo completo se recomienda validación de un entrenador cualificado.

## Propiedad intelectual y privacidad

- No se usarán ilustraciones extraídas de Hevy como edit targets ni como activos del proyecto.
- Las referencias de competidores sirven únicamente para describir cualidades generales como
  claridad, anatomía, fondo limpio y jerarquía visual.
- El personaje, los equipos, las poses, la iluminación y la composición serán originales de
  Vekira.
- No se representarán personas reales identificables, evitando problemas de consentimiento o
  privacidad; esto no sustituye el control de derechos de autor y marca.

## Criterios de aceptación

El piloto se aprueba cuando:

1. Los cinco ejercicios parecen pertenecer al mismo catálogo y al mismo personaje.
2. Cada lámina comunica inicio y final sin depender de texto.
3. El equipo y las articulaciones están completos y sin deformaciones visibles.
4. Los músculos resaltados corresponden al ejercicio.
5. La miniatura sigue siendo reconocible a 80 × 80 px.
6. No aparecen logos, marcas de agua ni elementos propios de otra aplicación.
7. El manifiesto permite relacionar de forma inequívoca ejercicio, poster y revisión técnica.
8. La prueba animada se evalúa por separado y no bloquea la aprobación del lenguaje visual
   estático.

## Fuera de alcance

- Reemplazar o eliminar el catálogo actual.
- Cargar activos en Supabase.
- Cambiar el esquema de base de datos.
- Integrar un reproductor de movimiento en la UI.
- Producir los 120–150 ejercicios antes de aprobar el piloto.
- Instalar Blender o importar modelos de terceros durante esta primera prueba.

