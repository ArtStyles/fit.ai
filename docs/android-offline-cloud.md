# Respaldo móvil y conexión directa

> Documento histórico de la primera implementación `1.1.0-offline`, cuya interfaz fue rechazada. La versión corregida reutiliza las pantallas originales y el contrato vigente está en [android-original-sync.md](android-original-sync.md). Las tablas anteriores se conservan para recuperar datos; no representan el almacenamiento de la entrada actual.

La aplicación de `mobile/` conecta directamente a Supabase mediante su SDK público. No llama a rutas de Next.js/Vercel y no contiene claves de servicio. Configuración de compilación: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Sin ambas variables, el entrenamiento y los respaldos locales funcionan; las acciones online muestran que falta configurar la conexión.

## Lo que funciona con las APIs existentes

- Correo/contraseña mediante Supabase Auth y descarga del perfil. La evaluación de preparación conserva sus bloqueos y nunca se da por aprobada si falta en el servidor.
- Descarga paginada de planes personales/profesionales, entrenamientos, series históricas y medidas de la cuenta autorizada. Se conservan los UUID de los entrenamientos y ejercicios remotos para recuperación de borradores antiguos. Las sesiones usan nombres históricos cuando existe `session_context_snapshot`.
- Directorio profesional, servicios solicitables mediante `get_requestable_trainer_services`, solicitudes con `create_coaching_request`, relaciones y asignaciones propias, conforme a RLS y los RPC existentes. La interfaz exige aceptar el texto `training-profile-v1` antes de solicitar un entrenador. Los planes materializados del cliente se descargan al sincronizar.
- Cada nueva versión de una asignación mantiene su propio plan. Los planes profesionales descargados son instantáneas inmutables; una sesión iniciada conserva su prescripción. No se convierte un programa profesional en una rutina editable.

La aplicación móvil implementa el **lado cliente del acompañamiento**, no el editor y panel de trabajo del profesional. Los cambios del perfil móvil no modifican el perfil web que comparte el entrenador; esa integración requiere un trabajo separado y explícito. Las imágenes sin correspondencia local se sustituyen por el contenido textual y el recurso de reserva de la interfaz.

## Respaldo móvil entre dispositivos

La migración adicional `infra/supabase/migrations/20260909030000_mobile_offline_backup.sql` crea dos tablas propias y `mobile_sync_push_v1`. Guarda perfiles, planes personales, sesiones finalizadas y medidas, incluidas las marcas de eliminación. Otro dispositivo conectado a la misma cuenta los descarga. La selección del plan activo y una sesión aún abierta permanecen locales; el respaldo/exportación local incluye esa sesión abierta.

**No se aplicó esta migración a producción.** Hasta su despliegue autorizado, las descargas web siguen disponibles, pero una operación de respaldo móvil devuelve un aviso de capacidad pendiente, queda en la cola y conserva su archivo local. No hay una ruta alternativa de inserción que eluda los permisos.

Los registros móviles se guardan en `mobile_sync_entities`, separados de `progress_logs`, `workout_plans` y `measurements` de la web. Por tanto, **el progreso registrado exclusivamente en la aplicación Android todavía no aparece en la web ni en las estadísticas web del entrenador**. La interfaz debe denominar esta función “Respaldo móvil”. No se presenta como una sincronización bidireccional completa con la web.

Reglas verificadas:

- Una cola serial incluye sincronización y cambios de autenticación. Antes de cada envío y antes de confirmar se verifica online el usuario actual y su coincidencia con el propietario y perfil activo.
- Cada operación conserva un UUID y contenido inmutables. Una respuesta perdida se reintenta con el mismo identificador; el servidor compara tipo, entidad, contenido y fecha antes de devolver el mismo recibo.
- El RPC ejecuta escritura y recibo en la misma transacción, con bloqueo por propietario. Las tablas no conceden inserción directa a clientes; RLS solo permite leer los datos propios de una cuenta activa.
- Las sesiones personales deben coincidir con el plan móvil previamente respaldado. Una sesión de un plan web debe referir un entrenamiento y plan propios, con identificadores y valores de prescripción iguales a los canónicos. Un plan profesional no puede crearse ni modificarse mediante este RPC.
- Las cantidades, fechas, tamaños y estructura básica se validan en el servidor. Las prescripciones de planes ya respaldados y las sesiones finalizadas son inmutables. Cambiar una rutina produce una nueva identidad.
- Los cambios pendientes y los datos locales más nuevos ganan frente a descargas antiguas; el repositorio comprueba de nuevo dentro de su transacción. El servidor rechaza conflictos distintos con idéntica fecha y no reemplaza versiones posteriores por operaciones antiguas.
- Cerrar sesión elimina las credenciales de este dispositivo y bloquea escrituras tardías de renovación, sin necesitar internet. No revoca las sesiones de otros dispositivos. Los perfiles y datos locales se conservan para seleccionarlos expresamente.

Iniciar sesión abre el perfil de esa cuenta remota; no atribuye silenciosamente datos de otro perfil local a esa persona. Los perfiles locales previos siguen en el selector y pueden exportarse. Cualquier transferencia debe usar el flujo explícito de importación/enlace que valide el propietario.

## Validación reproducible

```powershell
pnpm exec vitest run --config mobile/vitest.config.ts mobile/src/cloud --maxWorkers=2
pnpm exec tsc --noEmit -p mobile/tsconfig.json
node mobile/src/cloud/__tests__/run-postgres.mjs
```

El último comando necesita Docker y la imagen local `public.ecr.aws/supabase/postgres:17.6.1.143`. Crea su propio contenedor sin puertos publicados ni montajes y lo elimina al terminar; no usa ninguna base de datos del usuario. Primero prueba el RPC con roles/JWT en una base desechable; después instala el esquema público/privado completo y todas las migraciones siguientes en otra base desechable. Las tablas de Auth/Storage se simulan como plataforma externa para cargar el volcado; esta prueba no sustituye una prueba end-to-end de GoTrue/PostgREST y sus políticas en el entorno desplegado.

Resultado durante la implementación: 17 pruebas Vitest de nube aprobadas; compilación TypeScript móvil aprobada; contratos PostgreSQL aprobados para propietario, respuesta perdida/idempotencia, reversión atómica, escritura directa denegada, prescripción profesional, otro propietario, autenticación ausente, versiones antiguas, eliminaciones y carga completa de migraciones. Ninguna prueba utilizó credenciales reales ni modificó producción.

El despliegue futuro requiere revisión de esta migración adicional, aplicación por el flujo autorizado de migraciones y pruebas con dos cuentas reales de ensayo: enviar, reinstalar de forma compatible/abrir otro dispositivo, descargar, cerrar sesión offline y verificar aislamiento. No se ha comprobado ese recorrido remoto ni un dispositivo físico en esta tarea de nube.
