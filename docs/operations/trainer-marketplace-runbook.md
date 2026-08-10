# Runbook operativo del marketplace de entrenadores

## Alcance y estado del piloto

Este runbook cubre despliegue, verificación administrativa, suspensión, consentimiento, incidentes y rollback del módulo de entrenadores. El piloto comienza únicamente cuando el checklist de piloto esté firmado.

Durante esta etapa:

- `COMMUNITY_ENABLED` debe permanecer en `false`.
- Los servicios son gratuitos; precio, moneda, intervalo, checkout y claves de pago no se muestran ni se configuran.
- No existen chat privado ni reseñas del marketplace. La entrevista se coordina por el contacto externo declarado en la solicitud y visible solo para administración.
- Las rutinas profesionales aceptadas son inmutables para el cliente; el cliente solo puede ejecutarlas. Los cambios llegan como una nueva revisión del entrenador.
- Los planes comerciales futuros permanecen ocultos hasta integrar y aprobar la pasarela de pago.

## Responsables y evidencia

Antes del despliegue, registrar sin secretos:

- responsable de despliegue;
- responsable de base de datos y respaldo;
- administrador de verificación profesional;
- responsable de privacidad/incidentes;
- identificador del commit y del despliegue anterior;
- identificador del respaldo y resultado de su restauración de prueba;
- hora de inicio, resultado de cada puerta y decisión final.

No copiar valores de variables, credenciales, datos de contacto, notas, documentos, medidas ni URLs/rutas de storage en tickets, logs o capturas.

## Variables requeridas

Validar solo presencia y alcance; nunca imprimir valores:

- Aplicación: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `COMMUNITY_ENABLED`.
- E2E dedicado: `E2E_SUPABASE_URL`, `E2E_SUPABASE_PROJECT_REF`, `E2E_RUN_ID`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`.
- Puertas E2E: `E2E_TRAINER_RELATIONSHIPS_ENABLED`, `E2E_TRAINER_PROGRAMMING_ENABLED`, `E2E_TRAINER_PROGRAMMING_RETENTION_ACK`, `E2E_TRAINER_INSIGHTS_ENABLED`, `E2E_TRAINER_SECURITY_ENABLED`.
- Respaldo operativo, fuera de la aplicación: `TRAINER_DATABASE_PGSERVICE`, `RESTORE_VERIFY_PGSERVICE`, `PGSERVICEFILE`, `PGPASSFILE`, `BACKUP_AGE_RECIPIENT`, `BACKUP_AGE_IDENTITY_FILE`.

`SUPABASE_SERVICE_ROLE_KEY` y los secretos de base de datos solo se usan en procesos de servidor o del operador. Las conexiones de respaldo se definen como servicios libpq en `PGSERVICEFILE`, con contraseñas en un `PGPASSFILE` de permisos `0600`; ningún URI ni contraseña se expone como `NEXT_PUBLIC_*`, argumento de línea de comandos, salida de CI o captura. Los nombres de servicio no son secretos.

## Puerta previa: respaldo y restauración comprobada

1. Confirmar que el proveedor tiene backup/PITR vigente y registrar el identificador del punto de recuperación.
2. Confirmar que `pg_dump`, `pg_restore` y `age` están instalados, que `PGSERVICEFILE` contiene los servicios nombrados por `TRAINER_DATABASE_PGSERVICE` y `RESTORE_VERIFY_PGSERVICE`, y que `PGPASSFILE` tiene permisos `0600`. Crear un dump custom y cifrar su flujo inmediatamente con `age`; el formato custom comprime, pero no cifra por sí solo:

   ```bash
   set -o pipefail
   PGSERVICE="$TRAINER_DATABASE_PGSERVICE" pg_dump --format=custom --no-owner --no-acl \
     | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
       --output trainer-predeploy.dump.age
   sha256sum trainer-predeploy.dump.age
   ```

   Guardar el hash, el identificador de la clave pública `age`, la política de acceso y la evidencia de cifrado del volumen/objeto. No crear una copia plaintext. La identidad privada se mantiene fuera del repositorio y de CI general.

3. Verificar que el artefacto se autentica y contiene un catálogo restaurable, sin imprimir filas:

   ```bash
   age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" trainer-predeploy.dump.age \
     | pg_restore --list > trainer-predeploy.catalog
   test -s trainer-predeploy.catalog
   ```

4. Restaurar el flujo descifrado en una base aislada y vacía, nunca sobre producción. `--dbname` recibe solo el alias libpq no secreto; host, usuario y contraseña permanecen fuera de argv:

   ```bash
   set -o pipefail
   age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" trainer-predeploy.dump.age \
     | pg_restore --exit-on-error --no-owner --no-acl \
       --dbname="service=$RESTORE_VERIFY_PGSERVICE"
   ```

5. En la restauración aislada, comprobar conteos no sensibles, funciones y relaciones; no exportar filas:

   ```sql
   SELECT to_regclass('public.trainer_applications') IS NOT NULL AS applications_present;
   SELECT to_regclass('public.professional_audit_logs') IS NOT NULL AS audit_present;
   SELECT count(*) >= 0 AS audit_readable FROM public.professional_audit_logs;
   ```

6. Eliminar `trainer-predeploy.catalog` al cerrar la verificación conforme a la política temporal aprobada. Si descifrado, catálogo, restauración o controles de acceso/cifrado fallan, detener el despliegue.

## Orden de migración 040–045

Aplicar en orden ascendente y sin editar migraciones ya desplegadas:

1. `040_trainer_foundations.sql`
2. `041_trainer_verification.sql`
3. `042_trainer_relationships.sql`
4. `043_trainer_programming.sql`
5. `044_trainer_insights.sql`
6. `045_trainer_hardening.sql`

En local o CI, ejecutar antes del remoto:

```bash
pnpm test:db:trainers
pnpm test:db:trainer-security
pnpm audit:trainers
pnpm test
pnpm type-check
pnpm lint
```

En el proyecto enlazado de staging:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

El `dry-run` y la lista final deben mostrar 040–045 en ese orden. No continuar si aparece una migración desconocida, pendiente entre ellas o un cambio destructivo no revisado.

## Preflight remoto de solo lectura

Después de migrar y antes de crear fixtures o invitar usuarios, ejecutar con una sesión operativa restringida:

```sql
SELECT public.trainer_security_preflight() AS schema_marker;
```

El único resultado válido es `45`. La función es de solo lectura y valida las rutinas críticas. Complementar con catálogo, sin leer datos privados:

```sql
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.professional_audit_logs'::regclass;

SELECT has_table_privilege('service_role', 'public.professional_audit_logs', 'INSERT') AS can_append,
       has_table_privilege('service_role', 'public.professional_audit_logs', 'UPDATE') AS can_update,
       has_table_privilege('service_role', 'public.professional_audit_logs', 'DELETE') AS can_delete,
       has_table_privilege('service_role', 'public.professional_audit_logs', 'TRUNCATE') AS can_truncate;
```

Esperado: RLS y FORCE RLS activos; `can_append=true`; las tres mutaciones restantes en `false`.

## Despliegue de aplicación y smoke tests

Desplegar primero el esquema compatible y luego la aplicación. Con cuentas sintéticas o del proyecto E2E dedicado, verificar:

1. Solicitante guarda, adjunta una credencial permitida y envía una solicitud.
2. Administración inicia revisión, solicita cambios, agenda una entrevista externa, registra el resultado y decide.
3. Solo un entrenador aprobado/activo aparece en `/trainers` y puede publicar servicios gratuitos.
4. Un cliente envía solicitudes abiertas; una aceptación crea una sola relación activa y cancela las otras pendientes.
5. El cliente concede/revoca consentimientos y el siguiente acceso del entrenador se actualiza inmediatamente.
6. El entrenador crea una plantilla, propone una rutina y el cliente la acepta. El cliente puede ejecutarla, pero no editarla.
7. Una revisión crea una versión nueva; no reescribe la versión ejecutada ni el historial.
8. Las vistas del entrenador muestran solo clientes con relación y alcance vigentes.
9. Analíticas aceptan únicamente eventos allowlisted; los errores devuelven código de dominio y `correlationId`, nunca payloads internos.
10. Navegación no muestra Comunidad, checkout, precios, chat, reseñas ni edición de la rutina profesional.

Si se habilita E2E remoto, debe ser exclusivamente en un proyecto descartable con las banderas y el acuse `dedicated-project-reset`; ejecutar preflight antes de cualquier seed. La limpieza conserva `professional_audit_logs` por diseño.

## Verificación administrativa e entrevista

1. Abrir la solicitud desde la cola administrativa; nunca descargar documentos a dispositivos no gestionados.
2. Comparar credenciales con la fuente emisora. Registrar en la aplicación solo estados/códigos y notas previstas por el flujo; no copiar documentos o contactos a tickets.
3. Si hace falta entrevista técnica, usar el método de contacto y disponibilidad declarados. La plataforma todavía no ofrece mensajería privada.
4. Programar la entrevista con el RPC/acción administrativa, que expone al solicitante solo zona horaria, medio, enlace y nota pública necesaria.
5. Mantener resultado interno y nota pública separados. No incluir diagnóstico médico, medidas ni datos ajenos a la verificación profesional.
6. Aprobar únicamente tras revisar credenciales e entrevista. Confirmar que perfil y cuenta quedan activos y que el evento de decisión existe en auditoría.

No cambiar estados directamente con SQL. Usar las acciones administrativas, que aplican bloqueo, idempotencia, notificación y auditoría en una transacción.

## Suspensión inmediata y reanudación segura

Ante sospecha de acceso indebido, credencial inválida o conducta insegura:

1. El administrador autenticado solicita suspensión desde la frontera de servidor; esta invoca `suspend_account_and_professional` con razón interna y, si corresponde, vencimiento.
2. Confirmar inmediatamente: cuenta suspendida, perfil profesional suspendido, relaciones `paused_by_platform`, consentimientos revocados y lecturas/RPC del entrenador denegados.
3. Registrar solo el código/categoría del incidente y un `correlationId` en observabilidad. La razón detallada permanece en el sistema administrativo restringido.
4. Notificar por el canal de soporte aprobado sin revelar clientes ni evidencia.

Para reanudar:

1. Resolver el incidente y obtener aprobación de dos responsables (operación y privacidad/seguridad).
2. Reactivar la cuenta mediante la acción administrativa y luego restablecer el perfil con `reinstate_trainer_profile`.
3. No reactivar relaciones ni consentimientos automáticamente.
4. Cada cliente decide si ejecuta `resume_paused_coaching_relationship`; esto crea un nuevo consentimiento de perfil de entrenamiento.
5. Confirmar auditoría de restablecimiento/reanudación y volver a ejecutar las pruebas de acceso entre entrenador correcto, otro entrenador y entrenador suspendido.

## Revocación de consentimiento y cierre

- El cliente revoca medidas con `revoke_body_measurements_consent`; el siguiente `get_coach_client_measurements` debe fallar con `COACH_CLIENT_INSIGHTS_UNAVAILABLE`.
- El cliente revoca el perfil de entrenamiento con `revoke_training_profile_consent`; la relación termina y se congela la última rutina profesional sin borrar su historial.
- Cualquiera de los participantes puede finalizar mediante `end_coaching_relationship`; nunca actualizar la tabla directamente.
- Tras revocar/finalizar, confirmar en otra sesión/conexión que el entrenador no puede leer resumen, evidencia ni medidas. El cliente conserva ejecución e historial de su rutina.

## Inspección de auditoría y privacidad

`professional_audit_logs` es append-only: ni usuarios, administradores autenticados, `service_role` ni el cleanup E2E pueden actualizar, borrar o truncar evidencia. No existe bypass de retención en esta versión.

La inspección se realiza con un rol operativo de solo lectura o en una acción de servidor; nunca desde el navegador. Seleccionar primero campos mínimos:

```sql
SELECT created_at, entity_type, action
FROM public.professional_audit_logs
WHERE created_at >= $1 AND created_at < $2
ORDER BY created_at, id;
```

Si una investigación autorizada necesita correlación, agregar `entity_id` y los IDs actor/sujeto únicamente dentro del entorno restringido. No exportar `metadata`; si es indispensable, verificar la allowlist y redactar identificadores antes de compartir. Nunca consultar o adjuntar contacto, credenciales, storage, notas, razones libres, medidas, snapshots ni payloads de error.

La retención futura requiere diseño y migración independiente con revisión legal/seguridad. No agregar un bypass ad hoc.

## Respuesta a incidentes

### Acceso indebido o IDOR

1. Suspender al actor y pausar el piloto.
2. Conservar logs/auditoría; no ejecutar cleanup ni modificar evidencia.
3. Registrar hora, código de dominio, `correlationId`, versión de app/esquema y alcance estimado, sin payload privado.
4. Verificar RLS/RPC con identidades separadas y comparar contra las matrices SQL y E2E.
5. Notificar al responsable de privacidad y seguir el procedimiento legal aplicable.

### Corrupción o doble activación de rutina

1. Detener nuevas aceptaciones/revisiones mediante un despliegue de aplicación de emergencia o volver al despliegue anterior.
2. No editar ni borrar asignaciones/versiones. Tomar snapshot y consultar la auditoría.
3. Ejecutar matrices de autorización, carreras y continuidad antes de reabrir.

### Pérdida o intento de mutación de auditoría

1. Detener el piloto y todo proceso de limpieza.
2. Verificar backup/PITR, ACL, trigger append-only y hashes de migración.
3. Restaurar en aislamiento para calcular alcance. No restaurar producción hasta aprobación del responsable de incidente y base de datos.

## Rollback

Las migraciones 040–045 son aditivas y la 045 endurece permisos/invariantes. No ejecutar una down migration destructiva, no eliminar tablas/columnas y no borrar auditoría.

Rollback normal:

1. Detener invitaciones y escrituras del piloto.
2. Volver al despliegue de aplicación anterior, compatible con el esquema nuevo.
3. Mantener 040–045 aplicadas.
4. Confirmar que Comunidad sigue apagada y que pagos, precios, chat, reseñas y planes comerciales permanecen ocultos.
5. Repetir preflight y smoke de las funciones que siguen disponibles.

Esta versión no define una bandera global del marketplace. No asumir que una variable inventada lo desactiva: si hace falta cierre inmediato, usar el despliegue anterior conocido o un despliegue de emergencia revisado que retire las entradas UI y deniegue las acciones. La restauración del respaldo es el último recurso para corrupción confirmada; se ensaya primero en aislamiento y requiere decisión explícita por la posible pérdida de cambios posteriores.

## Cierre del despliegue

El responsable firma la salida solo si respaldo/restauración, orden 040–045, preflight 45, pruebas técnicas, smoke por roles, privacidad, auditoría append-only y exclusiones del piloto están en verde. Cualquier acceso cruzado, corrupción de plan, pérdida de evidencia o fallo de revocación detiene el piloto.
