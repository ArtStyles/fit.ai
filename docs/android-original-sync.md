# Respaldo y descarga de la aplicación original en Android

La entrada local reutiliza las páginas originales y conserva sus filas de datos. `mobile/src/original/sync.ts` ofrece `connectAccount`, `prepareSignedInAccount` y `synchronize`. El cliente usa la sesión Supabase del usuario, nunca una clave de servicio.

## Datos descargados

Se descargan con paginación `profiles`, `workout_plans`, `workouts`, `workout_exercises`, `exercises`, `progress_logs`, `exercise_logs` y `measurements`. Las filas conservan sus campos originales, incluidas las prescripciones, los snapshots históricos, el esfuerzo, las duraciones y las ocho medidas corporales. Los ejercicios privados referenciados se solicitan bajo las políticas existentes de Supabase. También se intenta actualizar el acceso profesional propio y los metadatos de rutinas asignadas.

Los ejercicios públicos que coinciden exactamente con `source` y `external_id` del catálogo incluido usan sus imágenes y animaciones revisadas locales. Conservan el ID original de la web y las referencias de sus rutinas; la URL remota original queda en un campo `mobile_remote_*` del respaldo. Esta normalización también se aplica a las próximas descargas. Los ejercicios privados, antiguos o ajenos al catálogo conservan sus medios originales y pueden necesitar conexión para mostrarlos.

Los perfiles locales siguen separados de las cuentas conectadas. Una nueva autenticación selecciona la cuenta vinculada sin eliminar otros perfiles ni sustituir sus cambios pendientes. La actualización de datos web compara con la última descarga para conservar las ediciones y eliminaciones realizadas en el dispositivo. Una rutina nueva de la web queda disponible sin desplazar una selección principal modificada localmente.

## Respaldo independiente de Android

La migración aditiva `infra/supabase/migrations/20260911003000_original_app_snapshot_backup.sql` crea un respaldo completo privado por cuenta y recibos de operación. La subida compara una revisión remota esperada; dos dispositivos no pueden sobrescribirse silenciosamente. Cada operación tiene un identificador estable y un recibo inmutable para reintentar una respuesta perdida. La confirmación reconoce solo la revisión enviada, dejando pendientes los cambios realizados durante la subida.

El respaldo almacena el estado original como JSON; no escribe sesiones, medidas, planes ni prescripciones en las tablas canónicas de la web o de entrenadores. Por tanto, el progreso nuevo de Android todavía no se incorpora al historial web ni a la evidencia profesional del entrenador. Los RPC existentes de entrenadores continúan funcionando con conexión y sus permisos originales.

Una cuenta local limpia puede recuperar un respaldo de otro dispositivo. Si ambos lados contienen cambios distintos, se conserva la copia local y se informa del conflicto. Hay que exportar el respaldo local antes de decidir qué copia conservar; no hay una fusión automática de dos entrenamientos divergentes.

La migración está preparada y validada localmente, **no aplicada al servidor de producción**. Si aún no existe, la descarga de rutinas e historial web funciona igualmente; sincronizar muestra que falta habilitar el respaldo Android. Debe mantenerse una exportación local hasta activar y verificar ese servicio.

## Verificación reproducible

```powershell
pnpm exec vitest run --config mobile/vitest.config.ts mobile/src/original/sync.test.ts mobile/src/original/sync-gateway.test.ts
node mobile/src/original/run-sync-postgres.mjs --full
```

El segundo comando usa únicamente un contenedor PostgreSQL efímero con nombre propio, sin publicar puertos, sin conectar con producción y sin modificar otros contenedores. Verifica persistencia completa, revisión optimista, reintentos, aislamiento de cuentas, RLS, bloqueo de escrituras directas y suspensión. `--full` comprueba además que todas las migraciones existentes y la nueva se aplican juntas.
