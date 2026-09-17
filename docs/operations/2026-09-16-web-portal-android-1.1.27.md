# Portal público y Android 1.1.27

## Distribución

- `main`: landing ES/EN, descarga, instrucciones, ayuda, privacidad, términos, recuperación y eliminación de cuenta; API autenticadas para Android.
- `codex/android-offline`: producto funcional completo, en `.worktrees/android-offline`. Conserva las pantallas originales y las cinco pestañas.
- Las rutas web del producto redirigen a `/{locale}#descargar`, incluso con sesión existente. Los POST a pantallas retiradas responden 410. `/login?intent=delete-account` solo conduce a gestionar la eliminación.
- La web deja de generar PWA. El antiguo `/sw.js` retira sus cachés y registro sin borrar datos del navegador.

Solicitud y perfil de entrenador (foto y credenciales), chat con historial y administración se ejecutan dentro del APK. Los filtros administrativos usan navegación local. Las operaciones conectadas usan `/api/mobile/coaching`, `/api/mobile/chat` y `/api/mobile/admin`, con bearer verificado, permisos existentes, límites de cuerpo y protección ante cambios de cuenta.

Las credenciales usan reserva firmada de Storage y finalización verificada. Claves privadas y permisos administrativos permanecen en el servidor. El entrenamiento personal funciona sin conexión; las operaciones conectadas muestran su estado dentro de Android. Un onboarding completado localmente sincroniza solo campos permitidos si el perfil canónico sigue pendiente; conserva perfiles remotos completos y campos privilegiados.

## APK verificado

| Dato | Valor |
| --- | --- |
| Archivo público | `public/downloads/Vekira-1.1.27-offline.apk` |
| Copia Android | `.artifacts/Vekira-1.1.27-offline.apk` en el worktree Android |
| Aplicación | `com.fitai.app` |
| Versión | `1.1.27-offline`, código 29 |
| Tamaño | 18 112 650 bytes (17,27 MiB) |
| Android mínimo / objetivo | API 24 / API 36 |
| SHA-256 | `f98d5379003cab8bf96be4e3b20e61346ceffe8f2fec328c942198343c846caa` |
| SHA-256 del certificado | `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784` |

La firma coincide con 1.1.26. Instalar como actualización sobre la aplicación existente, sin desinstalarla, para conservar los datos. El APK contiene `mobile/dist`, SQLite, 50 recursos del catálogo y 16 fuentes originales; no carga la aplicación desde una web remota. La descarga HTTP local coincide byte por byte con el APK firmado.

## Validación local

- Android: 416 pruebas en 57 archivos; typecheck móvil y ESLint de los archivos modificados aprobados.
- Recorridos Android: `original-journey`, `connected-boundaries-regression`, `coaching-regression` y `portal-migration-regression`. Los seis escenarios nuevos verifican solicitud y foto tras guardar/recargar, historial y respuesta del chat, retirada de foto profesional, rechazo administrativo y filtro/cambio de plan persistido. Fixtures sintéticos, sin cuentas reales modificadas, navegación externa inesperada ni errores de página.
- Main: 2813 aserciones unitarias aprobadas. Tres suites de navegación agotaron el tiempo al cerrar Chromium en la ejecución general; volvieron a pasar completas (65 pruebas) de forma serial con `--hookTimeout=60000`. No se cambió el producto para esa repetición.
- Portal: 18 pruebas Playwright aprobadas: descarga real, enlaces antiguos, soporte de cuenta, ES/EN, anchuras 320/390/768/1440 y axe WCAG A/AA. Revisión visual de landing, descarga, recuperación y pantallas Android.
- TypeScript y build de producción de main aprobados; Next utilizó fuentes reales almacenadas por una compilación anterior. ESLint de los archivos modificados aprobado en ambas ramas.
- HTTP local: públicas 200; antiguas 307; POST retirado 410; cuatro endpoints móviles/cuenta con CORS 204 y sin bearer 401; worker sin caché; APK con tipo correcto y hash idéntico.
- Release Android: `pnpm android:offline:release` aprobó pruebas Java, lint y ensamblado; `verify-android-offline.ps1`, `apksigner verify` y `aapt dump badging` confirmaron recursos, firma y versión.
- `pnpm check:supabase-migrations`: 15 migraciones activas válidas. Se copiaron a main ocho SQL faltantes, idénticos a Android, para completar la fuente del backend. No se ejecutó SQL remoto.

Evidencia en main: `.artifacts/portal-build-final.log`, `portal-unit-final.log`, `portal-navigation-recheck.log`, `portal-browser-final.log`, `portal-http-verification.json`, `portal-typecheck-final.log`, `portal-lint-final.log`, `portal-migrations-check.log` y capturas `portal-*.png`.

Evidencia en Android: `.artifacts/portal-mobile-tests-final.log`, `portal-mobile-typecheck-final.log`, `portal-lint-final.log`, `portal-journeys.log`, `portal-migration-rerun.log`, `portal-migration-regression/results.json`, `portal-apk-build.log` y `apk-verification.json`.

## Publicación

La validación anterior corresponde a la implementación local, antes del push y despliegue autorizados posteriormente por el propietario. No se probaron cuentas reales ni un teléfono físico.

Preflight de publicación: rama de producción Vercel `main`, proyecto `fit-ai`; ledger remoto de 15 migraciones idéntico a main, preflight 61 y RPC de eliminación limitado a service_role verificados mediante SSL y una transacción de solo lectura. No hay migraciones pendientes que aplicar. Los recibos saneados de la publicación se guardan en `.artifacts/portal-release/`.

Publicar main con las API nuevas y el APK compatible como una misma entrega. La versión 1.1.27 requiere esos endpoints para chat, solicitudes y administración; no distribuirla como actualización pública antes de que estén disponibles. Conservar las variables privadas existentes del servidor. Antes de publicar, verificar el ledger remoto frente a la fuente canónica: validar nombres localmente no prueba el estado de Supabase.

No fusionar ambas ramas completas. Trasladar solo cambios compartidos concretos, manteniendo main como portal/servidor y Android como producto.
