# Dashboard y perfil personal en Android

Fecha: 2026-09-09. Rama: `codex/android-offline`. Base: `f48b3f8`.

## Cambios

- La foto de Inicio abre un diálogo que muestra la imagen completa sin recortarla. Escape, botón de cierre, fondo y Atrás Android cierran el visor y devuelven el foco. Sin foto o cuando falla su carga, se muestran iniciales sin abrir un visor vacío.
- Fecha, saludo y nombre abren el mismo panel Cuenta y espacios en móvil y el menú en escritorio. El nombre accesible incluye esos textos; las instancias de ambos tamaños tienen IDs propios. Se conserva la navegación, el cambio de espacio y el cierre de sesión.
- La página Perfil personal presenta una tarjeta de identidad con foto, nombre y correo en una fila de ancho completo. La edición del nombre tiene un campo y un botón de guardado dentro de su tarjeta, sin una barra flotante adicional. Se conservan las opciones condicionales de Comunidad.
- El editor compartido de foto recupera fallos sin bloquear la pantalla ni perder la foto anterior. Bloquea operaciones desde la decodificación, libera URLs temporales y adopta la URL confirmada, invalidándola cuando llega una actualización del perfil. Detalles y límite del servicio Android en `android-avatar-action-boundary.md`.

## Verificación

- `pnpm mobile:test`: 151 pruebas en 25 archivos aprobadas.
- Dashboard y contratos de navegación: 54 pruebas unitarias aprobadas; después de la corrección final de nombre accesible se repitieron las 4 del encabezado.
- Formularios de perfil: 5 pruebas aprobadas.
- Visor y acceso a cuenta: 8 pruebas de navegador a 320/390/640/1280 px, incluyendo fallback, cierres, foco y accesibilidad. Axe no encontró problemas graves en encabezado y visor; el análisis global detectó contraste previo en la navegación inferior, fuera del alcance.
- Editor de foto: 8 pruebas aprobadas, 7 de interacción real en Chromium y una de traducción. Acciones remotas controladas; Canvas, Avatar, Toast y componente reales. La revisión independiente detectó y se corrigió el ciclo `null → foto nueva → actualización → null`.
- `mobile/tests/profile-regression.mjs`, ejecutado sobre el build final: foto y textos independientes a 320/390/1440 px, imagen sin recorte, Escape y foco, nombre accesible, ausencia de desbordamiento, recuperación del rechazo al eliminar foto en Android, guardado del nombre y persistencia tras recarga. Foto y datos de entrenamiento conservados; cero errores de página. Capturas inspeccionadas en `.artifacts/profile-fix/`.
- `mobile/tests/logout-regression.mjs`, ejecutado sobre el build final: cuentas local anterior y vinculada, Atrás, reinicio completo de navegador, rutas directas, envío sin conexión y reconexión. El login sigue requiriendo credenciales y conserva los datos.
- `pnpm mobile:type-check`, `pnpm type-check`, ESLint del alcance y `git diff --check`: aprobados.
- `pnpm android:offline:release`: aprobado; 37 pruebas JVM sin fallos ni errores. Log en `.artifacts/profile-fix/release-build.log`.

## Entrega

- Archivo: `.artifacts/Vekira-1.1.6-offline.apk`.
- Aplicación: `com.fitai.app`; versión `1.1.6-offline`; código 8.
- Tamaño: 17 944 084 bytes.
- SHA-256: `d33c05e78762466bda7c65b55b5972ed979bebe05e3cef4a514e89612af727e8`.
- Firma válida y mismo certificado que 1.1.5: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.
- Recursos idénticos a `mobile/dist`, SQLite WASM, 50 imágenes y 16 fuentes incluidas; sin cargador remoto.

No había teléfono conectado por ADB: la verificación de interacción corresponde al navegador local, con datos de prueba. Subir o eliminar fotos remotamente desde el APK sigue requiriendo resolver la integración del servicio documentada; esta entrega acredita la recuperación del error, no una subida real. Sin escrituras remotas, cambios de permisos, commit, push ni despliegue. El checkout principal permanece limpio.
