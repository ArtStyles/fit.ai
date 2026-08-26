# Android Now Playing Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en el Home de Vekira una tarjeta musical compacta, con telaraña radial y movimiento procedural, que refleje y controle la sesión multimedia prioritaria de Android sin capturar audio ni dejar huecos en web.

**Architecture:** Un plugin Capacitor local consulta `MediaSessionManager` mediante un `NotificationListenerService` autorizado por el usuario y expone snapshots tipados. Un adaptador TypeScript degrada a `unsupported` fuera de Android; un coordinador cliente conserva una pausa durante 12 segundos, descarta eventos antiguos y alimenta tanto el Home como Ajustes. La capa visual es independiente de la capa nativa y usa SVG/CSS determinista, sin persistencia ni peticiones de portadas.

**Tech Stack:** Next.js 14 Server/Client Components, React 18, TypeScript 5, Tailwind CSS 3, Capacitor 8, Android Java (SDK 24–36), Vitest 4, Playwright/Chromium y JUnit 4.

**Spec:** `docs/superpowers/specs/2026-08-26-android-now-playing-card-design.md`

## Global Constraints

- La ejecución debe comenzar invocando `superpowers:using-git-worktrees`. El `main` actual contiene cambios ajenos en `SecondaryMetrics.tsx` y sus pruebas/fixtures responsive; no se pueden editar, limpiar, incluir ni sobrescribir desde ese worktree.
- Antes de integrar de vuelta, hay que revisar el `vitest.config.ts` vigente y añadir la nueva prueba visual conservando la entrada existente de `SecondaryMetricsResponsive.test.tsx`.
- Seguir TDD en cada tarea: escribir la prueba, confirmar el fallo correcto, implementar lo mínimo, confirmar el pase y recién entonces crear el commit indicado.
- No instalar Spotify, Apple Music ni otra integración de proveedor. El origen es la sesión multimedia del sistema Android, no una cuenta externa.
- No solicitar `RECORD_AUDIO`, `MediaProjection`, micrófono ni captura de audio. El movimiento es procedural y determinista.
- No añadir tablas, migraciones, Zustand, `localStorage` ni persistencia de metadata musical. Portada y snapshot viven solo en memoria.
- Web, PWA, SSR, iOS y builds sin el plugin deben devolver `unsupported`, renderizar `null` en el Home y no reservar altura.
- La activación solo se inicia desde `/settings/musica`; el Home nunca abre Ajustes ni muestra un CTA de permiso.
- La tarjeta debe medir entre 89 y 92 px, carecer de borde, conservar un objetivo táctil mínimo de 44 × 44 px y respetar `prefers-reduced-motion`.
- La prueba en un dispositivo Android real es una frontera obligatoria de publicación. Un build y las pruebas JVM no sustituyen esa comprobación.

## File Map

**Create — TypeScript/native boundary**

- `src/lib/native/musicSession.ts` — contrato público, registro de plugin y fallback web.
- `src/lib/native/musicSessionState.ts` — estado, reconciliación, semilla y coordinador testeable.
- `src/lib/native/useNowPlayingSession.ts` — hook React y refresco al volver al foreground.
- `src/lib/native/__tests__/musicSession.test.ts` — contrato del adaptador.
- `src/lib/native/__tests__/musicSessionState.test.ts` — transiciones, reloj, gracia y limpieza.
- `src/lib/native/__tests__/musicSessionAndroidContract.test.ts` — registro/manifest verificables sin dispositivo.

**Create — Android**

- `android/app/src/main/java/com/fitai/app/music/MusicSessionPayload.java` — DTO inmutable sin objetos Android.
- `android/app/src/main/java/com/fitai/app/music/MusicSessionPolicy.java` — selección pura de la primera sesión elegible.
- `android/app/src/main/java/com/fitai/app/music/MusicSessionMapper.java` — metadata, capacidades, posición y portada limitada.
- `android/app/src/main/java/com/fitai/app/music/MusicSessionAccess.java` — autorización y acceso protegido a sesiones.
- `android/app/src/main/java/com/fitai/app/music/MusicSessionPlugin.java` — puente Capacitor, callbacks y transport controls.
- `android/app/src/main/java/com/fitai/app/music/VekiraNotificationListenerService.java` — ancla de autorización y rebind.
- `android/app/src/test/java/com/fitai/app/music/MusicSessionPolicyTest.java` — política JVM.
- `android/app/src/androidTest/java/com/fitai/app/music/MusicSessionMapperInstrumentedTest.java` — `MediaSession` controlada.

**Create — visual/Home**

- `src/components/dashboard/musicVisuals.ts` — geometría radial y fases deterministas.
- `src/components/dashboard/MusicWebHalo.tsx` — SVG decorativo.
- `src/components/dashboard/MusicPulseVisualizer.tsx` — cuatro barras aisladas.
- `src/components/dashboard/MusicNowPlayingCard.tsx` — tarjeta de 90 px.
- `src/components/dashboard/MusicNowPlayingSlot.tsx` — unión entre hook y presentación.
- `src/components/dashboard/__tests__/musicVisuals.test.ts` — determinismo y geometría.
- `src/components/dashboard/__tests__/MusicNowPlayingCard.test.tsx` — contenido, accesibilidad y dimensiones.
- `src/components/dashboard/__tests__/MusicNowPlayingSlot.test.tsx` — ausencia total de espacio y estados visibles.
- `src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx` — overflow, halo y movimiento reducido.
- `src/components/dashboard/__tests__/fixtures/musicNowPlaying.html` — documento de fixture visual.
- `src/components/dashboard/__tests__/fixtures/musicNowPlaying.fixture.tsx` — montaje con metadata extrema.

**Create — Settings**

- `src/components/settings/MusicIntegrationSettings.tsx` — estados y acceso explícito a Android.
- `src/components/settings/__tests__/MusicIntegrationSettings.test.tsx` — matriz de estados.
- `src/app/(app)/settings/musica/page.tsx` — ruta autenticada y localizada.

**Modify**

- `android/app/src/main/java/com/fitai/app/MainActivity.java` — registrar el plugin antes de `super.onCreate`.
- `android/app/src/main/AndroidManifest.xml` — declarar el servicio protegido.
- `src/app/(app)/dashboard/page.tsx` — insertar el slot después del H1 oculto y antes de avisos.
- `src/components/dashboard/__tests__/dashboardStructure.test.ts` — asegurar Header → Música → Avisos → Semana.
- `src/app/(app)/settings/page.tsx` — entrada “Integración musical”.
- `src/components/navigation/PendingLinkIcon.tsx` — icono `music-2`.
- `src/components/settings/__tests__/settingsOverview.test.tsx` — contrato de navegación.
- `src/lib/i18n/index.ts` — copias ES/EN.
- `src/styles/globals.css` — keyframes aislados y reducción de movimiento.
- `vitest.config.ts` — añadir únicamente la nueva prueba visual, conservando las modificaciones ya presentes.

---

## Task 1: Define the safe TypeScript plugin boundary

**Files:**

- Create: `src/lib/native/musicSession.ts`
- Create: `src/lib/native/__tests__/musicSession.test.ts`

**Interfaces**

- Consumes: `Capacitor.isNativePlatform()`, `Capacitor.getPlatform()`, `Capacitor.isPluginAvailable()` y `registerPlugin()`.
- Produces: `MusicPlaybackSnapshot`, `MusicSessionAuthorization`, `MusicSessionAdapter` y `musicSessionAdapter` para el coordinador y Ajustes.

- [ ] **Step 1: Write failing adapter tests**

Crear mocks hoisted para `@capacitor/core` y probar exactamente estos casos:

```ts
it('returns unsupported without invoking the native plugin on web', async () => {
  capacitorMocks.isNativePlatform.mockReturnValue(false)

  await expect(musicSessionAdapter.getAuthorizationStatus()).resolves.toBe('unsupported')
  await expect(musicSessionAdapter.getCurrentSession()).resolves.toBeNull()
  expect(nativeMocks.getAuthorizationStatus).not.toHaveBeenCalled()
})

it('unwraps native snapshots and listener events on supported Android', async () => {
  nativeMocks.getCurrentSession.mockResolvedValue({ snapshot: PLAYING_SNAPSHOT })
  nativeMocks.addListener.mockImplementation(async (_name, listener) => {
    listener({ snapshot: PLAYING_SNAPSHOT })
    return { remove: vi.fn() }
  })
  const listener = vi.fn()

  await expect(musicSessionAdapter.getCurrentSession()).resolves.toEqual(PLAYING_SNAPSHOT)
  await musicSessionAdapter.addListener('sessionChanged', listener)
  expect(listener).toHaveBeenCalledWith(PLAYING_SNAPSHOT)
})
```

- [ ] **Step 2: Run the targeted test and confirm the expected failure**

Run: `pnpm test -- src/lib/native/__tests__/musicSession.test.ts`

Expected: FAIL because `../musicSession` does not exist.

- [ ] **Step 3: Implement the public contract and web fallback**

El archivo debe contener estos tipos, sin ampliar el estado con valores específicos de Spotify:

```ts
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'

export type MusicSessionAuthorization = 'unsupported' | 'not_granted' | 'granted'
export type MusicPlaybackState = 'playing' | 'paused' | 'stopped'

export type MusicPlaybackSnapshot = {
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

type NativeSessionEvent = { snapshot: MusicPlaybackSnapshot | null }

interface NativeMusicSessionPlugin {
  getAuthorizationStatus(): Promise<{ status: MusicSessionAuthorization }>
  openNotificationListenerSettings(): Promise<void>
  getCurrentSession(): Promise<NativeSessionEvent>
  play(): Promise<void>
  pause(): Promise<void>
  addListener(
    eventName: 'sessionChanged',
    listener: (event: NativeSessionEvent) => void,
  ): Promise<PluginListenerHandle>
}

export interface MusicSessionAdapter {
  getAuthorizationStatus(): Promise<MusicSessionAuthorization>
  openNotificationListenerSettings(): Promise<void>
  getCurrentSession(): Promise<MusicPlaybackSnapshot | null>
  play(): Promise<void>
  pause(): Promise<void>
  addListener(
    eventName: 'sessionChanged',
    listener: (snapshot: MusicPlaybackSnapshot | null) => void,
  ): Promise<PluginListenerHandle>
}

const NativeMusicSession = registerPlugin<NativeMusicSessionPlugin>('MusicSession')
const EMPTY_HANDLE: PluginListenerHandle = { remove: async () => undefined }

function isSupportedAndroid(): boolean {
  return Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android'
    && Capacitor.isPluginAvailable('MusicSession')
}
```

Todos los métodos deben comprobar `isSupportedAndroid()`. Los métodos de lectura devuelven `unsupported`/`null`, los controles y apertura de Ajustes son no-op, y `addListener` devuelve `EMPTY_HANDLE` fuera de Android. En Android, se desenvuelven `{ status }` y `{ snapshot }`; los errores nativos se propagan al coordinador para convertirse en `error`.

- [ ] **Step 4: Run tests and type-check the contract**

Run:

```text
pnpm test -- src/lib/native/__tests__/musicSession.test.ts
pnpm type-check
```

Expected: PASS; no `any`, no acceso nativo en web y los nombres coinciden con `MusicSession`.

- [ ] **Step 5: Commit only the adapter files**

```text
git add src/lib/native/musicSession.ts src/lib/native/__tests__/musicSession.test.ts
git commit -m "feat: define Android music session bridge"
```

---

## Task 2: Build the deterministic session coordinator and React hook

**Files:**

- Create: `src/lib/native/musicSessionState.ts`
- Create: `src/lib/native/useNowPlayingSession.ts`
- Create: `src/lib/native/__tests__/musicSessionState.test.ts`

**Interfaces**

- Consumes: `MusicSessionAdapter` and `MusicPlaybackSnapshot` from Task 1; `App.addListener('appStateChange')` from `@capacitor/app`.
- Produces: `NowPlayingState`, `createNowPlayingSessionController()`, `reconcilePositionMs()`, `createMusicVisualSeed()` and `useNowPlayingSession()`.

- [ ] **Step 1: Write state-machine tests with an injected clock**

Definir un reloj falso con `now`, `setTimeout` y `clearTimeout`. Cubrir ausencia de permiso, snapshot inicial, evento antiguo, pausa, reanudación y destrucción:

```ts
it('keeps a paused session for exactly twelve seconds', async () => {
  const harness = createHarness({ authorization: 'granted', current: PLAYING_SNAPSHOT })
  const states: NowPlayingState[] = []
  const controller = createNowPlayingSessionController(harness.adapter, state => states.push(state), harness.clock)
  await controller.start()

  harness.emit({ ...PLAYING_SNAPSHOT, state: 'paused', updatedAtMs: 2_000 })
  expect(states.at(-1)).toMatchObject({ status: 'active', snapshot: { state: 'paused' } })

  harness.advanceBy(11_999)
  expect(states.at(-1)?.status).toBe('active')
  harness.advanceBy(1)
  expect(states.at(-1)).toEqual({ status: 'granted_idle', snapshot: null, error: null })
})

it('cancels paused exit when playback resumes and ignores older events', async () => {
  const harness = createHarness({ authorization: 'granted', current: PLAYING_SNAPSHOT })
  const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)
  await controller.start()
  harness.emit({ ...PLAYING_SNAPSHOT, state: 'paused', updatedAtMs: 4_000 })
  harness.emit({ ...PLAYING_SNAPSHOT, state: 'playing', updatedAtMs: 5_000 })
  harness.emit({ ...PLAYING_SNAPSHOT, title: 'Old title', updatedAtMs: 4_500 })
  harness.advanceBy(12_000)

  expect(harness.latest().snapshot?.title).toBe(PLAYING_SNAPSHOT.title)
  expect(harness.latest().status).toBe('active')
})

it('removes the native listener and timeout when stopped', async () => {
  const harness = createHarness({ authorization: 'granted', current: PAUSED_SNAPSHOT })
  const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)
  await controller.start()
  await controller.stop()

  expect(harness.remove).toHaveBeenCalledOnce()
  expect(harness.pendingTimers()).toBe(0)
})
```

Añadir pruebas para `reconcilePositionMs()` con velocidad 1.25 y clamp a duración, y para una semilla idéntica con `packageName + title + artist + durationMs`.

- [ ] **Step 2: Confirm the tests fail for missing implementation**

Run: `pnpm test -- src/lib/native/__tests__/musicSessionState.test.ts`

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement pure state and timing rules**

Usar estas formas públicas:

```ts
export const PAUSED_SESSION_GRACE_MS = 12_000

export type NowPlayingStatus =
  | 'checking'
  | 'unsupported'
  | 'not_granted'
  | 'granted_idle'
  | 'active'
  | 'error'

export type NowPlayingState = {
  status: NowPlayingStatus
  snapshot: MusicPlaybackSnapshot | null
  error: string | null
}

export type MusicSessionClock = {
  now(): number
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
}
```

Reglas del coordinador:

1. `start()` emite `checking`, consulta autorización y no registra listener en `unsupported`/`not_granted`.
2. Con autorización, obtiene el snapshot inicial y registra exactamente un listener.
3. Un snapshot sin título, `stopped` o `null` cancela el temporizador y emite `granted_idle` inmediatamente.
4. `playing` cancela salida y emite `active`.
5. `paused` emite `active` y programa una única salida a 12 000 ms.
6. Un snapshot no nulo con `updatedAtMs` menor al snapshot visible se ignora.
7. `refresh()` vuelve a comprobar permiso; si fue revocado limpia listener, timer y snapshot.
8. `stop()` es idempotente y limpia recursos incluso si `start()` termina después.

La reconciliación debe usar:

```ts
const elapsed = snapshot.state === 'playing'
  ? Math.max(0, nowMs - snapshot.updatedAtMs) * Math.max(0, snapshot.playbackSpeed)
  : 0
return Math.min(snapshot.durationMs, Math.max(0, snapshot.positionMs + elapsed))
```

- [ ] **Step 4: Wrap the coordinator in the client hook**

`useNowPlayingSession()` crea una sola instancia por adaptador, publica el estado con `useState`, llama `start()` en `useEffect` y `stop()` en cleanup. Un segundo efecto escucha `App.addListener('appStateChange')`; cuando `isActive` sea `true`, llama `refresh()`. El hook expone también `play()` y `pause()` con estado `controlPending`, sin hacer optimistic toggle.

- [ ] **Step 5: Run focused verification**

Run:

```text
pnpm test -- src/lib/native/__tests__/musicSession.test.ts src/lib/native/__tests__/musicSessionState.test.ts
pnpm type-check
```

Expected: PASS; los temporizadores falsos quedan vacíos y no quedan listeners tras cleanup.

- [ ] **Step 6: Commit state and hook**

```text
git add src/lib/native/musicSessionState.ts src/lib/native/useNowPlayingSession.ts src/lib/native/__tests__/musicSessionState.test.ts
git commit -m "feat: coordinate now playing session state"
```

---

## Task 3: Implement testable Android metadata and selection policy

**Files:**

- Create: `android/app/src/main/java/com/fitai/app/music/MusicSessionPayload.java`
- Create: `android/app/src/main/java/com/fitai/app/music/MusicSessionPolicy.java`
- Create: `android/app/src/main/java/com/fitai/app/music/MusicSessionMapper.java`
- Create: `android/app/src/test/java/com/fitai/app/music/MusicSessionPolicyTest.java`
- Create: `android/app/src/androidTest/java/com/fitai/app/music/MusicSessionMapperInstrumentedTest.java`

**Interfaces**

- Consumes: Android `MediaController`, `MediaMetadata`, `PlaybackState`, `PackageManager` and `ContentResolver`.
- Produces: immutable `MusicSessionPayload`, `MusicSessionPolicy.selectFirst()` and `MusicSessionMapper.map()` for the plugin.

- [ ] **Step 1: Write the pure JVM policy tests first**

```java
@Test
public void selectFirst_preservesAndroidPriorityAndRejectsInvalidEntries() {
    MusicSessionPayload own = payload("com.fitai.app", "Vekira", "playing", 300L);
    MusicSessionPayload stopped = payload("music.one", "Old", "stopped", 400L);
    MusicSessionPayload firstValid = payload("music.two", "Blinding Lights", "playing", 200L);
    MusicSessionPayload secondValid = payload("music.three", "Later", "playing", 500L);

    MusicSessionPayload selected = MusicSessionPolicy.selectFirst(
        Arrays.asList(own, stopped, firstValid, secondValid),
        "com.fitai.app"
    );

    assertSame(firstValid, selected);
}

@Test
public void selectFirst_rejectsBlankTitleAndKeepsPausedSessionEligible() {
    MusicSessionPayload blank = payload("music.one", "   ", "playing", 10L);
    MusicSessionPayload paused = payload("music.two", "Paused song", "paused", 20L);
    assertSame(paused, MusicSessionPolicy.selectFirst(Arrays.asList(blank, paused), "com.fitai.app"));
}
```

- [ ] **Step 2: Confirm the JVM tests fail**

Run from repository root: `android\gradlew.bat -p android testDebugUnitTest --tests "com.fitai.app.music.MusicSessionPolicyTest"`

Expected: FAIL because the payload and policy classes do not exist.

- [ ] **Step 3: Implement the immutable payload and pure policy**

`MusicSessionPayload` debe contener todos los campos del contrato TypeScript, getters, `toJSObject()` y ningún `MediaController`, `Bitmap` o `Context`. `MusicSessionPolicy.selectFirst()` itera en el orden recibido y acepta solo título no vacío, paquete distinto a Vekira y estado `playing`/`paused`.

```java
public static MusicSessionPayload selectFirst(
    List<MusicSessionPayload> candidates,
    String ownPackageName
) {
    for (MusicSessionPayload candidate : candidates) {
        boolean eligibleState = "playing".equals(candidate.getState())
            || "paused".equals(candidate.getState());
        if (!ownPackageName.equals(candidate.getPackageName())
            && candidate.getTitle() != null
            && !candidate.getTitle().trim().isEmpty()
            && eligibleState) {
            return candidate;
        }
    }
    return null;
}
```

- [ ] **Step 4: Implement Android mapping with bounded artwork**

`MusicSessionMapper.map(Context, MediaController)` debe:

- preferir `METADATA_KEY_TITLE`, luego `METADATA_KEY_DISPLAY_TITLE`;
- resolver artista con `ARTIST`, luego `ALBUM_ARTIST`, y álbum con `ALBUM`;
- resolver `sourceLabel` mediante `PackageManager.getApplicationLabel()` y caer al nombre del paquete;
- mapear solo `STATE_PLAYING`, `STATE_PAUSED` y el resto a `stopped`;
- calcular capacidades con `ACTION_PLAY`, `ACTION_PAUSE` y `ACTION_PLAY_PAUSE`;
- usar `PlaybackState.getPosition()`, `getPlaybackSpeed()` y `getLastPositionUpdateTime()`;
- crear `sessionId` con paquete + hash estable del token durante la vida del proceso;
- preferir `METADATA_KEY_ART`, luego `ALBUM_ART`, luego URI de metadata;
- escalar bitmap manteniendo aspecto a máximo 160 × 160 px;
- comprimir WebP en memoria y devolver `null` si el resultado supera 96 KiB después de reintentar a menor calidad;
- cerrar streams en `try-with-resources` y reciclar solo bitmaps creados por el mapper, nunca el bitmap propiedad de la sesión.

La firma central será:

La implementación debe mantener `map(Context context, MediaController controller)` como una operación total: obtiene `MediaMetadata` y `PlaybackState`, devuelve `null` cuando alguno falta y construye `MusicSessionPayload` únicamente después de normalizar todos los campos anteriores.

- [ ] **Step 5: Add an instrumented mapper test with a controlled MediaSession**

Crear una `MediaSession`, asignar metadata completa/parcial y estado `STATE_PLAYING`, construir un `MediaController` con su token y verificar título, artista, duración, posición, capacidades y que una portada grande termina con dimensiones máximas 160 px antes de codificarse. Cerrar la sesión en `finally`.

- [ ] **Step 6: Run JVM tests and compile the Android app**

Run:

```text
android\gradlew.bat -p android testDebugUnitTest
android\gradlew.bat -p android assembleDebug
```

Expected: PASS and `android/app/build/outputs/apk/debug/app-debug.apk` exists. `connectedDebugAndroidTest` is deferred until Task 8 because it requires a device/emulator.

- [ ] **Step 7: Commit Android policy and mapper**

```text
git add android/app/src/main/java/com/fitai/app/music/MusicSessionPayload.java android/app/src/main/java/com/fitai/app/music/MusicSessionPolicy.java android/app/src/main/java/com/fitai/app/music/MusicSessionMapper.java android/app/src/test/java/com/fitai/app/music/MusicSessionPolicyTest.java android/app/src/androidTest/java/com/fitai/app/music/MusicSessionMapperInstrumentedTest.java
git commit -m "feat: map Android media sessions safely"
```

---

## Task 4: Bridge Android sessions through Capacitor

**Files:**

- Create: `android/app/src/main/java/com/fitai/app/music/MusicSessionAccess.java`
- Create: `android/app/src/main/java/com/fitai/app/music/MusicSessionPlugin.java`
- Create: `android/app/src/main/java/com/fitai/app/music/VekiraNotificationListenerService.java`
- Create: `src/lib/native/__tests__/musicSessionAndroidContract.test.ts`
- Modify: `android/app/src/main/java/com/fitai/app/MainActivity.java`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces**

- Consumes: mapper/policy from Task 3, `MediaSessionManager`, enabled notification listener packages and Capacitor plugin APIs.
- Produces: native plugin named exactly `MusicSession`, event `{ snapshot }`, settings intent and real play/pause controls.

- [ ] **Step 1: Write a red static Android contract test**

Leer los tres archivos Android desde Vitest y exigir:

```ts
expect(plugin).toContain('@CapacitorPlugin(name = "MusicSession")')
expect(mainActivity).toContain('registerPlugin(MusicSessionPlugin.class)')
expect(mainActivity.indexOf('registerPlugin(MusicSessionPlugin.class)'))
  .toBeLessThan(mainActivity.indexOf('super.onCreate(savedInstanceState)'))
expect(manifest).toContain('android.permission.BIND_NOTIFICATION_LISTENER_SERVICE')
expect(manifest).toContain('android.service.notification.NotificationListenerService')
expect(manifest).not.toContain('android.permission.RECORD_AUDIO')
```

- [ ] **Step 2: Confirm the contract fails**

Run: `pnpm test -- src/lib/native/__tests__/musicSessionAndroidContract.test.ts`

Expected: FAIL because the plugin and service do not exist and the manifest lacks the service.

- [ ] **Step 3: Implement guarded authorization/session access**

`MusicSessionAccess` centraliza la comprobación y captura `SecurityException`:

```java
public boolean isAuthorized(Context context) {
    return NotificationManagerCompat.getEnabledListenerPackages(context)
        .contains(context.getPackageName());
}

public List<MediaController> getActiveSessions(
    Context context,
    MediaSessionManager manager,
    ComponentName listenerComponent
) {
    if (!isAuthorized(context)) return Collections.emptyList();
    try {
        return manager.getActiveSessions(listenerComponent);
    } catch (SecurityException denied) {
        return Collections.emptyList();
    }
}
```

- [ ] **Step 4: Implement the Capacitor plugin lifecycle**

`MusicSessionPlugin` tendrá `@CapacitorPlugin(name = "MusicSession")` y estos métodos: `getAuthorizationStatus`, `openNotificationListenerSettings`, `getCurrentSession`, `play`, `pause`. En `load()` obtiene servicios pero solo registra `OnActiveSessionsChangedListener` si hay autorización. En `handleOnResume()` vuelve a consultar autorización. En `handleOnDestroy()` elimina listener y callback.

El cambio de controlador debe seguir este orden para impedir callbacks filtrados:

```java
private void selectController(MediaController next) {
    if (selectedController != null) {
        selectedController.unregisterCallback(controllerCallback);
    }
    selectedController = next;
    selectedPayload = next == null ? null : mapper.map(getContext(), next);
    if (selectedController != null) {
        selectedController.registerCallback(controllerCallback);
    }
}
```

Cada cambio emite `notifyListeners("sessionChanged", event)` donde `event` siempre contiene la clave `snapshot`, incluso cuando sea `JSONObject.NULL`. `play()`/`pause()` comprueban `selectedPayload.canPlay()`/`canPause()` antes de invocar `TransportControls`. Si no hay permiso, todos los métodos resuelven un estado tipado y nunca filtran `SecurityException` a JavaScript.

- [ ] **Step 5: Register the plugin and listener service**

En `MainActivity.onCreate()`:

```java
registerPlugin(MusicSessionPlugin.class);
super.onCreate(savedInstanceState);
```

El registro debe quedar antes de `super`, conservando intacta la configuración edge-to-edge posterior.

En `<application>` del manifest:

```xml
<service
    android:name=".music.VekiraNotificationListenerService"
    android:exported="true"
    android:label="Vekira music integration"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

El servicio no lee `StatusBarNotification`. En `onListenerDisconnected()` llama `requestRebind(new ComponentName(this, VekiraNotificationListenerService.class))`.

- [ ] **Step 6: Run contract, unit and compile verification**

Run:

```text
pnpm test -- src/lib/native/__tests__/musicSessionAndroidContract.test.ts
android\gradlew.bat -p android testDebugUnitTest
android\gradlew.bat -p android assembleDebug
```

Expected: PASS; no permiso de audio; plugin registered before bridge startup.

- [ ] **Step 7: Commit the native bridge only**

```text
git add android/app/src/main/java/com/fitai/app/music/MusicSessionAccess.java android/app/src/main/java/com/fitai/app/music/MusicSessionPlugin.java android/app/src/main/java/com/fitai/app/music/VekiraNotificationListenerService.java android/app/src/main/java/com/fitai/app/MainActivity.java android/app/src/main/AndroidManifest.xml src/lib/native/__tests__/musicSessionAndroidContract.test.ts
git commit -m "feat: expose Android media sessions to Capacitor"
```

---

## Task 5: Build the compact card, radial web and procedural visualizer

**Files:**

- Create: `src/components/dashboard/musicVisuals.ts`
- Create: `src/components/dashboard/MusicWebHalo.tsx`
- Create: `src/components/dashboard/MusicPulseVisualizer.tsx`
- Create: `src/components/dashboard/MusicNowPlayingCard.tsx`
- Create: `src/components/dashboard/__tests__/musicVisuals.test.ts`
- Create: `src/components/dashboard/__tests__/MusicNowPlayingCard.test.tsx`
- Modify: `src/styles/globals.css`

**Interfaces**

- Consumes: `MusicPlaybackSnapshot`, `reconcilePositionMs()` and `createMusicVisualSeed()`.
- Produces: pure radial geometry, decorative halo, four-bar visualizer and an accessible controlled card.

- [ ] **Step 1: Write failing visual-domain tests**

```ts
it('builds a stable organic web with 24 spokes and 8 curved rings', () => {
  const first = buildMusicWebGeometry(8137)
  const second = buildMusicWebGeometry(8137)
  expect(first).toEqual(second)
  expect(first.spokes).toHaveLength(24)
  expect(first.rings).toHaveLength(8)
  expect(first.rings.every(path => path.includes('Q'))).toBe(true)
})

it('creates four stable visualizer phases in a bounded range', () => {
  const phases = buildMusicBarPhases(8137)
  expect(phases).toHaveLength(4)
  expect(phases.every(value => value >= 0 && value < 1)).toBe(true)
  expect(buildMusicBarPhases(8137)).toEqual(phases)
})
```

El test de la tarjeta con `renderToStaticMarkup` debe comprobar título/artista/fuente, `h-[90px]`, `rounded-[19px]`, portada de 52 px, botón con `min-h-11 min-w-11`, etiqueta “Pausar Blinding Lights”, progreso de 2 px y cuatro barras.

- [ ] **Step 2: Confirm missing modules fail**

Run:

```text
pnpm test -- src/components/dashboard/__tests__/musicVisuals.test.ts src/components/dashboard/__tests__/MusicNowPlayingCard.test.tsx
```

Expected: FAIL because visual modules do not exist.

- [ ] **Step 3: Implement deterministic radial geometry**

`buildMusicWebGeometry(seed)` usa un PRNG local, nunca `Math.random()`. El centro se ubica detrás de la tarjeta, se calculan 24 radios hasta el borde de un `viewBox="0 0 760 143"` y ocho anillos se forman conectando puntos irregulares con curvas cuadráticas. La irregularidad queda limitada a 1–3 unidades.

```ts
export type MusicWebGeometry = {
  spokes: Array<{ x1: number; y1: number; x2: number; y2: number; opacity: number }>
  rings: Array<{ d: string; opacity: number; width: number; accent: boolean }>
}

export function buildMusicBarPhases(seed: number): [number, number, number, number] {
  const random = mulberry32(seed)
  return [random(), random(), random(), random()]
}
```

- [ ] **Step 4: Implement halo and isolated bars**

`MusicWebHalo`:

```tsx
<svg
  aria-hidden="true"
  focusable="false"
  viewBox="0 0 760 143"
  preserveAspectRatio="none"
  className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
>
  {/* paths generated from deterministic geometry */}
</svg>
```

La red se dibuja detrás de la tarjeta, con trazos blancos/violetas de baja opacidad, y el centro queda oculto por la superficie opaca. `MusicPulseVisualizer` renderiza exactamente cuatro `span`, recibe `playing`, `positionMs` y `seed`, y aplica variables CSS por barra. En pausa fija una altura derivada de posición; con movimiento reducido no anima.

- [ ] **Step 5: Implement the 90px borderless card**

La firma será:

```ts
type MusicNowPlayingCardProps = {
  snapshot: MusicPlaybackSnapshot
  positionMs: number | null
  controlPending: boolean
  onPlay(): void
  onPause(): void
}
```

Estructura obligatoria:

- contenedor `relative h-[90px] overflow-hidden rounded-[19px] bg-[linear-gradient(135deg,hsl(var(--surface-2)),hsl(var(--surface-1))_60%,rgb(38_20_65))] shadow-[0_18px_40px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)]` sin clase `border`;
- padding `px-3 py-2.5`, gap 2.5;
- portada/fallback `h-[52px] w-[52px] rounded-[15px]`;
- bloque de texto `min-w-0 flex-1` y líneas `truncate`;
- botón exterior `min-h-11 min-w-11`, círculo visible de 40 px y `disabled` según capacidad/pending;
- línea de progreso absoluta de 2 px en la base;
- la fuente se presenta como texto neutro, no como logo inferido.

- [ ] **Step 6: Add scoped animation CSS**

Añadir `@keyframes vekira-music-bar` y `@keyframes vekira-web-thread`, clases prefijadas `.vekira-music-*`, y este cierre:

```css
@media (prefers-reduced-motion: reduce) {
  .vekira-music-bar,
  .vekira-music-web-accent {
    animation: none !important;
  }
}
```

No modificar tokens globales de superficie ni colores de entrenamiento.

- [ ] **Step 7: Run component tests and types**

Run:

```text
pnpm test -- src/components/dashboard/__tests__/musicVisuals.test.ts src/components/dashboard/__tests__/MusicNowPlayingCard.test.tsx
pnpm type-check
```

Expected: PASS; geometry stable, card accessible and no broad dashboard rerender loop.

- [ ] **Step 8: Commit the visual component set**

```text
git add src/components/dashboard/musicVisuals.ts src/components/dashboard/MusicWebHalo.tsx src/components/dashboard/MusicPulseVisualizer.tsx src/components/dashboard/MusicNowPlayingCard.tsx src/components/dashboard/__tests__/musicVisuals.test.ts src/components/dashboard/__tests__/MusicNowPlayingCard.test.tsx src/styles/globals.css
git commit -m "feat: add compact music card visuals"
```

---

## Task 6: Integrate the zero-gap slot into Home and verify responsive layout

**Files:**

- Create: `src/components/dashboard/MusicNowPlayingSlot.tsx`
- Create: `src/components/dashboard/__tests__/MusicNowPlayingSlot.test.tsx`
- Create: `src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx`
- Create: `src/components/dashboard/__tests__/fixtures/musicNowPlaying.html`
- Create: `src/components/dashboard/__tests__/fixtures/musicNowPlaying.fixture.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/components/dashboard/__tests__/dashboardStructure.test.ts`
- Modify carefully: `vitest.config.ts`

**Interfaces**

- Consumes: `useNowPlayingSession()` and visual components.
- Produces: first visual Home block, no DOM while inactive, responsive/browser evidence.

- [ ] **Step 1: Write red slot and ordering tests**

Exportar una presentación pura para probar sin ejecutar efectos:

```tsx
expect(renderToStaticMarkup(
  <MusicNowPlayingSlotView state={IDLE_STATE} controlPending={false} onPlay={vi.fn()} onPause={vi.fn()} />,
)).toBe('')
```

Actualizar `dashboardStructure.test.ts`:

```ts
const orderedSections = [
  '<DashboardHeader',
  '<MusicNowPlayingSlot',
  '<DashboardMainNotice',
  '<DashboardWeekJourney',
]
expect(page.match(/<MusicNowPlayingSlot\b/g)).toHaveLength(1)
```

- [ ] **Step 2: Confirm both tests fail for the intended reasons**

Run:

```text
pnpm test -- src/components/dashboard/__tests__/MusicNowPlayingSlot.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts
```

Expected: FAIL because the slot is absent and the dashboard order lacks Music.

- [ ] **Step 3: Implement the client slot**

```tsx
'use client'

export function MusicNowPlayingSlot() {
  const session = useNowPlayingSession()
  return (
    <MusicNowPlayingSlotView
      state={session.state}
      controlPending={session.controlPending}
      onPlay={() => { void session.play() }}
      onPause={() => { void session.pause() }}
    />
  )
}
```

`MusicNowPlayingSlotView` renderiza el wrapper solo cuando `state.status === 'active' && state.snapshot`. En activo usa `relative isolate mx-auto h-[143px] w-full max-w-3xl overflow-hidden`, halo absoluto y tarjeta centrada verticalmente. En `error` devuelve únicamente `<span className="sr-only" aria-live="polite">`; en los demás estados devuelve `null`. Ningún estado inactivo deja una caja visible en Home.

- [ ] **Step 4: Insert the slot at the exact approved location**

En `dashboard/page.tsx`, importar `MusicNowPlayingSlot` y colocarlo inmediatamente después de:

```tsx
<h1 className="sr-only">{t('Dashboard')}</h1>
<MusicNowPlayingSlot />
```

Debe quedar antes de la condición que renderiza `DashboardMainNotice`. No modificar `DashboardHeader`, `FixedTopBar` ni `DashboardWeekJourney`.

- [ ] **Step 5: Build a real browser fixture for long metadata**

Montar la vista activa con un título y artista largos, portada fallback y fuente larga. La prueba Chromium debe ejecutar anchos 320, 360, 390, 412 y 430 px y comprobar:

```ts
expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)
expect(geometry.cardHeight).toBeGreaterThanOrEqual(89)
expect(geometry.cardHeight).toBeLessThanOrEqual(92)
expect(geometry.haloTop).toBeGreaterThanOrEqual(geometry.slotTop)
expect(geometry.haloBottom).toBeLessThanOrEqual(geometry.slotBottom)
```

Con `page.emulateMedia({ reducedMotion: 'reduce' })`, verificar `animationName === 'none'` en barras y filamentos acentuados. Añadir `MusicNowPlayingResponsive.test.tsx` al arreglo `browserFixtureTests` de `vitest.config.ts` sin eliminar ni reordenar entradas existentes; conservar expresamente `SecondaryMetricsResponsive.test.tsx`.

- [ ] **Step 6: Run structural and browser verification**

Run:

```text
pnpm test -- src/components/dashboard/__tests__/MusicNowPlayingSlot.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts
pnpm test -- --project browser-fixtures src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx
```

Expected: PASS at all five widths; idle output is an empty string; reduced motion has no continuous animation.

- [ ] **Step 7: Commit Home integration without staging concurrent files**

Antes de añadir `vitest.config.ts`, ejecutar `git diff -- vitest.config.ts` y confirmar que el diff conserva la entrada de SecondaryMetrics. Luego:

```text
git add src/components/dashboard/MusicNowPlayingSlot.tsx src/components/dashboard/__tests__/MusicNowPlayingSlot.test.tsx src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx src/components/dashboard/__tests__/fixtures/musicNowPlaying.html src/components/dashboard/__tests__/fixtures/musicNowPlaying.fixture.tsx src/app/(app)/dashboard/page.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts vitest.config.ts
git commit -m "feat: place now playing card below Home header"
```

---

## Task 7: Add explicit music integration controls to Settings

**Files:**

- Create: `src/components/settings/MusicIntegrationSettings.tsx`
- Create: `src/components/settings/__tests__/MusicIntegrationSettings.test.tsx`
- Create: `src/app/(app)/settings/musica/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Modify: `src/components/navigation/PendingLinkIcon.tsx`
- Modify: `src/components/settings/__tests__/settingsOverview.test.tsx`
- Modify: `src/lib/i18n/index.ts`

**Interfaces**

- Consumes: `useNowPlayingSession()`, `musicSessionAdapter.openNotificationListenerSettings()`, existing Settings primitives and i18n.
- Produces: `/settings/musica`, explicit opt-in and visible status matrix.

- [ ] **Step 1: Write a red settings-state matrix**

Exportar `MusicIntegrationSettingsView` con `state`, `busy`, `onOpenSettings` y `onRetry`. Probar por render estático:

```ts
it.each([
  ['unsupported', 'Disponible solo en la app Android'],
  ['not_granted', 'Habilitar en Android'],
  ['granted_idle', 'Conectado · esperando música'],
  ['active', 'Integración activa'],
  ['error', 'No se pudo consultar Android'],
] as const)('renders %s without inventing a local permission switch', (status, copy) => {
  const html = renderToStaticMarkup(<MusicIntegrationSettingsView state={state(status)} busy={false} onOpenSettings={vi.fn()} onRetry={vi.fn()} />)
  expect(html).toContain(copy)
  expect(html).not.toContain('role="switch"')
})
```

En `settingsOverview.test.tsx`, exigir `href="/settings/musica"` y la etiqueta “Integración musical”.

- [ ] **Step 2: Confirm the tests fail**

Run:

```text
pnpm test -- src/components/settings/__tests__/MusicIntegrationSettings.test.tsx src/components/settings/__tests__/settingsOverview.test.tsx
```

Expected: FAIL because the component/route entry does not exist.

- [ ] **Step 3: Add localized navigation and route shell**

Añadir `Music2` a `PendingLinkIcon` bajo la clave `music-2`. En el grupo “Aplicación” de Settings, añadir:

```ts
{
  href: '/settings/musica',
  label: t('Integración musical'),
  description: t('Reproductor del sistema Android'),
  icon: 'music-2' as const,
}
```

La página usa `requireAppUserContext()` solo para idioma y renderiza `SettingsScreen` con título localizado, regreso a `/settings` y el componente cliente. No consulta Supabase adicional.

- [ ] **Step 4: Implement the explicit permission experience**

La vista usa `SettingsSection` y `SettingsStatus`:

- `unsupported`: estado informativo, sin botón.
- `not_granted`: explicación clara del acceso amplio de Android y botón “Habilitar en Android”.
- `granted_idle`: éxito “Conectado · esperando música” y botón “Gestionar en Android”.
- `active`: éxito con canción/fuente actual y botón “Gestionar en Android”.
- `error`: alerta, botón “Reintentar” y acceso manual a Ajustes si el plugin sigue soportado.

El botón llama únicamente `openNotificationListenerSettings()`, queda deshabilitado mientras abre y no marca permiso como concedido de forma optimista. Al volver al foreground, el hook de Task 2 refresca el estado real.

- [ ] **Step 5: Add complete ES/EN copy**

Agregar al mapa inglés todas las cadenas nuevas, incluyendo permiso, privacidad, estados, botones y etiquetas play/pausa. El español permanece como clave fuente. Verificar que no se renderizan claves sin traducir en inglés.

- [ ] **Step 6: Run settings and i18n tests**

Run:

```text
pnpm test -- src/components/settings/__tests__/MusicIntegrationSettings.test.tsx src/components/settings/__tests__/settingsOverview.test.tsx src/lib/i18n/__tests__/i18n.test.ts
pnpm type-check
```

Expected: PASS; no switch falso, no request de base de datos y ruta localizada.

- [ ] **Step 7: Commit Settings integration**

```text
git add src/components/settings/MusicIntegrationSettings.tsx src/components/settings/__tests__/MusicIntegrationSettings.test.tsx src/app/(app)/settings/musica/page.tsx src/app/(app)/settings/page.tsx src/components/navigation/PendingLinkIcon.tsx src/components/settings/__tests__/settingsOverview.test.tsx src/lib/i18n/index.ts
git commit -m "feat: add Android music integration settings"
```

---

## Task 8: Run end-to-end verification and the real-device acceptance gate

**Files:**

- Verify all files from Tasks 1–7.
- Modify only if a verification failure proves a scoped defect in this feature.

**Interfaces**

- Consumes: completed TypeScript, React and Android layers.
- Produces: reproducible automated evidence plus a real-device pass/fail result.

- [ ] **Step 1: Run the complete targeted feature suite**

```text
pnpm test -- src/lib/native/__tests__/musicSession.test.ts src/lib/native/__tests__/musicSessionState.test.ts src/lib/native/__tests__/musicSessionAndroidContract.test.ts src/components/dashboard/__tests__/musicVisuals.test.ts src/components/dashboard/__tests__/MusicNowPlayingCard.test.tsx src/components/dashboard/__tests__/MusicNowPlayingSlot.test.tsx src/components/dashboard/__tests__/dashboardStructure.test.ts src/components/settings/__tests__/MusicIntegrationSettings.test.tsx src/components/settings/__tests__/settingsOverview.test.tsx
pnpm test -- --project browser-fixtures src/components/dashboard/__tests__/MusicNowPlayingResponsive.test.tsx
```

Expected: all targeted tests PASS.

- [ ] **Step 2: Run repository-wide gates with bounded workers**

```text
pnpm test -- --maxWorkers=4
pnpm type-check
pnpm lint
pnpm cap:sync
android\gradlew.bat -p android testDebugUnitTest
android\gradlew.bat -p android assembleDebug
git diff --check
```

Expected: all commands exit 0. Después de `cap:sync`, revisar `git status --short` y no aceptar cambios generados no relacionados.

- [ ] **Step 3: Run instrumented Android tests when a target is attached**

Run:

```text
adb devices
android\gradlew.bat -p android connectedDebugAndroidTest
```

Expected: one authorized device/emulator is listed and the controlled `MediaSession` mapper test passes. Si no existe un target Android, registrar esta frontera como no verificada; no afirmar que la aceptación Android está completa.

- [ ] **Step 4: Perform real-device behavior checks**

En un teléfono Android físico con el APK debug:

1. Abrir Home antes del permiso y confirmar que no aparece hueco entre encabezado y avisos/semana.
2. Ir a Ajustes → Integración musical; confirmar el texto de privacidad y abrir la pantalla real del sistema.
3. Conceder acceso, volver a Vekira y confirmar `Conectado · esperando música`.
4. Reproducir Spotify, YouTube Music y un tercer reproductor que publique `MediaSession`.
5. Confirmar título, artista, fuente, portada/fallback, progreso y actualización al cambiar canción.
6. Pausar desde Vekira, verificar icono play y presencia durante 12 segundos; reanudar antes del límite y confirmar que no desaparece.
7. Pausar más de 12 segundos y confirmar que tarjeta y hueco se eliminan.
8. Destruir la sesión y confirmar ocultación inmediata.
9. Revocar el acceso, volver a Vekira y confirmar estado `not_granted` y Home vacío.
10. Activar “Quitar animaciones” de Android y verificar red/barras estáticas.
11. Rotar pantalla y revisar 320, 360, 390, 412 y 430 px equivalentes sin overflow.

- [ ] **Step 5: Inspect the final diff and commit only proven fixes**

Run:

```text
git status --short
git diff --stat
git diff --check
git log --oneline --max-count=8
```

Expected: solo están presentes los archivos de este plan; los siete commits funcionales son visibles; no hay whitespace errors. Si las verificaciones obligan a un ajuste final, escribir primero una regresión y crear un commit `fix: harden Android music session integration` con únicamente esos archivos.

## Completion Criteria

- [ ] Los 13 criterios de aceptación de la especificación están cubiertos por una prueba automatizada o por un paso explícito de dispositivo.
- [ ] No existe `RECORD_AUDIO`, captura de audio, proveedor musical, persistencia ni request nuevo de dashboard.
- [ ] Web/PWA/SSR no lanzan, no montan listeners y no reservan espacio.
- [ ] El plugin resuelve permiso ausente de forma tipada, registra y elimina callbacks simétricamente y controla la sesión seleccionada.
- [ ] La tarjeta conserva el diseño aprobado: 90 px, sin borde, telaraña radial fuera de la tarjeta y solo alrededor del componente.
- [ ] Movimiento reducido, targets táctiles, etiquetas dinámicas y truncado están verificados.
- [ ] Suite completa, tipos, lint, Gradle, build Android y `git diff --check` pasan.
- [ ] Un dispositivo Android real completa los once pasos manuales antes de publicar.
