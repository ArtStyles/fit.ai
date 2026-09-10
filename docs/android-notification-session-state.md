# Campanita coherente y sesiones minimizadas

Fecha: 2026-09-09. Rama: `codex/android-offline`.

## Problemas reproducidos

La marca del dashboard se calculaba con la posición del aviso en el dashboard y un conteo separado. El centro de notificaciones calculaba sus avisos con otra fuente que sí tenía en cuenta los descartes y la fecha de actualización del plan. Esto producía falsos negativos para la revisión del perfil y actualizaciones de planes antiguos, y falsos positivos para avisos de planes ya descartados.

Además, la caché de actividad solo añadía o reemplazaba filas que llegaban del servidor: una respuesta vacía no retiraba las notificaciones antiguas. El componente de la lista y su contador tampoco incorporaban siempre una nueva respuesta mientras seguían montados.

Al entrar en una rutina, SessionClient guardaba el borrador antes de autorizarlo para conservar un identificador estable ante errores y reintentos. Ese respaldo se publicaba inmediatamente como entrenamiento activo. Si la autorización rechazaba el inicio por una rutina completada, el dashboard ofrecía continuar ese intento como si fuera una sesión iniciada.

## Criterio del cambio

La campanita debe usar los mismos avisos pendientes y la misma actividad sin leer que el centro de notificaciones. Las notificaciones leídas pueden permanecer en el historial sin marcar la campanita; los avisos descartados no deben marcarla. Un fallo de consulta no equivale a un conteo confirmado.

Un borrador preparado debe conservar su identificador y sus datos sin aparecer como sesión activa. Solo una autorización válida habilita su presentación minimizada. Los intentos de versiones anteriores se pueden reclasificar al reintentar cuando la acción confirma que no existía autorización para ese identificador y rechaza el inicio. Una respuesta de red ambigua no permite hacer esa reclasificación. No se borra el respaldo ni el historial de entrenamientos.

Las pruebas del build usan cuentas de prueba aisladas, SQLite real y red externa bloqueada. No se consultan ni se modifican los datos remotos del usuario.

## Implementación y comprobación

- El dashboard consulta `loadNotificationAttention` y `listProductNotifications`, igual que el centro. Leer y quitar actividad revalida también el dashboard web.
- La caché reconcilia solamente el rango consultado. Mantiene páginas anteriores y posteriores y protege lecturas, descartes, altas y bajas confirmadas mientras llega una respuesta anterior. El propietario y la versión de sesión impiden incorporar respuestas posteriores al cierre o cambio de cuenta. Un conteo ambiguo queda desconocido hasta la siguiente lectura válida.
- El centro incorpora nuevas respuestas, mantiene páginas cargadas y cambios confirmados, conserva datos visibles ante un error temporal y calcula el contador sin duplicar descuentos.
- El respaldo guarda `activationState: preparing` antes de iniciar; el éxito real de autorización lo promueve a `active`. La acción Android solo devuelve `authorizationAbsent: true` si comprobó que ese identificador no tenía una autorización previa. El cliente puede entonces reclasificar un intento rechazado de una versión anterior, manteniendo su identificador y datos.

Validación final:

- `pnpm mobile:test`: 169 pruebas en 25 archivos, sin fallos.
- Siete suites de autorización, respaldo, store y minimizado: 135 pruebas, sin fallos.
- Cuatro suites de dashboard, contador, centro y acciones de notificaciones: 65 pruebas, sin fallos. El fixture de acceso a cuenta se actualizó al contexto que proporciona AppShell desde el cambio de avatar anterior; no hubo un cambio de producto asociado a ese ajuste del test.
- Navegador de sesión: 16 pruebas, sin fallos. Navegador del centro: 19 pruebas, sin fallos; incluye refresco, paginación, errores, gestos y foco.
- `node mobile/tests/notification-session-state-regression.mjs`: 10 escenarios sobre el build real, sin fallos. Incluye bandeja vacía, aviso de perfil, lectura/descarte, plan descartado, plan antiguo actualizado recientemente, leer una de dos novedades, entrenamiento completado, reanudación válida y respaldo antiguo rechazado. La comprobación de conservación del respaldo considera la normalización existente de metadatos vacíos.
- `node mobile/tests/session-readiness-regression.mjs`: cuatro escenarios de la corrección anterior, sin fallos, a 390 y 1440 px.
- TypeScript web y móvil, ESLint del alcance y `git diff --check`: sin errores.
- `pnpm android:offline:release`: correcto; 37 pruebas JVM sin errores ni fallos. Log en `.artifacts/notification-session-state/release-build.log`.
- Verificador de APK: assets iguales al build probado, SQLite incluido, 50 imágenes y 16 fuentes comprobadas, sin cargador remoto.
- Revisión independiente final de fuentes sin hallazgos pendientes. No hubo commit, push ni despliegue remoto. El checkout principal sigue limpio.

## Entrega y límites

- Archivo: `.artifacts/Vekira-1.1.9-offline.apk`.
- Paquete: `com.fitai.app`; versión `1.1.9-offline`; código `11`.
- Tamaño: 17 947 203 bytes.
- SHA-256: `6f04fa94659953a3ec95166bf264914bd113455c391d4298f6d23387034ab69f`.
- Firma verificada, mismo certificado de las versiones anteriores: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Instalar como actualización, sin desinstalar. Una tarjeta falsa guardada por la versión 1.1.8 se reclasifica al abrirla o volver a intentar esa rutina y regresar al inicio. El dashboard no intenta autorizar sesiones automáticamente.

No hay teléfono conectado por ADB: la instalación y el recorrido con la cuenta real siguen pendientes de comprobación en el dispositivo. Las pruebas con respuestas remotas controladas no establecen el estado de los datos de esa cuenta.
