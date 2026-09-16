# Despliegue de eliminación verificada de cuentas

## Resultado — 16 de septiembre de 2026

Aplicada en el proyecto Supabase `duqayqktljywufgxobbl` la migración `20260916010000_verified_account_deletion.sql`, a las **17:07 UTC**. El destino se contrastó con la configuración web y Android; el origen público configurado es `https://fit-ai-kohl.vercel.app`.

SHA256 del SQL aplicado:

```text
916f870c8136b3d680f75d152adc27dce62bb21027fb4ef7b5695ab3a0a1baca
```

Se utilizó `db push` del migrador oficial. No se editó manualmente el historial de migraciones, no se ejecutó el RPC de eliminación y no se eliminaron cuentas reales.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| Historial previo y dry-run | 14 migraciones coincidentes; únicamente la migración prevista pendiente; sin seeds ni roles adicionales |
| Historial posterior, 17:07 UTC | 15 migraciones, exactamente iguales al directorio activo `infra/supabase/migrations` |
| Dry-run posterior, 17:08 UTC | `Remote database is up to date` |
| `trainer_security_preflight()` | 61 antes y después; también 200/61 por REST |
| RPC de eliminación | SECURITY DEFINER, propietario `postgres`, `search_path=public, pg_temp` |
| EXECUTE del RPC, anon / authenticated / service_role | `false / false / true` |
| Acceso directo a snapshots privados, mismos roles | `false / false / false` |
| Cuerpos de las dos funciones modificadas | Hashes iguales a los cuerpos del SQL revisado |
| Prescripciones profesionales | Tres funciones de bloqueo y sus triggers idénticos a los previos, habilitados |
| Validador de identidad | Habilitado, diferido e incluye `trainer_detached_at`; columna presente |
| Caché PostgREST | `NOTIFY pgrst, 'reload schema'` completado a las 17:11 UTC |
| OpenAPI con service_role | 200; RPC y columna nuevos visibles |
| Lecturas sin usuario | Introspección restringida a service_role; consulta de planes con `limit=0` denegada con 401/42501, conforme al permiso privado |
| Clave pública / Auth | GET de configuración de Auth respondió 200; el rechazo de planes no implica una clave inválida |

Las comprobaciones se completaron mediante solicitudes exitosas separadas. La red produjo timeouts intermitentes, incluido uno en una repetición conjunta final de HTTP; no se interpretaron como éxito ni motivaron otro push tras confirmar el historial de 15 migraciones. La evidencia SQL se obtuvo con `psql -X` y transacciones `BEGIN READ ONLY`.

## Compatibilidad utilizada durante esta ejecución

El helper habitual `scripts/lib/supabase-migration-workdir.mjs` conserva su versión fijada 2.116.0 y su contrato `--workdir infra`. Su validación y constructor de argumentos se utilizaron para este despliegue. Por problemas de conexión del ejecutable TS/Bun se autorizó, únicamente para esta operación, el migrador Go oficial **2.101.0**, presente en dos instalaciones locales idénticas; se verificaron versión, procedencia del paquete y hash.

SHA256 del ejecutable Go utilizado:

```text
ec4a928d9fc85ecb44c25f9ea65a058b34d2536aaa284050af0b94058ca32a51
```

La conexión se encaminó por un puente TCP Docker ligado únicamente a localhost, hacia una dirección IPv4 de la resolución vigente del mismo pooler/proyecto. Se mantuvo `sslmode=require`. El error de sentencias preparadas en el puerto 6543 se resolvió con `prefer_simple_protocol=true`, nombre correspondiente a pgx v4 incorporado en ese ejecutable. Supabase documenta que el pooler transaccional no admite sentencias preparadas; pgx v4 documenta este parámetro de compatibilidad. [Supabase](https://supabase.com/docs/guides/troubleshooting/disabling-prepared-statements-qL8lEL), [pgx v4](https://pkg.go.dev/github.com/jackc/pgx/v4#ParseConfig).

El ajuste de proceso `GODEBUG=tlsmlkem=0` también estuvo presente, sin desactivar TLS; no se atribuye a ese ajuste la resolución de los timeouts. El puente temporal y los contenedores de esta operación se retiraron. No se alteraron los contenedores ajenos ni la configuración de red del equipo. No fijar permanentemente la IP usada en esta ejecución.

## Evidencia y límites

El recibo saneado está en `.artifacts/playstore-deploy-2026-09-16/account-deletion-deployment.json`. En el mismo directorio se conservan `account-deletion-apply.log`, `account-deletion-after.log`, `account-deletion-dry-after.log`, `rest-schema-reload.json` y el diagnóstico REST. El recibo identifica los resultados HTTP observados en las respuestas exitosas de esta sesión y distingue la repetición fallida.

Este registro acredita el despliegue del esquema. La publicación web se registra por separado en `android-web-deployment.md`. No sustituye la prueba de eliminación con identidades ficticias ni la verificación del paquete en un teléfono. El protocolo de prueba, la recuperación de fallos entre Storage/RPC/Auth y la retención real están en [la guía operativa](android-account-deletion-release.md). Eliminar solamente Auth sigue siendo insuficiente; deben mantenerse el RPC previo y sus restricciones.
