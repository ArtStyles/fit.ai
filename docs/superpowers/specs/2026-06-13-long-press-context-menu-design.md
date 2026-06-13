# Diseño: Menú contextual de "mantener pulsado" (estilo realzado)

Fecha: 2026-06-13
Estado: Propuesto (pendiente de revisión del usuario)

## Problema

Las acciones por elemento (editar, eliminar, etc.) hoy están **mal adaptadas a móvil**:

- En el historial de medidas, el botón de eliminar vive en `group-hover:opacity-100`
  ([MeasurementsClient.tsx:434](../../../src/components/measurements/MeasurementsClient.tsx)),
  es decir, es **invisible en táctil** (no hay hover).
- En los ejercicios del plan se muestran **5 controles inline a la vez** por fila —
  subir, bajar, quitar, ajustar, cambiar
  ([WorkoutExerciseList.tsx](../../../src/components/plan/WorkoutExerciseList.tsx)) —
  saturando la interfaz.

El usuario quiere una interacción más nativa de móvil: **mantener pulsado** un elemento
abre una "ventanita" encima con las acciones (editar, eliminar…), en lugar de exponer
muchos botones permanentemente.

## Objetivo

Un patrón global y reutilizable: mantener pulsado cualquier elemento de lista/tarjeta
con acciones abre un **menú contextual realzado** (estilo iOS/Android): el elemento se
eleva sobre un fondo atenuado y el menú se ancla a él. Se aplica de una vez a las tres
superficies reales con acciones por elemento.

## Decisiones tomadas

- **Alcance:** patrón global con un único primitivo reutilizable, aplicado **de una vez**
  a las tres superficies: medidas, ejercicios del plan, conversaciones del chat.
- **Descubribilidad:** long-press puro **+ pista** — la fila reacciona al mantener
  (escala + barra de progreso) y se muestra un tip una sola vez. Sin afordancias
  permanentes que ensucien la interfaz.
- **Estilo del menú:** **realzado** (la fila se eleva sobre scrim atenuado, el menú se
  ancla y se voltea arriba/abajo según el espacio). Es el más nativo y encaja con la
  estética actual (Barlow, dark, aurora, violeta).
- **Háptica:** al abrir el menú se dispara `hapticImpact('medium')`
  ([haptics.ts](../../../src/lib/native/haptics.ts)).
- **Reordenar ejercicios del plan:** sustituir las flechas subir/bajar por
  **arrastrar-y-soltar** con `Reorder` de framer-motion (sin dependencias nuevas).
- **Medidas:** el menú lleva **Editar + Eliminar**; "Editar" requiere una nueva server
  action `updateMeasurement` y reutiliza la forma de registro prellenada.
- **Sin dependencias nuevas:** framer-motion 12, Radix, `@capacitor/haptics` y portales
  ya están en el proyecto.

## No objetivos

- No se rediseñan las vistas más allá de mover acciones al menú y (en el plan) el
  reordenado por arrastre.
- No se añade multi-selección ni acciones por lotes.
- No se toca `deleteAccount` (botón único de ajustes, no es una lista).

## Arquitectura

### 1. Primitivo `LongPressMenu`

Nuevo componente cliente en `src/components/ui/long-press-menu.tsx`. Envuelve cualquier
elemento y le añade el menú contextual. Cada vista solo declara **sus** acciones; toda la
mecánica vive en el primitivo.

```tsx
import type { LucideIcon } from 'lucide-react'

export type LongPressAction = {
  id: string
  label: string
  icon: LucideIcon
  onSelect: () => void | Promise<void>
  variant?: 'default' | 'danger'
  disabled?: boolean
}

export function LongPressMenu(props: {
  actions: LongPressAction[]
  label: string            // etiqueta accesible del disparador ("Medida del 12 jun")
  disabled?: boolean       // p.ej. mientras se arrastra para reordenar
  children: React.ReactNode
}): JSX.Element
```

Uso:

```tsx
<LongPressMenu actions={actions} label={`Medida del ${fmtDate(row.recorded_at)}`}>
  {/* el contenido de la fila tal cual */}
</LongPressMenu>
```

#### Comportamiento

- **Pulsar y mantener ~400 ms** → `hapticImpact('medium')` → abre el menú.
- **Mientras se mantiene:** el hijo escala a `.97` y aparece una barra de progreso violeta
  que se llena en ~400 ms (feedback del gesto). Si el puntero se mueve >10 px (scroll),
  se cancela.
- **Al abrir:** se renderiza vía `createPortal` a `document.body` (para escapar de los
  `overflow:hidden` de las tarjetas):
  - un **scrim** oscuro (`bg-black/55`) a pantalla con `position: fixed`,
  - un **clon elevado** del hijo en las coordenadas medidas (`scale(1.03)`, anillo violeta),
  - el **menú** anclado debajo del clon (o encima si no cabe), con muelle de framer-motion.
- **Posicionamiento:** se mide el disparador con `getBoundingClientRect()` (coordenadas de
  viewport, válidas con portal fijo). Si `top + alturaMenú > altoViewport`, el menú se
  voltea encima.
- **Cerrar:** tocar el scrim, `Escape`, o seleccionar una acción. Al cerrar se ejecuta
  `onSelect` de la acción elegida.
- **Desktop:** además abre con clic derecho (`contextmenu`), para paridad.
- **Tip primera vez:** una píldora "Mantén pulsado para más opciones" mostrada una sola
  vez, con flag en `localStorage` (`fitai:lpm-hint-seen`).

#### Accesibilidad

- Cada disparador incluye un botón `sr-only` "Más opciones" (invisible pero enfocable) que
  abre el mismo menú; así el patrón es usable por teclado y lector de pantalla sin añadir
  afordancias visibles.
- El menú usa `role="menu"` con items `role="menuitem"`, foco atrapado mientras está
  abierto, navegación con flechas, `Enter`/`Espacio` para activar y `Escape` para cerrar.
  Al cerrar, el foco vuelve al disparador.
- Las acciones `variant: 'danger'` se anuncian igual; el color rojo es solo visual.

#### Estructura interna (para mantener el componente acotado y testeable)

- `useLongPress(handlers, { threshold: 400, moveTolerance: 10 })` — hook con la lógica de
  punteros (pointerdown/move/up/cancel) y el temporizador. **Lógica pura testeable**.
- `computeMenuPosition(triggerRect, menuSize, viewport)` — función pura que decide
  arriba/abajo y left clamped. **Testeable en entorno node** (el `vitest.config.ts` usa
  `environment: 'node'`).
- `LongPressMenu` — orquesta hook + posición + portal + framer-motion.

### 2. Reordenado por arrastre en el plan

`WorkoutExerciseList` hoy es un componente de servidor con `<form action>` por control. Se
extrae cada fila a un nuevo componente cliente `WorkoutExerciseRow` que:

- Se renderiza dentro de `Reorder.Group` / `Reorder.Item` (framer-motion) para
  arrastrar-y-soltar táctil. Mientras se arrastra, `LongPressMenu` se desactiva
  (`disabled`) para no entrar en conflicto con el gesto.
- Al soltar, persiste el nuevo orden con una **nueva server action**
  `reorderWorkoutExercises(planId, workoutId, orderedIds: string[])` (sustituye al
  `moveWorkoutExercise` de a uno). Actualización optimista del orden en cliente.
- Aloja el `LongPressMenu` con las acciones **Ajustar · Cambiar · Quitar**:
  - **Ajustar** → abre un `Dialog` (Radix) con la forma de `PrescriptionFields` + notas,
    que postea `updateWorkoutExercise`.
  - **Cambiar** → abre un `Dialog` con los candidatos de reemplazo, que postea
    `replaceWorkoutExercise`.
  - **Quitar** (danger) → postea `removeWorkoutExercise`, inmediato y optimista (mismo
    comportamiento que el borrado actual de medidas; sin diálogo de confirmación extra en
    este spec).

Se eliminan las flechas y los `<details>` inline; "Agregar ejercicio" se mantiene.

### 3. Medidas: editar + eliminar

- Nueva server action `updateMeasurement(id, payload)` en
  [measurements.ts](../../../src/app/actions/measurements.ts), simétrica a `logMeasurement`.
- `HistoryRow` aloja `LongPressMenu` con **Editar · Eliminar (danger)**:
  - **Editar** → abre el `Dialog` con `LogForm` prellenada con los valores de la fila;
    al guardar llama `updateMeasurement` y actualiza el estado local.
  - **Eliminar** → `deleteMeasurement` (optimista, ya existe).
- Se **elimina** el botón-papelera de hover. El tap sobre la fila sigue expandiendo los
  perímetros extra (gesto independiente del long-press).
- `LogForm` se generaliza para aceptar `initialValues?` y modo crear/editar.

### 4. Chat: conversaciones

- La lista de conversaciones ([ChatContainer.tsx](../../../src/components/chat/ChatContainer.tsx),
  `deleteConversation`) aloja `LongPressMenu` con **Eliminar (danger)** por conversación.
  (Renombrar queda como posible extra a confirmar durante la implementación, no es
  bloqueante.)
- Se retira cualquier botón de borrar inline/hover equivalente.

## Flujo de datos

1. Disparador (long-press / clic derecho / botón sr-only) → abre menú con háptica.
2. Selección de acción → `onSelect()` declarado por la vista → server action
   correspondiente (optimista donde aplique) → `revalidate`/estado local.
3. El primitivo no conoce las acciones concretas: recibe `LongPressAction[]` y delega.

## Estrategia de pruebas (vitest, entorno node)

- `computeMenuPosition` — pruebas unitarias: voltea arriba cuando no cabe abajo; clamp
  horizontal; centra sobre el disparador.
- `useLongPress` — pruebas de la máquina de estados con temporizadores simulados
  (`vi.useFakeTimers`): dispara al superar el umbral; cancela al mover; cancela al soltar
  antes de tiempo.
- Las server actions nuevas (`updateMeasurement`, `reorderWorkoutExercises`) se prueban a
  nivel de validación de entrada (mismos patrones que las existentes).
- Interacción DOM completa (portal, framer-motion) queda fuera del alcance de pruebas dado
  el entorno `node`; se valida manualmente en el Pixel 7 Pro / APK.

## Archivos afectados

Nuevos:
- `src/components/ui/long-press-menu.tsx` — primitivo + `useLongPress` + `computeMenuPosition`.
- `src/components/plan/WorkoutExerciseRow.tsx` — fila cliente con menú + reorder + diálogos.
- Tests: `src/components/ui/__tests__/long-press-menu.test.ts(x)`.

Modificados:
- `src/components/ui/index.ts` — exporta `LongPressMenu`.
- `src/components/measurements/MeasurementsClient.tsx` — `HistoryRow` con menú; `LogForm`
  crear/editar.
- `src/app/actions/measurements.ts` — `updateMeasurement`.
- `src/components/plan/WorkoutExerciseList.tsx` — usar `WorkoutExerciseRow` + `Reorder.Group`.
- `src/app/actions/plan.ts` — `reorderWorkoutExercises`.
- `src/components/chat/ChatContainer.tsx` — menú en conversaciones.

## Riesgos y mitigaciones

- **Conflicto gesto long-press vs. arrastre vs. scroll:** mitigado con `moveTolerance`
  (cancela al desplazarse), `touch-action` adecuado y desactivar `LongPressMenu` durante el
  arrastre del `Reorder`.
- **Portal y `position: fixed` bajo el contenedor nativo (Capacitor):** validar en APK que
  el scrim cubre toda la pantalla con el teclado/safe-areas.
- **`WorkoutExerciseList` pasa de servidor a cliente:** se acota a extraer la fila; la carga
  de datos sigue en servidor. Verificar que las server actions siguen funcionando desde el
  cliente.
- **Descubribilidad:** el tip de una sola vez es la única señal; revisar en pruebas de
  usuario que es suficiente.

## Despliegue

- Cambio **solo-web** (UI/rutas): la háptica usa el plugin ya integrado, así que **no
  requiere recompilar nativo**; basta deploy a Vercel. (Ver nota de memoria
  `project_native_capabilities`.)
- Implementación de una sola tanda (las tres superficies), validada manualmente en Pixel 7 Pro.
