# Reestructuración visual del núcleo de entrenamiento

## Objetivo

Rediseñar el recorrido principal de Vekira —dashboard, vista del plan y sesión
activa— como una experiencia continua de rendimiento premium. Las tres pantallas
deben compartir jerarquía, lenguaje visual y comportamiento, pero adaptar su
densidad a la tarea de cada momento:

- el dashboard debe responder qué ocurrió, qué toca hoy y qué viene después;
- el plan debe explicar la estrategia semanal antes de ofrecer edición;
- la sesión debe permitir registrar una serie con una mano y con el mínimo de
  decisiones simultáneas.

La dirección aprobada es **Línea del atleta**: la interfaz organiza el producto
alrededor del tiempo y muestra la progresión como una secuencia de pasado,
presente y siguiente acción.

## Problemas actuales

La implementación existente tiene toda la información necesaria, pero la
presenta como una sucesión de tarjetas con peso visual similar. Esto provoca:

- jerarquía débil entre la acción principal y la información secundaria;
- exceso de superficie violeta sin un significado de estado consistente;
- avisos que desplazan el entrenamiento de hoy;
- una vista del plan donde administrar puede competir con comprender;
- una sesión activa que muestra demasiadas series y acciones al mismo tiempo;
- aprovechamiento limitado del espacio disponible en escritorio;
- transiciones funcionales, pero con poca continuidad entre pantallas.

## Alcance

El rediseño incluye:

- composición responsive del dashboard;
- composición responsive de la vista del plan activo;
- estados previo, activo, descanso y finalización de la sesión;
- jerarquía, tipografía, color, espaciado, profundidad y movimiento;
- divulgación progresiva de avisos y acciones secundarias;
- adaptación de los componentes existentes sin cambiar las reglas del producto;
- español e inglés, navegación por teclado, lector de pantalla y movimiento
  reducido.

No se incluyen:

- un nuevo puntaje numérico de preparación o recuperación;
- migraciones, tablas o datos nuevos en Supabase;
- cambios al motor de planes, reglas de acceso o persistencia de sesiones;
- rediseño completo de progreso, comunidad, ajustes, autenticación o marketing;
- gamificación, recompensas o métricas que el producto no pueda justificar con
  datos existentes.

## Referencias y criterio propio

La propuesta usa principios observados en productos profesionales, sin copiar
su identidad:

- [Hevy](https://www.hevyapp.com/features/): registro de entrenamiento directo,
  valores anteriores visibles y progreso accesible;
- [WHOOP](https://www.whoop.com/gb/en/recovery/): síntesis de datos complejos en
  una recomendación diaria accionable;
- [Strava](https://support.strava.com/en-us/articles/15402077-training-log):
  continuidad semanal y lectura temporal de la actividad;
- [Apple Fitness](https://support.apple.com/en-euro/guide/iphone/iph4c34a8a95/ios):
  resúmenes jerárquicos y métricas configurables.

La identidad propia de Vekira será la secuencia **plan basado en evidencia →
entrenamiento guiado → progreso verificable**, representada por una línea
temporal que continúa entre las tres pantallas.

## Sistema visual compartido

### Color

El fondo seguirá siendo oscuro y mate. Se reducirá el uso de gradientes grandes
y brillo ambiental para que los acentos comuniquen estado:

- fondo principal: negro azulado cercano a `#07080B`;
- superficies: `#101116` y `#15171D`;
- violeta Vekira `#8B5CF6`: identidad, selección y elemento activo;
- lima `#BEF264`: acción física inmediata, como iniciar o completar una serie;
- verde `#4ADE80`: trabajo completado y persistencia correcta;
- naranja `#FB923C`: esfuerzo, advertencia o atención;
- blanco suave y gris frío: contenido y metadatos.

El lima no sustituye al violeta como color de marca. Se reserva para una sola
acción primaria por viewport. El verde y el naranja nunca se usarán como
decoración.

### Tipografía

Se conservarán las fuentes actuales:

- Barlow Condensed para títulos, cifras de rendimiento y estados;
- Plus Jakarta Sans para contenido, controles y ayudas.

Las cifras principales usarán numerales tabulares cuando cambien durante la
sesión. Los rótulos en mayúsculas tendrán tamaño mínimo legible y no contendrán
información exclusiva que desaparezca a tamaños pequeños.

### Forma y profundidad

- radio de 12 px para controles, 16–18 px para superficies y 22–24 px para
  contenedores protagonistas;
- bordes de baja intensidad para separar superficies;
- sombra solo en el elemento activo o flotante;
- degradados radiales discretos únicamente en el entrenamiento actual;
- sin glassmorphism generalizado ni auroras permanentes.

### Movimiento y respuesta

- presión de botones: 120–160 ms;
- expansión o cambio de selección: 200–240 ms;
- avance de líneas y barras: hasta 300 ms;
- confirmación de serie: escala breve, cambio de color y háptica existente;
- transición a descanso: el CTA inferior se transforma en temporizador, sin
  abrir una capa desconectada del contexto;
- ningún movimiento decorativo infinito;
- `prefers-reduced-motion` elimina desplazamientos y escalas, pero conserva los
  cambios de estado.

## Arquitectura de experiencia

### 1. Dashboard: la semana como historia

#### Composición móvil

El encabezado será compacto: avatar, fecha, saludo y un acceso a avisos. Las
promociones o notas informativas no ocuparán espacio antes de la acción de hoy.
Los avisos se priorizarán así:

1. ausencia de plan o bloqueo que impida entrenar: estado principal visible;
2. check-in, recuperación pendiente o ajuste accionable: aviso compacto antes de
   la cronología;
3. promoción o información no urgente: centro de avisos del encabezado.

Después aparecerá un resumen semanal con sesiones completadas, sesiones
programadas y volumen existente. Una línea de progreso conecta la cabecera con
la cronología.

La cronología mostrará:

- la sesión completada más reciente como fila compacta;
- descansos como filas atenuadas;
- el entrenamiento de hoy expandido, con nombre, enfoque, cantidad de
  ejercicios, duración y CTA;
- la siguiente sesión como fila compacta;
- una recomendación contextual después de la secuencia.

No se inventará un puntaje de preparación. Se usarán únicamente `weekly`,
`today`, volumen, racha, sesión más reciente, recomendación y estados ya
producidos por `dashboardViewModel`.

Las métricas secundarias seguirán disponibles debajo del primer recorrido. Sin
sesiones completadas mostrarán un único estado de inicio; con datos mostrarán
racha, volumen, marca personal y ajustes activos mediante una cuadrícula breve.

#### Escritorio

A partir del breakpoint de escritorio, el dashboard usará dos columnas dentro
de un máximo aproximado de 1152 px:

- columna principal: resumen y cronología semanal;
- columna lateral fija dentro del viewport: entrenamiento actual,
  recomendación y métricas clave.

La interfaz no será una columna móvil ampliada. El orden semántico conservará el
entrenamiento actual antes de la información secundaria.

#### Componentes

`DashboardHeader`, `DashboardNotice`, `TodayActionCard`, `WeeklyStatus`,
`NextRecommendation` y `SecondaryMetrics` conservarán sus responsabilidades de
datos y accesibilidad, pero se recompondrán alrededor de dos límites nuevos:

- `DashboardWeekTimeline`: secuencia temporal y estados de cada día;
- `DashboardPerformanceSummary`: sesiones, volumen y métricas secundarias.

La transformación de datos seguirá centralizada en `dashboardViewModel`; los
componentes no reconstruirán reglas de programación.

### 2. Plan: mapa semanal antes que editor

#### Composición móvil

La parte superior mostrará un selector de plan compacto seguido por tres datos:
frecuencia, duración aproximada y nivel. Las restricciones aplicadas se
resumirán en una línea expandible.

El mapa semanal reutilizará el lenguaje del dashboard:

- hoy se expande;
- sesiones completadas y descansos se comprimen;
- sesiones futuras muestran nombre, enfoque, ejercicios y duración;
- seleccionar una sesión abre su detalle en un panel inferior;
- el panel ofrece entrar al entrenamiento cuando las reglas actuales lo
  permitan.

La distribución semanal por grupo muscular se derivará de las series prescritas
y las etiquetas musculares existentes. Cada grupo recibirá las series de los
ejercicios que lo incluyan; por eso se presentará como cobertura relativa y no
como un total único de series. Será un resumen colapsable y no requerirá
persistencia nueva.

Las acciones principales serán `Cambiar plan` y `Ajustar plan`. Compartir,
regenerar, borrar y editar estructura vivirán en el menú contextual del plan.

#### Modo de edición

La edición será un estado explícito, no un conjunto de formularios abiertos en
la vista de lectura. Al entrar:

- la sesión seleccionada ocupará una vista completa en móvil;
- los ejercicios mostrarán orden, prescripción y acción de edición;
- reordenar, reemplazar, eliminar y añadir conservarán las acciones existentes;
- cambios no guardados tendrán salida confirmada;
- guardar devolverá al mapa semanal y conservará la sesión seleccionada.

En escritorio, el mapa ocupará la columna izquierda y el detalle o editor la
derecha. En móvil, lectura detallada usa panel inferior y edición usa pantalla
completa para evitar formularios comprimidos.

#### Componentes

`PlanSwitcher`, `WeeklyPlanSummary`, `PlanDayTimeline`,
`WorkoutExerciseList`, `WorkoutExerciseManager`, `PlanAdjustButton` y
`PlanRegenerateButton` seguirán siendo las piezas funcionales. La composición
se dividirá en:

- `PlanOverview`: metadatos, compatibilidad y selector;
- `PlanWeekMap`: cronología y selección de día;
- `PlanWorkoutDetail`: detalle de lectura;
- `PlanEditMode`: operaciones de edición existentes;
- `PlanDistribution`: resumen derivado de volumen por grupo.

No se moverán reglas del servidor a componentes cliente.

### 3. Sesión: modo concentración

#### Encabezado persistente

Mostrará nombre de la sesión, tiempo transcurrido, series completadas, progreso,
estado de guardado, volver y finalizar. `Finalizar` tendrá menor jerarquía que
`Completar serie` y mantendrá la confirmación existente cuando haya progreso.

#### Ejercicio y serie activos

Solo el ejercicio activo se expandirá. Su encabezado mostrará imagen, músculos,
objetivo, RPE y menú contextual. La actuación principal se organizará así:

- serie anterior: compacta y editable al tocarla;
- serie actual: peso, repeticiones o duración, RPE y controles grandes;
- serie siguiente: vista previa compacta;
- CTA fijo: `Completar serie N`.

Los botones de incremento usarán el mismo paso permitido por los campos
actuales. La entrada numérica directa seguirá disponible. RPE continuará siendo
opcional cuando las reglas actuales lo permitan.

Al completar una serie:

1. se actualiza primero el estado local de `sessionStore`;
2. aparece confirmación visual y háptica;
3. el CTA se transforma en el temporizador de descanso;
4. el usuario puede saltar el descanso o añadir tiempo;
5. al terminar, se expande la siguiente serie o el siguiente ejercicio.

La interacción no dependerá de animaciones para comunicar éxito. Texto, icono y
color reflejarán el estado.

#### Acciones secundarias

El menú del ejercicio contendrá ver técnica, cambiar solo por hoy, saltar con
motivo y eliminar cuando sea un ejercicio añadido. `Añadir ejercicio solo hoy`
aparecerá al final de la lista. Todas las acciones existentes seguirán
disponibles, pero fuera del flujo primario de registro.

`ExerciseCard` se separará visualmente en:

- `SessionExerciseHeader`;
- `ActiveSetFocus`;
- `CompactSetSummary`;
- `SessionExerciseMenu`;
- `CompleteSetDock`.

El estado y las mutaciones seguirán perteneciendo a `sessionStore`; los nuevos
componentes recibirán valores y callbacks tipados.

## Flujo de datos y compatibilidad

No habrá cambios de esquema ni contratos persistidos. El rediseño consumirá:

- el `DashboardViewModel` actual y nuevas propiedades puramente derivadas;
- datos ya consultados por la página del plan;
- el estado y las acciones actuales de `sessionStore`;
- `PendingLink`, estados de carga, sincronización, temporizador y háptica
  existentes.

Los datos derivados de presentación —porcentaje semanal, distribución muscular
y posición temporal— se calcularán en funciones puras y se probarán sin acceder
al DOM.

## Estados y errores

### Dashboard

- sin plan: estado principal con CTA de generación;
- descanso: hoy sigue ocupando la posición temporal, sin CTA de sesión;
- completado: la sesión de hoy cambia a estado confirmado y señala la próxima;
- recuperable: aparece como acción contextual, sin alterar reglas de acceso;
- carga o error: se reutilizan `ScreenState` y avisos anunciables.

### Plan

- sin plan activo: selector y generación como acción dominante;
- plan sin sesiones: mensaje explícito y acciones de reparación;
- sesión no disponible: detalle legible con CTA deshabilitado y explicación;
- error al editar: los datos introducidos permanecen y el error se anuncia;
- cambio de plan con edición pendiente: confirmación antes de descartar.

### Sesión

- sin conexión: el encabezado indica guardado local;
- sincronización fallida: acceso a reintento sin bloquear el registro;
- descanso activo: temporizador persistente y recuperable;
- salida con progreso: confirmación existente;
- error final al guardar: conservar backup y ofrecer reintento;
- movimiento reducido: estados instantáneos sin perder confirmaciones.

## Accesibilidad

- objetivos táctiles mínimos de 44 × 44 px;
- contraste WCAG AA para texto, controles y estados;
- no depender solo del color para completado, activo, descanso o error;
- encabezados y regiones en orden lógico incluso en la composición de dos
  columnas;
- mensajes de progreso, descanso y sincronización mediante regiones vivas
  moderadas;
- campos numéricos con etiquetas persistentes y teclado adecuado;
- foco visible y restaurado al cerrar paneles o menús;
- controles secundarios accesibles sin requerir gestos;
- `prefers-reduced-motion` respetado en todas las transiciones nuevas.

## Pruebas

### Unitarias y de componentes

- derivación y orden de la cronología del dashboard;
- prioridad de avisos y estados de hoy;
- distribución semanal del plan a partir de ejercicios y series;
- selección de día y entrada/salida del modo de edición;
- determinación de serie anterior, actual y siguiente;
- transformación del CTA entre completar serie y descanso;
- localización de todos los textos nuevos;
- contratos de `sessionStore` sin regresiones.

### Integración y E2E

- dashboard → plan → sesión sin perder el contexto del día;
- inicio de sesión desde dashboard y plan;
- registro y corrección de una serie;
- temporizador, siguiente serie, salto y reemplazo;
- guardado offline, reintento y finalización;
- navegación con teclado y auditoría de accesibilidad;
- estados sin plan, descanso, completado y sesión recuperable.

### Verificación visual

Se revisarán al menos estos viewports:

- 360 × 800;
- 390 × 844;
- 768 × 1024;
- 1280 × 800.

La verificación debe comprobar que el CTA principal permanece visible o
alcanzable, que no hay contenido horizontal cortado y que las composiciones de
escritorio usan dos columnas reales.

## Criterios de aceptación

1. Las tres pantallas comparten Línea del atleta, semántica de color y
   transiciones.
2. El dashboard muestra el entrenamiento de hoy sin que promociones no urgentes
   lo desplacen.
3. El dashboard no presenta métricas inventadas ni un puntaje de preparación
   sin respaldo.
4. En escritorio, dashboard y plan usan una composición de dos columnas.
5. El plan permite comprender frecuencia, duración, nivel, compatibilidad y
   distribución semanal antes de entrar a edición.
6. Todas las operaciones actuales de plan permanecen disponibles mediante
   divulgación progresiva.
7. La sesión permite registrar y completar la serie actual con una mano y sin
   recorrer acciones secundarias.
8. Series anteriores y siguientes siguen visibles y editables.
9. Completar una serie conecta confirmación, háptica, descanso y siguiente serie
   en un único flujo.
10. Los estados de guardado, error y salida segura conservan su comportamiento.
11. Textos, foco, contraste, objetivos táctiles y movimiento reducido cumplen
    los requisitos definidos.
12. No se requieren migraciones ni cambios a las reglas del motor de planes.
