# Verificación de Vekira Android offline

Fecha local: 2026-09-08. Rama: `codex/android-offline`; base web: `f8eca6263075b2972b86128c10e8df302ca384f4`.

## Resultado reproducible

| Comprobación | Resultado |
| --- | --- |
| `pnpm mobile:test` | 49/49: SQLite real, importación, outbox, dominio, recuperación y nube |
| `pnpm mobile:type-check` y ESLint de archivos modificados | Aprobados |
| `node mobile/tests/offline-journey.mjs` | Aprobado sobre la compilación final: perfil, rutina, 3 series editadas, recarga, finalización, historial, respaldo, aislamiento y reapertura de perfil sin selección activa |
| `node mobile/tests/ui-surfaces.mjs` | Aprobado: preparación, medidas, catálogo, imágenes, teclado, entrenadores sin conexión y anchos 360/390/768; sin errores de página |
| `node mobile/src/cloud/__tests__/run-postgres.mjs` | Aprobado sobre PostgreSQL desechable y esquema completo con todas las migraciones; autorización, idempotencia, rollback y conflictos |
| `pnpm type-check` y `pnpm build` | Web Next.js aprobada; advertencias existentes de Browserslist/Tailwind |
| Suite unitaria web | Primera ejecución: 2720/2725 aprobadas con timeouts en 7 archivos. Repetición aislada de los 7: 108/108 aprobadas. No se modificaron pruebas web ni reglas de negocio para sortearlos |
| `pnpm android:offline:release` | Aprobado; incluye `testDebugUnitTest` y `assembleRelease` |
| Pruebas Android JVM | 37/37 aprobadas; corresponden a las pruebas existentes del proyecto nativo |
| Revisión independiente | Hallazgos de persistencia, respaldos, arranque y logout corregidos y revisados nuevamente; sin P1/P2 pendientes en los alcances revisados |

Para repetir las pruebas de navegador, ejecutar `pnpm mobile:build`, mantener `pnpm mobile:preview` en otra terminal (puerto 4178) y ejecutar ambos scripts. Los tests usan contextos temporales, SQLite WASM real en IndexedDB y bloquean toda solicitud externa. El servidor local representa los archivos internos que sirve Capacitor. Las capturas generadas están en `mobile/tests/*.png` y se excluyen de Git.

## APK

- Archivo de compilación: `android/app/build/outputs/apk/release/app-release.apk`.
- Copia para instalar: `.artifacts/Vekira-1.1.0-offline.apk`.
- Tamaño: 17 273 210 bytes.
- SHA-256: `bce1b912797c9de65a15b323fa3fae4722f53106b1ee75184437b2aecfb7b9aa`.
- Aplicación `com.fitai.app`, versión `1.1.0-offline`, código 2.
- `apksigner verify --print-certs`: firma válida, misma huella SHA-256 que el APK anterior disponible en el checkout web: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.
- Archivo inspeccionado: sin `server.url`, con entrada local, SQLite WASM y 50 imágenes revisadas cuyos hashes coinciden con el catálogo. Los JS/CSS empaquetados coinciden byte a byte con la compilación probada; no contiene el service worker web. Splash con cierre automático a los 500 ms.

## Límites pendientes

No hay teléfono conectado ni emulador configurado. Falta ejecutar en un Android real el arranque en modo avión, SQLite nativo, cierre del proceso, exportación con el selector Android, actualización sobre el APK anterior y lectura del almacenamiento WebView antiguo. La firma y el contenido del archivo no prueban esos recorridos.

No se desplegó la migración adicional ni se probó el recorrido remoto con cuentas reales. Las APIs existentes permiten conectar la cuenta, consultar entrenadores y descargar datos web; el nuevo respaldo entre instalaciones móviles requiere desplegar `20260909030000_mobile_offline_backup.sql`. Un fallo de respaldo conserva la cola, permite descargar y muestra el error. Los registros nuevos de Android aún no alimentan el historial web ni las estadísticas web del entrenador. El panel profesional continúa en la web.

El trabajo se conserva en su propia rama y worktree. No se mezcló ni se subió a `main`, ni se publicó en Vercel.
