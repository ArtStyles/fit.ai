# Compañero de constancia

Implementación del diseño aprobado, en el worktree `codex/android-offline`. Conserva las cinco pestañas y los cambios anteriores de la aplicación.

## Integración visual

- Inicio: tarjeta después del entrenamiento de hoy, con acceso al compañero y al saludo.
- `/companion`: código de invitación, revisión de identidad, aceptación, resumen semanal y desvinculación confirmada.
- `/companion?view=message`: mensaje opcional de 120 puntos Unicode tras normalización NFC y eliminación de espacios exteriores; el vacío envía `👏 ¡Bien hecho!`.
- Invitaciones y saludos aparecen en la campanita existente. No hay publicaciones, archivos ni historial de chat.
- La vista usa los componentes, tipografía y traducciones de la aplicación. Las pruebas renderizan 320, 390 y 1440 píxeles.

## Reglas y persistencia

Una persona puede mantener un vínculo activo o pendiente. Los códigos y las invitaciones caducan en siete días. Ambas personas confirman antes de compartir. Sólo se muestran nombre, foto, sesiones de la semana y meta; los detalles de entrenamientos y salud siguen siendo privados.

Las ocho funciones RPC de `20260912010000_companion_constancy.sql` obtienen la identidad autenticada y gestionan membresía, cuota y notificación dentro de la misma transacción. Las tablas y funciones auxiliares privadas no conceden acceso a `anon` ni `authenticated`. Bloqueos de usuarios en orden estable y la clave única por miembro resuelven invitaciones y envíos simultáneos.

Un saludo por remitente y día UTC, con próxima disponibilidad mostrada en hora local. Cambiar de compañero no reinicia el límite. Se conserva sólo el último recibo por remitente: repetir su UUID y texto devuelve el estado sin generar otro aviso, hasta que un envío posterior lo sustituye. Las notificaciones ocupan una fila por destinatario y tipo; un evento nuevo renueva su UUID para que una lectura o eliminación tardía del anterior no oculte el nuevo.

El servidor calcula cada semana según la zona horaria de su propietario, suma las sesiones canónicas y las del respaldo Android y deduplica IDs/sesiones. La meta procede del plan activo y, si falta, del perfil; una meta desconocida se muestra como tal. No se descarga el respaldo de otra persona.

## Android y conexión

El adaptador de Android valida las respuestas y guarda un resumen separado por cuenta durante un máximo de 24 horas. Sin conexión muestra que son datos anteriores y permite redactar, sin enviar ni modificar vínculos. Un envío ambiguo invalida la caché anterior; su reintento conserva el UUID y texto. El borrador sólo vive en la vista y se elimina al cambiar de cuenta/vínculo o desmontarla.

Para que el progreso local llegue al resumen, los cambios de entrenamiento de una cuenta conectada con compañero actualizan el respaldo privado existente. Se conserva primero SQLite y después se intenta sincronizar, con debounce, exclusión de intentos y límite de 30 segundos. Se reutiliza la protección de conflictos entre dispositivos. El cliente de red, las lecturas y las escrituras locales se vinculan a la identidad y generación de sesión del intento; no se inicia sesión en segundo plano. Una confirmación privada ya enviada puede terminar de persistirse en su propia cuenta, pero no activa una sesión ni escribe en otra cuenta.

## Validación local

Comandos ejecutados durante la implementación:

```powershell
pnpm mobile:test
pnpm exec vitest run src/lib/companions/__tests__/client.test.ts src/app/actions/__tests__/companions.test.ts src/lib/dashboard/__tests__/DashboardPage.integration.test.tsx src/app/actions/__tests__/notifications.test.ts
pnpm exec vitest run src/components/companions/__tests__/companionInteraction.test.tsx --project browser-fixtures
node mobile/src/original/run-companion-postgres.mjs
pnpm run check:supabase-migrations
pnpm mobile:type-check
pnpm run type-check
pnpm mobile:build
node mobile/tests/companion-regression.mjs
```

- Android: 199 pruebas correctas, incluidas cuenta, cierre de sesión, rutas, adaptador y sincronización.
- Contrato compartido, acciones web, dashboard y notificaciones: 63 pruebas correctas.
- Vistas: 11 pruebas de navegador correctas, incluidos consentimiento, doble pulsación, Unicode, borrador, reintento, foco, cuenta cambiada y respuestas transitorias.
- Build real: 9 recorridos correctos con SQLite y red controlada; cero peticiones inesperadas. Verifica ambos tamaños de dashboard, campanita y lectura durable, un único respaldo automático con la sesión pendiente, reconexión sin envío automático, desvinculación y caché aislada entre cuentas.
- PostgreSQL real: baseline completa, contratos de privacidad, caducidad, Unicode, deduplicación y carreras concurrentes correctos. También se reprodujo y corrigió la reutilización del ID de una notificación leída.
- TypeScript web/móvil, ESLint del alcance, validador de 10 migraciones y `git diff --check` correctos.
- Build móvil correcto. Permanecen avisos existentes de tamaño de chunks, Browserslist y clases de duración; las importaciones diferidas del coordinador también comparten módulos que ya carga la aplicación.

Las capturas de componentes están en `.artifacts/companions/`; el recorrido sobre el build real, con SQLite y HTTP controlado, escribe capturas y `report.json` en `.artifacts/companion-constancy/`. No envía mensajes ni peticiones a cuentas reales.

## Despliegue y APK — 10 de septiembre de 2026

El usuario autorizó explícitamente desplegar la migración y generar la APK. Se aplicaron mediante el wrapper mantenido, CLI 2.116.0 y `infra`, las tres migraciones pendientes del proyecto configurado en web y móvil (`duqayqktljywufgxobbl`):

- `20260909030000_mobile_offline_backup.sql`.
- `20260911003000_original_app_snapshot_backup.sql`.
- `20260912010000_companion_constancy.sql`.

El ledger pasó de siete a diez entradas. El dry-run previo enumeró exactamente esas tres migraciones, sin seeds ni roles; el posterior confirmó `upToDate: true` y ninguna pendiente. No se ejecutaron resets ni modificaciones de datos de negocio para verificar el despliegue. El preflight de entrenadores sigue en 61.

Una transacción remota de sólo lectura comprobó las ocho RPC de compañeros y tres de respaldo, SECURITY DEFINER/search_path, permisos de tablas y funciones privadas, rechazo sin identidad y aislamiento del respaldo. Se ejecutaron consultas con el rol `authenticated` y dos sujetos activos existentes, sin imprimir sus identidades ni datos. Esto comprueba la autorización de la base de datos; no equivale a una sesión real de usuario en un teléfono. La API REST reconoce la nueva RPC y rechaza llamadas anónimas. La ruta de red usada fue el pooler de transacciones 6543 con TLS; no se guardaron credenciales en informes o archivos de código.

APK entregada: `.artifacts/Vekira-1.1.10-offline.apk`, código 12, paquete `com.fitai.app`, 17.966.821 bytes, SDK mínimo 24 y destino 36. SHA-256:

```text
ed82e5da0cfb2e62abc605500ff3e01d3c0b2890d2a510d3806ff723525f0562
```

Firma v2 verificada, con el mismo certificado que 1.1.9 y el mismo origen HTTPS de WebView. Los 249 archivos empaquetados coinciden con el build previamente probado; se verificaron SQLite, 50 imágenes y 16 fuentes. Gradle finalizó correctamente y confirmó `testDebugUnitTest` actualizado (siete suites, 37 pruebas, cero fallos). La APK anterior permanece intacta.

Los informes están en `.artifacts/companion-constancy/release-1.1.10/`; los logs de despliegue sanitizados, en `.artifacts/companion-release-*.log`. Instalar sobre la versión anterior, sin desinstalar, para conservar los datos locales. No se ha probado esta versión en un teléfono físico ni se ha publicado la web o enviado cambios a Git.
