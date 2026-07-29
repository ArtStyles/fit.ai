# Diseño: Pull-to-refresh global con pulso de Vekira

Fecha: 2026-07-29  
Estado: Aprobado por el usuario

## Problema

Vekira no ofrece una recarga gestual al arrastrar hacia abajo en móvil. La aplicación
ya usa un viewport de scroll propio para evitar que el overscroll de Android deforme
las barras fijas, por lo que el gesto nativo del navegador está deshabilitado
deliberadamente.

El usuario quiere recuperar esa interacción con una sensación similar a Threads:
un indicador de marca aparece desde el borde superior, responde directamente al dedo
y se sincroniza con una vibración precisa. El indicador debe usar el símbolo real de
Vekira y funcionar en todas las pantallas autenticadas de la aplicación móvil.

## Objetivo

Añadir un pull-to-refresh global, consistente y no destructivo en el viewport de la
aplicación. Al superar el umbral y soltar, se ejecutará `router.refresh()` para
actualizar los Server Components y sus datos sin recargar el documento completo.

La identidad visual elegida es **Pulso de energía**:

- el símbolo de Vekira entra deslizándose desde arriba;
- no rota;
- al superar el umbral hace un latido;
- dos ondas violetas se expanden desde el símbolo;
- el latido se sincroniza con un impacto háptico;
- durante la actualización mantiene un pulso discreto;
- al terminar hace un último pulso visual y sale hacia arriba.

## Decisiones aprobadas

- **Alcance:** todas las rutas dentro del shell autenticado de Vekira.
- **Plataformas:** Capacitor Android, PWA y navegador móvil.
- **Escritorio:** el gesto no se monta en punteros precisos o viewports de escritorio.
- **Estrategia:** controlador personalizado global, no el spinner nativo del sistema.
- **Identidad:** marca SVG de Vekira sin el fondo cuadrado del icono de aplicación.
- **Movimiento:** variante visual B, “Pulso de energía”; no se usa giro.
- **Umbral:** 72 px de arrastre vertical bruto.
- **Recarga:** `router.refresh()` dentro de una transición de React.
- **Háptica:** un único `hapticImpact('medium')` la primera vez que el gesto cruza
  el umbral.
- **Duración mínima:** el estado de actualización permanece visible al menos 600 ms.
- **Dependencias:** no se añaden paquetes; se reutilizan React, Next.js, CSS y la capa
  háptica existente.

## No objetivos

- No se habilita pull-to-refresh en las páginas públicas, login, registro u onboarding.
- No se realiza `window.location.reload()`.
- No se cambia el diseño de las barras superiores ni de la navegación inferior.
- No se sustituye el indicador de rutas ni los skeletons de carga existentes.
- No se añaden sonidos ni vibraciones continuas.
- No se desplaza ni se deforma el chrome fijo de la aplicación.

## Arquitectura

### 1. Máquina de estados del gesto

La interacción se modelará con cinco estados explícitos:

```ts
type PullToRefreshPhase =
  | 'idle'
  | 'pulling'
  | 'armed'
  | 'refreshing'
  | 'settling'
```

La lógica pura vivirá en
`src/components/navigation/pull-to-refresh.logic.ts` y será independiente de React:

```ts
export const PULL_ACTIVATE_DISTANCE = 72
export const PULL_MAX_DISTANCE = 112

export type PullGestureState = {
  phase: PullToRefreshPhase
  startY: number | null
  startX: number | null
  rawDistance: number
  visualDistance: number
  thresholdAnnounced: boolean
}

export function beginPull(point: { x: number; y: number }): PullGestureState

export function updatePull(
  state: PullGestureState,
  point: { x: number; y: number },
): PullGestureState

export function releasePull(state: PullGestureState): {
  state: PullGestureState
  shouldRefresh: boolean
}

export function cancelPull(): PullGestureState
```

`visualDistance` aplicará resistencia progresiva y tendrá un máximo de 112 px. El
desplazamiento visible será menor que el recorrido real del dedo para producir una
sensación elástica. Un movimiento se cancela si se vuelve predominantemente horizontal.

El estado `thresholdAnnounced` asegura que la háptica ocurra una sola vez por gesto,
aunque el dedo retroceda y vuelva a cruzar el umbral.

### 2. Controlador global

`AppScrollViewport` seguirá siendo el único elemento que desplaza el contenido y
alojará el controlador del gesto. La integración global es intencional: evita
duplicación por página y garantiza que todas las rutas autenticadas se comporten igual.

El controlador:

- se habilita con un puntero táctil/grueso y ancho inferior a 1024 px;
- comienza únicamente cuando `scrollTop <= 0`;
- ignora multitouch;
- ignora gestos iniciados sobre `input`, `textarea`, `select`, elementos
  `contenteditable` o `[data-pull-refresh-disabled]`;
- escucha movimiento vertical con un listener no pasivo solo durante un gesto válido;
- no captura desplazamientos horizontales;
- cancela en `touchcancel`, cambio de ruta o desmontaje;
- bloquea nuevos gestos durante `refreshing` y `settling`.

El contenido normal y las barras fijas no se trasladan. Solo se mueve el indicador,
evitando reintroducir la deformación de overscroll que el viewport actual resuelve.

### 3. Indicador visual

`src/components/navigation/PullToRefreshIndicator.tsx` será un componente presentacional.
Recibirá el estado y progreso calculados:

```ts
type PullToRefreshIndicatorProps = {
  phase: PullToRefreshPhase
  progress: number
  visualDistance: number
  reducedMotion: boolean
}
```

El componente se renderizará por encima del shell móvil con `pointer-events: none` y
un `z-index` superior a `FixedTopBar`.

#### Arrastre

- Empieza oculto sobre el borde superior.
- Su opacidad y escala aumentan con `progress`.
- Desciende con `visualDistance`.
- No gira ni altera la orientación del logotipo.

#### Cruce del umbral

- El símbolo escala rápidamente a `1.13`, vuelve a `0.97` y se estabiliza en `1`.
- Dos anillos violetas parten del centro con 160 ms de separación.
- El primer cruce llama a `hapticImpact('medium')`.
- El indicador hace un ajuste vertical corto de 2–4 px para reforzar el “enganche”.

#### Actualización y salida

- Mientras `router.refresh()` está pendiente, el símbolo mantiene un pulso lento entre
  escala `0.97` y `1.03`.
- Se mantiene visible durante un mínimo de 600 ms.
- Al finalizar realiza un pulso final breve, pierde opacidad y sale hacia arriba.
- El ciclo completo respeta las safe areas del dispositivo.

Los gradientes del SVG reutilizarán los colores del logo oscuro existente:
`#ddd6fe`, `#a78bfa` y `#7c3aed`.

### 4. Recarga de datos

Al soltar en estado `armed`, el controlador ejecutará:

```ts
startTransition(() => {
  router.refresh()
})
```

La transición de React será la fuente principal para saber cuándo finaliza la
actualización. El indicador no saldrá hasta que:

1. la transición deje de estar pendiente; y
2. hayan transcurrido al menos 600 ms desde el inicio.

`router.refresh()` vuelve a solicitar el árbol de Server Components y lo fusiona con el
árbol cliente actual. Esto mantiene el estado cliente compatible y evita la recarga
destructiva del documento. Componentes como `PostFeed`, que ya reconcilian sus props
iniciales al cambiar, recibirán los datos actualizados normalmente.

Un temporizador de seguridad de 10 segundos devolverá la máquina a `settling` si una
transición no concluye. El error de datos seguirá siendo responsabilidad de los límites
de error y estados de carga existentes de Next.js; el indicador no ocultará ni
reemplazará esos mecanismos.

## Háptica

Se reutiliza `src/lib/native/haptics.ts`:

- Capacitor usa `@capacitor/haptics` con `ImpactStyle.Medium`.
- PWA y navegador móvil usan `navigator.vibrate(40)` mediante el fallback existente.
- La vibración se dispara al armar el gesto, no al tocar la pantalla ni al soltar.
- No hay segunda vibración al finalizar para mantener una respuesta precisa y evitar
  fatiga háptica.

## Accesibilidad

- El SVG y las ondas son decorativos y usan `aria-hidden`.
- Un estado accesible con `role="status"` anuncia “Actualizando contenido” solo durante
  la recarga.
- Los textos pasan por el sistema de traducción existente.
- Con `prefers-reduced-motion: reduce`, se eliminan latido, rebote y ondas. El símbolo
  aparece, permanece estático durante la actualización y se desvanece al terminar.
- La interacción no depende exclusivamente del color: posición, escala y estado
  accesible comunican la activación.

## Manejo de conflictos

- **Scroll normal:** no se inicia si el viewport no está en el borde superior.
- **Movimiento horizontal:** se cancela cuando el desplazamiento horizontal domina.
- **Controles de formulario:** no se inicia desde controles editables.
- **Gestos simultáneos:** solo se acepta un toque primario.
- **Recarga duplicada:** `refreshing` y `settling` bloquean nuevas activaciones.
- **Cambio de ruta:** limpia listeners, temporizadores y estado.
- **Pantallas con interacción compleja:** pueden añadir
  `data-pull-refresh-disabled` a una zona concreta sin desactivar el patrón global.

## Estrategia de pruebas

### Pruebas unitarias

`src/components/navigation/__tests__/pull-to-refresh.logic.test.ts` cubrirá:

- estado inicial y comienzo del gesto;
- resistencia progresiva y límite visual;
- transición de `pulling` a `armed` exactamente a 72 px;
- cancelación de movimiento predominantemente horizontal;
- liberación antes del umbral sin recarga;
- liberación después del umbral con una sola recarga;
- una única notificación háptica por gesto;
- cancelación y reinicio seguro.

### Pruebas de integración del componente

Se verificará estructuralmente que:

- el indicador use el símbolo SVG de Vekira;
- el estado `refreshing` exponga el mensaje accesible;
- movimiento reducido elimine ondas y animación continua;
- el shell monte un único controlador global.

### Prueba móvil de extremo a extremo

Una prueba Playwright con viewport móvil simulará:

1. abrir una ruta autenticada;
2. confirmar que el viewport está en `scrollTop = 0`;
3. arrastrar menos de 72 px y comprobar que no hay recarga;
4. arrastrar más de 72 px y comprobar una sola actualización;
5. confirmar que el indicador aparece y vuelve a reposo;
6. confirmar que las barras fijas conservan su geometría.

La intensidad y calidad del impacto háptico se validarán manualmente en el WebView de
Capacitor, porque no pueden medirse con fidelidad en Vitest o Playwright.

## Archivos previstos

Nuevos:

- `src/components/navigation/pull-to-refresh.logic.ts`
- `src/components/navigation/PullToRefreshIndicator.tsx`
- `src/components/navigation/__tests__/pull-to-refresh.logic.test.ts`
- pruebas estructurales o de integración junto al componente de navegación

Modificados:

- `src/components/navigation/AppScrollViewport.tsx`
- `src/styles/globals.css`
- `tests/e2e/core-product.spec.ts` o una especificación móvil dedicada

## Riesgos y mitigaciones

- **`router.refresh()` finaliza demasiado rápido:** duración visual mínima de 600 ms.
- **Transición atascada o conexión deficiente:** salida de seguridad a los 10 segundos.
- **Conflicto con controles táctiles:** filtro de elementos editables y cancelación por
  dirección.
- **Regresión del overscroll de Android:** el contenido y las barras fijas permanecen
  inmóviles; solo se anima el indicador.
- **Movimiento excesivo:** variante sin rotación y soporte explícito de movimiento
  reducido.
- **Háptica molesta:** un único impacto por gesto, únicamente al alcanzar el umbral.

## Criterios de aceptación

- Funciona en todas las rutas autenticadas al usar un dispositivo móvil.
- Solo puede comenzar con el viewport en el borde superior.
- Un arrastre inferior a 72 px nunca actualiza.
- Un arrastre igual o superior a 72 px actualiza una sola vez al soltar.
- El símbolo de Vekira no gira.
- El cruce del umbral muestra el latido y dos ondas violetas.
- La háptica ocurre una sola vez y coincide con el primer latido.
- Las barras fijas no se desplazan, estiran ni deforman.
- El scroll vertical, los gestos horizontales y los formularios mantienen su
  comportamiento normal.
- El indicador sale correctamente tras éxito, timeout o cambio de ruta.
- La experiencia respeta `prefers-reduced-motion`.
- No se añaden dependencias.
