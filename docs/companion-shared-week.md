# Saludos recibidos y semana compartida

Ampliación del compañero de constancia aprobada en esta conversación e implementada sobre los cambios locales de `codex/android-offline`.

## Comportamiento

- La pantalla del compañero muestra el último saludo recibido de esa persona con su nombre y fecha, separado del saludo enviado. El texto se representa literalmente, sin interpretar HTML.
- Se conserva el saludo recibido aunque sea de un día anterior, hasta que el emisor envíe otro o termine el vínculo. No se crea un historial de conversación.
- El envío mantiene su límite diario y los reintentos existentes; consultar un saludo o mostrar un logro no envía mensajes.
- Inicio y el resumen semanal muestran «Semana completada juntos» cuando ambos alcanzan su propia meta. Las metas pueden ser diferentes. No se modifica ningún plan.
- Se requieren dos metas conocidas, positivas y alcanzadas, para el mismo periodo lunes-domingo actual según las zonas horarias de ambas personas. No se combinan semanas diferentes ni se inventan metas.
- La vista reevalúa el logro cada minuto y al recuperar foco/visibilidad para retirar una celebración de la semana anterior sin esperar una petición nueva.
- Android conserva el dato en la caché privada de la cuenta bajo el límite existente de 24 horas, con aviso de resumen anterior cuando está sin conexión. No se agrega al respaldo de entrenamiento y no pasa a otra cuenta.

Las cinco pestañas, el compañero único y las invitaciones existentes se conservan. El historial de cuatro semanas y varios compañeros no forman parte de esta entrega.

## Compatibilidad y migración

`20260912020000_companion_received_greeting.sql` amplía `private.companion_state`; la migración anterior permanece intacta. El mensaje recibido se consulta únicamente dentro de un vínculo activo, desde el emisor que corresponde al compañero actual, con el identificador exacto de ese vínculo y una cuenta de origen activa.

El campo adicional `receivedGreeting` es opcional para aceptar respuestas antiguas y cachés anteriores. La aplicación mantiene el resto de las funciones si el servidor aún no devuelve este campo. Cuando está presente, se valida su fecha, texto y estado de consentimiento.

## Verificación de esta entrega

- Contrato, logro, acciones web, dashboard y notificaciones: 80 pruebas correctas.
- Suite Android: 200 pruebas correctas, incluida caché del saludo, aislamiento por cuenta y respaldo sin datos del compañero.
- Componentes en navegador: 17 pruebas correctas; ES/EN, saludo recibido/enviado, cuota, texto literal, metas distintas, desconexión, cambio de cuenta/vínculo y cambio de semana.
- Recorrido sobre `mobile/dist`: 11 escenarios correctos con SQLite y HTTP controlado, sin errores de navegador ni peticiones inesperadas. Incluye las nuevas vistas a 390 y 1440 px, recarga offline y revocación confirmada.
- TypeScript web y móvil, ESLint del alcance, build móvil y validador de 11 migraciones correctos.
- PostgreSQL 17 real en una instancia temporal local: contratos anteriores y nuevos de saludos correctos, incluidas invitaciones concurrentes y carreras entre envío y desvinculación. El modo `--native` usa la instalación existente y conserva el modo Docker habitual.
- Pruebas escritas antes de implementar confirmaron la falta del nuevo dato y de la celebración; después pasaron con la implementación.

Capturas de componentes revisadas a 320/390/1440 px en `.artifacts/companions/enhanced-*.png`. El recorrido compilado guarda `.artifacts/companion-constancy/shared-week-*.png` y su `report.json`. Revisión independiente de contrato, interfaz y SQL sin hallazgos accionables.

El build mantiene avisos existentes de Browserslist, clases de duración y tamaño/importaciones de chunks. No se cambiaron dependencias para esta ampliación.

PostgreSQL: `node mobile/src/original/run-companion-postgres.mjs --native --red-received` falló por la ausencia esperada de `receivedGreeting`; con todas las migraciones, `node mobile/src/original/run-companion-postgres.mjs --native` pasó. Ambas ejecuciones finales detuvieron y eliminaron su instancia temporal. Docker no pudo iniciar por un problema del archivo de ejecución `dockerInference`; no se reinicializaron datos ni ajustes de Docker.

La revisión detectó y corrigió la lectura de archivos de inicio personales de `psql`: el ejecutor ahora usa `-X` tanto en modo nativo como Docker. Las ejecuciones finales repitieron el fallo esperado y el éxito usando un `PSQLRC` de prueba que intentaba desactivar `ON_ERROR_STOP`, confirmando que se ignora. Evidencia en `.artifacts/companion-shared-week/postgres-red.log` y `postgres-green.log`.

Un intento nativo inicial dejó `C:\Users\ACER NITRO\AppData\Local\Temp\vekira-companion-contract-fVzvpx`. Sus procesos están detenidos. La revisión automática rechazó la eliminación de esa carpeta con `blocked by policy`; no se reintentó por otra vía.

## Alcance de publicación

El 10 de septiembre de 2026, el usuario autorizó desplegar la migración y generar la APK. Se aplicó `20260912020000_companion_received_greeting.sql` al proyecto Supabase `duqayqktljywufgxobbl`. El ledger remoto contiene 11 migraciones y `trainer_security_preflight` conserva el resultado 61. El dry-run posterior confirmó `upToDate: true`, sin migraciones, seeds ni roles pendientes.

El cuerpo de `private.companion_state(uuid)` coincide exactamente con la migración revisada: MD5 del cuerpo con saltos de línea normalizados `f73a851669e8c11898af652881fe347f`; SHA-256 del archivo de migración `da4132ff5dbed6bee23dcf5ee89226bb652db57bdcea1ec13d8b54e55cbed921`. Pasaron las verificaciones de ACL, autoridad de la RPC y privacidad de la función auxiliar. Una transacción SQL `READ ONLY` comprobó la proyección del saludo y la identidad con dos sujetos activos existentes, la ausencia de saludo fuera de un vínculo activo, el rechazo del acceso directo a la función privada y el rechazo sin identidad. No se modificaron datos de negocio ni se guardaron identidades o mensajes reales en los informes. La comprobación HTTP REST mediante PowerShell, con HTTPS y validación TLS normal, confirmó el rechazo anónimo esperado: HTTP 401, código `42501`, permiso denegado para `get_companion_state`. El error `EACCES` del intento con Node correspondía al entorno local.

La nueva APK `.artifacts/Vekira-1.1.11-offline.apk` incorpora esta ampliación: código 13, paquete `com.fitai.app`, 17.967.805 bytes, SDK mínimo 24 y destino 36. SHA-256:

```text
7e67bef3798d744c8cc66c83475dede26cf6f7f2b179cf22cc6078e5ab26d4bc
```

La firma v2 es válida y mantiene el certificado de `1.1.10-offline`, con SHA-256 `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`. Se conserva el origen HTTPS de WebView y la APK anterior permanece intacta. Los 249 archivos de `mobile/dist` reconstruidos son idénticos a los del build que pasó los 11 recorridos compilados; la APK contiene esos archivos y los dos archivos Cordova vacíos generados por Capacitor, todos verificados. También se comprobaron SQLite, 50 imágenes y 16 fuentes, sin cargador remoto. Gradle terminó correctamente y confirmó `testDebugUnitTest UP-TO-DATE`: siete suites, 37 pruebas, cero fallos ni errores.

Los logs de despliegue y SQL están en `.artifacts/companion-shared-week/supabase-*.log` y el informe remoto consolidado en `supabase-release-verification.json`, verificado a las `2026-09-10T16:34:53.868Z`; los informes de firma, metadatos, archivos y compilación están en `.artifacts/companion-shared-week/release-1.1.11/`. Instalar sobre la versión anterior, sin desinstalar, para conservar los datos locales. No se probó en un teléfono físico, no se publicó la web ni se realizó push a Git. Las verificaciones SQL y de navegador no equivalen a una sesión real de usuario en el dispositivo.
