# Persistencia del cierre de sesión en Android

Fecha: 2026-09-09. Rama: `codex/android-offline`. Base: `f48b3f8`.

## Causa y corrección

El cierre de sesión limpiaba la autenticación remota, pero dejaba `original_app_settings.active_account` en SQLite. Al reiniciar, la aplicación abría ese perfil guardado como si siguiera activo.

Ahora se elimina la selección activa en una transacción antes de finalizar el cierre de sesión. Los perfiles, rutinas, historial y medidas permanecen guardados. Si falla la persistencia, la operación no comunica un cierre exitoso. Las rutas personales exigen una cuenta activa.

Una versión de sesión invalida las operaciones de acceso iniciadas antes del cierre. Se verifica al activar o crear el perfil dentro de la cola de almacenamiento, tanto para el sincronizador como para el cliente utilizado por el formulario real de acceso. Una respuesta tardía de contraseña u OTP no vuelve a activar el perfil ni inicia la renovación automática de la sesión.

Los perfiles vinculados a cuentas online no aparecen como acceso directo en las opciones sin conexión. Los perfiles exclusivamente locales pueden abrirse de nuevo mediante una selección explícita.

## Verificación

- `pnpm mobile:test`: 140 pruebas en 24 archivos, sin fallos. Las nuevas regresiones reprodujeron los defectos antes de aplicar las correcciones.
- Las pruebas de almacenamiento cierran y reabren SQLite en disco, comprueban conservación exacta de datos y cubren un fallo al confirmar la transacción.
- Las pruebas de concurrencia cubren identidades existentes y nuevas, respuestas tardías del servidor y los caminos reales de contraseña y OTP.
- `node mobile/tests/logout-regression.mjs`: cierre completo y reapertura del proceso de Chromium con el mismo perfil persistente; retorno al login para perfiles locales y vinculados, protección de `/dashboard`, datos conservados, reapertura explícita del perfil local y exclusión del perfil vinculado en las opciones locales. Resultado y capturas en `.artifacts/logout-fix/`.
- `node mobile/tests/login-loading-regression.mjs`: aprobadas las regresiones de formulario normal, error de conexión después del envío, reintento, fallo pasivo de almacenamiento, exclusión de operaciones locales simultáneas, carga y movimiento reducido.
- `pnpm mobile:type-check`, ESLint de los archivos del arreglo y `git diff --check`: aprobados.
- `pnpm android:offline:release`: aprobado. Informes JVM: 37 pruebas, cero fallos y errores.
- `scripts/verify-android-offline.ps1`: recursos compilados coinciden con el APK; SQLite WASM, 16 fuentes y 50 imágenes presentes; sin cargador remoto.

## Entrega

- Archivo: `.artifacts/Vekira-1.1.3-offline.apk`.
- Aplicación: `com.fitai.app`; versión `1.1.3-offline`; código 5.
- Tamaño: 17 943 663 bytes.
- SHA-256: `1cd26e0f1dfa305c431bd7890a0925332b3fdbc8b9930539825c152eda38afa0`.
- Firma verificada; mismo certificado que `Vekira-1.1.2-offline.apk`: SHA-256 `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

La corrección se aplica al volver a cerrar sesión con esta versión. No se puede reconstruir un cierre previo que la versión anterior no guardó.

No había dispositivos conectados al comprobar ADB. La actualización y el recorrido en un teléfono Android quedan pendientes; las pruebas de navegador y de puente nativo simulado no equivalen a esa comprobación. Sin commit, push ni cambios remotos; el checkout principal permanece limpio.
