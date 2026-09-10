# Login y acompañamiento en Android

Fecha: 2026-09-09. Rama: `codex/android-offline`. Base: `f48b3f8`.

## Cambios y causa

- **Login:** el documento ya reservaba el espacio de la barra de estado, pero AuthShell añadía otro viewport completo. La regresión reprodujo 32 px de scroll innecesario con un inset superior de 32 px. AuthShell ahora delimita su área por los cuatro insets y permite scroll interno cuando hace falta, con `overscroll-y-contain`. Conserva el efecto local al llegar al borde, foco, teclado y zoom; el contenido no arrastra el documento bajo la barra del sistema.
- **Estado del acompañamiento:** Inicio leía tablas locales incompletas; no se descargaban los consentimientos ni toda la información del servicio. La vista conectada sí consultaba el servidor. El adaptador móvil ahora reutiliza la consulta canónica con el cliente conectado que verifica la identidad. Guarda un resumen completo por cuenta para consultas offline. Una caché antigua incompleta se trata como información pendiente de actualizar, no como permiso revocado.
- **Caché de presentación:** se almacena en `original_app_settings`, aislada por cuenta y versión de sesión, sin incrementar la revisión de los datos, emitir una recarga general ni incluirse en respaldos. Una respuesta tardía después del cierre de sesión se descarta. Las lecturas conectadas tienen un límite de ocho segundos para no bloquear indefinidamente Inicio.
- **Rutinas asignadas:** el embed de `trainer_assignment_versions` era ambiguo porque hay una FK desde la versión a su asignación y otra desde la asignación a su versión activa. La consulta especifica `trainer_assignment_versions_assignment_id_fkey` y conserva la selección por `active_version_id`.
- **Vista de acompañamiento:** entrenador y estado, rutinas y acceso a Plan, resumen de datos compartidos, solicitudes pendientes e historial plegado. Las notas, gestión y detalles de permisos se despliegan cuando se necesitan. La autorización realmente ausente queda visible y las revocaciones conservan su confirmación.

La autorización de datos del entrenador y la autorización de una sesión de ejercicio son contratos distintos. No se concedieron permisos automáticamente ni se eliminaron controles de entrenamiento. Se verificó el inicio de una rutina profesional manteniendo sus IDs de asignación, versión y prescripción bloqueada.

## Verificación

- `pnpm mobile:test`: 151 pruebas, 25 archivos, sin fallos.
- Cuatro suites de acompañamiento: 47 pruebas únicas aprobadas, incluyendo navegador, teclado, confirmación cancelada, reintentos e idempotencia. Una duplicación de React en el servidor de fixtures se corrigió con dedupe; ConsentManager se repitió aislado con 9/9 aprobadas.
- `pnpm mobile:type-check` y `pnpm type-check`: aprobados.
- ESLint de los archivos cambiados y `git diff --check`: aprobados.
- `mobile/tests/coaching-regression.mjs`: app original compilada y backend HTTP interceptado. Una cuenta descargada por una versión anterior muestra autorización coherente en Inicio y Acompañamiento; carga la versión activa; respeta orden y detalles plegados en 390/1440 px; conserva el resumen offline e inicia la rutina profesional mediante su CTA real sin alterar la prescripción. Cero errores de página o peticiones inesperadas. Evidencia en `.artifacts/coaching-fix/`.
- `mobile/tests/auth-scroll-regression.mjs`: geometría de insets, ausencia de scroll innecesario en 320/390/1440 px, pantallas compactas, tamaño de teclado, foco y texto al 200 %, sin desplazar body/window al borde. Evidencia en `.artifacts/auth-scroll-fix/`.
- Regresiones completas de login/carga y logout/reinicio de proceso aprobadas sobre el build final. Las opciones sin conexión siguen ausentes.
- `pnpm android:offline:release`: aprobado; 37 pruebas JVM sin fallos ni errores.
- Verificación del APK: recursos idénticos a `mobile/dist`, SQLite WASM, 16 fuentes y 50 imágenes incluidas; sin cargador remoto.

## Entrega

- Archivo: `.artifacts/Vekira-1.1.5-offline.apk`.
- Aplicación: `com.fitai.app`; versión `1.1.5-offline`; código 7.
- Tamaño: 17 941 286 bytes.
- SHA-256: `576c0d874e66b1f82c76882f44cd95a979b68f7318787ad0aebfce6c8c308ddd`.
- Firma válida y mismo certificado que 1.1.4: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

No había teléfono conectado en ADB. El recorrido con la cuenta real y el efecto elástico nativo quedan pendientes de comprobar en el dispositivo. La petición remota de diagnóstico de metadatos expiró; la ambigüedad se verificó en el esquema local y con SDK real frente a transporte simulado, no con una respuesta PGRST201 de producción. Sin escrituras remotas, cambios de permisos, commit ni push.
