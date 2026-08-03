# Resumen del plan y gráfica de ejercicio responsive

## Objetivo

Simplificar el resumen del plan y corregir el desbordamiento horizontal de la
gráfica en la ficha de ejercicio, especialmente en pantallas móviles.

La solución debe:

- dejar de mostrar las etiquetas redundantes `Gimnasio completo`, `Equipo: …`
  y `Sesiones de … min` debajo del resumen del plan;
- conservar las tarjetas superiores de días por semana, duración por sesión y
  nivel;
- mantener dentro de la tarjeta el selector de 4, 12 y 24 semanas;
- contener el desplazamiento horizontal de las barras dentro de la propia
  gráfica, sin ensanchar ni recortar la página;
- conservar el comportamiento de escritorio y todos los cálculos actuales.

## Diagnóstico

`ExerciseProgressChart` asigna a las barras un ancho mínimo de 544 px para que
fechas y columnas sigan siendo legibles. Ese ancho vive dentro de una columna
CSS Grid cuyo tamaño mínimo automático no se reduce al ancho disponible. Como
resultado, la columna completa adopta el ancho intrínseco de la gráfica y el
contenedor con `overflow-x-auto` no llega a actuar como zona de scroll interna.
La tarjeta se expande hacia la derecha y también arrastra al selector de
periodos, dejando parcialmente fuera de pantalla el botón de 24 semanas.

Las tres etiquetas del resumen del plan se generan en
`appliedConstraintLabels`. La duración ya aparece en la tarjeta superior y el
usuario ha indicado que tampoco necesita volver a mostrar el tipo de gimnasio
ni la lista de equipo en este resumen.

## Diseño aprobado

### Resumen del plan

`appliedConstraintLabels` dejará de generar las etiquetas de tipo de gimnasio,
equipo disponible y duración de sesión. Continuará generando únicamente los
avisos de restricciones de movimiento autorizadas, porque sí aportan contexto
de seguridad y no duplican las métricas superiores.

`PlanOverview` conservará su franja condicional de restricciones. Si no existe
ningún aviso de seguridad, la franja no se renderizará y la tarjeta terminará
después del selector de plan.

No se modifican el perfil, las preferencias guardadas ni los datos que recibe
el motor de entrenamiento; el cambio afecta solo al resumen visible.

### Gráfica de ejercicio

La columna principal que contiene `ExerciseProgressChart` podrá contraerse con
`min-width: 0`. La tarjeta y la zona desplazable también declararán de forma
explícita que su ancho máximo es el ancho disponible.

El selector de 4, 12 y 24 semanas seguirá en una sola fila y ocupará el ancho
interior de la tarjeta en móvil. Sus celdas podrán contraerse sin exceder el
contenedor y mantendrán objetivos táctiles de al menos 44 px de alto.

Las barras conservarán su ancho mínimo actual. Cuando ese ancho sea mayor que
el espacio disponible, solo la zona de barras tendrá desplazamiento horizontal
táctil. El título, el selector, el resumen del punto seleccionado y el enlace a
la sesión permanecerán fijos dentro de la tarjeta.

En escritorio se mantiene la composición de dos columnas y el selector con su
ancho actual.

## Flujo de datos y estados

No cambia el flujo de datos. El servidor seguirá construyendo la misma ficha y
`ExerciseProgressChart` seguirá filtrando los mismos puntos por periodo. La
selección de una barra y el enlace a la sesión conservarán su funcionamiento.

Los estados sin datos, la traducción español/inglés y los avisos de
restricciones autorizadas permanecerán disponibles. No se añaden peticiones,
persistencia, migraciones ni tratamiento nuevo de errores.

## Accesibilidad y responsive

- el selector conserva nombres accesibles y `aria-pressed`;
- las barras mantienen su nombre accesible y su selección actual;
- el scroll horizontal queda limitado a la gráfica y puede usarse mediante
  gesto táctil;
- no debe existir overflow horizontal en la página a 375 px ni en el ancho de
  498 px de las capturas de referencia;
- el selector completo debe permanecer dentro de la tarjeta;
- los cambios no dependen de animación ni afectan `prefers-reduced-motion`.

## Pruebas

### Unitarias

- verificar que `appliedConstraintLabels` omite tipo de gimnasio, equipo y
  duración;
- verificar que mantiene uno o varios avisos de restricciones autorizadas;
- verificar la localización de esos avisos.

### Responsive e integración

- cargar una ficha con suficientes puntos para exceder el ancho móvil;
- comprobar que la tarjeta y los tres botones del selector permanecen dentro
  del viewport;
- comprobar que la página no desarrolla overflow horizontal;
- comprobar que la zona de barras sí tiene overflow interno y acepta un cambio
  de `scrollLeft`;
- comprobar que cambiar el periodo y abrir una sesión siguen funcionando.

### Verificación general

- pruebas unitarias relacionadas;
- prueba responsive de la ficha de ejercicio;
- comprobación de tipos;
- lint;
- build de producción si las verificaciones anteriores pasan.

## Criterios de aceptación

1. El resumen del plan ya no muestra las tres etiquetas señaladas.
2. Las tarjetas de días, duración y nivel permanecen visibles y sin cambios de
   datos.
3. Los avisos de restricciones autorizadas continúan mostrándose cuando
   existen.
4. Los botones de 4, 12 y 24 semanas caben completamente dentro de la tarjeta
   en móvil.
5. Las barras se desplazan horizontalmente dentro de la gráfica cuando sea
   necesario.
6. La tarjeta y la página no se desbordan hacia la derecha.
7. El comportamiento de escritorio, los cálculos y la navegación no cambian.

## Fuera de alcance

- rediseñar la gráfica o cambiar la métrica representada;
- comprimir todas las barras para eliminar el scroll;
- modificar el motor del plan o las preferencias de entrenamiento;
- eliminar avisos de seguridad relacionados con restricciones autorizadas;
- cambiar otras pantallas que usan `PeriodSelector`.
