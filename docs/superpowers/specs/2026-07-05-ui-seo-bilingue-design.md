# Rediseño integral de UI y estrategia SEO bilingüe para Vekira

**Fecha:** 5 de julio de 2026
**Estado:** Diseño aprobado
**Mercado prioritario:** Latinoamérica
**Idiomas:** Español latinoamericano e inglés

## 1. Objetivo

Transformar Vekira en un producto visualmente coherente, accesible y orientado a móvil, y construir una base SEO bilingüe que permita adquirir usuarios orgánicamente sin depender de la futura integración de pagos.

El proyecto conservará las capacidades actuales de planificación, entrenamiento guiado, progresión, coach, comunidad y seguimiento. El trabajo reorganizará estas capacidades para que cada pantalla tenga una acción principal clara y para que el valor técnico del producto sea entendible desde las páginas públicas.

## 2. Alcance

### Incluido

- Sistema visual y tokens compartidos.
- Navegación móvil y de escritorio.
- Landing, registro y onboarding.
- Dashboard, sesión activa, plan, progreso y biblioteca.
- Comunidad, perfiles, notificaciones y ajustes.
- Accesibilidad WCAG AA.
- Internacionalización por rutas.
- Páginas comerciales y editoriales en español e inglés.
- Biblioteca pública de ejercicios.
- Metadatos, sitemap, robots, canonical, `hreflang` y datos estructurados.
- Instrumentación para medir conversión UI y rendimiento SEO.
- Pruebas funcionales, visuales, SEO y de accesibilidad.

### Fuera de alcance

- Integración con Stripe u otro procesador de pagos.
- Checkout, facturación, reembolsos y gestión automática de suscripciones.
- Rebranding completo o sustitución del nombre Vekira.
- Migración a otro framework.
- Incorporación inicial de un CMS externo.

La página de planes puede mantenerse como presentación informativa o acceso anticipado, pero no simulará un proceso de compra.

## 3. Principios de producto y experiencia

1. **Móvil primero.** La experiencia base se diseñará para 375 px y se ampliará progresivamente.
2. **Una acción principal por pantalla.** Las acciones secundarias se revelarán según contexto.
3. **Progreso antes que decoración.** La interfaz priorizará el entrenamiento actual, el siguiente paso y la evidencia de avance.
4. **Confianza antes que espectacularidad.** No se usarán cifras, testimonios o resultados no verificables.
5. **Accesibilidad desde los componentes.** Contraste, foco, semántica y tamaño táctil no serán correcciones posteriores.
6. **Español primero, arquitectura bilingüe.** Latinoamérica será el mercado principal sin bloquear el crecimiento en inglés.
7. **Contenido indexable y producto privado separados.** Las páginas públicas atraerán tráfico; las rutas personales permanecerán fuera del índice.

## 4. Sistema visual

### 4.1 Dirección estética

Vekira conservará su violeta como color distintivo, pero reducirá el uso de degradados púrpura como recurso dominante. El resultado debe percibirse deportivo, preciso, energético y confiable, no como una plantilla genérica de inteligencia artificial.

- **Títulos y métricas:** Barlow Condensed.
- **Interfaz y lectura:** Plus Jakarta Sans.
- **Color primario:** violeta Vekira.
- **Progreso confirmado:** verde.
- **Advertencias:** ámbar.
- **Errores y acciones destructivas:** rojo.
- **Superficies:** neutros oscuros con jerarquía clara.
- **Iconografía:** Lucide con tamaños y grosores normalizados.

Los emojis usados como controles o identificadores en onboarding se sustituirán por iconos SVG. Los emojis podrán permanecer únicamente como contenido expresivo generado por usuarios.

### 4.2 Tokens

El sistema definirá tokens para:

- Colores semánticos.
- Tipografía y escala de tamaños.
- Espaciado en múltiplos de cuatro.
- Radios de borde.
- Elevación y sombras.
- Duraciones y curvas de movimiento.
- Anchos máximos de contenido.
- Alturas de navegación.
- Tamaños táctiles mínimos.
- Capas `z-index` documentadas.

No se introducirán valores visuales aislados en páginas nuevas cuando exista un token equivalente.

### 4.3 Estados obligatorios

Cada componente con datos o acciones remotas contemplará:

- Carga.
- Vacío.
- Error recuperable.
- Error bloqueante.
- Éxito.
- Deshabilitado.
- Sin conexión.
- Sincronización pendiente.

Los estados vacíos explicarán la siguiente acción útil; no serán superficies muertas.

## 5. Navegación y estructura global

### 5.1 Móvil

La barra inferior tendrá cinco destinos estables:

1. Inicio.
2. Plan.
3. Entrenar.
4. Progreso.
5. Comunidad.

`Entrenar` tendrá prioridad visual y conducirá a la sesión programada o, si no existe, al estado de descanso o selección permitido. El coach dejará de competir permanentemente con la navegación mediante un FAB global; aparecerá como acción contextual en dashboard, plan y sesión.

El avatar superior concentrará perfil, notificaciones y ajustes.

### 5.2 Escritorio

- Sidebar compacta con los mismos cinco destinos.
- Contenido principal con ancho máximo consistente.
- Panel contextual opcional para coach, resumen o detalles.
- Navegación y orden de tabulación equivalentes a la jerarquía visual.

## 6. Rediseño por experiencia

### 6.1 Landing pública

Orden de secciones:

1. Hero con promesa concreta, captura real y CTA `Crear mi plan gratis`.
2. Problema: improvisación, rutinas genéricas y falta de progresión.
3. Ciclo de valor: plan, entrenamiento, registro y ajuste.
4. Beneficios por objetivo y contexto.
5. Capturas reales de dashboard, sesión y progreso.
6. Metodología, seguridad y límites de la herramienta.
7. Prueba social verificable o bloque explícito de acceso anticipado.
8. Preguntas frecuentes.
9. CTA final.

Propuesta principal:

> Vekira convierte cada entrenamiento que completas en el siguiente paso de tu progresión.

La landing no mostrará métricas de usuarios o satisfacción sin una fuente verificable.

### 6.2 Registro y onboarding

El registro solicitará inicialmente solo las credenciales indispensables. Nombre completo, nombre de usuario y configuración social se moverán a etapas posteriores.

El onboarding se agrupará en cinco etapas:

1. Objetivo y experiencia.
2. Disponibilidad.
3. Lugar y equipo.
4. Seguridad y limitaciones.
5. Datos físicos y confirmación.

Requisitos:

- Mostrar duración estimada y progreso numerado.
- Conservar respuestas locales ante abandono.
- Mantener navegación hacia atrás.
- Explicar por qué se pide información sensible.
- Mantener el cribado de seguridad antes de confirmar un plan.
- Presentar una vista previa comprensible antes del plan definitivo.
- Sustituir emojis funcionales por iconos.

### 6.3 Dashboard

El dashboard responderá:

- Qué debe hacer el usuario hoy.
- Si está progresando.
- Qué necesita atención.

Jerarquía:

1. Sesión o descanso de hoy.
2. CTA principal.
3. Estado semanal.
4. Próxima recomendación de mejora.
5. Racha y métricas secundarias.
6. Actividad social relevante.

Los banners se consolidarán para impedir que varias alertas compitan simultáneamente.

### 6.4 Sesión activa

La sesión es la superficie principal del producto.

- Ejercicio, imagen y serie actual visibles.
- Controles numéricos grandes con `inputmode` correcto.
- Peso, repeticiones y RPE editables sin desplazamientos innecesarios.
- Temporizador de descanso visible y no invasivo.
- Comparación compacta con la sesión anterior.
- Menú secundario para reemplazar, saltar o eliminar.
- Estado explícito de guardado local y sincronización.
- Recuperación ante pérdida de conexión.
- Resumen final centrado en mejoras, récords y continuidad.

### 6.5 Plan y biblioteca

- Resumen semanal antes del detalle diario.
- Días representados como tabs o timeline según el ancho.
- Separación clara entre editar, reemplazar y solicitar un ajuste al coach.
- Historial de planes separado del plan activo.
- Razón visible de las recomendaciones cuando exista.
- Restricciones aplicadas visibles: equipo, duración y seguridad.

### 6.6 Progreso

Un centro único reunirá:

- Constancia.
- Volumen.
- Mejores marcas.
- Evolución corporal.
- Progresión por ejercicio.
- Comparaciones de 4, 12 y 24 semanas.

Toda gráfica tendrá resumen textual y alternativa accesible. Los estados sin datos indicarán qué actividad generará la primera métrica.

### 6.7 Comunidad y perfiles

- Feed orientado a logros y sesiones, no a contenido genérico.
- Plantillas visuales para compartir sesiones.
- Estadísticas deportivas antes que contadores sociales en el perfil.
- Privacidad visible al publicar.
- Descubrimiento por objetivo, nivel o modalidad de entrenamiento.
- Likes y seguidores no desplazarán las acciones de entrenamiento.

### 6.8 Ajustes

Las opciones se agruparán en:

- Perfil.
- Entrenamiento.
- Privacidad y seguridad.
- Notificaciones.
- Idioma.
- Cuenta.

Se reducirán rutas fragmentadas cuando varias configuraciones puedan convivir en una misma sección accesible.

## 7. Accesibilidad

- Cumplimiento mínimo WCAG 2.2 AA.
- Contraste 4.5:1 para texto normal y 3:1 para texto grande y controles.
- Objetivos táctiles de al menos 44 × 44 px.
- Zoom permitido; se eliminará `userScalable: false`.
- Foco visible en todos los controles.
- Navegación completa por teclado.
- Un H1 por página y jerarquía secuencial de encabezados.
- Enlace para saltar al contenido.
- Labels asociados a campos.
- Errores anunciados mediante regiones vivas o `role="alert"`.
- Ningún estado comunicado solo mediante color.
- Texto base mínimo de 16 px en móvil.
- Respeto global a `prefers-reduced-motion`.
- Validación en 375, 768, 1024 y 1440 px.

## 8. Arquitectura bilingüe

### 8.1 Rutas

Las páginas públicas usarán prefijo de idioma:

- `/es/...`
- `/en/...`

El español latinoamericano será la versión principal. La raíz `/` será una página ligera de selección de idioma y actuará como `x-default`. Podrá recomendar español o inglés según `Accept-Language`, pero no redirigirá automáticamente sin una elección previa. Las campañas y enlaces de producto dirigirán directamente a `/es` o `/en`. El selector conservará la página equivalente cuando exista.

Cada entidad traducible tendrá un identificador estable independiente del slug. Esto permitirá relacionar, por ejemplo, `/es/ejercicios/sentadilla` con `/en/exercises/squat`.

### 8.2 SEO internacional

Cada página indexable incluirá:

- Canonical propio.
- `hreflang="es-419"`.
- `hreflang="en"`.
- `hreflang="x-default"`.
- Título y descripción localizados.
- Open Graph localizado.
- URL equivalente por idioma cuando exista.

No se publicará una versión inglesa automática sin revisión humana. Las páginas sin traducción no declararán un equivalente inexistente. Cada versión tendrá contenido principal íntegramente localizado; `hreflang` no se tratará como sustituto de la traducción ni como mecanismo de detección del idioma.

## 9. Arquitectura de contenido SEO

### 9.1 Páginas comerciales

- Entrenamiento personalizado.
- Rutinas adaptativas.
- Entrenamiento de fuerza.
- Entrenamiento en casa.
- Entrenamiento con poco equipo.
- Seguimiento de progresión.
- Coach de entrenamiento con IA.
- Aplicación para registrar entrenamientos.
- Comparación entre Vekira y una rutina genérica.
- Preguntas frecuentes.

Cada página responderá a una intención de búsqueda específica y tendrá contenido propio.

### 9.2 Clústeres editoriales

**Progresión**

- Sobrecarga progresiva.
- Aumento de peso y repeticiones.
- RPE.
- Estancamientos.

**Planificación**

- Rutinas de 3, 4 y 5 días.
- Full body.
- Torso-pierna.
- Push-pull-legs.
- Frecuencia y duración.

**Ejercicios**

- Técnica.
- Músculos trabajados.
- Equipo.
- Alternativas.
- Errores comunes.
- Progresiones relacionadas.

**Entrenamiento seguro**

- Adaptación de rutinas.
- Recuperación.
- Fatiga y descanso.
- Cuándo buscar orientación profesional.

El contenido de seguridad no realizará diagnósticos ni promesas clínicas.

### 9.3 Biblioteca pública de ejercicios

Cada ejercicio público incluirá:

- Nombre localizado.
- Imagen optimizada.
- Instrucciones.
- Equipo.
- Dificultad.
- Músculos principales y secundarios.
- Alternativas.
- Errores frecuentes.
- Preguntas frecuentes cuando aporten valor.
- CTA contextual para crear un plan personalizado.

Las páginas públicas no expondrán datos personales ni funcionalidades administrativas del catálogo.

## 10. SEO técnico

- `robots.ts` y `sitemap.ts`.
- Sitemaps por idioma y tipo de contenido cuando el volumen lo requiera.
- `metadataBase`, canonical, Open Graph y tarjetas sociales.
- Imágenes sociales localizadas.
- Schema `SoftwareApplication`, `FAQPage`, `BreadcrumbList` y `Article` únicamente cuando los datos correspondientes sean visibles y aplicables a la plantilla.
- URLs descriptivas y permanentes.
- Redirecciones 301 al cambiar slugs indexados.
- Login, registro, onboarding, dashboard, configuración y perfiles privados con `noindex`. Estas rutas seguirán siendo rastreables para que los buscadores puedan leer la directiva; no se bloquearán simultáneamente mediante `robots.txt`.
- Páginas 404 localizadas.
- Control de duplicados entre idiomas, ejercicios y filtros.
- Imágenes WebP o AVIF mediante `next/image` con espacio reservado.
- Validación de schemas con Rich Results Test, sin asumir que un marcado válido garantiza una presentación enriquecida.

Objetivos de rendimiento:

- LCP inferior a 2,5 segundos.
- INP inferior a 200 ms.
- CLS inferior a 0,1.

## 11. Gestión de contenido

La primera etapa utilizará MDX dentro del repositorio.

Cada documento tendrá:

- Identificador estable.
- Idioma.
- Slug localizado.
- Título.
- Descripción.
- Autor.
- Fechas de publicación y actualización.
- Imagen social.
- Identificador de traducción equivalente, si existe.

El build validará estos campos. Un documento incompleto o una combinación duplicada de idioma y slug producirá un error de compilación.

Se mantendrá un glosario bilingüe para términos deportivos. Un CMS externo se evaluará solo si un equipo no técnico necesita publicar con frecuencia.

## 12. Componentes y límites

Componentes públicos compartidos:

- `MarketingLayout`
- `LocalizedLink`
- `LanguageSwitcher`
- `FeatureSection`
- `ProductScreenshot`
- `FAQ`
- `ArticleLayout`
- `ExercisePublicPage`

Servicios y utilidades:

- Resolución de idioma y ruta equivalente.
- Generación de metadatos.
- Generación de canonical y `hreflang`.
- Validación del contenido.
- Construcción de sitemaps.
- Emisión de eventos analíticos.

La interfaz pública y la aplicación compartirán tokens y marca, pero mantendrán layouts separados para evitar que la densidad del producto invada las páginas de adquisición.

## 13. Datos y medición

Eventos mínimos:

- `landing_view`
- `primary_cta_clicked`
- `language_changed`
- `signup_started`
- `signup_completed`
- `onboarding_step_completed`
- `onboarding_abandoned`
- `plan_generated`
- `first_session_started`
- `first_session_completed`
- `plan_adjustment_used`
- `organic_page_cta_clicked`

Los eventos no incluirán datos médicos, credenciales ni texto libre sensible.

Indicadores:

- CTR orgánico por idioma y clúster.
- Conversión de visita orgánica a registro.
- Registro a plan generado.
- Plan generado a primera sesión completada.
- Abandono por etapa del onboarding.
- Retención semanal de usuarios orgánicos.

La métrica de producto principal será el número de usuarios semanales que completan al menos dos sesiones planificadas.

## 14. Manejo de errores

- **Traducción de UI faltante:** fallback al español y registro del identificador faltante.
- **Página sin traducción equivalente:** el selector llevará al inicio del idioma elegido y lo explicará.
- **Imagen ausente:** placeholder de marca con dimensiones reservadas.
- **Contenido SEO inválido:** fallo del build.
- **Progreso insuficiente:** estado vacío educativo.
- **Sin conexión durante una sesión:** persistencia local y sincronización posterior.
- **Fallo de sincronización:** estado visible, reintento seguro y ausencia de pérdida silenciosa.
- **Datos parciales:** la pantalla mostrará únicamente métricas confiables y explicará la ausencia del resto.

## 15. Verificación

### Automatizada

- Pruebas unitarias para rutas, traducciones, canonical, `hreflang` y metadatos.
- Pruebas de validación MDX.
- Pruebas de componentes y estados accesibles.
- E2E de registro, onboarding, generación y sesión.
- Verificación de sitemap y robots.
- Axe sobre plantillas públicas y flujos críticos.
- Lighthouse sobre landing, artículo, ejercicio público y dashboard.

### Manual

- Teclado completo.
- Lector de pantalla en flujos críticos.
- Zoom al 200 %.
- Reducción de movimiento.
- Contraste y estados no dependientes del color.
- Capturas en 375, 768, 1024 y 1440 px.
- Revisión lingüística del español latino y del inglés.
- Validación visual en PWA y Android.

## 16. Fases

### Fase 1: fundaciones

- Tokens y componentes base.
- Navegación global.
- Accesibilidad transversal.
- Rutas de idioma.
- Metadatos, robots, sitemap y `noindex`.

### Fase 2: adquisición y activación

- Landing bilingüe.
- Registro y onboarding.
- Dashboard y sesión activa.
- Capturas del producto.
- Páginas comerciales iniciales.

### Fase 3: producto completo

- Plan y biblioteca.
- Progreso.
- Comunidad y perfiles.
- Ajustes.
- Estados vacíos, offline y sincronización.

### Fase 4: crecimiento orgánico

- Biblioteca pública de ejercicios.
- Clústeres editoriales.
- Datos estructurados.
- Analítica SEO y experimentación de contenido.

## 17. Criterios de aceptación

El diseño se considerará implementado cuando:

- Las rutas críticas utilicen el nuevo sistema visual y navegación.
- No existan bloqueos de accesibilidad críticos detectados por Axe en las plantillas seleccionadas.
- La aplicación sea utilizable con teclado y zoom al 200 %.
- Las páginas públicas principales existan en español e inglés revisado.
- Canonical, `hreflang`, sitemap, robots y datos estructurados sean válidos.
- Las anotaciones `hreflang` sean recíprocas y solo relacionen traducciones realmente equivalentes.
- Las rutas privadas no sean indexables.
- Los cuatro breakpoints definidos no presenten desplazamiento horizontal accidental.
- La landing, el registro y el onboarding emitan los eventos de medición acordados.
- Las métricas Core Web Vitals de laboratorio cumplan los objetivos en las plantillas públicas críticas.
- No exista ninguna dependencia funcional con la integración de pagos.
