# Recuperación de preparación al empezar un entrenamiento

Fecha: 2026-09-09. Rama: `codex/android-offline`.

## Diagnóstico

La pantalla mostrada por el usuario procede de la autorización local de sesiones del APK. El código agrupaba una revisión pendiente o desconocida y una revisión que requiere autorización profesional en el mismo mensaje: «Completa la revisión de preparación antes de entrenar». La pantalla solo permitía reintentar y no ofrecía completar la revisión.

La captura no permite conocer el estado concreto del perfil del usuario. Esta revisión es independiente del consentimiento para compartir datos con un entrenador. No se ha demostrado un fallo de sincronización ni se han consultado o modificado los datos remotos de esa cuenta.

## Cambio

- La autorización local devuelve el motivo de preparación pendiente o de autorización profesional requerida.
- Si falta la revisión, la sesión abre el cuestionario existente. Al guardar, vuelve a autorizar la misma sesión, conservando su identificador y sin regenerar la rutina.
- Si las respuestas requieren autorización de un profesional de salud, la pantalla explica el motivo y permite revisar las respuestas. Guardar respuestas que mantienen esa restricción no habilita el entrenamiento ni vuelve a abrir el diálogo automáticamente.
- Cancelar conserva las respuestas y devuelve el foco al botón para completar la preparación. También se puede volver al plan.
- Las respuestas tardías de un guardado no pueden iniciar otra autorización después de salir de la pantalla o cambiar de cuenta: el callback conserva y comprueba la generación de la sesión.

Se mantienen los límites, la política de preparación, las autorizaciones existentes, la idempotencia y los bloqueos de las rutinas asignadas. En el servidor web solo se amplía el tipo del resultado; no se cambia el RPC ni se introduce una nueva barrera de preparación web. No hay migraciones, despliegue remoto, commit ni push.

## Validación

- `pnpm mobile:test`: 159 pruebas, 25 archivos, sin fallos.
- Pruebas de autorización y gestión de intentos: 36 pruebas, sin fallos.
- `sessionRecoveryInteraction.test.tsx`: 13 pruebas de navegador, sin fallos; incluye cancelación, foco, guardado fallido, restricciones y respuestas tardías tras desmontar o cambiar de cuenta.
- `node mobile/tests/session-readiness-regression.mjs`: cuatro escenarios sobre el build real de Android con SQLite y la red externa bloqueada. Revisión pendiente a 390 y 1440 px, limitaciones guardadas y restricción profesional. Se comprueba una rutina asignada bloqueada, la persistencia de respuestas, un único permiso con el mismo identificador y la reanudación tras recargar.
- TypeScript web y móvil, ESLint de los archivos cambiados y `git diff --check`: sin errores.
- `pnpm android:offline:release`: build correcto; 37 pruebas JVM, sin fallos ni errores.
- `scripts/verify-android-offline.ps1`: assets del APK iguales al build, SQLite incluido, 50 imágenes y 16 fuentes verificadas, sin cargador remoto.
- Revisión visual de las pantallas de preparación, cuestionario y restricción profesional. Evidencias en `.artifacts/session-readiness/`.
- Revisión independiente del guardado tardío: sin problemas pendientes.

No hay dispositivos conectados mediante ADB. Falta comprobar la instalación y el recorrido con la cuenta real en un teléfono Android. El checkout principal permanece limpio.

## APK

- Archivo: `.artifacts/Vekira-1.1.8-offline.apk`.
- Paquete: `com.fitai.app`; versión `1.1.8-offline`; código `10`.
- Tamaño: 17 946 632 bytes.
- SHA-256: `4a758be09eebf7157facddf7c113edb9fd6631695287ba91b0db879f72ad2b0b`.
- Firma verificada e igual a la versión 1.1.7: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Instalar como actualización sobre la versión anterior para conservar los datos locales; no desinstalar primero.
