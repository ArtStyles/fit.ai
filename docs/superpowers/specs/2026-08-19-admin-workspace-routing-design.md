# Workspace administrativo con rutas dedicadas

**Fecha:** 2026-08-19

**Estado:** Aprobado para planificación

**Alcance:** Reorganización del panel administrativo existente

## 1. Contexto

El panel administrativo actual vive dentro de `src/app/(app)/admin`, por lo que hereda `AppShell`, la navegación personal o profesional y el dock de entrenamiento. Además, `/admin` concentra en una sola pantalla el resumen de cuentas, la lista y acciones de usuarios, el editor del banner del dashboard y el acceso a la cola de entrenadores.

Esta estructura mezcla dos espacios de trabajo distintos y dificulta ampliar Administración. El administrador continúa viendo navegación de producto mientras realiza tareas operativas, y las features administrativas no tienen destinos propios salvo Entrenadores.

## 2. Objetivo

Crear un workspace administrativo dedicado que sustituya la navegación normal mientras la URL esté bajo `/admin`, separe las features existentes por rutas y mantenga una salida explícita hacia la aplicación.

El resultado debe:

- conservar `/admin` como entrada estable;
- aislar el layout, la navegación y la autorización administrativas;
- separar Resumen, Usuarios, Entrenadores y Contenido;
- funcionar en escritorio y móvil;
- reutilizar los datos, acciones y componentes existentes cuando corresponda;
- preservar las URLs administrativas actuales de Entrenadores;
- evitar migraciones de base de datos y dependencias nuevas.

## 3. Alcance

### Incluido

- Nuevo grupo de rutas `(admin)` independiente de `(app)`.
- Layout administrativo autenticado y localizado.
- Sidebar persistente en escritorio.
- Navegación administrativa inferior en móvil.
- Resumen operativo en `/admin`.
- Gestión de cuentas en `/admin/users`.
- Cola de entrenadores en `/admin/trainers`.
- Expediente profesional en `/admin/trainers/[applicationId]`.
- Editor del banner en `/admin/content`.
- Reubicación de redirecciones, notices y revalidaciones hacia la ruta propietaria de cada feature.
- Estados de carga, vacío y error por módulo.
- Pruebas unitarias, de integración y E2E del nuevo workspace.

### Excluido

- Nuevos módulos administrativos.
- Nuevos roles o cambios en la política de autorización.
- Cambios en el modelo de datos o migraciones de Supabase.
- Un sistema nuevo de auditoría o actividad.
- Rediseño de los flujos personales o profesionales.
- Reescritura de las acciones administrativas existentes que no sea necesaria para adaptar rutas y revalidaciones.
- Traducción completa del contenido administrativo actualmente escrito en español.

## 4. Arquitectura de rutas

Las páginas se moverán de `src/app/(app)/admin` a `src/app/(admin)/admin`. Los route groups de Next.js no forman parte de la URL, por lo que el cambio elimina la herencia de `AppShell` sin alterar los destinos externos.

```text
src/app/(admin)/admin/
├── layout.tsx
├── loading.tsx
├── error.tsx
├── page.tsx
├── users/
│   ├── loading.tsx
│   ├── error.tsx
│   └── page.tsx
├── trainers/
│   ├── loading.tsx
│   ├── error.tsx
│   ├── page.tsx
│   └── [applicationId]/
│       ├── loading.tsx
│       └── page.tsx
└── content/
    ├── loading.tsx
    ├── error.tsx
    └── page.tsx
```

Las rutas resultantes serán:

| Ruta | Responsabilidad |
| --- | --- |
| `/admin` | Resumen operativo y accesos a tareas pendientes |
| `/admin/users` | Usuarios, suscripciones, suspensión y reactivación |
| `/admin/trainers` | Cola y filtros de solicitudes profesionales |
| `/admin/trainers/[applicationId]` | Expediente y decisiones sobre una solicitud |
| `/admin/content` | Configuración y programación del banner del dashboard |

Las rutas personales, profesionales y públicas no cambian.

## 5. Layout y autorización

`src/app/(admin)/admin/layout.tsx` será un Server Component. Antes de renderizar el workspace, exigirá el contexto administrativo mediante la autorización existente. Un usuario no autenticado seguirá siendo enviado al login; un usuario autenticado sin permisos administrativos seguirá siendo enviado a `/dashboard`.

El layout resolverá el idioma y la zona horaria del perfil y envolverá el contenido en `I18nProvider`. Después renderizará `AdminShell`. El guard del layout protege la superficie, pero no sustituye los guards existentes en loaders y acciones sensibles. Las operaciones que leen datos privados o mutan cuentas conservarán la comprobación administrativa en servidor.

El workspace administrativo no renderizará:

- `AppShell`;
- `DesktopSidebar` del producto;
- `BottomNav` personal o profesional;
- `WorkspaceSwitcher`;
- `ActiveWorkoutDock`.

## 6. Navegación administrativa

La configuración de navegación será una fuente única con cuatro elementos:

| Etiqueta | Ruta | Icono conceptual |
| --- | --- | --- |
| Resumen | `/admin` | Dashboard |
| Usuarios | `/admin/users` | Usuarios |
| Entrenadores | `/admin/trainers` | Verificación profesional |
| Contenido | `/admin/content` | Panel o contenido |

La coincidencia activa será exacta para `/admin`. Para los demás elementos aceptará descendientes, de modo que `/admin/trainers/[applicationId]` mantenga Entrenadores activo.

### Escritorio

A partir del breakpoint `lg`, `AdminShell` mostrará un sidebar de ancho estable con:

- marca `Vekira Admin`;
- etiqueta de sección `Operaciones`;
- cuatro destinos administrativos;
- contador de solicitudes pendientes cuando exista un valor real mayor que cero;
- acción `Volver a Vekira` al final, dirigida a `/dashboard`.

El contenido ocupará el espacio restante con un ancho máximo adecuado para tablas y formularios administrativos.

### Móvil

Por debajo de `lg`, el workspace mostrará:

- cabecera compacta con identidad administrativa;
- acción visible para salir a `/dashboard`;
- navegación inferior fija con los cuatro destinos;
- área de contenido con separación suficiente para no quedar oculta bajo la navegación.

Los destinos deben tener una superficie táctil mínima de 44 por 44 píxeles, nombre accesible y `aria-current="page"` cuando corresponda.

## 7. Resumen administrativo

`/admin` dejará de renderizar la lista completa de usuarios y el editor del banner. Mostrará un resumen derivado de las fuentes existentes:

- total de usuarios;
- usuarios Pro;
- cuentas suspendidas;
- solicitudes profesionales y cantidad pendiente;
- última actividad administrativa disponible;
- tarjeta de atención con enlace a la cola cuando existan solicitudes pendientes;
- accesos secundarios a Usuarios, Entrenadores y Contenido.

Las variaciones mensuales de usuarios se calcularán con `createdAt` y la zona horaria del perfil. La actividad reciente solo podrá provenir de timestamps ya disponibles en cuentas, solicitudes y banner. No se crearán eventos ficticios ni un nuevo sistema de auditoría.

Si una fuente secundaria no está disponible, su bloque mostrará `No disponible` y las fuentes sanas continuarán visibles. Un valor desconocido nunca se convertirá en cero. Los fallos de autorización no se transformarán en estados parciales: conservarán su redirección segura.

## 8. Módulo de usuarios

`/admin/users` será propietario de la experiencia que hoy vive en `/admin`:

- resumen breve de cuentas;
- búsqueda por correo, nombre o username;
- filtros de estado y suscripción representados en query parameters;
- cuenta, avatar, badges, fechas y motivo de suspensión;
- acciones de plan, suspensión y reactivación.

La URL será la fuente del estado de búsqueda y filtros para que recarga, historial y enlaces compartidos mantengan la vista. La tabla compacta de escritorio cambiará a tarjetas apiladas en móvil sin perder datos ni acciones.

Las redirecciones de `src/app/actions/admin.ts` pasarán de `/admin?...` a `/admin/users?...`. Después de una mutación se revalidarán `/admin/users` y `/admin`, porque el cambio puede afectar el listado y las métricas generales.

## 9. Módulo de entrenadores

Las URLs actuales se preservan. `/admin/trainers` conservará el filtro `?status=` y `TrainerApplicationQueue`; el detalle conservará `TrainerApplicationReview` y `notFound()` cuando el expediente no exista.

La cola presentará filtros de estado visibles, contador pendiente y jerarquía más clara entre identidad, tipo de solicitud, especialidades y fecha. El detalle usará una cabecera local con breadcrumb hacia Entrenadores en lugar del `PageTopBar` pensado para el producto.

Las acciones de entrenador revalidarán `/admin/trainers` y `/admin`. Las rutas o acciones que ya revalidan el detalle continuarán haciéndolo cuando el cambio afecte el expediente abierto.

## 10. Módulo de contenido

`/admin/content` será propietario de `DashboardBannerEditor`. La pantalla mostrará:

- estado actual;
- campos de contenido;
- programación;
- vista previa;
- disponibilidad de la feature;
- feedback de guardado o error.

Las redirecciones de `src/app/actions/dashboardBanner.ts` pasarán de `/admin?...` a `/admin/content?...`. Después de guardar se revalidarán `/admin/content` y `/admin`, porque el resumen puede mostrar el último cambio del banner.

## 11. Componentes y responsabilidades

Los componentes nuevos o reorganizados tendrán límites explícitos:

- `AdminShell`: estructura responsive del workspace; no carga datos de módulos.
- `AdminDesktopSidebar`: navegación de escritorio y salida a la aplicación.
- `AdminMobileNav`: navegación móvil y estado activo.
- `adminNavigation`: configuración, iconos y función pura de coincidencia activa.
- `AdminPageHeader`: título, descripción, breadcrumb y acciones de cada ruta.
- `AdminOverview`: composición visual del resumen.
- `AdminMetricCard`: métrica con estado disponible o no disponible.
- `AdminActivityList`: eventos reales normalizados y estado vacío.
- `AdminUserDirectory`: búsqueda, filtros y representación responsive de cuentas.

Los componentes actuales `AdminUserActions`, `DashboardBannerEditor`, `TrainerApplicationQueue`, `TrainerApplicationReview` y `TrainerReviewActions` seguirán encapsulando sus responsabilidades actuales. Solo se ajustarán cuando necesiten integrarse con la nueva ruta o jerarquía visual.

## 12. Flujo de datos

1. Next.js resuelve una URL bajo `/admin`.
2. El layout exige el contexto administrativo y obtiene idioma y zona horaria.
3. `AdminShell` selecciona navegación mediante la ruta actual.
4. La página propietaria llama únicamente a sus loaders.
5. Los loaders conservan autorización en servidor y devuelven modelos de presentación tipados.
6. Las mutaciones validan el formulario, exigen autorización y escriben mediante las acciones existentes.
7. La acción revalida el módulo afectado y el resumen si una métrica cambió.
8. La acción redirige al módulo propietario con `notice` o `error`.

El resumen podrá combinar resultados autorizados en paralelo. La autorización se ejecutará antes de capturar fallos parciales para evitar ocultar redirects de seguridad dentro de `Promise.allSettled` u otra normalización de errores.

## 13. Estados de interfaz y errores

Cada módulo tendrá un `loading.tsx` que mantenga la geometría del shell y represente el contenido con skeletons. Los archivos `error.tsx` ofrecerán un mensaje específico y una acción de reintento sin exponer errores internos.

Estados vacíos requeridos:

- Usuarios sin coincidencias para búsqueda o filtros.
- Cola de entrenadores sin solicitudes para el estado seleccionado.
- Actividad reciente sin eventos disponibles.
- Banner todavía no configurado o feature no disponible.

Los notices y errores de acciones serán visibles, anunciables y asociados al módulo correcto. Las acciones destructivas conservarán sus confirmaciones existentes. El expediente desconocido devolverá la experiencia `notFound()` existente.

## 14. Accesibilidad y responsive

- Ambas navegaciones usarán `<nav>` con nombre accesible.
- La ruta activa usará `aria-current="page"`.
- Iconos decorativos tendrán `aria-hidden="true"`.
- Los links y botones conservarán foco visible.
- Los targets móviles tendrán al menos 44 por 44 píxeles.
- El contenido reservará espacio para la barra inferior y las safe areas.
- Las métricas no dependerán solo del color para comunicar estado.
- Las tablas de escritorio tendrán una alternativa de tarjetas en móvil, no scroll horizontal obligatorio.
- Los estados de error y notice usarán `role="alert"` o `aria-live` según corresponda.

## 15. Estrategia de pruebas

### Unitarias

- Configuración de destinos administrativos.
- Coincidencia activa exacta de `/admin` y por prefijo para descendientes.
- Cálculo de métricas de usuarios y variación mensual con zona horaria.
- Normalización cronológica de actividad real.
- Estado `No disponible` distinto de cero.

### Integración de componentes y rutas

- `AdminShell` renderiza navegación administrativa y no renderiza navegación del producto.
- Layout rechaza usuarios no administrativos.
- Resumen presenta métricas y tolera una fuente secundaria no disponible.
- Usuarios preserva búsqueda y filtros en query parameters.
- Entrenadores conserva filtros y detalle.
- Contenido presenta el editor sin cargar la lista de usuarios.
- Acciones redirigen y revalidan las nuevas rutas propietarias.
- Navegaciones de escritorio y móvil cumplen nombres y estado activo accesibles.

### E2E

- Entrar desde Ajustes a `/admin`.
- Navegar a Usuarios, Entrenadores y Contenido usando el shell administrativo.
- Confirmar que la navegación personal o profesional no aparece.
- Abrir un expediente y conservar Entrenadores activo.
- Volver a `/dashboard` mediante la salida explícita.
- Conservar las verificaciones administrativas y de seguridad existentes.

### Verificación de entrega

- Suite Vitest relevante y completa.
- Type-check de TypeScript.
- ESLint.
- Build de Next.js.
- Playwright del flujo administrativo cuando el entorno E2E esté configurado.

## 16. Criterios de aceptación

1. Entrar a cualquier ruta `/admin` reemplaza completamente la navegación normal por la administrativa.
2. `/admin` contiene un resumen y no contiene el directorio completo de usuarios ni el editor completo del banner.
3. Usuarios, Entrenadores y Contenido tienen rutas propias y navegación activa correcta.
4. El detalle de entrenador mantiene `/admin/trainers` como sección activa.
5. El administrador puede regresar a `/dashboard` desde escritorio y móvil.
6. Todas las rutas y mutaciones mantienen autorización en servidor.
7. Los notices, errores y revalidaciones vuelven al módulo propietario.
8. La interfaz es utilizable sin scroll horizontal obligatorio en móvil.
9. Ningún resumen inventa datos cuando una fuente falla.
10. No se añaden migraciones ni dependencias de runtime.

## 17. Riesgos y mitigaciones

### Duplicación o debilitamiento del guard

Mover las páginas podría dejar una ruta sin autorización o provocar lecturas duplicadas. El layout protegerá toda la superficie y los loaders y acciones conservarán su guard en servidor. Las pruebas cubrirán tanto el layout como las operaciones sensibles.

### Redirecciones antiguas

Las acciones actuales apuntan a `/admin`. Si no se actualizan, los notices aparecerían fuera de su contexto. Las pruebas de acciones exigirán los nuevos destinos `/admin/users` y `/admin/content`.

### Revalidación incompleta

Una mutación podría actualizar un módulo sin refrescar las métricas. Cada acción revalidará su ruta propietaria y `/admin` cuando el dato contribuya al resumen.

### Divergencia responsive

Dos navegaciones podrían comportarse distinto. Ambas consumirán la misma configuración y función de estado activo; solo cambiará su presentación.

### Actividad engañosa

Combinar timestamps heterogéneos podría sugerir eventos no ocurridos. El normalizador solo emitirá elementos identificables desde las fuentes existentes y mostrará un estado vacío cuando no haya datos confiables.
