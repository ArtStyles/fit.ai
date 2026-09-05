# Navegación móvil y selector de espacio personal/profesional

**Fecha:** 2026-09-05

**Estado:** Dirección aprobada; documento pendiente de revisión

**Alcance:** Reorganización del chrome de navegación autenticado de Vekira

## 1. Contexto

Vekira presenta dos espacios dentro de una misma cuenta autenticada:

- el espacio personal para planificar, entrenar y revisar el progreso;
- el espacio profesional para que un entrenador gestione clientes, rutinas y solicitudes.

La navegación inferior móvil muestra actualmente cinco destinos del espacio activo y añade
`WorkspaceSwitcher` como un sexto control. Ese control compite por el mismo ancho que los
destinos, aunque no representa una sección de la aplicación. El resultado visible es:

- etiquetas importantes truncadas, especialmente `Entrenadores` y `Solicitudes`;
- el acceso destacado `Entrenar` deja de percibirse centrado;
- `Entrenador` o `Personal` parece una pestaña más, aunque en realidad cambia todo el contexto;
- no hay una presentación consistente de la identidad ni del espacio activo;
- la barra mezcla navegación entre destinos con una acción global.

El mecanismo funcional ya es seguro: la preferencia se guarda en la cookie
`vekira_workspace`, `normalizeWorkspace` nunca concede acceso profesional y la acción de cambio
vuelve a comprobar que exista un perfil de entrenador activo. El rediseño no sustituirá esos
controles de servidor.

## 2. Objetivo

Separar la navegación principal del cambio de espacio para que cada superficie tenga una sola
responsabilidad:

- la barra inferior navegará únicamente entre destinos raíz del espacio activo;
- un control de cuenta persistente mostrará la identidad y el espacio actual;
- una hoja de cuenta permitirá cambiar entre Personal y Entrenador;
- los destinos secundarios de gestión profesional saldrán de la barra sin perder acceso;
- el cambio conservará la misma sesión y nunca se presentará como otra cuenta.

El resultado debe sentirse equilibrado en móvil, seguir siendo claro en escritorio y mantener
la autorización profesional exclusivamente en el servidor.

## 3. Decisiones de producto aprobadas

1. La interfaz usará el término **Espacio**, no `Cuenta`, para distinguir Personal y Entrenador.
2. `Entrenador` dejará de renderizarse como sexto elemento de la barra inferior.
3. El avatar será el acceso principal a identidad, ajustes y cambio de espacio.
4. En el dashboard, tocar el avatar abrirá la hoja de cuenta; la edición de foto quedará en
   `/settings/perfil` y desaparecerá el badge de cámara del encabezado.
5. La navegación personal conservará inicialmente sus cinco destinos actuales.
6. La navegación profesional tendrá cuatro destinos; Perfil saldrá de la barra.
7. El selector estará disponible en todas las pantallas estándar del shell autenticado y se
   ocultará deliberadamente en los flujos inmersivos donde también se oculta la navegación.
8. Cambiar de espacio llevará a la raíz del destino (`/dashboard` o `/coach`) en lugar de
   intentar traducir la ruta actual entre contextos.

## 4. Arquitectura de información

### 4.1 Espacio personal

| Orden | Etiqueta | Ruta | Tratamiento |
| --- | --- | --- | --- |
| 1 | Inicio | `/dashboard` | Destino raíz |
| 2 | Plan | `/plan` | Destino raíz |
| 3 | Entrenar | `/entrenar` | Acción central destacada y destino raíz |
| 4 | Progreso | `/progress` | Destino raíz |
| 5 | Entrenadores o Comunidad | `/trainers` o `/feed` | Depende de la feature flag existente |

La primera entrega no retirará `Entrenadores` ni `Comunidad`: hoy no existe otro acceso general
con la misma visibilidad. La desaparición del sexto control devolverá espacio suficiente y
recuperará la simetría alrededor de `Entrenar`.

Una reducción posterior a cuatro destinos personales queda fuera de este alcance. Solo deberá
considerarse después de crear en Inicio una sección **Acompañamiento** con CTA dependiente del
estado real: `Buscar entrenador`, `Ver solicitud`, `Mi entrenador` o `Revisar propuesta`.

### 4.2 Espacio entrenador

| Orden | Etiqueta | Ruta | Tratamiento |
| --- | --- | --- | --- |
| 1 | Resumen | `/coach` | Destino raíz |
| 2 | Clientes | `/coach/clients` | Destino operativo |
| 3 | Rutinas | `/coach/programs` | Destino operativo |
| 4 | Solicitudes | `/coach/requests` | Destino operativo |

`/coach/profile` seguirá existiendo, pero se alcanzará desde:

- la hoja de cuenta;
- la tarjeta `Editar perfil` del Resumen profesional.

`/coach/services` seguirá anidado conceptualmente bajo Perfil profesional y conservará el acceso
`Gestionar servicios` desde esa pantalla. No se fusionarán páginas ni se cambiarán URLs.

En `/coach/profile` y `/coach/services` ningún destino inferior tendrá `aria-current="page"`:
marcar Resumen sería semánticamente incorrecto. El encabezado y el badge del disparador
mantendrán visible el contexto Entrenador.

### 4.3 Superficies compartidas

Ajustes, Notificaciones y Perfil personal no serán nuevos destinos de la barra. Se alcanzarán
desde la hoja de cuenta o desde sus accesos contextuales actuales. Administración conservará su
shell, rutas y navegación independientes; no se añadirá como tercer espacio al selector.

## 5. Control persistente de cuenta

### 5.1 Disparador

El disparador será un botón táctil de al menos 44 por 44 píxeles con:

- avatar o iniciales del usuario;
- un badge pequeño que identifique el espacio activo;
- nombre accesible `Abrir cuenta y espacios`;
- foco visible y estado pendiente cuando haya una navegación en curso.

El badge usará una persona para Personal y un maletín para Entrenador. El color reforzará el
estado, pero el icono y el nombre accesible evitarán depender solo del color.

En el dashboard se reutilizará el avatar grande existente como disparador. Se conservarán el
saludo y la campana; el engranaje dejará de ocupar un botón independiente porque Ajustes estará
en la hoja. En otros encabezados estándar aparecerá una variante compacta a la derecha.

Las rutas principales que hoy no tienen encabezado persistente recibirán el disparador dentro de
su encabezado de contenido existente. No se añadirá una barra vacía ni se duplicarán títulos.

### 5.2 Hoja de cuenta

En móvil, el botón abrirá una hoja inferior modal. En escritorio, abrirá un popover o panel
anclado al bloque de cuenta del sidebar. Ambos formatos compartirán el mismo modelo y acciones.

Orden del contenido:

1. avatar, nombre visible y correo;
2. rótulo `Espacio activo`;
3. selector Personal/Entrenador;
4. enlaces contextuales;
5. Ajustes;
6. Cerrar sesión, separado visualmente.

Cuando el espacio activo sea Personal, el enlace contextual será `Perfil personal`. Cuando sea
Entrenador, los enlaces contextuales serán `Perfil profesional` y `Servicios`. El acceso al otro
espacio siempre se hará mediante el selector antes de mostrar sus destinos profundos de gestión;
así la URL, el badge y la navegación no quedan en contextos diferentes. El acceso a
Notificaciones continuará mediante la campana y no se duplicará en la primera entrega.

### 5.3 Disponibilidad profesional

- `granted: true`: se muestran Personal y Entrenador como opciones.
- `missing_profile`, `inactive` o `suspended`: se muestra únicamente Personal y no se inventa
  en la hoja un estado de solicitud que `getTrainerAccess` no conoce.
- La entrada profesional existente de Ajustes seguirá siendo propietaria de la solicitud y su
  seguimiento mediante `/coach/apply`.
- Si una pantalla conservaba datos de acceso ya obsoletos y el servidor rechaza el cambio, la
  hoja mostrará el error y refrescará el modelo; no activará Entrenador ni modificará la cookie.

El cliente nunca decidirá por sí solo que una cuenta puede usar el espacio profesional.

Un acceso directo a `/coach/*` sin perfil activo conservará el guard actual y redirigirá a
`/coach/apply`. El render del layout puede normalizar una cookie obsoleta a Personal para la
presentación, pero no afirmará haber reescrito esa cookie.

### 5.4 Cobertura de rutas

| Familia de rutas | Tipo | Integración del disparador |
| --- | --- | --- |
| `/dashboard` | Estándar | Avatar grande de `DashboardHeader`, modo `custom` |
| `/plan`, `/progress`, `/notifications`, `/settings/**`, `/coach/**` autorizado | Estándar | Slot compacto compartido en `PageTopBar` |
| `/feed`, `/buscar`, `/chat`, `/exercises`, `/post/**`, `/solicitudes`, `/coach/apply` | Estándar | Slot predeterminado de su `FixedTopBar` directo |
| `/trainers/**`, `/coaching`, `/calendario`, `/history/**`, `/medidas`, `/u/**` | Estándar | Disparador compacto dentro del encabezado de contenido existente |
| `/entrenar` | Redirect | No renderiza una pantalla intermedia; conserva el acceso en la barra de origen |
| `/session/**`, `/plans/generate`, `/feed/new` | Inmersiva | Selector oculto |

La tabla cubre todas las familias actuales dentro de `src/app/(app)`. Una ruta autenticada nueva
deberá declararse estándar o inmersiva antes de integrarse al shell.

## 6. Cambio de espacio

La acción dejará de terminar siempre en `redirect()` y adoptará un resultado discriminado:

```ts
type WorkspaceChangeResult =
  | { ok: true; workspace: 'personal' | 'coach'; destination: '/dashboard' | '/coach' }
  | {
      ok: false
      code: 'invalid_workspace' | 'coach_unavailable' | 'unexpected'
      error: string
    }
```

El flujo será:

1. El usuario abre la hoja de cuenta.
2. La interfaz muestra cuál espacio está activo mediante texto, icono y `aria-pressed`.
3. El usuario selecciona el otro espacio.
4. Antes de mutar la cookie, el control emite una intención de navegación cancelable. Una
   superficie con cambios sin guardar puede detenerla y mostrar su confirmación existente.
5. Ambos controles se deshabilitan mientras se procesa la acción y una región `aria-live`
   anuncia `Cambiando al espacio ...`.
6. La Server Action exige una sesión válida, valida el input y vuelve a consultar el acceso
   profesional.
7. Solo un resultado válido escribe la cookie con sus atributos actuales, revalida el layout y
   devuelve el espacio y destino canónicos.
8. El cliente usa `router.replace(destination)` y luego refresca el árbol de servidor. No usa
   `push`, de modo que Atrás no restaura automáticamente la pantalla previa del otro espacio.
9. Un error conserva la hoja abierta, el espacio original y la cookie original; rehabilita los
   controles y ofrece reintento.

No se conservará una ruta profunda al cambiar porque `Clientes`, `Plan`, `Rutinas` y `Progreso`
no tienen equivalencias seguras entre espacios. El entrenamiento activo no se descartará: si el
usuario entra al espacio profesional, la sesión personal seguirá persistida y volverá a estar
disponible al regresar.

Los redirects de autenticación seguirán propagándose como navegación segura. Un intento de
activar Entrenador sin acceso devolverá `coach_unavailable`, no cambiará silenciosamente a
Personal y provocará un refresh del modelo tras mostrar el mensaje.

## 7. Coherencia entre ruta y espacio

`resolvePresentedWorkspace({ pathname, preferredWorkspace, trainerAccess })` será la única fuente
del espacio presentado. Aplicará estas reglas en orden:

1. Si `trainerAccess.granted` es falso, devuelve Personal para el shell.
2. Si la ruta comienza por `/coach` y no es `/coach/apply`, devuelve Entrenador.
3. Si pertenece a una familia personal, devuelve Personal.
4. Si es compartida o desconocida, devuelve el `preferredWorkspace` ya normalizado por el
   servidor.

Familias personales actuales: `/dashboard`, `/plan`, `/plans`, `/entrenar`, `/session`,
`/progress`, `/feed`, `/trainers`, `/coaching`, `/calendario`, `/history`, `/medidas`,
`/exercises`, `/buscar`, `/post`, `/solicitudes`, `/u`, `/chat` y `/coach/apply`.

Familias compartidas actuales: `/settings` y `/notifications`. Administración continúa fuera de
`AppShell` y no participa en esta resolución.

La clasificación por prefijo exigirá igualdad exacta o un límite `/` posterior; por ejemplo,
`/coach` incluye `/coach/clients`, pero no una ruta ajena llamada `/coaching`.

El layout cargará ambos conjuntos de navegación, el acceso profesional y la preferencia de
cookie normalizada. `AppShell`, `BottomNav`, `DesktopSidebar` y la hoja consumirán la misma
resolución basada en `usePathname`; ninguna pieza escogerá el espacio de forma independiente.

Visitar directamente una ruta de un espacio no reescribirá la cookie: la ruta manda para esa
pantalla y la cookie seguirá siendo la preferencia de las rutas compartidas. Cambiar mediante el
selector sí actualizará la cookie y reemplazará la entrada de historial. Si Atrás abre una ruta
antigua de otro espacio, la prioridad de ruta garantizará que el chrome corresponda a esa URL.

Esta resolución solo afecta la presentación. Los guards de `/coach`, las Server Actions y RLS
seguirán siendo la fuente de autorización. La cookie nunca se convertirá en un permiso.

## 8. Componentes y responsabilidades

### Componentes nuevos

- `AccountWorkspaceMenu`: contenido compartido de identidad, selector y enlaces.
- `AccountWorkspaceTrigger`: botón compacto o avatar grande que abre el menú.
- `AccountWorkspaceProvider`: expone al chrome únicamente el modelo serializable necesario.
- `resolvePresentedWorkspace`: función pura que armoniza preferencia, acceso y familia de ruta.
- `WorkspaceNavigationGuard`: protocolo cancelable que permite a editores con cambios pendientes
  aprobar o impedir el cambio antes de ejecutar la Server Action.

### Componentes modificados

- `AppShell`: recibe el resumen de cuenta, la preferencia normalizada y ambos conjuntos de
  navegación; proporciona una única resolución de espacio al chrome cliente.
- `BottomNav`: deja de renderizar `WorkspaceSwitcher` y contiene solo destinos.
- `DesktopSidebar`: sustituye el selector aislado por un bloque de cuenta coherente con móvil.
- `appNavigation`: elimina Perfil de los destinos profesionales y conserva la coincidencia
  activa correcta para los cuatro destinos restantes y sus descendientes.
- `FixedTopBar`: incorpora el slot compacto de cuenta de forma predeterminada y admite los modos
  explícitos `hidden` y `custom` para flujos inmersivos y el dashboard, respectivamente.
- `PageTopBar`: compone sus acciones derechas propias con el slot de cuenta sin desbordamiento.
- `DashboardHeader`: convierte el avatar en disparador, elimina el badge de cámara y mueve
  Ajustes a la hoja.
- `AvatarUploader`: continúa siendo editable en `/settings/perfil`; no se usará como control de
  carga dentro del dashboard.
- Páginas raíz sin topbar: incorporan el acceso compacto al menú mediante el patrón compartido.

El componente visual no consultará Supabase. El layout autenticado cargará nombre, correo,
avatar y acceso profesional una sola vez y pasará un modelo explícito. La acción de servidor
continuará validando de nuevo toda operación sensible.

Los consumidores directos de `FixedTopBar` recibirán el slot predeterminado sin duplicar carga
de datos. Los encabezados de tarea de `/session`, `/plans/generate` y `/feed/new` lo marcarán
como `hidden`; `DashboardHeader` lo marcará como `custom` porque su avatar grande será el
disparador. Las rutas estándar sin `FixedTopBar` añadirán un encabezado mínimo que use el mismo
provider. Si `FixedTopBar` se renderiza fuera de `AccountWorkspaceProvider`, el slot será nulo y
no cambiará la geometría de esa superficie.

## 9. Responsive y comportamiento por plataforma

### Móvil

- Cinco destinos como máximo en Personal y cuatro en Entrenador.
- Personal usa una cuadrícula de cinco columnas iguales y Entrenador una de cuatro; el selector
  no participa en ninguna de ellas.
- Etiquetas completas, de una palabra cuando sea posible, sin depender de truncado como estado
  normal. A 320 píxeles podrá utilizarse la familia tipográfica condensada existente sin bajar
  de 10 píxeles ni ocultar el texto visible.
- `Entrenar` ocupa la tercera columna personal. El centro horizontal de su control diferirá como
  máximo 2 píxeles del centro del viewport en cada tamaño validado.
- La hoja respeta safe areas y permite scroll cuando el tamaño vertical es reducido.
- El contenido conserva separación inferior suficiente para la barra y el dock de sesión.

### Escritorio

- El sidebar conserva todos los destinos del espacio activo.
- El bloque inferior muestra avatar, nombre y espacio actual.
- Al activarlo abre el mismo menú como popover; no añade una sexta entrada al `<nav>`.
- El cambio de espacio conserva el comportamiento de redirección de móvil.

### Flujos inmersivos

El acceso de cuenta se ocultará en `/session`, `/plans/generate` y `/feed/new`, aunque el flujo
conserve su propio encabezado de tarea. Es una excepción intencional para evitar abandonar
accidentalmente una sesión, generación o composición. La navegación normal reaparecerá al salir
del flujo.

## 10. Accesibilidad e internacionalización

- Barra, selector y hoja tendrán nombres accesibles diferenciados.
- El destino actual conservará `aria-current="page"`.
- El selector expondrá `aria-pressed` y texto visible para el espacio seleccionado.
- Todos los botones y enlaces tendrán un target mínimo de 44 por 44 píxeles.
- La hoja atrapará el foco, cerrará con Escape y devolverá el foco al disparador.
- El cambio pendiente y los errores se anunciarán mediante regiones accesibles.
- Ningún estado dependerá exclusivamente del color o de un icono sin texto alternativo.
- Las etiquetas nuevas se añadirán al sistema i18n existente en español e inglés.
- Nombres y correos largos deberán truncarse visualmente sin ampliar el viewport.
- Se respetarán `prefers-reduced-motion` y los patrones de transición existentes.

## 11. Estados y casos límite

- Usuario personal sin acceso profesional.
- Entrenador activo en espacio Personal.
- Entrenador activo en espacio Entrenador.
- Acceso profesional revocado mientras la cookie todavía contiene `coach`.
- Nombre, correo o labels traducidos largos.
- Cambio de espacio con red lenta o error de red.
- Apertura y cierre repetidos de la hoja.
- Sesión de entrenamiento personal activa al entrar al espacio profesional.
- Ruta compartida abierta desde cada espacio.
- Acceso directo a una ruta profesional con preferencia Personal.
- Navegación mediante teclado, lector de pantalla y botón Atrás de Android.

## 12. Estrategia de pruebas

### Unitarias

- Personal conserva cinco destinos y su orden.
- Entrenador contiene exactamente Resumen, Clientes, Rutinas y Solicitudes.
- Perfil y Servicios no se convierten en destinos inferiores.
- `/coach/profile` y `/coach/services` no marcan falsamente Resumen con `aria-current`.
- La resolución única de espacio aplica la prioridad acceso → ruta profesional → ruta personal
  → preferencia en rutas compartidas.
- Cada familia enumerada en la matriz se clasifica correctamente y una ruta desconocida usa la
  preferencia normalizada.
- La normalización continúa rechazando `coach` sin acceso activo.

### Componentes e integración

- `BottomNav` no renderiza `WorkspaceSwitcher` ni un sexto control.
- `Entrenar` queda centrado con el conjunto personal completo.
- La hoja muestra identidad, espacio actual y enlaces correctos para cada estado de acceso.
- El avatar del dashboard abre la hoja y no abre el selector de archivos.
- La edición de avatar continúa disponible en `/settings/perfil`.
- `PageTopBar` conserva acciones derechas existentes junto al control de cuenta.
- El cambio de espacio presenta estado pendiente, evita dobles envíos y gestiona errores.
- Una rutina profesional con cambios pendientes puede cancelar el cambio antes de cualquier
  mutación de cookie; al confirmarlo, la navegación continúa una sola vez.
- La acción devuelve un resultado canónico, no muta la cookie al fallar y distingue input
  inválido de acceso profesional no disponible.
- Los guards profesionales siguen rechazando usuarios sin acceso.
- El bloque de cuenta de escritorio y la hoja móvil usan las mismas opciones.

### Navegación y visual

- Comprobar móvil en 320×800, 360×800, 390×844 y 412×915.
- Comprobar escritorio a 1280 píxeles o más.
- Verificar que ninguna etiqueta se corta en español o inglés.
- Medir que el centro de Entrenar queda dentro de la tolerancia de 2 píxeles y que ningún item
  colisiona con otro, con la safe area o con el dock de entrenamiento activo.
- Recorrer Personal → Entrenador → Personal y confirmar `router.replace`, raíces, cookie y estado
  activo; Atrás no debe restaurar la pantalla sustituida del otro espacio.
- Abrir una URL antigua del otro espacio y confirmar que la prioridad de ruta presenta el chrome
  correcto aunque la cookie contenga la preferencia contraria.
- Comparar la instantánea persistida de una sesión activa antes y después del cambio de espacio;
  debe permanecer idéntica.
- Confirmar que los flujos inmersivos no muestran barra ni selector.

### Gates de entrega

- Pruebas Vitest focalizadas de navegación, workspace, dashboard y accesibilidad.
- Suite completa con `pnpm exec vitest run --maxWorkers=4`.
- `pnpm type-check`.
- `pnpm lint`.
- `git diff --check`.
- Validación visual real en los viewports definidos; las clases CSS por sí solas no bastan.

## 13. Criterios de aceptación

1. Ninguna barra inferior móvil muestra más de cinco controles.
2. Personal muestra cinco destinos y Entrenador muestra cuatro.
3. El cambio Personal/Entrenador no aparece como pestaña de navegación.
4. El centro de `Entrenar` queda a no más de 2 píxeles del centro del viewport y ninguna etiqueta
   se trunca en los viewports soportados.
5. Todas las familias marcadas como estándar en la matriz muestran un botón con nombre accesible
   `Abrir cuenta y espacios`; las inmersivas no lo muestran.
6. El dashboard conserva saludo y notificaciones, pero Ajustes vive en la hoja de cuenta.
7. Tocar el avatar del dashboard abre la hoja; cambiar la foto se hace desde Perfil.
8. Perfil profesional y Servicios siguen accesibles aunque no estén en la barra profesional.
9. Un usuario sin perfil profesional activo recibe `coach_unavailable`, conserva la cookie y no
   puede activar el espacio Entrenador.
10. La instantánea de entrenamiento persistida antes y después del cambio es idéntica; no se
    introduce ninguna migración ni se relajan guards, grants o RLS.
11. Para cada cruce ruta/cookie probado, el badge y los destinos coinciden con
    `resolvePresentedWorkspace`.
12. La hoja enfoca su título o espacio seleccionado al abrir, cierra con Escape, devuelve el foco
    al disparador y mantiene sus controles por encima de la safe area inferior.

## 14. Fuera de alcance

- Reducir ahora la navegación personal a cuatro destinos.
- Crear la futura sección Acompañamiento del dashboard.
- Cambiar URLs públicas o fusionar páginas profesionales.
- Modificar el modelo de datos, RLS o estado de verificación de entrenadores.
- Incorporar Administración como espacio seleccionable.
- Rediseñar el contenido interno de Plan, Progreso, Entrenadores, Clientes o Rutinas.
- Añadir notificaciones profesionales nuevas o badges derivados de datos nuevos.
- Conservar rutas profundas al alternar espacios.

## 15. Entrega y límites de verificación

El cambio es de aplicación y no requiere una migración de Supabase. La verificación local podrá
confirmar renderizado, navegación y la protección del contrato de servidor, pero no demuestra
por sí sola el estado de un deployment, una sesión remota real ni el comportamiento en un
dispositivo físico. Esas fronteras deberán informarse por separado si la implementación se
publica posteriormente.
