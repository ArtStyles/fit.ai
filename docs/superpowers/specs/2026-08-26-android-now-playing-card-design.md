# Diseño: tarjeta musical nativa con halo de telaraña radial

**Fecha:** 2026-08-26

**Estado:** Diseño visual aprobado; especificación técnica pendiente de revisión final

**Producto:** Vekira

**Plataforma principal:** aplicación Android con Capacitor 8

## 1. Resumen

Vekira incorporará en el Home una tarjeta compacta que aparece cuando Android informa una
sesión multimedia activa. La tarjeta mostrará portada, título, artista, aplicación de origen,
progreso y un único control principal de reproducción o pausa. Vivirá inmediatamente debajo
del encabezado del Dashboard y antes de los avisos o del recorrido semanal.

El acabado aprobado es **Vekira Pulse fino**:

- tarjeta de 89–92 px de alto, sin borde visible;
- portada de 52 px;
- control circular de 40 px, con objetivo táctil efectivo de 44 × 44 px;
- superficie oscura con profundidad y acento violeta;
- telaraña radial orgánica detrás de la tarjeta, limitada a su halo;
- 24 radios y 8 anillos curvos con pequeñas irregularidades;
- la telaraña no alcanza el encabezado ni “Entrenamiento de hoy”;
- visualizador procedural animado mientras la sesión está reproduciendo.

La detección de sesiones ajenas será exclusiva del contenedor Android. Android exige que el
usuario habilite explícitamente a Vekira como servicio de acceso a notificaciones para poder
consultar `MediaSessionManager.getActiveSessions(...)`. La PWA y el navegador no pueden leer
las sesiones multimedia de otras aplicaciones y no mostrarán la tarjeta.

La primera versión no capturará audio, no usará el micrófono y no intentará calcular el BPM
real. El movimiento será una simulación determinista sincronizada con la posición de la
sesión. Esta decisión evita el permiso de grabación, la proyección de pantalla y la dependencia
de que Spotify u otra aplicación permita copiar su audio.

## 2. Decisiones aprobadas

- **Ubicación:** primer bloque visible del `main` del Dashboard, debajo de
  `DashboardHeader` y antes de `DashboardMainNotice` y `DashboardWeekJourney`.
- **Dirección visual:** Vekira Pulse fino, oscuro y violeta.
- **Altura visual:** 89–92 px.
- **Borde:** ninguno alrededor de la tarjeta musical.
- **Telaraña:** radial, densa, curva, orgánica y restringida al halo del reproductor.
- **Jerarquía:** portada, canción, artista, fuente, visualizador y un control play/pausa.
- **Color de acción:** violeta; el verde lima continúa reservado para acciones de
  entrenamiento.
- **Movimiento reducido:** telaraña y barras estáticas, sin pulsos continuos.
- **Persistencia:** ningún dato musical se guarda en Supabase ni en almacenamiento local.
- **Plataforma inicial:** Android nativo. Web/PWA se mantiene sin tarjeta cross-app.
- **Análisis de audio:** fuera de alcance; la animación no representa el waveform o BPM real.

## 3. Viabilidad y límites de plataforma

### 3.1 Android

`MediaSessionManager` permite obtener controladores de sesiones activas en orden de
prioridad. Para sesiones de otros paquetes, una aplicación normal necesita el permiso
privilegiado `MEDIA_CONTENT_CONTROL` o ser un `NotificationListenerService` habilitado por el
usuario. Vekira usará la segunda ruta.

El acceso permite observar `PlaybackState`, `MediaMetadata` y `TransportControls` publicados
por cada aplicación. La calidad de los datos depende de que el reproductor externo mantenga
una sesión multimedia correcta. Una aplicación que no publique título, artista, posición o
duración producirá una tarjeta parcial o no será elegible.

### 3.2 Web y PWA

La API web `MediaSession` permite que una página publique y controle su propia reproducción;
no expone las sesiones de Spotify, YouTube Music u otras aplicaciones. El adaptador web
devolverá `unsupported` y el Dashboard no reservará espacio vacío.

### 3.3 Audio y ritmo

`AudioPlaybackCapture` requiere Android 10+, permiso `RECORD_AUDIO`, consentimiento mediante
`MediaProjection` y que la aplicación fuente autorice la captura. Esas condiciones no son
adecuadas para una tarjeta ambiental. V1 no solicitará esos permisos ni procesará muestras
de audio.

El ritmo visual se generará localmente con osciladores deterministas y la posición de
reproducción. Se percibirá sincronizado y estable, pero no se describirá como BPM real ni
análisis del sonido.

## 4. Objetivos

1. Detectar de forma reactiva la sesión multimedia prioritaria de Android.
2. Mostrar metadatos útiles sin depender de una integración específica con Spotify.
3. Permitir pausar y reanudar desde un único control seguro.
4. Ocultar la tarjeta sin dejar huecos cuando no exista una sesión elegible.
5. Mantener toda la información musical dentro del dispositivo.
6. Conservar el lenguaje visual, responsive y accesible de Vekira.
7. Degradar de forma segura en navegador, PWA y versiones antiguas de la app nativa.

## 5. Fuera de alcance

- Reproducir música directamente dentro de Vekira.
- Buscar canciones, crear playlists o iniciar sesión en Spotify, Apple Music u otro proveedor.
- Mostrar controles anterior/siguiente, volumen, cola o selector de dispositivo en V1.
- Capturar, grabar, transmitir o almacenar audio de otras aplicaciones.
- Calcular BPM, espectro o waveform reales.
- Persistir título, artista, portada, paquete o historial de escucha.
- Crear una implementación equivalente para iOS sin una API pública compatible.
- Garantizar compatibilidad con aplicaciones que no publiquen una `MediaSession` activa.
- Añadir la telaraña a la barra superior, navegación inferior o tarjetas de entrenamiento.

## 6. Experiencia y estados visibles

### 6.1 Activación

La integración se habilitará desde Ajustes, en una sección “Integración musical”. Vekira
explicará que Android concede un acceso amplio a notificaciones, aunque la implementación
solo consulte sesiones multimedia y nunca lea ni almacene cuerpos de notificaciones.

El botón “Habilitar en Android” abrirá la pantalla del sistema para servicios de escucha de
notificaciones. No se mostrará un diálogo propio que simule el permiso ni se abrirán Ajustes
automáticamente al entrar al Home.

Estados de la sección:

- `unsupported`: navegador, PWA o contenedor sin el plugin;
- `not_granted`: integración disponible, pero no habilitada por el usuario;
- `granted_idle`: habilitada y sin sesión activa;
- `active`: existe una sesión elegible;
- `error`: fallo recuperable al consultar Android.

Sin permiso, el Home no mostrará una tarjeta vacía ni un CTA persistente. La activación vive
únicamente en Ajustes.

### 6.2 Visibilidad de la tarjeta

La tarjeta aparece cuando la sesión prioritaria está en `STATE_PLAYING`. Si se pausa, queda
visible hasta 12 segundos con el icono de reproducir para permitir reanudar. Si no se reanuda,
sale y libera por completo su espacio. Una sesión destruida o sin metadatos mínimos se oculta
de inmediato.

La entrada y salida usarán opacidad y un desplazamiento vertical de 4–6 px. No se reservará
altura durante SSR: el componente se monta oculto y aparece solo después de consultar el
plugin, evitando bloques negros vacíos.

### 6.3 Contenido

La tarjeta mostrará:

- portada proporcionada por la sesión o un fallback Vekira;
- título, con una línea y elipsis;
- artista, con una línea y elipsis;
- nombre legible de la aplicación fuente;
- barras procedurales;
- progreso de lectura si duración y posición son válidas;
- botón play/pausa.

No se mostrará el logotipo de un proveedor si Android solo entrega el nombre del paquete.
Vekira usará el nombre de aplicación resuelto por `PackageManager` y un tratamiento tipográfico
neutro.

## 7. Especificación visual

### 7.1 Tarjeta

- alto objetivo: 89–92 px;
- radio: 18–20 px;
- padding vertical: 10 px;
- padding horizontal: 12 px;
- separación interna: 10 px;
- portada: 52 × 52 px, radio de 15 px;
- control visible: 40 × 40 px dentro de un objetivo de 44 × 44 px;
- sin `border`; profundidad mediante gradiente, sombra y brillo interior;
- título aproximado de 13 px y artista de 9 px en móvil;
- línea de progreso de 2 px en la base.

La superficie reutilizará `surface-1`, `surface-2`, foreground y la familia violeta existente.
No se introducirá un verde nuevo ni se alterará el significado del color de entrenamiento.

### 7.2 Halo radial

`MusicWebHalo` será un SVG decorativo colocado detrás de la tarjeta:

- `aria-hidden="true"` y `pointer-events: none`;
- 24 radios que parten de un centro oculto detrás de la tarjeta;
- 8 anillos formados por segmentos curvos, no elipses perfectas;
- irregularidad determinista de 1–3 px para evitar un aspecto geométrico artificial;
- variación de opacidad y grosor entre filamentos;
- uno o dos filamentos violetas que pulsan suavemente;
- recorte dentro de una zona aproximada de 143 px de alto;
- separación completa respecto del encabezado y del bloque inferior.

La tarjeta opaca el centro de la red. Solo se ven los filamentos superiores, inferiores y
laterales que la rodean. La red nunca funciona como borde del componente.

### 7.3 Visualizador

El visualizador tendrá cuatro barras. Una función pura creará fases a partir de una semilla
estable de `packageName + title + artist + durationMs`. Durante reproducción, las alturas se
calcularán con la posición de la sesión y un reloj monotónico local. Al pausar, las barras
quedarán estáticas.

No se re-renderizará todo el Dashboard en cada frame. El movimiento vivirá en CSS mediante
variables o en un subcomponente aislado que actualice solo sus barras. Con
`prefers-reduced-motion: reduce`, no habrá animación continua.

## 8. Arquitectura

### 8.1 Contrato TypeScript

`src/lib/native/musicSession.ts` definirá el límite de plataforma:

```ts
type MusicSessionAuthorization =
  | 'unsupported'
  | 'not_granted'
  | 'granted'

type MusicPlaybackState = 'playing' | 'paused' | 'stopped'

type MusicPlaybackSnapshot = {
  sessionId: string
  packageName: string
  sourceLabel: string
  title: string
  artist: string | null
  album: string | null
  artworkDataUrl: string | null
  state: MusicPlaybackState
  positionMs: number | null
  durationMs: number | null
  playbackSpeed: number
  updatedAtMs: number
  canPlay: boolean
  canPause: boolean
}
```

La API del adaptador será:

```ts
getAuthorizationStatus(): Promise<MusicSessionAuthorization>
openNotificationListenerSettings(): Promise<void>
getCurrentSession(): Promise<MusicPlaybackSnapshot | null>
play(): Promise<void>
pause(): Promise<void>
addListener(
  'sessionChanged',
  listener: (snapshot: MusicPlaybackSnapshot | null) => void,
): Promise<PluginListenerHandle>
```

El adaptador comprobará `Capacitor.isNativePlatform()`, plataforma Android y
`Capacitor.isPluginAvailable('MusicSession')`. En cualquier otro entorno devolverá
`unsupported` sin lanzar.

### 8.2 Plugin Android

Se añadirá un plugin local en Java bajo
`android/app/src/main/java/com/fitai/app/music/`:

- `MusicSessionPlugin.java`: puente Capacitor y ciclo de listeners;
- `VekiraNotificationListenerService.java`: componente autorizado por Android;
- `MusicSessionMapper.java`: conversión de `MediaController` a payload seguro.

`MainActivity` registrará `MusicSessionPlugin` antes de completar el arranque del bridge. El
manifest declarará el servicio con
`android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`, `exported="true"` y el intent filter
de `android.service.notification.NotificationListenerService`.

El plugin:

1. comprueba si el paquete de Vekira está entre los listeners habilitados;
2. obtiene `MediaSessionManager`;
3. registra `OnActiveSessionsChangedListener`;
4. elige la primera sesión válida en el orden de prioridad de Android;
5. registra un `MediaController.Callback` solo para esa sesión;
6. emite `sessionChanged` cuando cambian metadata, estado o sesión prioritaria;
7. elimina callbacks al detenerse o cambiar de sesión;
8. usa `TransportControls.play()` y `pause()` solo si el estado anuncia esa capacidad.

La lista no se filtrará únicamente por Spotify: cualquier reproductor que publique una sesión
compatible podrá aparecer. Se excluirán sesiones sin título, sesiones detenidas y el propio
paquete de Vekira.

### 8.3 Portadas

Un `Bitmap` de metadata se escalará nativamente a un máximo de 160 × 160 px y se devolverá
como WebP o PNG en memoria, con un límite estricto de tamaño. La capa web no hará peticiones
de red para completar portadas. Si el bitmap o URI no se puede leer, mostrará el fallback
violeta aprobado.

### 8.4 Estado React

`useNowPlayingSession` será el único coordinador cliente. Al montar:

1. comprueba soporte y autorización;
2. consulta el snapshot inicial;
3. registra el listener;
4. reconcilia posición con `updatedAtMs` y `playbackSpeed`;
5. aplica la gracia de 12 segundos al pausar;
6. limpia listener y temporizador al desmontar.

El hook usará un reducer puro para que transiciones, selección, gracia y errores sean
deterministas. No habrá Zustand global: el dato solo lo consume el Home y una futura sección
de Ajustes.

### 8.5 Dashboard

`MusicNowPlayingSlot` se insertará como primer bloque visual dentro de `<main>` en
`src/app/(app)/dashboard/page.tsx`. El slot devolverá `null` hasta disponer de un snapshot
visible. Sus componentes serán:

- `MusicNowPlayingSlot`: soporte, suscripción y visibilidad;
- `MusicNowPlayingCard`: contenido y control;
- `MusicWebHalo`: SVG decorativo;
- `MusicPulseVisualizer`: animación aislada.

Esta separación evita incorporar lógica nativa a `DashboardHeader` o al Server Component de
la página.

## 9. Privacidad y seguridad

- La integración es opt-in y reversible desde Ajustes de Android.
- El servicio no procesa cuerpos, remitentes ni contenido de notificaciones.
- No se envía metadata musical a Vercel, Supabase, analítica o logs remotos.
- Los logs de desarrollo no incluyen título, artista ni portada.
- Las portadas viven en memoria y se descartan al cambiar la sesión.
- La tarjeta no se monta para usuarios no autenticados porque pertenece al shell del Home.
- El control solo actúa sobre la sesión seleccionada por Android; nunca almacena tokens de
  proveedor.
- La publicación en tienda debe explicar de forma precisa el uso del acceso a notificaciones
  y revisarse contra las políticas vigentes antes de distribuir la actualización nativa.

## 10. Errores y recuperación

- **Permiso revocado:** el listener se elimina, la tarjeta desaparece y Ajustes vuelve a
  `not_granted`.
- **Plugin no disponible:** degradación silenciosa a `unsupported`; esto cubre builds nativos
  antiguos que carguen la web nueva.
- **Sesión destruida:** la tarjeta sale sin conservar metadata antigua.
- **Metadata incompleta:** se usa fallback para artista o portada; sin título se descarta.
- **Fallo de play/pausa:** se restaura el último estado confirmado y se muestra un anuncio
  accesible breve, sin toast persistente.
- **Cambio rápido de canciones:** solo el último `sessionId + updatedAtMs` puede actualizar el
  reducer; eventos anteriores se ignoran.
- **Aplicación en background:** al reanudar Vekira se vuelve a consultar permiso y snapshot.
- **Listener desconectado por Android:** el servicio espera `onListenerConnected()` y solicita
  rebind por la vía oficial antes de volver a consultar.

No habrá polling continuo. Los eventos nativos y una consulta al montar o reanudar son la
fuente de verdad.

## 11. Accesibilidad y responsive

- Botón play/pausa con nombre dinámico “Pausar {canción}” o “Reproducir {canción}”.
- Objetivo táctil mínimo de 44 × 44 px aunque el círculo visible mida 40 px.
- Título y artista se truncan sin desplazar el control.
- La portada y la telaraña son decorativas cuando el texto ya comunica la información.
- Estado de error en una región `aria-live="polite"`.
- El movimiento no es necesario para comprender si la música está activa.
- Con movimiento reducido, barras, filamentos y entrada se vuelven estáticos o instantáneos.
- No habrá overflow horizontal a 320, 360, 390, 412 y 430 px.
- La tarjeta mantendrá 89–92 px; en anchos extremos reducirá el gap antes de ocultar artista o
  fuente.
- La telaraña se recorta dentro de su halo y nunca intercepta punteros.

## 12. Pruebas

### 12.1 Lógica TypeScript

- plataforma web y plugin ausente devuelven `unsupported`;
- permiso ausente no registra listeners;
- selección de snapshot activo y descarte de metadata inválida;
- pausa mantiene la tarjeta durante 12 segundos y luego la oculta;
- una reanudación cancela el temporizador de salida;
- eventos antiguos no sustituyen un snapshot más reciente;
- posición se reconcilia con velocidad y timestamp;
- semilla visual estable para la misma canción;
- limpieza de listeners y temporizadores.

### 12.2 Componentes

- el slot no reserva espacio sin sesión;
- el orden estructural es Header → Música → Avisos → Semana;
- play/pausa conserva objetivo táctil de 44 px;
- título y artista truncados no invaden el control;
- el SVG tiene `aria-hidden` y `pointer-events: none`;
- movimiento reducido elimina animaciones continuas;
- snapshots en 320, 360, 390, 412 y 430 px no presentan overflow.

### 12.3 Android

- mapper de metadata completa, parcial y sin título;
- elección de sesión por prioridad y estado;
- alta y baja correcta de `MediaController.Callback`;
- permiso no concedido devuelve estado tipado, no `SecurityException` a JavaScript;
- play y pausa usan la sesión actual;
- portada se limita y libera;
- desconexión y rebind del servicio;
- prueba instrumentada con una `MediaSession` controlada dentro del fixture Android.

### 12.4 Verificación manual en dispositivo

1. Instalar un build Android con el plugin.
2. Confirmar que el Home no muestra hueco antes del permiso.
3. Habilitar la integración desde Ajustes del sistema.
4. Reproducir Spotify, YouTube Music u otro reproductor con `MediaSession`.
5. Verificar título, artista, portada, progreso y fuente.
6. Pausar y reanudar desde Vekira.
7. Cambiar de canción y confirmar actualización sin metadata anterior.
8. Revocar el permiso y confirmar ocultación inmediata.
9. Probar movimiento reducido y rotación de pantalla.

Comandos de repositorio previstos:

```text
pnpm test
pnpm type-check
pnpm lint
pnpm cap:sync
android\gradlew.bat test
git diff --check
```

## 13. Archivos previstos

Nuevos:

- `android/app/src/main/java/com/fitai/app/music/MusicSessionPlugin.java`
- `android/app/src/main/java/com/fitai/app/music/VekiraNotificationListenerService.java`
- `android/app/src/main/java/com/fitai/app/music/MusicSessionMapper.java`
- `src/lib/native/musicSession.ts`
- `src/components/dashboard/MusicNowPlayingSlot.tsx`
- `src/components/dashboard/MusicNowPlayingCard.tsx`
- `src/components/dashboard/MusicWebHalo.tsx`
- `src/components/dashboard/MusicPulseVisualizer.tsx`
- pruebas unitarias y de componente junto a esas capas

Modificados:

- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/com/fitai/app/MainActivity.java`
- `src/app/(app)/dashboard/page.tsx`
- la vista de Ajustes que aloje “Integración musical”
- `src/styles/globals.css` solo si los tokens actuales no cubren la animación

No se requiere migración de base de datos ni dependencia de proveedor musical.

## 14. Despliegue

1. Implementar y validar primero el plugin en un build Android interno.
2. Desplegar la web con detección de `Capacitor.isPluginAvailable` para que builds antiguos
   permanezcan estables.
3. Probar al menos dos reproductores y un caso sin metadata completa.
4. Revisar disclosure y política de tienda antes de publicar el APK/AAB.
5. Publicar la actualización nativa; un despliegue de Vercel por sí solo no instala el plugin
   ni modifica el manifest de dispositivos existentes.

La funcionalidad puede activarse gradualmente porque la ausencia del plugin oculta el slot.
No habrá escritura remota que necesite rollback.

## 15. Criterios de aceptación

1. La tarjeta aparece debajo del encabezado cuando Android informa música reproduciéndose.
2. Sin sesión, permiso o plugin, no existe hueco visual en el Home.
3. La tarjeta mide 89–92 px, no tiene borde y conserva un control táctil de 44 px.
4. La telaraña es radial, curva, orgánica y solo rodea el reproductor.
5. La red no alcanza el encabezado, avisos ni tarjeta de entrenamiento.
6. Título, artista, portada, fuente y progreso se actualizan al cambiar de canción.
7. Play y pausa controlan la sesión prioritaria real de Android.
8. Una pausa conserva la tarjeta 12 segundos y una sesión destruida la oculta de inmediato.
9. La animación procedural se detiene al pausar y respeta movimiento reducido.
10. No se captura audio, no se usa el micrófono y no se persiste metadata musical.
11. Navegador, PWA y builds sin plugin degradan a `unsupported` sin error visible.
12. Pruebas TypeScript, componentes, Android, tipos, lint y diff terminan en verde.
13. La compatibilidad se confirma en un dispositivo Android real antes de publicación.

## 16. Referencias técnicas verificadas

- Android `MediaSessionManager`:
  https://developer.android.com/reference/android/media/session/MediaSessionManager
- Android `NotificationListenerService`:
  https://developer.android.com/reference/android/service/notification/NotificationListenerService
- Android Audio Playback Capture:
  https://developer.android.com/media/platform/av-capture
- Web `MediaSession`:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaSession
- Capacitor 8:
  https://capacitorjs.com/docs
