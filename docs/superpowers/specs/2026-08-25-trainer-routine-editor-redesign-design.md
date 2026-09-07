# Rediseño integral del editor de rutinas profesionales

**Fecha:** 2026-08-25
**Estado:** Diseño aprobado
**Producto:** Vekira

## 1. Resumen

El editor de plantillas profesionales se reorganizará como un espacio de trabajo centrado en
el día activo. La configuración general quedará resumida, los días se navegarán mediante
pestañas y la lista de ejercicios ocupará el área principal. En móvil, las tarjetas serán
compactas y sus parámetros se distribuirán en una cuadrícula estable, sin solapamientos ni
desbordamiento horizontal.

El flujo permitirá seleccionar varios ejercicios y agregarlos en una sola operación. Cada
ejercicio nuevo recibirá valores iniciales de `3 × 10`, RPE `7`, descanso de `60` segundos,
peso vacío y notas vacías; después podrá editarse individualmente desde el día activo.

El modelo de guardado será híbrido:

- agregar, eliminar y reordenar días o ejercicios se guardará inmediatamente;
- nombre, objetivo, descripción y datos descriptivos del día requerirán una confirmación
  explícita;
- asignar y publicar seguirán siendo operaciones separadas y confirmadas.

La corrección lógica eliminará la dependencia del `order_index` enviado por el navegador.
Una nueva RPC añadirá el lote dentro de una transacción, bloqueará el día, calculará órdenes
consecutivos en el servidor y guardará todos los ejercicios o ninguno.

## 2. Estado actual y causa raíz

La ruta `src/app/(app)/coach/programs/[templateId]/page.tsx` presenta tres bloques apilados:
el editor de plantilla, el diálogo de asignación y el diálogo de publicación. Dentro de
`ProgramTemplateEditor`, todos los días aparecen abiertos verticalmente y cada
`TemplateWorkoutEditor` mezcla edición del día, lista, reordenamiento, edición individual y
formulario para agregar un ejercicio.

`TemplateWorkoutEditor` usa un `ExercisePicker` de selección única y un campo no controlado
con `defaultValue={workout.exercises.length + 1}` para `orderIndex`. Tras agregar un ejercicio,
`router.refresh()` conserva la instancia asociada al mismo `workout.id`; por tanto, el campo
puede mantener el orden anterior. El segundo envío intenta reutilizar ese valor.

La base de datos no limita el día a un ejercicio. La tabla permite hasta 30 posiciones, pero
impone unicidad mediante
`trainer_template_exercises_workout_order_unique (template_workout_id, order_index)`. El orden
obsoleto viola esa restricción y `addTrainerTemplateExercise` lo reduce al mensaje genérico
“No se pudo agregar el ejercicio. Revisa el orden indicado.”. La UI hace que el fallo parezca
un límite funcional.

La suite actual valida rangos y algunos contratos de interacción, pero su fixture de
`addTrainerTemplateExercise` devuelve éxito sin registrar los datos enviados. No prueba dos
adiciones consecutivas ni detecta la reutilización del orden.

## 3. Objetivos

1. Permitir agregar varios ejercicios a un día sin colisiones de orden.
2. Convertir toda la vista en un espacio de trabajo claro, no solo sustituir el selector.
3. Priorizar un día activo y mantener una visión semanal compacta.
4. Hacer explícito qué cambios están guardados y cuáles permanecen pendientes.
5. Mantener asignación, publicación y snapshots profesionales separados del borrador editable.
6. Ofrecer una experiencia móvil sin cruces, recortes accidentales ni controles menores de
   44 px.
7. Preservar autorización, límites y atomicidad en la base de datos.

## 4. Fuera de alcance

- Rediseñar las vistas del cliente que consumen una rutina ya asignada.
- Cambiar el modelo de snapshots o la inmutabilidad de asignaciones publicadas.
- Modificar límites existentes de series, repeticiones, peso, RPE, descanso o notas.
- Introducir superseries, circuitos, bloques o progresiones automáticas.
- Prohibir que un ejercicio ya presente en el día pueda añadirse de nuevo en otra operación.
- Reescribir `043_trainer_programming.sql` u otra migración ya desplegada.
- Aplicar automáticamente la migración a la base remota como efecto de hacer commit o push.

## 5. Arquitectura de información

### 5.1 Cabecera y resumen de rutina

La cabecera conservará la navegación hacia la lista de rutinas, el nombre actual, el estado
de guardado y la acción de vista previa. Debajo aparecerá un resumen compacto con nombre,
objetivo, frecuencia y nivel. “Editar información” abrirá o expandirá el formulario de
metadatos; este no dominará la pantalla cuando el entrenador esté construyendo el contenido.

En escritorio, el estado de borrador, el resumen semanal y las acciones “Asignar” y “Publicar
revisión” ocuparán un panel lateral. En móvil, el resumen semanal aparecerá después del día
activo y las acciones principales vivirán en una barra inferior segura para el área del
dispositivo.

### 5.2 Navegación de días

Los días se mostrarán como pestañas horizontales con nombre, foco muscular o descriptor y
cantidad de ejercicios. Solo un día estará activo. La fila podrá desplazarse horizontalmente
en móvil con `scroll-snap`; no aumentará el ancho del documento. El control para agregar un
día estará al final de la misma fila.

Cambiar de pestaña no hará una escritura. Agregar, eliminar o reordenar días sí será una
operación estructural de guardado inmediato. El orden visible procederá siempre del resultado
persistido. `order_in_plan` no seguirá expuesto como un campo numérico editable; el orden se
cambiará únicamente desde la navegación de días.

### 5.3 Día activo

El día activo mostrará nombre, volumen total y duración estimada, seguido de la lista ordenada
de ejercicios. Cada tarjeta tendrá:

- asa de reordenamiento;
- nombre, grupos musculares y equipo;
- series y repeticiones;
- intensidad;
- descanso;
- menú de edición y eliminación.

En móvil, la cabecera de la tarjeta ocupará una fila y las tres métricas una cuadrícula
`repeat(3, minmax(0, 1fr))`. Los textos internos podrán truncarse, pero ningún bloque podrá
salir de la tarjeta. El botón “Agregar varios ejercicios” cerrará la lista.

## 6. Selector múltiple

“Agregar varios ejercicios” abrirá un diálogo en escritorio y una hoja de pantalla completa
en móvil. El selector reutilizará el catálogo existente y conservará búsqueda, paginación y
filtros. La selección será múltiple y cada ejercicio podrá marcarse una sola vez dentro de la
operación actual.

La cabecera mostrará la cantidad seleccionada. El pie permanecerá visible y contendrá
“Cancelar” y “Agregar N ejercicios”. Antes de confirmar se mostrarán los valores iniciales:

```text
series = 3
repeticiones = 10
RPE = 7
descanso = 60 segundos
peso = null
notas = null
```

No habrá un formulario completo por ejercicio dentro del selector. Al confirmar, todos se
añadirán al final del día en el orden en que fueron seleccionados. El diálogo se cerrará solo
cuando la operación termine correctamente; así, un error conserva búsqueda y selección para
permitir reintentar.

## 7. Modelo de guardado híbrido

### 7.1 Operaciones inmediatas

Las siguientes acciones se enviarán al servidor al confirmarse:

- agregar, eliminar o reordenar días;
- agregar varios ejercicios;
- eliminar o reordenar ejercicios.

Cada área tendrá estado pendiente independiente. Guardar metadatos no bloqueará toda la lista
de ejercicios, y una operación en el día activo no deshabilitará acciones no relacionadas.
Durante una mutación se bloqueará únicamente el control afectado para evitar duplicados.

### 7.2 Operaciones explícitas

Nombre, frecuencia, objetivo y descripción de la rutina, además de nombre y día del
entrenamiento, se editarán en formularios explícitos. Al cambiar un valor aparecerá “Cambios
pendientes”; al guardar correctamente, cambiará a “Todo guardado”.

Si el entrenador intenta asignar, publicar o abandonar la vista con cambios descriptivos
pendientes, la UI le pedirá guardarlos o descartarlos. Asignar y publicar nunca se dispararán
como consecuencia de otra acción.

### 7.3 Edición de prescripción

Series, repeticiones, peso, RPE, descanso y notas se editarán desde la tarjeta individual y se
guardarán con una confirmación explícita por ejercicio. `order_index` dejará de ser un campo
editable: el único camino para cambiarlo será reordenar la lista mediante el contrato atómico
existente. La actualización de una prescripción no incluirá ni modificará su orden.

## 8. Contrato de datos para inserción por lote

La siguiente migración disponible será
`056_trainer_template_exercise_batch_append.sql`. Añadirá:

```sql
public.append_trainer_template_exercises(
  p_template_workout_id uuid,
  p_exercises jsonb
) returns jsonb
```

`p_exercises` será un array no vacío y de tamaño máximo 30. Cada elemento contendrá
`exerciseId`, `sets`, `reps`, `weightKg`, `targetRpe`, `restSeconds` y `notes`; no aceptará
`orderIndex`.

La función:

1. derivará el usuario exclusivamente de `auth.uid()`;
2. comprobará perfil y entrenador activos;
3. resolverá la propiedad de la plantilla y bloqueará la fila del entrenamiento;
4. validará el JSON, los rangos actuales y la existencia de todos los ejercicios del catálogo;
5. bloqueará las filas de ejercicios del día y normalizará sus órdenes actuales de forma
   consecutiva, preservando el orden relativo;
6. calculará las posiciones nuevas al final de esa lista normalizada;
7. rechazará el lote completo si el resultado supera 30 ejercicios;
8. insertará el array completo con órdenes consecutivos en una sola transacción;
9. devolverá los IDs creados, `exerciseId` y `orderIndex` en el mismo orden solicitado.

El lock se tomará con el mismo orden de autorización usado por las RPC profesionales para no
introducir una jerarquía de bloqueo contradictoria. La función será `SECURITY DEFINER`, tendrá
`search_path = public, pg_temp`, owner controlado, `REVOKE` para `PUBLIC` y `anon`, y `GRANT`
solo para `authenticated` y `service_role`.

La RPC no impondrá unicidad permanente por `exercise_id`, preservando la semántica actual. Sí
rechazará IDs repetidos dentro del mismo payload, porque el selector no puede seleccionar dos
veces la misma opción en una sola operación.

## 9. Acciones y componentes

### 9.1 Acción de servidor

`src/app/actions/trainerPrograms.ts` incorporará una acción plural que:

- convertirá la selección y los valores iniciales en el JSON canónico;
- validará UUID, cardinalidad y rangos antes de llamar a la RPC;
- mapeará errores de autorización, catálogo, límite y conflicto a mensajes diferenciados;
- revalidará únicamente la vista de programas afectada;
- devolverá los IDs y órdenes creados.

La acción singular existente podrá mantenerse como adaptador de un elemento durante la
transición, pero la nueva UI no enviará ni confiará en `orderIndex` al agregar.

La edición de una prescripción usará un parser separado que no acepte `orderIndex`; de la
misma forma, la edición descriptiva del día no aceptará `orderInPlan`. Los dos órdenes solo
podrán cambiar mediante las RPC de reordenamiento.

### 9.2 Separación de componentes

La vista se dividirá por responsabilidad:

- `ProgramTemplateWorkspace`: coordina día activo y estados globales.
- `ProgramTemplateSummary`: resume metadatos y abre su formulario.
- `TemplateDayTabs`: navega, agrega y reordena días.
- `ActiveTemplateWorkout`: edita un único día y calcula sus totales visibles.
- `TemplateExerciseList`: representa y reordena tarjetas.
- `TemplateExerciseCard`: muestra y edita una prescripción.
- `TemplateExerciseBatchPicker`: mantiene búsqueda, filtros y selección múltiple.
- `ProgramTemplateActions`: contiene estado, resumen, asignación y publicación.
- `SaveStateIndicator`: distingue guardado, pendiente, guardando y error.

Los nombres finales pueden ajustarse al implementar, pero se conservarán esos límites. El
componente de página seguirá cargando plantilla, catálogo, relaciones y asignaciones; no se
duplicarán esas consultas dentro de cada tarjeta.

## 10. Flujo de errores y recuperación

- **Agregar lote:** el diálogo permanece abierto, conserva selección y muestra el error junto
  al botón con una acción “Reintentar”. No aparecerán ejercicios parciales.
- **Reordenar:** la lista puede anticipar visualmente el nuevo orden; si el servidor falla,
  volverá al último orden confirmado y anunciará el error.
- **Eliminar:** requerirá confirmación. Un fallo conservará la tarjeta.
- **Guardar metadatos:** conservará los valores introducidos y los marcará como pendientes.
- **Catálogo obsoleto:** identificará los ejercicios que dejaron de estar disponibles y
  permitirá desmarcarlos sin perder el resto de la selección.
- **Pérdida de conexión:** usará el mismo estado recuperable; no convertirá un timeout en éxito.

Los mensajes visibles serán específicos y habrá una región `aria-live` para lectores de
pantalla. El foco volverá al control que abrió el selector después de cancelar o completar la
operación.

## 11. Accesibilidad y comportamiento responsive

- Todos los controles interactivos tendrán un objetivo mínimo de 44 × 44 px.
- Las pestañas de días expondrán semántica de `tablist`, `tab` y `tabpanel`.
- Selección, estado pendiente y errores no dependerán únicamente del color.
- El selector podrá recorrerse por teclado y anunciará el conteo seleccionado.
- En 320, 360, 390, 430 y 450 px, el documento no tendrá desbordamiento horizontal.
- La cuadrícula de métricas permanecerá dentro de la tarjeta; en anchos extremos reducirá
  espaciado y tipografía antes de cambiar de estructura.
- La barra inferior respetará `env(safe-area-inset-bottom)`.
- En escritorio, el área principal y el panel lateral no excederán el ancho legible definido
  por los contenedores actuales del producto.

## 12. Pruebas

### 12.1 Base de datos

Una suite pgTAP para la migración 056 cubrirá:

1. inserción de dos o más ejercicios con órdenes consecutivos;
2. apéndice correcto cuando el día ya contiene ejercicios;
3. compactación estable de huecos antes de añadir el lote;
4. rollback total ante un ejercicio inválido o fallo forzado;
5. rechazo al superar 30 posiciones;
6. rechazo de JSON malformado, duplicados en el lote y rangos inválidos;
7. rechazo para otro entrenador, perfil inactivo y rol no autenticado;
8. dos llamadas concurrentes sin órdenes duplicados;
9. ACL, owner, `search_path` y reejecución segura de la migración.

El runner profesional aplicará la 056 después de las migraciones vigentes y la incluirá en el
contrato de reejecución.

### 12.2 Acciones y componentes

- La acción plural serializa exactamente la selección y no acepta `orderIndex`.
- Dos adiciones consecutivas al mismo día producen posiciones distintas.
- El fixture registra el `FormData` o payload recibido en vez de devolver siempre éxito.
- Un fallo conserva la selección y habilita reintento.
- El formulario descriptivo distingue `dirty`, `saving`, `saved` y `error`.
- Asignar y publicar advierten cuando existen cambios descriptivos pendientes.
- Reordenar revierte visualmente si falla.
- El día activo, las pestañas y el selector cumplen navegación por teclado y anuncios.
- Las pruebas responsive comprueban la ausencia de solapamientos y desbordamiento en móvil.

### 12.3 Verificación de repositorio

Antes de integrar se ejecutarán, según los scripts disponibles:

```text
pnpm test:db:trainers
pnpm test
pnpm type-check
pnpm lint
git diff --check
```

También habrá una comprobación manual o automatizada del flujo completo en escritorio y en un
viewport móvil: seleccionar tres ejercicios, agregarlos, editar uno, reordenar, recargar y
confirmar que persisten.

## 13. Despliegue

1. Aplicar la migración 056 en un entorno de prueba y ejecutar pgTAP.
2. Confirmar la RPC y sus permisos mediante el preflight profesional actualizado.
3. Desplegar la aplicación después de que la RPC esté disponible.
4. Ejecutar un smoke autenticado con un día existente y dos adiciones consecutivas.
5. Verificar agregar tres ejercicios, reordenar, recargar, asignar y publicar una revisión.
6. Observar errores agregados sin registrar nombres, notas ni datos personales.

Hacer commit o push del archivo SQL no demuestra que la migración haya llegado a producción.
La aplicación no debe desplegarse antes que la RPC, porque la nueva UI depende de ella.

## 14. Criterios de aceptación

El cambio estará listo cuando:

1. un entrenador pueda agregar varios ejercicios en una sola confirmación;
2. dos adiciones consecutivas no reutilicen `order_index`;
3. el lote sea atómico y el orden se calcule exclusivamente en el servidor;
4. la vista muestre un único día activo con navegación clara entre días;
5. móvil no presente métricas superpuestas ni desbordamiento horizontal;
6. los cambios estructurales se guarden inmediatamente y los descriptivos indiquen si están
   pendientes;
7. errores recuperables conserven el trabajo del entrenador y permitan reintentar;
8. asignar y publicar sigan siendo acciones independientes y confirmadas;
9. autorización y límites se validen tanto en la acción como en la base de datos;
10. pruebas de base de datos, componentes, accesibilidad, tipos y lint terminen en verde;
11. la migración 056 se verifique explícitamente en el entorno remoto antes del despliegue de
    la nueva UI.
