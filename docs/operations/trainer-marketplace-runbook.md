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
- Puertas E2E: `E2E_TRAINER_RELATIONSHIPS_ENABLED=true`, `E2E_TRAINER_PROGRAMMING_ENABLED=true`, `E2E_TRAINER_PROGRAMMING_RETENTION_ACK=dedicated-project-reset`, `E2E_TRAINER_INSIGHTS_ENABLED=true`, `E2E_TRAINER_SECURITY_ENABLED=true`, `E2E_TRAINER_MARKETPLACE_ENABLED=true`.
- Exclusiones obligatorias del piloto: `COMMUNITY_ENABLED=false`, `TRAINER_PAYMENTS_ENABLED=false`, `TRAINER_MESSAGING_ENABLED=false`, `TRAINER_REVIEWS_ENABLED=false`. La puerta rechaza cualquier otro valor; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` deben estar ausentes.
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

## Orden de migración 040–057

Aplicar en orden ascendente y sin editar migraciones ya desplegadas:

1. `040_trainer_foundations.sql`
2. `041_trainer_verification.sql`
3. `042_trainer_relationships.sql`
4. `043_trainer_programming.sql`
5. `044_trainer_insights.sql`
6. `045_trainer_hardening.sql`
7. `046_release_session_authorization.sql`
8. `047_product_notification_preferences_insert.sql`
9. `048_profile_weight_measurement_sync.sql`
10. `049_trainer_iso_weekday_repair.sql`
11. `050_product_events_conversion_funnel.sql`
12. `051_workout_adjustment_atomic.sql`
13. `052_notification_attention_dismissals.sql`
14. `053_trainer_draft_rpc_json_repair.sql`
15. `054_product_notification_archiving.sql`
16. `055_atomic_notification_attention_dismissal.sql`
17. `056_trainer_template_exercise_batch_append.sql`
18. `057_trainer_assignment_decline.sql`

La 053 reemplaza hacia delante el RPC `save_trainer_application_draft` para
eliminar el uso de `jsonb_object_length(jsonb)`, que PostgreSQL no ofrece.
Después de aplicarla, guardar un borrador autenticado y confirmar que el RPC
devuelve `status = draft` y que la fila aparece en `trainer_applications` antes
de desplegar o reabrir el formulario.

La 054 conserva el historial de `product_notifications` y permite que cada
usuario archive únicamente sus propias filas mediante `dismissed_at`.

La 055 añade el RPC autenticado que valida y registra en una sola transacción la
versión vigente de los avisos de plan, revisión del perfil y promoción. Desplegar
054 y 055 antes que la aplicación que expone los nuevos controles de descarte.

La 056 añade `append_trainer_template_exercises(uuid, jsonb)` para incorporar
un lote de ejercicios a un día existente de plantilla de forma atómica. La 057
añade el cierre idempotente de propuestas no aceptadas, conserva intacto el
snapshot, serializa aceptación frente a rechazo y notifica al entrenador sin
guardar el motivo libre en auditoría. Aplicar las migraciones de producción
040–057 completas y en este orden numérico; el
hecho de que un archivo esté confirmado en Git no demuestra que se haya aplicado
en el proyecto remoto.

Programar la 050 en una ventana de bajo tráfico o mantenimiento. La migración
toma un bloqueo `SHARE ROW EXCLUSIVE` sobre `public.progress_logs` antes del
backfill y la instalación del trigger, por lo que las escrituras de sesiones
activas pueden quedar en espera o agotar su timeout hasta que termine la
transacción. Durante la ejecución, vigilar sesiones en espera y bloqueos de
`progress_logs` mediante `pg_stat_activity` y `pg_locks`; si la migración falla,
dejar que la transacción revierta por completo antes de reintentar. Los guardados
de sesión y la propia 050 son idempotentes, así que una operación interrumpida
puede reintentarse con seguridad una vez liberado el bloqueo.

Antes de aplicar la 049, pausar nuevas propuestas y publicaciones de revisiones
profesionales, y mantener suspendidas las invitaciones. Esperar a que concluyan
las publicaciones que ya estaban en curso. La 049 ejecuta un preflight
estructural agregado y, si detecta una relación o snapshot no reparable, aborta
la transacción con `TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED`; sus
postcondiciones usan `TRAINER_ISO_WEEKDAY_REPAIR_POSTCONDITION_FAILED`. Ambos
errores exponen solo el tipo de anomalía y su conteo agregado. Investigar y
corregir hacia delante antes de reintentar; no modificar las migraciones 043 o
045 ya desplegadas.

En local o CI, ejecutar antes del remoto:

```bash
pnpm test:db:trainers
pnpm test
pnpm type-check
pnpm lint
```

Usar `pnpm test:db:trainers` como puerta funcional y de autorización, y
`pnpm test:db:trainer-security` como puerta de seguridad repetida tres veces.
Ambos ejercitan el conjunto profesional 040–051 y 053; la 052, independiente
del dominio de entrenadores, permanece obligatoria en el orden remoto 040–057.
La puerta profesional incluye además la 056 y la 057: su subconjunto es
exactamente `040–051, 053, 056, 057`; no sustituye la aplicación remota de 052,
054 y 055 dentro de la cronología completa 040–057.

En el proyecto enlazado de staging:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

El `dry-run` y la lista final deben mostrar 040–057 en ese orden. No continuar si aparece una migración desconocida, pendiente entre ellas o un cambio destructivo no revisado.

## Preflight remoto de solo lectura

Después de migrar y antes de crear fixtures o invitar usuarios, ejecutar con una sesión operativa restringida:

```sql
SELECT public.trainer_security_preflight() AS schema_marker;
```

El único resultado válido es `57`: `trainer_security_preflight() = 57`. La
función es de solo lectura e incluye la capa ISO y los contratos de la 056 y la
057. Confirmar también que `append_trainer_template_exercises(uuid, jsonb)` y
`decline_trainer_assignment(uuid, text, text)` existen, que solo `authenticated`
y `service_role` tienen `EXECUTE`, y que `anon` no lo tiene. A
continuación, en una sesión operativa privilegiada con acceso de lectura, ejecutar
esta auditoría exclusivamente de conteo:

```sql
SELECT count(*) AS iso_weekday_divergences
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
 AND version.materialized_plan_id = plan.id
CROSS JOIN LATERAL jsonb_array_elements(version.snapshot->'workouts') AS prescribed(value)
JOIN public.workouts workout
  ON workout.plan_id = plan.id
 AND workout.order_in_plan = (prescribed.value->>'orderInPlan')::INTEGER
WHERE plan.source_type = 'trainer_assigned'
  AND workout.day_of_week IS DISTINCT FROM (prescribed.value->>'dayOfWeek')::INTEGER;
```

Resultados obligatorios:

```text
trainer_security_preflight = 57
iso_weekday_divergences = 0
```

No continuar si cualquiera de los dos resultados difiere. Complementar con catálogo, sin leer datos privados:

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

Desplegar la aplicación solo después de que el esquema remoto y su smoke pasen.
Con cuentas sintéticas o del proyecto E2E dedicado, verificar:

```bash
pnpm test:e2e:trainer-marketplace
```

Este es el único comando autorizado para el journey destructivo del marketplace: inicia un servidor Next nuevo con el mismo entorno del proceso y `reuseExistingServer=false`. No ejecutar `trainer-marketplace.spec.ts` mediante `pnpm test:e2e` ni contra un servidor ambiental, porque podría apuntar a otro proyecto Supabase.

1. Solicitante guarda, adjunta una credencial permitida y envía una solicitud.
2. Administración inicia revisión, solicita cambios, agenda una entrevista externa, registra el resultado y decide.
3. Solo un entrenador aprobado/activo aparece en `/trainers` y puede publicar servicios gratuitos.
4. Un cliente envía solicitudes abiertas; una aceptación crea una sola relación activa y cancela las otras pendientes.
5. El cliente concede/revoca consentimientos y el siguiente acceso del entrenador se actualiza inmediatamente.
6. El entrenador crea una plantilla sintética con lunes (`1`) y domingo (`7`) y propone dos rutinas en fixtures separados. El cliente rechaza una con un reintento de la misma clave y acepta la otra. Confirmar un solo audit/aviso por rechazo, que aceptar frente a rechazar produce un único ganador y que la aceptada materializa ambos días con esos valores ISO; repetir la auditoría de divergencias con resultado `0`.
7. El entrenador publica una revisión sintética que incluye lunes y domingo. Confirmar la misma materialización ISO, que la revisión no reescribe la versión ejecutada ni el historial, y que la auditoría sigue en `0`.
8. Las vistas del entrenador muestran solo clientes con relación y alcance vigentes.
9. Analíticas aceptan únicamente eventos allowlisted; los errores devuelven código de dominio y `correlationId`, nunca payloads internos.
10. Navegación no muestra Comunidad, checkout, precios, chat, reseñas ni edición de la rutina profesional.

Antes del despliegue de UI, y sin mutar producción durante el smoke local,
verificar en una plantilla existente: abrir Day A; añadir Prensa y Gemelos en una
primera confirmación; añadir Zancada en una segunda; editar Zancada a 4 × 8, RPE
8 y 90 s; reordenarla encima de Gemelos; recargar y confirmar filas y orden;
editar el nombre de la rutina y confirmar que la asignación se bloquea hasta
«Guardar detalles»; guardar, abrir asignación y luego publicación de revisión;
repetir la comprobación de tarjetas a 390 px sin desbordamiento horizontal.

Reanudar propuestas, publicaciones de revisiones e invitaciones solo cuando el
preflight, la auditoría ISO y los dos smoke sintéticos estén en verde.

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

Las migraciones 040–057 son aditivas. Tras un despliegue exitoso de la 057,
el rollback es solo hacia delante: no ejecutar una down migration destructiva,
no eliminar tablas/columnas, no borrar auditoría, no eliminar ejercicios
anexados y nunca restaurar la sustracción defectuosa de días. En un entorno ya
desplegado tampoco se debe volver a ejecutar la migración histórica 045 ni la
secuencia completa 040–057 sobre evidencia creada por la 057: la 045 contiene
el dominio de auditoría anterior a `trainer_plan_assignment/declined`. Cualquier
reparación posterior se entrega como una migración nueva, revisada y solo hacia
delante; la reaplicación aislada de 057 se reserva para su prueba de
rerunnabilidad documentada en una base descartable.

Procedimiento posterior a la 057:

1. Detener invitaciones, nuevas propuestas y publicaciones de revisiones.
2. Mantener aplicadas las migraciones hasta la 057 y los datos reparados; volver solo a una versión de aplicación compatible con el esquema nuevo si hace falta.
3. Confirmar que Comunidad sigue apagada y que pagos, precios, chat, reseñas y planes comerciales permanecen ocultos.
4. Investigar con conteos agregados y ensayar cualquier restauración de respaldo en aislamiento; no restaurar producción sin la decisión explícita por la posible pérdida de cambios posteriores.
5. Corregir hacia delante con una migración revisada y repetir preflight, auditoría ISO y smoke antes de reabrir publicaciones.

Esta versión no define una bandera global del marketplace. No asumir que una variable inventada lo desactiva: si hace falta cierre inmediato, usar el despliegue anterior conocido o un despliegue de emergencia revisado que retire las entradas UI y deniegue las acciones.

## Cierre del despliegue

El responsable firma la salida solo si respaldo/restauración, orden 040–057,
`trainer_security_preflight() = 57`, divergencias ISO profesionales en `0`,
pruebas técnicas, smoke por roles, privacidad, auditoría append-only y
exclusiones del piloto están en verde. Cualquier acceso cruzado, corrupción de
plan, pérdida de evidencia o fallo de revocación detiene el piloto.
