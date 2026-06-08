# Diseño: Tap-para-ampliar imagen de ejercicio

Fecha: 2026-06-08
Estado: Aprobado (pendiente de plan de implementación)

## Problema

Durante una sesión de entrenamiento, cada ejercicio se muestra en un card con una
miniatura de 40×40 px ([ExerciseCard.tsx](../../../src/components/session/ExerciseCard.tsx)).
Esa miniatura es demasiado pequeña para visualizar correctamente el movimiento (muchas
imágenes son GIFs de la ejecución). El usuario quiere poder **tocar la imagen** y verla
ampliada en un overlay, sin salir de la sesión.

## Objetivo

Tocar la imagen de un ejercicio abre un overlay (lightbox) con la imagen ampliada y el
nombre del ejercicio como pie. La capacidad debe estar disponible en toda la app donde
se muestran imágenes de ejercicio.

## Decisiones tomadas

- **Contenido del overlay:** imagen ampliada + nombre del ejercicio. (No mini-ficha; la
  ficha completa ya existe en `/exercises/[exerciseId]`.)
- **Alcance:** toda la app (sesión, cuadrícula de ejercicios, selector de reemplazo,
  heros de ficha/grid), no solo el card de sesión.

## Arquitectura

### 1. Capacidad `zoomable` dentro de `ExerciseImage`

En vez de wrappers por sitio, la capacidad es **opt-in** mediante una prop nueva en
[ExerciseImage](../../../src/components/exercises/ExerciseImage.tsx):

```tsx
<ExerciseImage src={...} alt={...} variant="thumb" zoomable />
```

Comportamiento cuando `zoomable` está activo **y** hay imagen real (no placeholder):

- La imagen se renderiza envuelta en un `<button>` que abre el overlay.
- Muestra una **lupa sutil** en una esquina (badge translúcido) como señal de afordancia.
- El componente gestiona su propio estado de abierto/cerrado y el `Dialog`.

Si no hay imagen (placeholder) o `zoomable` es `false` → comportamiento idéntico al actual.
Cero regresiones en los sitios que no activen la prop.

### 2. Overlay (lightbox)

Reutiliza el `Dialog` de Radix existente ([dialog.tsx](../../../src/components/ui/dialog.tsx))
con un `DialogContent` a medida (fondo transparente, sin borde ni padding, a pantalla):

- Backdrop oscuro `bg-black/80` (lo provee `DialogOverlay`).
- Imagen grande centrada con **`object-contain`** para que el movimiento se vea completo,
  sin recorte.
- **Nombre del ejercicio** como pie, sobre un degradado para legibilidad.
- Cierre: tap en el backdrop, botón **✕**, o tecla **Escape** (todo lo maneja Radix).
- Animación de zoom-in ya incluida en el `Dialog`.

### 3. Reestructura del card de sesión

Hoy la miniatura vive **dentro** del `<button>` que expande el card
([ExerciseCard.tsx:94-119](../../../src/components/session/ExerciseCard.tsx)). No se puede
anidar un `<button>` dentro de otro `<button>`. La cabecera pasa a ser un `<div>`
contenedor con dos zonas hermanas:

- **Imagen** = botón propio → abre overlay.
- **Resto de la fila** (info + estado/progreso + chevron) = botón de expandir/colapsar.

Misma apariencia. Tocar la imagen amplía; tocar el resto expande/colapsa.

### 4. Resto de sitios ("toda la app")

Añadir la prop `zoomable` donde aplica:

- **Cuadrícula de ejercicios** ([ExerciseGrid.tsx:44](../../../src/app/(app)/exercises/ExerciseGrid.tsx))
  (thumb) y **hero del grid** (:153).
- **Selector de reemplazo** ([SessionExercisePicker.tsx:64](../../../src/components/session/SessionExercisePicker.tsx)).
- **Hero de la ficha** ([page.tsx:501](<../../../src/app/(app)/exercises/[exerciseId]/page.tsx>)).

En los sitios donde la imagen vive dentro de otro elemento clickeable (card que navega,
fila con `onSelect`), el botón de zoom hace `stopPropagation` para no disparar la acción
del contenedor.

## Edge cases

- **Placeholder (sin imagen):** no se vuelve clickeable; no aparece la lupa.
- **Imagen rota (onError):** vuelve al placeholder; el overlay no debería abrirse a una
  imagen rota → reutilizar el mismo estado `errored` de `ExerciseImage`.
- **Click anidado:** garantizar que tocar la imagen dentro de un contenedor clickeable no
  propague (no expande el card, no navega, no selecciona reemplazo).

## Testing

- **`ExerciseImage`**: con `zoomable` + imagen real, click abre el overlay; con placeholder
  o sin `zoomable`, no hay botón ni overlay.
- **`ExerciseCard`**: tap en la imagen abre overlay; tap en el resto de la fila expande;
  no hay `<button>` anidado en `<button>`.

## Fuera de alcance (YAGNI)

- Swipe-to-dismiss y pinch-to-zoom dentro del overlay. El tap-fuera + ✕ + Escape cubren
  el caso. Posible mejora futura.

## Notas de despliegue

Cambio **solo-web** (UI + componentes, sin tocar capacidades nativas/Capacitor) → solo
deploy a Vercel, sin recompilar el APK.
