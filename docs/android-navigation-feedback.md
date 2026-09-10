# Toque suave y sonido de navegación en Android

Fecha: 2026-09-09. Rama: `codex/android-offline`.

## Diagnóstico y cambio

La barra inferior llamaba a `hapticImpact('light')`. La versión instalada de Capacitor Haptics implementa LIGHT en Android 26+ como una onda de 50 ms con amplitud 110. Cambiarla por `selectionChanged` habría aumentado la duración a 100 ms, por lo que no resolvía la sensación descrita.

Ahora la barra usa un plugin local `VekiraNavigationFeedback` con una única llamada `tap()`:

- `View.performHapticFeedback(SEGMENT_FREQUENT_TICK)` desde Android 14; `CLOCK_TICK` en versiones anteriores compatibles con minSdk 24.
- `View.playSoundEffect(CLICK)` para el clic corto del sistema, sin solicitar foco de audio ni reproducir un archivo multimedia.
- Se respetan los ajustes de vibración y sonidos táctiles; no se fuerzan opciones ni se restaura la onda anterior cuando el efecto no está disponible.
- Separación mínima de 120 ms entre efectos para que las activaciones rápidas no los acumulen. La navegación continúa inmediatamente, incluso si el plugin tarda, no existe en un contenedor anterior o rechaza la llamada.
- Clics modificados, secundarios o cancelados no disparan feedback. La activación normal y por teclado mantienen un efecto; cambiar de ruta no genera otro.

El alcance es la barra inferior de Android. Los efectos de series, descansos, guardados y actualización por gesto no cambian. Web e iOS conservan el efecto ligero que tenían. La referencia de Hevy orienta la sensación de un toque breve; no se copió un recurso sonoro ni se verificó equivalencia acústica con esa aplicación.

La [guía de Android](https://developer.android.com/develop/ui/views/haptics/haptic-feedback) recomienda efectos semánticos de View frente a ondas genéricas para interacciones frecuentes. La [referencia de SEGMENT_FREQUENT_TICK](https://developer.android.com/reference/android/view/HapticFeedbackConstants#SEGMENT_FREQUENT_TICK) especifica un efecto muy suave y permite que el dispositivo lo omita cuando no pueda producirlo apropiadamente. El comportamiento de `playSoundEffect` se contrastó además con el código del SDK local android-36.1.

## Verificación

- Se reprodujo la discrepancia del helper anterior: cuatro pruebas fallaban usando el impacto genérico y pasan con la llamada de navegación.
- Cinco suites de navegación y feedback: 65 pruebas aprobadas, incluidas las seis nuevas del helper.
- `node mobile/tests/navigation-feedback-regression.mjs`: siete escenarios de Chromium aprobados con BottomNav, PendingLink, helper y haptics reales. Sólo se sustituyen fronteras de Capacitor, Next y autorización de sesión. Incluye clic, teclado, pestaña activa, ráfagas, errores, respuesta pendiente, plugin ausente, clic cancelado/modificado y conservación de web/iOS. El script verifica también el contrato Java/JS y el registro en MainActivity. Informe en `.artifacts/navigation-feedback/report.json`.
- `pnpm mobile:type-check`, `pnpm type-check`, ESLint del alcance y `git diff --check`: aprobados.
- Revisión independiente sin hallazgos pendientes.
- `pnpm android:offline:release`: aprobado; 37 pruebas JVM sin fallos ni errores. El plugin nuevo compila con el resto del código Android. Log en `.artifacts/navigation-feedback/release-build.log`.
- APK verificado: mismos recursos que `mobile/dist`, SQLite WASM, 50 imágenes y 16 fuentes incluidos, sin cargador remoto.

## Entrega

- `.artifacts/Vekira-1.1.7-offline.apk`.
- Paquete `com.fitai.app`; versión `1.1.7-offline`; código 9.
- Tamaño: 17 944 044 bytes.
- SHA-256: `dc8cc47c460554b393ff0484fc818ec8083e9151c0a135303d659237e3d0b897`.
- Firma válida; mismo certificado que 1.1.6: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

No había teléfono conectado por ADB. Las pruebas verifican el flujo y las llamadas, no la intensidad física ni el sonido efectivo en un modelo concreto. La comparación sensorial debe hacerse instalando esta actualización en el teléfono. Sin commit, push, despliegue ni cambios de permisos; checkout principal limpio.
