# Expansión visual del sistema de evidencia de entrenamiento

## Objetivo

Extender la dirección visual **Línea del atleta**, ya aplicada al dashboard, al
plan y a la sesión activa, hacia las vistas donde el usuario revisa lo que ya
ocurrió y entiende su evolución:

- Calendario (`/calendario`);
- Progreso (`/progress`);
- Historial (`/history`);
- detalle de sesión completada (`/history/[logId]`);
- detalle de ejercicio (`/exercises/[exerciseId]`).

Estas vistas deben sentirse como partes consecutivas de un único sistema de
evidencia: **entrenar → registrar → entender → ajustar**. Cada pantalla tendrá
una evidencia dominante, una interpretación breve basada en datos reales y una
acción siguiente clara.

## Contexto y problemas actuales

La implementación actual contiene sesiones, volumen, series, rachas, marcas,
medidas, progresión por ejercicio e instrucciones suficientes para construir
una lectura útil. Sin embargo, predominan las cuadrículas de tarjetas con pesos
similares y recorridos verticales largos. Esto provoca:

- poca diferencia entre la señal principal y los metadatos;
- repetición de métricas entre Progreso, Historial y detalle de ejercicio;
- un Calendario dividido entre resumen, mapa anual y mes sin una selección
  temporal que conecte los tres;
- sesiones históricas que se leen como registros técnicos, no como resultados;
- fichas de ejercicio extensas donde técnica, evolución e historial compiten;
- controles y celdas pequeñas en algunos estados móviles;
- enlaces rápidos presentados como tarjetas grandes que desplazan la evidencia;
- efectos interactivos funcionales, pero sin continuidad entre vistas.

## Dirección aprobada

Se adopta el enfoque **Sistema continuo de evidencia**. No será un reskin
superficial ni un dashboard analítico denso. Las cinco vistas compartirán esta
secuencia:

1. **Identidad:** nombre, fecha o periodo y contexto breve.
2. **Evidencia principal:** calendario, tendencia o secuencia de ejercicios.
3. **Lectura útil:** interpretación derivada exclusivamente de datos reales.
4. **Siguiente acción:** abrir una sesión, revisar un ejercicio, cambiar periodo
   o continuar explorando.

La experiencia priorizará rendimiento de entrenamiento —frecuencia, volumen,
fuerza y marcas personales— y tratará las medidas corporales como contexto
secundario.

## Alcance

El rediseño incluye:

- nueva jerarquía responsive de las cinco rutas;
- composición de escritorio con dos columnas cuando exista detalle contextual;
- navegación temporal, selección y divulgación progresiva;
- reorganización de métricas existentes;
- estados de hover, foco, selección, expansión y cambio de periodo;
- estados vacíos, carga, error y datos insuficientes;
- funciones puras o adaptadores para cálculos compartidos;
- español e inglés para todo texto nuevo;
- teclado, lector de pantalla, contraste y movimiento reducido;
- pruebas unitarias, de componentes y verificación visual responsive.

## Fuera de alcance

No se incluyen:

- migraciones, tablas o columnas nuevas;
- cambios al motor de planes, reglas de entrenamiento o persistencia;
- nuevos puntajes de preparación, recuperación o calidad;
- recomendaciones automáticas sin una regla existente que las produzca;
- edición o eliminación de sesiones históricas si no forma parte del flujo
  actual;
- planificación de entrenamientos futuros desde Calendario;
- fotografías de progreso o nuevas visualizaciones anatómicas;
- rediseño de Medidas, Comunidad, Ajustes, autenticación o marketing;
- reproducción exacta de la identidad visual de otra aplicación.

## Referencias y criterio propio

La solución adopta patrones comprobados, no interfaces copiadas:

- [Hevy Calendar](https://help.hevyapp.com/hc/en-us/articles/35380117933207-Track-Your-Workout-Consistency-with-the-Calendar-and-Streak-Features):
  lectura inmediata de consistencia y acceso del día a la sesión;
- [Hevy Gym Progress](https://www.hevyapp.com/features/gym-progress/):
  progresión por ejercicio, marcas, volumen e historial conectado;
- [Hevy Workout Summary](https://www.hevyapp.com/features/track-workouts/):
  síntesis posterior al entrenamiento y jerarquía de logros;
- [Strava Training Log](https://support.strava.com/en-us/articles/15402077-training-log):
  actividad temporal, periodos y estadísticas relevantes por selección;
- [Strava Activity History](https://support.strava.com/en-us/articles/15402014-viewing-your-activity-history-on-strava):
  búsqueda y filtrado de actividades anteriores.

La identidad propia de Vekira será conectar esas evidencias mediante la misma
línea temporal del núcleo de entrenamiento y convertir cada vista en una
respuesta concreta, no en un contenedor de métricas.

## Sistema visual compartido

### Color y superficies

Se conserva el sistema aprobado para el núcleo:

- fondo oscuro mate y superficies de bajo contraste;
- violeta para identidad, navegación, selección y rango activo;
- lima para una acción física inmediata cuando exista;
- verde para resultados completados y persistencia correcta;
- naranja para advertencias, series omitidas o esfuerzo elevado;
- blanco suave y gris frío para contenido y metadatos.

Las superficies amplias, divisores y cambios tonales reemplazarán la repetición
de tarjetas equivalentes. Los colores de estado no se usarán como decoración y
ningún significado dependerá solo del color.

### Tipografía y densidad

- Barlow Condensed continuará en títulos, periodos y cifras protagonistas;
- Plus Jakarta Sans continuará en contenido, filtros y explicaciones;
- numerales tabulares para métricas y series;
- tres métricas en Calendario, Progreso e Historial; la ficha de ejercicio podrá
  mostrar cuatro en una franja compacta o cuadrícula 2 × 2;
- etiquetas secundarias siempre legibles, sin texto diminuto en el heatmap;
- ancho aproximado máximo de 1152 px en las vistas con dos columnas.

### Movimiento e interacción

- presión o hover: 120–160 ms;
- selección, expansión o cambio de rango: 160–220 ms;
- transición de trazados y barras: hasta 300 ms;
- sin animaciones decorativas infinitas;
- `prefers-reduced-motion` conserva los cambios de estado sin desplazamientos o
  escalas.

La selección de fecha actualizará el detalle asociado; los puntos de una
gráfica revelarán periodo y valor; las filas responderán a hover y foco; y las
tablas largas usarán divulgación progresiva cuando ayude a escanear.

## Arquitectura de experiencia

### 1. Calendario: navegador temporal

#### Composición

El encabezado mostrará mes y año, controles anterior/siguiente y la acción
`Hoy`. Debajo aparecerá una franja de tres métricas derivadas:

- días entrenados en el periodo visible;
- continuidad semanal actual;
- frecuencia media de sesiones por semana.

Los días y la frecuencia se calcularán para el mes visible. La continuidad se
etiquetará como racha actual y permanecerá vinculada a la fecha presente, para
que navegar a un mes anterior no cambie retroactivamente su significado.

El calendario mensual será la evidencia dominante. En escritorio ocupará la
columna principal y convivirá con un panel de día seleccionado. En móvil, el
panel aparecerá inmediatamente después del mes.

El panel mostrará todas las sesiones del día, no solo la primera, con nombre o
rutina disponible, duración, series, volumen y una acción explícita para abrir
el detalle. Seleccionar una fecha no navegará automáticamente.

El resumen anual quedará debajo como contexto secundario. Mostrará continuidad
por semanas o meses y evitará convertir cada marca diminuta en un botón. La
interacción diaria pertenece al calendario mensual, donde puede cumplirse el
objetivo táctil mínimo.

#### Estados

- hoy: anillo o marcador violeta con etiqueta accesible;
- día entrenado: intensidad derivada de volumen, acompañada por texto accesible;
- día seleccionado: superficie violeta y estado `aria-selected`;
- varias sesiones: indicador numérico y lista completa en el panel;
- sin sesiones ese día: mensaje breve sin falso estado de error;
- calendario vacío: explicación y CTA hacia el plan o entrenamiento disponible;
- datos parciales: las métricas que no puedan calcularse mostrarán ausencia
  explícita, nunca cero engañoso.

### 2. Progreso: evidencia acumulada

#### Composición

Un hero editorial definirá el periodo y ofrecerá rangos de 4, 12 y 24 semanas.
La gráfica principal mostrará volumen semanal. La frecuencia se representará
como cantidad de sesiones directamente etiquetada en cada semana, sin un
segundo eje vertical ni otra gráfica competidora.

La franja principal contendrá:

- variación de volumen frente al periodo inmediatamente anterior equivalente;
- frecuencia media de sesiones por semana;
- cantidad de marcas personales del periodo.

Si el periodo anterior no tiene datos suficientes, la variación se mostrará
como `Sin comparación`, no como 0 %.

Después aparecerán bloques asimétricos para consistencia semanal, ejercicios
con mayor progreso y marcas recientes. Las medidas corporales ocuparán una
sección posterior de menor contraste con acceso a su vista completa.

Historial, Calendario y Medidas pasarán de ser tarjetas dominantes a enlaces de
exploración compactos. La progresión detallada de un ejercicio no se duplicará:
Progreso señalará movimientos destacados y enlazará a sus fichas.

#### Interacción

Cambiar el rango actualizará gráfica, métricas y lecturas como una sola unidad.
Seleccionar un punto revelará semana, volumen y número de sesiones. Seleccionar
un ejercicio destacado abrirá su ficha. Las transiciones interpolarán las
marcas cuando el movimiento esté permitido.

#### Lectura útil

Las frases derivadas usarán reglas deterministas y neutrales, por ejemplo:

- volumen mayor, menor o estable frente al periodo anterior;
- frecuencia mayor, menor o estable;
- ejercicio con mayor cambio medible;
- aparición de marcas personales.

Un ejercicio solo podrá considerarse destacado si tiene al menos dos puntos
válidos en el periodo. El cambio se calculará sobre la métrica primaria que ya
soporta `ExerciseProgressionSection` y se comparará como porcentaje dentro del
mismo ejercicio; no se compararán kilogramos absolutos entre movimientos.

No se usarán etiquetas subjetivas como `excelente`, `mala recuperación` o
`listo para subir carga` sin respaldo de una regla existente.

### 3. Historial: cronología de resultados

#### Composición

El encabezado resumirá sesiones, volumen acumulado y marcas personales. La
evidencia principal será una cronología de sesiones agrupadas por semana o mes.

Cada fila mostrará:

- nombre de rutina o sesión;
- fecha y hora cuando estén disponibles;
- duración, series y volumen;
- una única señal destacada según prioridad: marca personal, diferencia de
  volumen comparable o RPE registrado.

La diferencia de volumen solo será comparable con la sesión completada anterior
del mismo `workout_id`. Las sesiones improvisadas o sin identificador estable no
recibirán esa señal.

Los récords actuales se integrarán en un bloque secundario `Hitos recientes`.
En escritorio acompañará la cronología; en móvil aparecerá después del primer
grupo de sesiones sin interrumpir el escaneo.

Búsqueda y filtros vivirán en una barra compacta. Al expandirse conservarán los
criterios existentes y actualizarán la cronología sin saltos de layout. Si no
hay resultados, se distinguirá entre historial vacío y filtros sin coincidencia.

#### Interacción

La fila completa será un enlace accesible al detalle. Hover y foco revelarán la
acción sin ocultar información esencial. Los grupos temporales usarán
encabezados semánticos y no dependerán de una línea puramente decorativa.

### 4. Detalle de sesión: debrief de entrenamiento

#### Composición

El encabezado mostrará nombre, fecha, enfoque muscular y compartir como acción
secundaria. La franja principal contendrá duración, series completadas y
volumen.

Marcas personales, RPE/mood y series omitidas se presentarán en un bloque de
resultado solo cuando existan. El bloque no reservará espacio vacío.

Los ejercicios formarán una secuencia numerada. Cada resumen mostrará siempre:

- nombre y grupos musculares disponibles;
- cantidad de series completadas;
- mejor serie;
- volumen;
- comparación con la aparición anterior del mismo ejercicio cuando exista.

La tabla completa de series podrá expandirse por ejercicio. En móvil se usará
divulgación progresiva para evitar una página interminable; en escritorio se
podrán mantener abiertos los ejercicios seleccionados sin convertir cada uno en
una tarjeta protagonista.

Cada ejercicio enlazará a su ficha. En escritorio, la secuencia ocupará la
columna principal y el resultado/contexto la columna lateral.

#### Reglas de lectura

La comparación anterior debe usar la misma definición de carga, repeticiones y
volumen que las demás vistas. Una pista sobre la próxima sesión solo aparecerá
si el plan o una regla de progresión existente ya la produce. Si no existe, se
mostrará contexto histórico sin prescripción.

### 5. Detalle de ejercicio: pasaporte del movimiento

#### Composición

Un hero compacto combinará imagen, nombre, músculos, equipo y acceso a técnica.
La imagen conservará el zoom actual.

La franja principal mostrará hasta cuatro datos, reordenados responsive:

- mejor carga registrada;
- número de sesiones;
- volumen de la aparición más reciente;
- RPE medio de la aparición más reciente cuando exista.

La evidencia principal será una gráfica de evolución con selector temporal. La
serie representada conservará la métrica ya soportada por los datos del
ejercicio; no se introducirá 1RM estimado sin una definición existente y
probada.

Junto a la gráfica se mostrarán una lectura breve, el último estímulo y la mejor
serie. Descripción, músculos, equipo e instrucciones vivirán en un bloque
editorial diferenciado. Las instrucciones largas podrán contraerse en móvil sin
ocultar su existencia.

El historial de las últimas apariciones seguirá disponible y enlazará a cada
sesión completa. Progreso mostrará la visión transversal; esta ficha se
concentrará exclusivamente en el movimiento seleccionado.

## Componentes y responsabilidades

Se crearán o adaptarán piezas orientadas a significado, no a rutas concretas:

- `EvidenceHeader`: identidad, periodo y acción contextual;
- `MetricStrip`: dos a cuatro métricas responsive sin tarjetas individuales;
- `EvidenceInsight`: lectura principal con procedencia de datos explícita;
- `SessionSummaryRow`: resumen compartido por Calendario e Historial;
- `AchievementMarker`: marca, esfuerzo o advertencia con icono y texto;
- `TimelineGroup`: agrupación temporal semántica;
- `PeriodSelector`: rangos accesibles y estado activo;
- `ProgressChartFrame`: ejes, selección, tooltip y estados vacíos consistentes;
- `DisclosureSection`: expansión accesible para series o instrucciones.

No todos deben convertirse en componentes universales desde el primer cambio.
Solo se extraerán cuando dos vistas compartan estructura, semántica y pruebas.
Los componentes de dominio actuales —como `ContributionHeatmap`, `MonthGrid`,
`HistorySessionList`, `ExerciseProgressionSection` y los gráficos existentes—
podrán adaptarse o dividirse manteniendo sus responsabilidades funcionales.

## Flujo de datos

### Principios

- Las páginas de servidor continúan siendo responsables de autenticación,
  consultas y datos iniciales.
- Si una composición requiere una columna existente que la consulta actual no
  carga, se ampliará únicamente el `select`; no cambiará el esquema.
- Las métricas derivadas se calculan en funciones puras o adaptadores de vista.
- Los componentes cliente controlan únicamente selección, rango, filtro,
  expansión y presentación.
- No se añaden solicitudes al seleccionar fechas si las sesiones necesarias ya
  forman parte del rango cargado.
- Los mismos cálculos de volumen, frecuencia y tendencia se reutilizan en
  Progreso, Historial y detalle de ejercicio.

### Calendario e Historial

Los logs agregados se normalizarán a una representación de sesión compartida.
Calendario agrupará por fecha local; Historial agrupará por semana o mes. Un día
puede contener cero, una o varias sesiones. Los enlaces conservarán el `logId`
real de cada sesión.

### Progreso

Las sesiones se agruparán en semanas según el locale y la convención ya usada
por el producto. Para cada rango se derivarán volumen, sesiones, frecuencia y
marcas. La comparación usará un periodo anterior de igual duración y requerirá
datos válidos en ambos lados.

### Detalle de sesión y ejercicio

Las series se transformarán una vez en resúmenes por ejercicio: completadas,
mejor serie, volumen y RPE. La comparación histórica localizará la aparición
anterior del mismo ejercicio sin mezclar variantes o identificadores distintos.
La ficha de ejercicio reutilizará esta definición para su último estímulo y
cronología.

El volumen y la mejor serie conservarán las funciones de dominio existentes. El
volumen solo se mostrará para modalidades compatibles; tiempo, distancia u
otras modalidades no se convertirán artificialmente a kilogramos.

## Estados vacíos y errores

### Estados vacíos

- Calendario sin sesiones: explicación de qué aparecerá tras entrenar y acceso
  al recorrido disponible;
- día sin actividad: descanso o ausencia de registro, sin valoración negativa;
- Progreso sin rango comparable: tendencia actual y `Sin comparación`;
- Historial vacío: CTA hacia el plan o sesión disponible;
- filtros sin resultados: limpiar filtros sin confundirlo con historial vacío;
- ejercicio sin logs: técnica e instrucciones permanecen visibles y la gráfica
  explica qué datos necesita;
- sesión sin RPE, mood o marcas: omitir esos módulos, no mostrar guiones masivos.

### Errores y carga

- conservar `ScreenState` y los esqueletos existentes donde sean adecuados;
- anunciar errores de consulta con texto y región accesible;
- no borrar contenido previo al cambiar un filtro o periodo si falla una carga;
- ofrecer reintento para errores recuperables;
- mantener enlaces a sesión o ejercicio deshabilitados con explicación cuando
  falte un identificador válido;
- evitar que una gráfica con datos inválidos rompa el resto de la página.

## Responsive y accesibilidad

- objetivos táctiles mínimos de 44 × 44 px;
- foco visible y restaurado tras cerrar divulgaciones;
- orden semántico equivalente al orden visual;
- `aria-selected` para fechas y periodos seleccionados;
- `aria-expanded` para series e instrucciones;
- nombres accesibles con fecha y estado para cada día interactivo;
- gráficos con resumen textual, ejes etiquetados y detalle accesible del punto;
- tablas con encabezados semánticos y desplazamiento contenido solo cuando sea
  inevitable;
- contraste WCAG AA para texto, controles y estados;
- icono o texto además del color para selección, logro, advertencia y descanso;
- sin información esencial exclusiva de hover;
- comportamiento completo con `prefers-reduced-motion`.

Se verificarán como mínimo 360 × 800, 390 × 844, 768 × 1024 y 1280 × 800.

## Pruebas

### Unitarias

- agrupación de sesiones por fecha, semana y mes;
- varias sesiones en un mismo día;
- continuidad y frecuencia semanal;
- comparación entre periodos equivalentes;
- ausencia de comparación con datos insuficientes;
- prioridad de señal en una fila de Historial;
- mejor serie, volumen y comparación anterior por ejercicio;
- frases neutrales de lectura útil;
- locale y límites de fecha.

### Componentes

- selección de día y actualización del panel;
- navegación mensual y retorno a hoy;
- cambio de rango sincronizado con métricas y gráfica;
- filtros de Historial y estado sin coincidencias;
- expansión de series por ejercicio;
- expansión de instrucciones;
- navegación desde sesión resumida a detalle y desde ejercicio a su ficha;
- estados de foco, teclado y movimiento reducido.

### Integración y visual

- Calendario → sesión completada → ejercicio → sesión original;
- Progreso → ejercicio destacado → ficha;
- Historial → sesión → ejercicio;
- consistencia de volumen y mejores series entre rutas;
- estados vacío, parcial, error y datos completos;
- ausencia de overflow horizontal y solapamiento en los viewports definidos;
- dos columnas reales en escritorio y orden vertical correcto en móvil;
- auditoría de contraste, nombres accesibles y objetivos táctiles.

## Criterios de aceptación

1. Las cinco vistas comparten la secuencia identidad → evidencia → lectura →
   acción y el sistema visual de Línea del atleta.
2. Calendario prioriza el mes, permite seleccionar una fecha sin navegar y
   muestra todas las sesiones de ese día.
3. El resumen anual es contexto secundario y no usa controles diarios demasiado
   pequeños.
4. Progreso prioriza volumen, frecuencia, fuerza y marcas; las medidas
   corporales quedan como contexto secundario.
5. Cambiar 4, 12 o 24 semanas actualiza gráfica, métricas y lectura de forma
   coherente.
6. Ninguna comparación se presenta cuando faltan datos equivalentes.
7. Historial agrupa sesiones temporalmente, conserva búsqueda/filtros y destaca
   una sola señal verificable por fila.
8. El detalle de sesión muestra resultado antes de metadatos y permite revisar
   todas las series mediante divulgación progresiva.
9. Cada ejercicio de una sesión enlaza a una ficha que conserva técnica,
   evolución e historial.
10. El detalle de ejercicio no introduce métricas estimadas sin definición
    existente y no duplica toda la vista de Progreso.
11. Volumen, frecuencia, mejor serie y comparaciones usan la misma definición en
    todas las rutas.
12. Estados vacíos, parciales y de error mantienen la jerarquía y ofrecen una
    salida útil.
13. Textos nuevos están localizados; teclado, foco, contraste, lector de pantalla
    y movimiento reducido cumplen los requisitos definidos.
14. No se requieren migraciones ni cambios a reglas del motor de entrenamiento.
