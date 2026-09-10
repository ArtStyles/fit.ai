# Correcciones de acceso, notificaciones y carga en Android

Fecha: 2026-09-09. Rama: `codex/android-offline`. Base: `f48b3f8`.

## Cambios

- El login presenta el formulario original de correo y contraseña. Las opciones locales y de recuperación permanecen en un desplegable secundario. Los problemas de conexión se comunican al enviar el formulario; los rechazos permiten reintentar.
- El login puede abrirse aunque falle el almacenamiento local. No se muestran errores técnicos de lecturas pasivas. Las operaciones locales comparten un bloqueo para evitar acciones simultáneas al cerrar y reabrir las opciones.
- SQLite utiliza un único registro de conexiones y comparte la apertura pendiente. Antes, la detección de perfiles anteriores creaba otro registro vacío cuya comprobación de consistencia cerraba la conexión activa en Android. La regresión reproduce el error `Query: No available connection for database vekira_offline`.
- Los avisos de atención tienen un frente opaco: el fondo rojo de «Quitar» solo se revela al deslizar. Se conserva la animación compartida y se ignoran los gestos cancelados por el sistema.
- La carga muestra el logo original de Vekira, estado accesible, mensaje centrado e indicador que respeta movimiento reducido.

## Verificación

- `pnpm mobile:test`: 130 pruebas, 21 archivos, sin fallos.
- Pruebas unitarias de errores de login: 9 aprobadas.
- Pruebas montadas de avisos: 8 aprobadas; las tres regresiones nuevas fallaban antes del arreglo.
- `pnpm mobile:type-check`, `pnpm type-check`, ESLint de archivos cambiados y `git diff --check`: aprobados.
- `node mobile/tests/login-loading-regression.mjs`: formulario inicial sin errores, envío con Enter sin conexión, reintento, fallo de almacenamiento al iniciar, enlace de privacidad, exclusión de operaciones locales simultáneas, carga y movimiento reducido. Capturas sin desbordamiento en 320/390/1440 px en `.artifacts/login-loading-fixes/`.
- `node mobile/tests/original-journey.mjs`: onboarding, generación, sesión persistente tras recarga, historial/progreso, ocho medidas, catálogo, ajustes y respaldos aprobados sobre el build final.
- `pnpm android:offline:release`: compilación aprobada; informes JVM con 37 pruebas, cero fallos y errores.
- `scripts/verify-android-offline.ps1`: JS/CSS empaquetados idénticos a `mobile/dist`, SQLite WASM, 16 fuentes y 50 imágenes revisadas presentes, sin cargador remoto.

## APK

- Archivo: `.artifacts/Vekira-1.1.2-offline.apk`.
- Aplicación: `com.fitai.app`; versión `1.1.2-offline`; código 4.
- Tamaño: 17 943 979 bytes.
- SHA-256: `b93e450f68983423222d5a7e88237ae591f8edcee69ba2eddb27fe6629f0d38e`.
- Firma verificada y comparada con `Vekira-1.1.1-offline.apk`: certificado SHA-256 `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Sin dispositivo conectado al verificar con ADB. La instalación de actualización y el recorrido nativo en un teléfono siguen pendientes. La regresión del controlador utiliza el administrador real del plugin con un puente nativo simulado y SQLite real; no equivale a probar el dispositivo. No se hicieron cambios remotos, commit ni push; `main` permanece limpio.
