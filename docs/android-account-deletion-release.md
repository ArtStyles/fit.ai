# Publicación de eliminación de cuentas y recuperación de acceso

## Estado y alcance

Este procedimiento acompaña a la rama `codex/android-offline`. **La migración y la web se desplegaron el 16/09/2026**, después de la autorización del propietario. Recibos y límites de la verificación: `android-account-deletion-deployment.md` y `android-web-deployment.md`. La URL pública es <https://fit-ai-kohl.vercel.app/> y el proyecto Supabase verificado es `duqayqktljywufgxobbl`.

La implementación local requiere juntos:

- `infra/supabase/migrations/20260916010000_verified_account_deletion.sql` y sus migraciones anteriores en el ledger activo.
- El servicio `src/lib/account/delete.ts`, `POST /api/account/delete`, la acción web de eliminación y las páginas `/delete-account` y `/recover-password`.
- La nueva app Android, configurada para ese backend.

**Eliminar únicamente el usuario de Auth no es suficiente.** El esquema profesional contiene referencias `RESTRICT` y protección de prescripciones bloqueadas. La prueba local reproduce el fallo para un cliente y para su entrenador. El RPC de preparación limpia las dependencias propias y conserva las prescripciones/historial de otros clientes antes del paso Auth.

## 1. Prerrequisitos y configuración

Antes de operar, identificar en los paneles del proveedor el proyecto Supabase y el proyecto de alojamiento que corresponden a esta aplicación. Usar un entorno de pruebas separado para los borrados de comprobación. Revisar que existe un mecanismo de recuperación de base de datos del proveedor y conocer sus límites para Storage/Auth; no presumir que un backup SQL restaura archivos o identidades.

Variables por nombre, sin valores:

| Entorno | Variables | Uso |
| --- | --- | --- |
| Servidor Next.js | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Verificación de la identidad y cliente público |
| Solo servidor | `SUPABASE_SERVICE_ROLE_KEY` | RPC privilegiado, limpieza Storage y eliminación Auth |
| Compilación Android | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Mismo proyecto Supabase; credenciales públicas |
| Compilación Android | `VITE_ACCOUNT_API_URL` | Origen HTTPS del backend de cuentas, sin ruta ni query |
| Compilación Android, opcional | `VITE_WEB_APP_URL` | Origen HTTPS de enlaces profesionales; usa el de cuentas si se omite |
| Operación CLI | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | Cuando la autenticación de la CLI las requiera |
| Operación PostgreSQL | `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSFILE` | Si se utiliza `psql`; proceden del entorno verificado por el operador |

La clave de servicio no debe existir en variables `VITE_*`, `NEXT_PUBLIC_*`, recursos Android ni repositorio. Las variables de Vite se incorporan al compilar: cambiar solo el servidor no actualiza una APK ya construida.

Para recuperar acceso, revisar SMTP y la plantilla **Reset password** de Supabase. El formulario implementado espera el código `{{ .Token }}`; una plantilla que solo envía un enlace no completa este flujo. Revisar también la caducidad configurada, los límites de envío y Site URL/URLs permitidas para cualquier enlace que conserve la plantilla. No se fija aquí un valor de caducidad ni se afirma que el correo real ya funciona.

## 2. Comprobaciones previas sin modificar datos

Ejecutar desde `D:\work\project\.worktrees\android-offline`:

```powershell
git status --short
git branch --show-current
pnpm check:supabase-migrations
pnpm supabase:migrations:list
pnpm supabase:migrations:dry-run
```

Los scripts utilizan `scripts/lib/supabase-migration-workdir.mjs`, Supabase CLI fijada por ese helper y el directorio activo **`infra/supabase/migrations`**. No usar la secuencia histórica de `supabase/migrations` para publicar. `dry-run` enumera las migraciones que se aplicarían y no las ejecuta.

Si aparece `LegacyProjectNotLinkedError`, no inferir el destino ni continuar con push. Vincular **el workdir `infra`** al proyecto que el operador haya confirmado usando el mismo helper (`--run link --project-ref` y la referencia verificada). Esto modifica configuración local y no se realizó durante esta entrega. Repetir listado y dry-run después. Detener el proceso si el listado incluye migraciones inesperadas o si no coincide el proyecto.

Con conexión PostgreSQL administrativa verificada, ejecutar estas consultas en una transacción de solo lectura. Si se usa consola, iniciar `psql -X -v ON_ERROR_STOP=1` con la conexión ya configurada, sin incrustar contraseñas en comandos o logs:

```sql
BEGIN READ ONLY;
SELECT version
FROM supabase_migrations.schema_migrations
ORDER BY version;

SELECT public.trainer_security_preflight() AS professional_schema_marker;

SELECT to_regprocedure('public.prepare_verified_account_deletion(uuid)') AS deletion_rpc,
       to_regclass('private.detached_trainer_prescriptions') AS retained_prescriptions;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='workout_plans'
  AND column_name='trainer_detached_at';
COMMIT;
```

En el esquema activo anterior a esta entrega el preflight profesional devuelve `61`; la nueva migración no cambia ese marcador ni pretende que él valide el RPC nuevo. Antes del despliegue es normal que el RPC/tabla/columna nuevos no existan; después deben existir. Comparar siempre con las migraciones efectivamente publicadas, no con un runbook histórico de otro marcador.

Comprobar las páginas públicas con GET y la API con OPTIONS, sin seguir silenciosamente redirecciones a login. Un `200` que contiene la página de acceso no prueba que exista la API. Antes de publicar estos cambios pueden no estar disponibles; registrar su estado como pendiente, no como prueba superada.

## 3. Verificación local y orden de despliegue

Pruebas reproducibles, independientes de credenciales remotas:

```powershell
node scripts/test-account-deletion-db.mjs --red-only
node scripts/test-account-deletion-db.mjs
pnpm exec vitest run --project unit src/lib/account/__tests__/delete.test.ts --maxWorkers=1
```

El runner SQL crea su propio contenedor efímero, carga el esquema real y usa cuentas ficticias. No acepta una URL de conexión remota ni reinicia otros contenedores. Evidencia de esta entrega: **42 comprobaciones PostgreSQL y 5 pruebas de servicio** correctas, con reproducción del fallo previo.

Orden para un operador autorizado:

1. Preparar un despliegue del servidor desde el código revisado, configurar sus variables y comprobar build/typecheck y pruebas correspondientes. Revisar el texto de retención de `/delete-account` y privacidad contra la sección 6.
2. En el proyecto verificado, revisar de nuevo el ledger y el dry-run. Aplicar mediante `pnpm supabase:migrations:push`. Este comando **sí modifica la base de datos**. El recibo de este lanzamiento documenta el fallback de transporte con el migrador oficial Go 2.101.0 ante fallos de la CLI fijada. No editar el ledger a mano ni usar reset remoto.
3. Repetir `pnpm supabase:migrations:list` y `pnpm supabase:migrations:dry-run`: la versión `20260916010000` debe figurar aplicada y no deben quedar migraciones previstas para este lanzamiento.
4. Ejecutar las consultas de la sección 4. Publicar después el servidor preparado, incluyendo API, acción web, páginas y excepciones de rutas públicas. No activar en Android el flujo contra una API anterior.
5. Verificar páginas/API y correo real con las cuentas controladas de la sección 5. Configurar las URLs de eliminación y privacidad de la ficha de Play Store cuando las páginas públicas estén disponibles.
6. Compilar el paquete Android con el origen de producción confirmado y las variables públicas del proyecto correcto. Repetir el recorrido desde ese paquete antes de distribuirlo. El APK/AAB local y las pruebas con HTTP simulado no demuestran despliegue, entrega de correo ni comportamiento en un teléfono.

## 4. Comprobaciones de la migración publicada

Además del ledger, comprobar el límite de permisos. Ejecutar solo después de que existan los objetos nuevos:

```sql
BEGIN READ ONLY;
SELECT p.proname, p.prosecdef, r.rolname AS owner, p.proconfig
FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
WHERE p.oid='public.prepare_verified_account_deletion(uuid)'::regprocedure;

SELECT
  has_function_privilege('anon','public.prepare_verified_account_deletion(uuid)','EXECUTE') AS anon_execute,
  has_function_privilege('authenticated','public.prepare_verified_account_deletion(uuid)','EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role','public.prepare_verified_account_deletion(uuid)','EXECUTE') AS service_execute;

SELECT
  has_table_privilege('anon','private.detached_trainer_prescriptions','SELECT,INSERT,UPDATE,DELETE') AS anon_access,
  has_table_privilege('authenticated','private.detached_trainer_prescriptions','SELECT,INSERT,UPDATE,DELETE') AS authenticated_access,
  has_table_privilege('service_role','private.detached_trainer_prescriptions','SELECT,INSERT,UPDATE,DELETE') AS service_direct_access;

SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid='public.workout_plans'::regclass
  AND tgname IN ('trg_validate_trainer_assigned_plan','trg_guard_locked_trainer_plan_mutation');
COMMIT;
```

Esperado: SECURITY DEFINER verdadero, propietario `postgres`, `search_path=public, pg_temp`; permisos de ejecución `false / false / true`; acceso directo a snapshots `false / false / false`; triggers habilitados. El validador debe incluir `trainer_detached_at`. La identidad normal de `trainer_assigned` sigue exigiendo relación, asignación y versión válidas. No resolver un fallo concediendo acceso a authenticated o desactivando los triggers.

La API publicada debe responder OPTIONS `204` y un POST sin Bearer `401` JSON con `auth_required`, nunca HTML de login. El POST sin identidad es una prueba negativa sin borrado. El endpoint no acepta `userId`; el servidor obtiene la identidad de `getUser(token)`.

## 5. Prueba controlada antes de liberar Android

Usar exclusivamente identidades ficticias y correos controlados, en un proyecto de pruebas separado. Registrar los UUID del fixture y los resultados sin guardar contraseñas/tokens. No usar una cuenta personal ni la cuenta propietaria protegida.

1. Crear entrenador A, clientes B y C y cuenta D ajena. Establecer relaciones reales, una plantilla de A y una asignación para cada cliente. Activar una rutina profesional y registrar sesiones/series. Subir un archivo de prueba de cada cuenta a los flujos que correspondan.
2. Guardar una comparación de las plantillas de A, los planes/historial/series de C y datos de D. Eliminar B desde Ajustes → Cuenta de la app, confirmando la palabra solicitada. Verificar la ausencia de Auth/perfil/datos propios de B y que A, C y D conservan lo esperado. En el dispositivo deben seguir disponibles las otras cuentas locales.
3. Con un fixture nuevo equivalente, eliminar A desde la página web. Auth, perfil y relaciones vivas de A deben desaparecer. B y C mantienen sus sesiones, series y ejercicios prescritos exactos; sus copias quedan profesionales, bloqueadas, retiradas y con `trainer_detached_at`. No pueden activarse ni editarse como planes personales. Los datos de D permanecen iguales.
4. Probar petición sin sesión, sesión caducada, confirmación incorrecta y cuerpo con campo `userId`: no deben eliminar datos. El SQL local ya comprueba el bloqueo del propietario; no intentar borrarlo en producción.
5. En pruebas, simular fallo de Storage, fallo del RPC y fallo/respuesta perdida de Auth. Comprobar el tratamiento de la sección 7. El cliente no debe informar éxito ni borrar la cuenta local por un `503` o una respuesta ambigua.
6. Recuperar acceso con un correo controlado: recepción del código, código incorrecto, caducado, reenvío, cambio de contraseña y login posterior con la nueva. Confirmar que cancelar la recuperación no cambia la cuenta activa ni persiste una sesión de recuperación.
7. Tras el despliegue real, hacer únicamente una comprobación final con cuentas de prueba expresamente creadas para ese destino, después de confirmar el alcance. Registrar evidencia del paquete instalado, versión del servidor, ledger y correo entregado. No dar por aprobada esta fase a partir de los mocks locales.

## 6. Retención real que debe declarar el producto

Se eliminan el perfil y datos propios de entrenamiento, medidas, conversaciones, backups en la nube, dependencias profesionales propias y archivos ubicados en los prefijos de propietario de los buckets atendidos por el servicio (`avatars`, `posts`, `trainer-credentials`, `fitness-card-photos`). La limpieza confirma cada paso; los servicios externos pueden fallar por separado.

Excepciones reales:

- `professional_audit_logs` permanece inmutable, **incluidos UUIDs y metadatos permitidos de los eventos**. No se borra ni anonimiza automáticamente. La migración no establece un plazo de retención; el responsable debe definir y publicar uno que corresponda a su operación y obligaciones, sin inventarlo en esta guía.
- Al eliminar un entrenador, las prescripciones y sesiones que pertenecen a sus clientes se conservan como historial propio de esos clientes. El snapshot privado se elimina cuando se elimina su plan/cliente. Se corta la relación profesional viva y no se transforma la rutina en editable.
- Archivos exportados y copias en otros dispositivos no son revocados ni borrados remotamente por este flujo. Deben eliminarse allí. Esto incluye un dispositivo offline con una copia previa.
- La retención de backups o logs internos de los proveedores no está configurada por esta migración. Verificarla con la configuración del proveedor antes de prometer eliminación inmediata de todas las copias.

La página pública y privacidad deben describir estas excepciones con claridad. “Todo queda anonimizado” o “todos los datos se borran inmediatamente en cualquier dispositivo” no corresponde a esta implementación.

## 7. Fallos parciales y recuperación

Orden del servicio: **Storage → RPC transaccional → Auth → confirmación al cliente**. PostgreSQL sí es transaccional; Storage y Auth no participan en esa misma transacción.

| Estado verificado | Resultado real | Acción de recuperación |
| --- | --- | --- |
| Falla Storage | Puede haber archivos ya retirados; RPC y Auth no se ejecutan | Resolver el fallo de Storage y reintentar la misma solicitud verificada. La paginación recopila rutas antes de borrar; rutas ausentes no justifican cambiar de cuenta |
| Falla/falta el RPC | Auth no se elimina; la transacción SQL fallida revierte sus cambios; Storage puede estar limpio | Revisar versión/ACL/errores de la migración y corregir hacia delante. No saltarse el RPC ni desactivar `RESTRICT`/bloqueos |
| RPC termina y Auth falla | Datos/perfil propios ya eliminados; identidad Auth pendiente | Confirmar el UUID en las herramientas administrativas autorizadas. Reintentar el mismo flujo: el RPC tolera el perfil ausente y Auth se vuelve a intentar. No recrear automáticamente el perfil ni restaurar una copia vieja |
| Auth termina pero se pierde la respuesta | La cuenta remota puede estar eliminada y la copia local aún existir | Consultar Auth por el UUID registrado, no deducir éxito solo de un fallo de login. Un nuevo `401` no es una confirmación de borrado. Resolver la copia local tras confirmar el resultado, preservando otras cuentas |
| Estado remoto desconocido | No hay prueba suficiente de éxito | Mantener el resultado como pendiente, inspeccionar Storage/perfil/Auth por separado y reintentar solo con identidad y alcance confirmados |

Para investigar, usar lecturas administrativas restringidas al UUID de prueba/solicitud ya verificado; no registrar correos, tokens o contenido completo del historial en logs de diagnóstico. Un respaldo previo o la auditoría no autoriza recrear una cuenta que pidió eliminarse. Un rollback de la web tampoco revierte una eliminación ya completada. Ante problemas, suspender la liberación del paquete y corregir hacia delante manteniendo el RPC, sus permisos y los invariantes de prescripción.
