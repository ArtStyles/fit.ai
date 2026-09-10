# Vekira Android 1.1.13-offline

Actualización del 10 de septiembre de 2026, integrada en `codex/android-offline`. El alcance autorizado es Android y APK; no se publica la web de producción.

## Aplicación

- Archivo local: `.artifacts/Vekira-1.1.13-offline.apk`.
- Paquete: `com.fitai.app`.
- Versión: `1.1.13-offline`; código `15`.
- Tamaño: 17 998 694 bytes (18,0 MB).
- SHA-256: `5df4a7427f97e9562f6ba45e0066e7498507610c992ee0e7a1c1d5addc0961cf`.
- Certificado SHA-256: `745fafc84e47312960f942cd3118bd1e57036d3993163fa3d6943bfd468c4784`.

Firma APK v2 válida, con el certificado original. Instalar sobre la versión anterior para conservar los datos; no desinstalar primero. El primer acceso a una cuenta y la sincronización siguen necesitando conexión.

## Correcciones

- Abrir una sesión completada desde Inicio ya admite la consulta de historial: el adaptador local ordena relaciones embebidas, conserva el orden raíz y el aislamiento entre cuentas.
- En la semana de Inicio, la fecha original de una sesión realizada otro día aparece azul, con fecha real de finalización y acceso al historial. La asistencia y el conteo permanecen en la fecha real, sin duplicarlos por mostrar la referencia original.
- La identidad procede de la ocurrencia guardada o de la autorización consumida. Para registros antiguos, se usa el día de la semana del snapshot dentro de la ventana de recuperación de dos días. No se deducen fechas del nombre de la rutina ni del horario actual. Si no hay evidencia suficiente, se conserva únicamente la fecha real registrada.
- Se preservan nombres históricos, contexto del plan anterior, cambios de día de una rutina, límites de semana y zona horaria. También se muestra la referencia cuando la fecha original es hoy o coincide con otra sesión real.
- Los dos selectores de «Mover una sesión» usan el componente Radix existente: menú del tema, controles táctiles, opciones multilínea, teclado, recuperación del foco y motivos de destinos bloqueados. Guardar y restaurar conservan la prescripción original.

Mantiene el mapa muscular y la reprogramación de sesiones incorporados en 1.1.12. No cambia el esquema remoto ni requiere migraciones Supabase.

## Verificación

- Reproducción roja y verde del error `nested ordering` y de los casos de fecha/identidad.
- 216 pruebas móviles en 29 archivos; 109 pruebas compartidas de dashboard/calendario semanal y planificación en 14 archivos.
- `pnpm type-check`, `pnpm mobile:type-check` y ESLint de los archivos modificados aprobados.
- `pnpm android:offline:release`: build correcto; 37 pruebas JVM, cero errores y fallos.
- `node mobile/tests/opengym-regression.mjs`: 12 recorridos sobre el bundle empaquetado, con SQLite real y red externa bloqueada. Incluye historial desde Inicio y tras recarga, recuperaciones nuevas y antiguas, plan anterior, adelanto de sesión, doble referencia, mapa muscular, menús/teclado, guardar/restaurar y completar la sesión movida. Vistas 320/360/390/1440px según escenario; sin errores de página ni desbordamiento horizontal.
- Capturas revisadas: tarjeta azul, detalle de sesión y ambos menús en móvil/escritorio. Evidencia local en `.artifacts/opengym-regression/`.
- `scripts/verify-android-offline.ps1`: assets del APK iguales al bundle probado; SQLite, 50 imágenes, 16 fuentes y licencia MuscleMap verificados; sin cargador remoto ni service worker.
- `apksigner` y `aapt2`: firma, paquete, versión y código correctos; min SDK 24 y target SDK 36.
- Sin dispositivos conectados por ADB. La instalación/actualización y el recorrido con la cuenta real en teléfono quedan pendientes de prueba física.

## Integración

Desarrollo aislado en `codex/android-offline-opengym`, basado en la entrega `15a4850`. La rama Android limpia recibe los cambios por fast-forward y push normal; se compara el SHA local con el remoto. La rama `main` permanece fuera de esta integración. APK, claves de firma y configuración local continúan ignorados por Git.
