# Diseño de modales y notificaciones con área segura

**Fecha:** 2026-08-02
**Estado:** aprobado para planificación

## Problema

Los componentes portaleados de Radix se posicionan con `position: fixed` y no heredan el `padding` de área segura aplicado al `body`. El `DialogContent` compartido se centra con `top: 50%` y puede extenderse detrás de la barra del sistema cuando su contenido es alto. El viewport de notificaciones usa `top: 1rem` sin sumar `--app-safe-area-top`. Como resultado, el borde superior y los controles de cierre pueden quedar demasiado arriba o ser difíciles de tocar en Android, iOS y la PWA instalada.

## Objetivos

- Mantener todos los controles interactivos fuera de las barras del sistema.
- Mostrar cualquier diálogo como una hoja inferior deslizante en viewports móviles.
- Mantener los diálogos centrados en escritorio.
- Garantizar que el contenido largo se desplace dentro del diálogo sin ocultar el cierre.
- Bajar el grupo de notificaciones por debajo del área segura superior.
- Conservar las API públicas actuales de `DialogContent` y `useToast`.

## Fuera de alcance

- Cambiar el contenido, las acciones o la lógica de negocio de los diálogos.
- Mover las notificaciones a la parte inferior.
- Introducir gestos de arrastre para cerrar hojas inferiores.
- Rediseñar colores, iconografía o variantes de las notificaciones.

## Enfoque elegido

El comportamiento responsive se implementará en los componentes compartidos `DialogContent` y `ToastProvider`. Esto corrige todos los consumidores actuales y futuros desde una sola frontera. Los estilos particulares que contradigan el contrato global, como alturas de `100dvh` o posicionamiento manual de una hoja inferior, se reducirán únicamente donde sea necesario para que adopten el nuevo comportamiento compartido.

No se añadirá una variante opcional por diálogo: el usuario pidió que cualquier modal use el mismo patrón en móvil y una variante opt-in permitiría que algunos quedaran sin corregir.

## Comportamiento del diálogo

### Móvil, por debajo de `sm`

- El panel se ancla a la parte inferior y ocupa el ancho disponible.
- Conserva 1rem de margen horizontal y esquinas redondeadas en la parte superior.
- Su altura máxima se calcula contra `100dvh`, restando el área segura superior y un margen visual de 1.5rem. Por lo tanto, el panel nunca toca el límite superior utilizable de la pantalla.
- El área segura inferior se incorpora al relleno del panel para que sus acciones no queden bajo la barra de navegación del sistema.
- El contenido que exceda la altura máxima usa desplazamiento vertical dentro del panel.
- Al abrir, el panel se desplaza desde debajo del viewport hasta su posición final en aproximadamente 280 ms con una curva de desaceleración.
- Al cerrar, regresa hacia abajo en aproximadamente 200 ms.
- El overlay mantiene una transición de opacidad coordinada.

### Escritorio, desde `sm`

- El panel permanece centrado horizontal y verticalmente.
- Conserva su ancho máximo y sus esquinas redondeadas.
- La altura máxima también deja margen respecto de los bordes del viewport.
- El contenido largo se desplaza internamente.
- Al abrir usa una transición centrada de opacidad y escala desde 96% durante 200 ms; al cerrar invierte esa transición durante 150 ms. No hereda el desplazamiento completo de la hoja móvil.

### Control de cierre

- El cierre permanece dentro del panel, en la esquina superior derecha del contenido visible.
- Su objetivo táctil mínimo es de 44 × 44 px aunque el icono conserve su tamaño visual.
- El texto accesible será `Cerrar`.
- El estado de foco seguirá siendo visible y compatible con teclado.

## Comportamiento de las notificaciones

- El viewport permanece en la esquina superior derecha.
- Su posición superior será `--app-safe-area-top` más 1rem de separación.
- Los márgenes laterales incluirán las áreas seguras izquierda y derecha.
- Cada botón de cierre tendrá un objetivo táctil mínimo de 44 × 44 px.
- Se conserva la duración de 3.2 segundos, el apilamiento actual, el cierre manual y el swipe hacia la derecha.
- La animación lateral existente de las notificaciones no cambia; el movimiento desde abajo aplica a los modales.

## Movimiento reducido

Con `prefers-reduced-motion: reduce`, los diálogos, las notificaciones y el overlay no usarán desplazamiento, escalado ni transiciones temporizadas. El cambio entre abierto y cerrado será inmediato y no dependerá de la animación para comunicar estado.

## Compatibilidad y excepciones existentes

- `PlanWorkoutWorkspace` ya implementa manualmente una hoja inferior móvil. Adoptará el contrato compartido para evitar dos juegos de transformaciones.
- `PostImageCropper` usa actualmente `max-h-[100dvh]`; deberá respetar el mismo límite superior seguro que los demás diálogos.
- Las clases específicas de ancho, color, separación y estructura interna de cada consumidor se conservarán.
- Radix continuará gestionando portal, foco, Escape, bloqueo de interacción exterior y atributos de estado.

## Pruebas

Se añadirán pruebas de contrato para verificar que:

- el diálogo compartido define anclaje inferior y entrada desde abajo en móvil;
- el breakpoint `sm` restaura el centrado de escritorio;
- la altura máxima móvil descuenta `--app-safe-area-top` y mantiene margen superior;
- el panel permite desplazamiento interno y añade el área segura inferior;
- el cierre de diálogo y de toast ofrecen objetivos táctiles de al menos 44 × 44 px;
- el viewport de toast suma `--app-safe-area-top` y respeta las áreas seguras laterales;
- existe un tratamiento para movimiento reducido;
- los consumidores con posicionamiento conflictivo dejan de anular el contrato compartido.

Las verificaciones finales incluirán Vitest, comprobación de tipos y una prueba visual móvil y de escritorio cuando la aplicación local pueda iniciarse.

## Criterios de aceptación

- Ningún modal alcanza o cruza la barra superior del sistema en móvil.
- El botón de cierre siempre es visible, enfocable y fácil de tocar.
- Todos los modales móviles entran desde abajo y salen hacia abajo.
- Los modales de escritorio continúan centrados.
- Los modales largos conservan acceso a todo su contenido mediante scroll interno.
- Las notificaciones aparecen debajo de la barra del sistema y pueden cerrarse cómodamente.
- No cambia la lógica de apertura, cierre ni las acciones de negocio existentes.
