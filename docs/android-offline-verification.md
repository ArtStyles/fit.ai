# Verificación de Vekira original en Android offline

Fecha: 2026-09-09. Rama: `codex/android-offline`; base web: `f8eca6263075b2972b86128c10e8df302ca384f4`.

La versión `1.1.1-offline` sustituye la interfaz alternativa anterior. Reutiliza 48 módulos de página originales, el AppShell, la navegación Inicio/Plan/Entrenar/Progreso/Entrenadores, el onboarding, las sesiones, los gráficos y los ajustes. Los cambios en `src/` son tres condiciones específicas del APK: acceso al catálogo local y mensajes de guardado local. La navegación y las pantallas de la web mantienen su comportamiento predeterminado.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `pnpm mobile:test` | 127 pruebas en 20 archivos aprobadas; incluye SQLite real, acciones, recuperación, sincronización, medios y aislamiento |
| `pnpm mobile:type-check` y ESLint de los archivos modificados | Aprobados |
| `node mobile/tests/original-journey.mjs` | Aprobado sobre `mobile/dist` empaquetado: onboarding, cinco pestañas exactas, generación, sesión original, RPE y corrección de una serie tras recarga, guardado durable, historial, progreso y las ocho medidas |
| Recorrido ampliado del mismo script | Calendario, catálogo con búsqueda real, ficha con historial de la sesión guardada, todas las rutas de ajustes, exportación/importación, estado offline de entrenadores y registro original; sin errores JavaScript |
| Inspección visual | Capturas revisadas de Inicio, Plan, sesión, progreso, catálogo, ficha y registro; sin desbordamiento en 360/390/768/1440 px |
| `node mobile/src/original/run-sync-postgres.mjs --full` | Aprobado en PostgreSQL efímero: todas las migraciones juntas, aislamiento, RLS, suspensión, revisión optimista y recibos de reintento; producción sin cambios |
| `pnpm type-check` y `pnpm build` | Web Next.js aprobada después de los cambios compartidos |
| `pnpm android:offline:release` | Aprobado: Vite, sincronización Capacitor, `testDebugUnitTest` y `assembleRelease` |
| Pruebas Android JVM | 37 pruebas existentes aprobadas, sin fallos ni errores |
| Revisión independiente | Corregidos contratos de onboarding, filtros de relaciones/búsqueda, reinicio de sesión por recarga de datos, mezcla de cuentas, privacidad y retirada profesional; sin otros bloqueos confirmados en los alcances revisados |

La prueba de navegador usa SQLite WASM real en IndexedDB, permite solo el servidor local de archivos y bloquea internet. Sus comprobaciones esperan la finalización de la carga antes de descartar errores. No se usan capturas de la interfaz alternativa como evidencia de esta entrega.

Para reproducir: ejecutar `pnpm mobile:build`, iniciar `pnpm mobile:preview` en el puerto 4178 y ejecutar `node mobile/tests/original-journey.mjs`. El informe y las capturas se guardan en `.artifacts/original-journey/`. `scripts/verify-android-offline.ps1` inspecciona el APK y compara los archivos empaquetados con `mobile/dist`.

## APK entregado

- Archivo: `.artifacts/Vekira-1.1.1-offline.apk`.
- Tamaño: 17 944 092 bytes.
- SHA-256: `5f5e4bf33480a9f4480d11c2fc197f847c70a304dd9d76998c0b241f54fad625`.
- Aplicación `com.fitai.app`, versión `1.1.1-offline`, código 3; Android mínimo 24, destino 36.
- Firma verificada con `apksigner`, misma huella SHA-256 que la instalación anterior: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.
- Sin `server.url` ni service worker web; entrada local `mobile/dist` y Splash con cierre automático.
- SQLite WASM, 50 imágenes revisadas, animación revisada y 16 archivos de las tipografías originales verificados dentro del archivo. Los JS/CSS coinciden byte a byte con el build del recorrido final.
- La compilación rechaza las acciones personales de servidor y las dependencias de Firebase Admin/Anthropic excluidas si alcanzan el bundle móvil. La configuración móvil usa solo credenciales públicas de Supabase.

## Límites pendientes

No hay dispositivo conectado ni emulador configurado, comprobado nuevamente al cerrar la entrega. Falta probar arranque en modo avión, SQLite nativo, cierre del proceso, selector de respaldo, actualización firmada sobre una instalación anterior y recuperación del origen WebView en un teléfono. La compilación y la firma no prueban esos recorridos.

No se desplegó la migración `20260911003000_original_app_snapshot_backup.sql` ni se ejecutó un recorrido con cuentas reales. Descargar datos web usa las APIs existentes. El respaldo completo entre instalaciones Android requiere esa migración; su ausencia muestra un aviso y conserva los datos. Los registros nuevos de Android todavía no alimentan el historial web ni las estadísticas profesionales.

Las operaciones que necesitan servicios privilegiados (IA remota, eliminación de cuenta y determinadas cargas de imágenes/notificaciones) siguen pendientes de adaptación del backend. Las acciones ordinarias de entrenadores conservan sus RPC y permisos; su verificación aquí es de contratos y código, no una validación completa contra producción.

El trabajo permanece en su rama y worktree. No se mezcló ni subió a `main`, ni se publicó en Vercel. La copia principal sigue limpia en el SHA de base indicado.
