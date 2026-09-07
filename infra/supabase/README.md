# Runbook de migraciones Supabase

Este directorio es la única línea activa de migraciones del proyecto. El CLI se
ejecuta siempre con `--workdir infra`; por tanto, solo lee
`infra/supabase/migrations/`.

El directorio `supabase/migrations/` de la raíz contiene 61 SQL históricos y
fixtures de pruebas. No se usa con `db push` ni con `db reset`. En particular,
`004_rollback.sql`, `005_rollback.sql` y `009_reset_test_accounts.sql` nunca
entran en el flujo automático.

## Estado inicial trazable

La línea activa comienza con una sola migración:

```text
20260906233340_remote_schema_baseline.sql
```

Las nuevas migraciones se añaden después de ese baseline. El reordenamiento
atómico de ejercicios se entrega en
`20260907135652_workout_exercise_reorder_atomic.sql`; el archivo `060` del
directorio histórico conserva el mismo SQL para las fixtures de PostgreSQL.

El baseline se capturó el 6 de septiembre de 2026 con `pg_dump` 17.6 en modo
`schema-only` sobre los esquemas `public` y `private`. Se usó `pg_dump` después
de que `supabase db pull` y `supabase db dump` agotaran el tiempo de espera. No
contiene filas de negocio. Añade únicamente cinco filas sanitizadas e
idempotentes para configurar los buckets de la aplicación.

Para que el mismo SQL pueda reproducirse en Supabase local:

- excluye cambios de privilegios por defecto del rol administrado
  `supabase_admin`;
- neutraliza al inicio los privilegios por defecto de tablas y funciones que el
  entorno local hereda para `postgres`;
- restaura al final los privilegios por defecto de `postgres` capturados en el
  remoto;
- no crea secuencias porque el esquema remoto no contiene ninguna.

La reproducción se verificó mediante resets locales con los CLI 2.101, 2.112 y
2.116. La comprobación final usó `supabase@2.116.0` y la misma imagen PostgreSQL
17.6.1.121 del remoto. El preflight devolvió `59`; buckets y privilegios
coincidieron exactamente. Los dumps normalizados local/remoto solo difirieron en
el token aleatorio de restricción de `pg_dump` y en el formato equivalente de
una condición `AND`.

## Herramientas soportadas

El wrapper `scripts/lib/supabase-migration-workdir.mjs` fija
`supabase@2.116.0` y añade `--workdir infra` a los comandos. El mismo módulo
valida los SQL activos cuando se ejecuta mediante
`pnpm run check:supabase-migrations`; además, repite esa validación antes de
cualquier `db push` o `db reset --local`. No uses un `supabase` global para el
flujo mantenido por el repositorio.

Para usar comandos `--linked` se necesita un login válido de Supabase y un
enlace autenticado. El login de Management API disponible en la máquina durante
la auditoría terminó respondiendo `Unauthorized` tanto con el CLI 2.101 como con
el 2.116. Por ello, los scripts que usan `--linked` fallarán hasta renovar la
sesión; ese fallo no permite afirmar nada sobre el ledger. Los comandos con una
URL efímera mediante `--db-url` no dependen de ese login.

Nunca guardes ni muestres la URL de conexión, la contraseña de base de datos o
un access token. Los directorios `infra/supabase/.temp/` e
`infra/supabase/.branches/` también son estado local y permanecen fuera de Git.

## Crear una migración

1. Valida el árbol activo:

   ```powershell
   pnpm run check:supabase-migrations
   ```

2. Crea un archivo timestamped desde el wrapper:

   ```powershell
   node scripts/lib/supabase-migration-workdir.mjs --run migration new nombre_descriptivo
   ```

3. Implementa únicamente cambios de esquema reproducibles. Los nombres deben
   seguir `YYYYMMDDHHMMSS_nombre_descriptivo.sql`. No añadas rollbacks, resets,
   credenciales ni copias de filas remotas.

4. Reconstruye la base local desechable:

   ```powershell
   node scripts/lib/supabase-migration-workdir.mjs --run start
   node scripts/lib/supabase-migration-workdir.mjs --run db reset --local
   ```

   `db reset --local` solo puede apuntar al stack de `infra`. **Nunca ejecutes
   `db reset --linked`.** El wrapper rechaza cualquier reset remoto y exige
   `--local` de forma explícita. No hay seed automático. La importación del
   catálogo de ejercicios sigue siendo una operación explícita y separada
   mediante `pnpm seed:exercises`.

5. Repite el validador y las pruebas relacionadas con el contrato modificado.

## Despliegue normal

La secuencia soportada es validar, autenticar/enlazar, listar, simular, aplicar y
volver a listar:

```powershell
pnpm run check:supabase-migrations
node scripts/lib/supabase-migration-workdir.mjs --run login
node scripts/lib/supabase-migration-workdir.mjs --run link --project-ref <project-ref>
pnpm run supabase:migrations:list
pnpm run supabase:migrations:dry-run
pnpm run supabase:migrations:push
pnpm run supabase:migrations:list
```

No registres contraseñas en el historial de shell ni uses los marcadores del
ejemplo literalmente. Si el proyecto ya está enlazado y la sesión sigue válida,
omite `login` y `link`. Un `db push` real requiere revisión y autorización; que
el dry-run esté limpio no significa que se haya desplegado nada.

Supabase recomienda una conexión directa para migraciones y, cuando el entorno
solo dispone de IPv4, el pooler en modo sesión. En esta máquina la conexión de
sesión por el puerto 5432 agotó el tiempo de espera. Como excepción verificada,
el pooler de transacciones por el puerto 6543 funcionó con los CLI 2.112 y 2.116;
el CLI 2.101 colisionó al usar prepared statements. El modo transacción no
soporta prepared statements, así que este fallback solo se usa explícitamente
con el CLI fijado 2.116 y después de validar el resultado.

Si es imprescindible usar ese fallback, entrega la URL únicamente mediante una
variable de entorno efímera y añade `--db-url` al comando del wrapper:

```powershell
node scripts/lib/supabase-migration-workdir.mjs --run migration list --db-url $env:SUPABASE_DB_URL
node scripts/lib/supabase-migration-workdir.mjs --run db push --dry-run --db-url $env:SUPABASE_DB_URL
```

No guardes `SUPABASE_DB_URL` en Git, archivos de log o documentación.

## Ledger y trazabilidad

Antes del baseline, el remoto no tenía la tabla
`supabase_migrations.schema_migrations`. Se registró solo la versión
`20260906233340` con `migration repair --status applied`; no se ejecutó el DDL
del baseline sobre el esquema ya existente.

La verificación posterior encontró exactamente una fila, con nombre
`remote_schema_baseline` y `1155` sentencias almacenadas. `migration list` alineó
la versión local y remota, y `db push --dry-run` informó que no había nada
pendiente. Un nuevo dump `public`/`private` quedó idéntico al anterior al repair,
salvo el token aleatorio generado por `pg_dump`. No fue necesario revertir.

El ledger tiene solo estas columnas:

```text
version | statements | name
```

Por sí solo no registra operador, fecha de despliegue, commit de Git, aprobación,
checksum ni SQL manual. Además, el timestamp del nombre indica cuándo se creó la
migración, no cuándo se desplegó. La trazabilidad completa de cada despliegue
debe correlacionar:

- la versión y el archivo del ledger;
- el SHA de Git que contiene exactamente ese archivo;
- un log de despliegue sanitizado con entorno, aprobación, comandos y resultado,
  sin URLs de conexión ni credenciales.

No describas una migración como aplicada basándote solo en Git, en la presencia
de objetos del esquema o en un comando que terminó sin revisar el estado
posterior.

## Repair de emergencia

`migration repair` solo concilia el ledger cuando el esquema ya fue verificado
por otro medio. No forma parte del despliegue normal y nunca debe usarse para
ocultar una migración pendiente.

```powershell
node scripts/lib/supabase-migration-workdir.mjs --run migration repair <version> --status applied --linked
```

Después de cualquier repair, comprueba inmediatamente `migration list`, el
dry-run y el contrato crítico del esquema. Si la marca es incorrecta:

```powershell
node scripts/lib/supabase-migration-workdir.mjs --run migration repair <version> --status reverted --linked
```

`--status reverted` elimina la marca del ledger; **no revierte DDL ni datos**.
Ante una diferencia de esquema, detente y diagnostícala en lugar de modificar el
historial para forzar una apariencia de alineación.

## Referencias

- [Supabase CLI: desarrollo local](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Migraciones de base de datos](https://supabase.com/docs/guides/deployment/database-migrations)
- [`migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair)
- [Conexiones directas y poolers](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Regresión de `link` en CLI 2.112](https://github.com/supabase/cli/issues/6115)
