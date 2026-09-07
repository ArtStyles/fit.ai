# Supabase Migration Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establecer una línea canónica y trazable de migraciones Supabase a
partir del esquema remoto vigente, sin volver a ejecutar el historial legado ni
modificar datos de negocio.

**Architecture:** El CLI opera exclusivamente desde `infra/supabase`, donde vive
el baseline timestamped
`20260906233340_remote_schema_baseline.sql`. La captura final se obtuvo con
PostgreSQL 17 `pg_dump --schema-only` después de timeouts de `db pull` y
`db dump`. `supabase/migrations` se conserva como archivo histórico y fixture de
pruebas. Un validador impide versiones no canónicas, duplicadas, scripts
destructivos y defaults administrados en la línea activa. El remoto recibió solo
una fila de historial mediante `migration repair`; no se ejecutó el baseline
sobre el esquema existente.

**Tech Stack:** Supabase CLI fijado exactamente en 2.116.0 por el runner,
PostgreSQL 17, Docker Desktop, Node.js, pnpm, Vitest y PowerShell en Windows.

**Spec:**
`docs/superpowers/specs/2026-09-06-supabase-migration-baseline-design.md`

**Global Constraints:** No imprimir credenciales ni URLs con contraseña. No usar
`db reset --linked`. No copiar filas remotas. No ejecutar ningún archivo de
`supabase/migrations` contra producción. `migration repair` solo concilia el
ledger y no sustituye un despliegue. Si falla una validación posterior al repair,
revertir únicamente la marca del baseline y detenerse.

---

## Task 1: Añadir el contrato automatizado de la línea activa

**Files:**

- Create: `scripts/lib/supabase-migration-workdir.mjs`
- Create: `scripts/__tests__/supabase-migration-workdir.test.ts`
- Modify: `package.json`

- [x] **Step 1: Escribir tests que fallen**

Se cubrieron el workdir `infra`, el formato
`YYYYMMDDHHMMSS_nombre.sql`, versiones duplicadas, términos destructivos y la
adición obligatoria de `--workdir infra`. El primer ciclo falló porque el módulo
aún no existía.

- [x] **Step 2: Implementar el validador mínimo**

El módulo exporta funciones puras y, como programa, inspecciona
`infra/supabase/migrations`. También valida el contenido para impedir privilegios
por defecto del rol administrado `supabase_admin`, citado o sin citar. Antes de
un `db push` o `db reset --local`, el runner repite la validación y rechaza todo
reset remoto o reset sin `--local` explícito.

- [x] **Step 3: Fijar el CLI y exponer comandos seguros**

El runner invoca con `npx` el paquete exacto `supabase@2.116.0`; no depende de un
CLI global ni de un rango flotante. Los scripts `list`, `dry-run` y `push` pasan
por el runner y el workdir canónico. La regresión de `link` observada en 2.112
está corregida desde 2.113.

- [x] **Step 4: Verificar y guardar el contrato**

Los tests del runner y su revisión independiente quedaron correctos. El pin
final 2.116 conserva el contrato probado.

## Task 2: Crear el workdir aislado

**Files:**

- Create: `infra/supabase/config.toml`
- Modify: `.gitignore`

- [x] **Step 1: Inicializar configuración**

Se creó un workdir independiente sin project ref, contraseña ni token. Los
puertos locales se aislaron de otros stacks del equipo y PostgreSQL quedó en la
major 17.

- [x] **Step 2: Ignorar estado local**

`**/supabase/.temp/` y `**/supabase/.branches/` quedaron ignorados; se comprobó
que los metadatos locales de enlace y rama no entran en Git.

- [x] **Step 3: Comprobar enlace y conexiones sin exponer secretos**

El enlace funcionó durante la captura inicial. La sesión de Management API
disponible al final de la auditoría respondió `Unauthorized` tanto con el CLI
2.101 como con el 2.116; por ello, el flujo `--linked` exige renovar el login
y nunca se interpreta un fallo de autenticación como estado del ledger.

La conexión de sesión 5432 agotó el tiempo de espera en este entorno IPv4. El
pooler de transacciones 6543 se verificó como fallback explícito con 2.112 y
2.116; 2.101 colisionó al usar prepared statements.

- [x] **Step 4: Confirmar preestado remoto**

Una consulta read-only confirmó que
`supabase_migrations.schema_migrations` no existía antes de crear/registrar el
baseline.

## Task 3: Extraer y revisar el baseline remoto

**Files:**

- Create:
  `infra/supabase/migrations/20260906233340_remote_schema_baseline.sql`

- [x] **Step 1: Preparar Docker y las herramientas PostgreSQL**

Docker Desktop se verificó sin detener ni alterar el stack de otro proyecto. Se
usaron cliente y dump PostgreSQL 17 compatibles con el servidor remoto.

- [x] **Step 2: Capturar el baseline sin actualizar historial**

`supabase db pull` y `supabase db dump` agotaron sus tiempos de espera. Se usó
`pg_dump --schema-only --no-owner --schema=public --schema=private`; el ledger
remoto permaneció ausente durante la captura.

- [x] **Step 3: Auditar el SQL generado**

La revisión confirmó DDL, funciones, triggers, RLS y grants sin JWTs,
contraseñas, UUIDs de usuarios ni filas de negocio. Se eliminaron los wrappers
aleatorios de psql y las mutaciones de defaults administrados por
`supabase_admin`.

- [x] **Step 4: Incorporar buckets como bootstrap idempotente**

Se consultó la configuración remota de forma read-only y se añadieron únicamente
cinco filas sanitizadas mediante `INSERT ... ON CONFLICT`. No se copiaron
objetos de Storage ni datos de usuario.

## Task 4: Probar reproducción local y equivalencia

**Files:**

- Test:
  `infra/supabase/migrations/20260906233340_remote_schema_baseline.sql`
- Test: `scripts/__tests__/supabase-migration-workdir.test.ts`
- Test: `scripts/__tests__/trainer-security-preflight.test.ts`
- Test:
  `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`

- [x] **Step 1: Validar el árbol activo**

`pnpm run check:supabase-migrations` validó una sola versión canónica y el
contenido permitido.

- [x] **Step 2: Reconstruir una base local desechable**

El baseline completó resets locales con los CLI 2.101, 2.112 y 2.116. La
ejecución final usó el runner exacto 2.116.0 y la misma imagen PostgreSQL
17.6.1.121 del remoto. No se ejecutó seed automático.

- [x] **Step 3: Ejecutar verificaciones críticas**

Se confirmó una única fila local del ledger, `trainer_security_preflight() = 59`,
los esquemas `public`/`private`, los cinco buckets y los defaults de roles. Los
tests de contrato relacionados pasaron.

- [x] **Step 4: Comparar contra el remoto**

Los dumps normalizados solo difirieron en el token aleatorio de restricción de
`pg_dump` y en el formato equivalente de una condición `AND`. Buckets y ACL
coincidieron exactamente; no hubo diferencias de aplicación que bloquearan el
repair.

## Task 5: Registrar el baseline en el ledger remoto

**Remote only:** `supabase_migrations.schema_migrations`

- [x] **Step 1: Capturar snapshot previo**

Se reconfirmó que la tabla del ledger no existía. La versión se derivó del único
archivo activo: `20260906233340`.

- [x] **Step 2: Registrar solo la versión**

Se ejecutó `migration repair 20260906233340 --status applied` usando una conexión
efímera al pooler de transacciones y sin imprimirla. El comando actualizó solo el
historial; no ejecutó el SQL del baseline.

- [x] **Step 3: Verificar inmediatamente**

El ledger quedó con exactamente una fila, nombre `remote_schema_baseline` y
`1155` sentencias. `migration list` mostró la misma versión local/remota y
`db push --dry-run` informó `upToDate: true`, sin nada pendiente. Un dump remoto
posterior no mostró cambios de esquema fuera del token aleatorio de `pg_dump`.

- [x] **Step 4: Evaluar la condición de reversión**

Las comprobaciones fueron correctas, así que no se ejecutó rollback. Si hubieran
fallado, `migration repair --status reverted` habría eliminado solo la marca del
ledger, no DDL ni datos.

## Task 6: Documentar el flujo operativo

**Files:**

- Modify: `README.md`
- Create: `infra/supabase/README.md`
- Modify:
  `docs/superpowers/specs/2026-09-06-supabase-migration-baseline-design.md`
- Modify:
  `docs/superpowers/plans/2026-09-06-supabase-migration-baseline.md`

- [x] **Step 1: Rotular el historial legado**

README identifica `supabase/migrations` como material histórico/fixtures fuera de
`db push` y `db reset`, incluidos los rollbacks y
`009_reset_test_accounts.sql`.

- [x] **Step 2: Documentar el runbook activo**

El runbook cubre creación, reset local, listado, dry-run, push y repair de
emergencia. Distingue las columnas reales del ledger de la evidencia externa
necesaria: SHA de Git y log sanitizado. También documenta autenticación, el
fallback 6543 verificado y la prohibición de `db reset --linked`.

- [x] **Step 3: Registrar la evidencia real**

Spec y plan reflejan la captura con `pg_dump`, el CLI final 2.116.0, los resets,
la equivalencia, el repair remoto y el dry-run. No afirman que se haya ejecutado
un `db push` real.

## Task 7: Verificación final e integración Git

**Files:** Todos los archivos intencionales anteriores.

- [x] **Step 1: Ejecutar controles frescos**

```powershell
pnpm run check:supabase-migrations
pnpm exec vitest run scripts/__tests__/supabase-migration-workdir.test.ts scripts/__tests__/trainer-security-preflight.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts --maxWorkers=1
pnpm type-check
pnpm lint
git diff --check
```

En la rama y de nuevo sobre el resultado integrado, el validador confirmó una
sola migración activa; las pruebas focales pasaron 3 archivos / 51 tests;
type-check y lint terminaron en 0; y la suite completa pasó 298 archivos / 2.781
tests. El reset local final aplicó únicamente el baseline y devolvió preflight
59 con cinco buckets.

- [x] **Step 2: Revisar alcance y secretos**

Inspeccionar `git status`, `git diff --stat`, el diff completo y patrones de
secretos. Confirmar que no están staged `infra/supabase/.temp`, `.env.local`,
`.artifacts` ni cambios ajenos del checkout principal.

La revisión de líneas añadidas no encontró credenciales, JWTs, URLs específicas
del proyecto ni claves privadas. `.temp`, `.branches`, `.env.local` y la carpeta
preexistente `.artifacts/` quedaron fuera de Git.

- [x] **Step 3: Completar revisión independiente e integración**

Revisar el cambio completo contra esta spec, corregir hallazgos y confirmar que
cada commit contiene solo archivos intencionales.

Tres revisiones independientes aprobaron el runner, el baseline y la
documentación después de bloquear resets remotos, validar antes de push/reset y
rotular todo 040–059 como historial no ejecutable.

- [x] **Step 4: Publicar sin sobrescribir trabajo concurrente**

Verificar que `origin/main` no avanzó. Integrar la rama aislada, repetir los
controles relevantes en `main` y hacer push normal a `origin/main`. Nunca usar
force-push.

`main` había avanzado con la actualización a Next 16. Se preservaron esos
cambios mediante un merge normal, se verificó el árbol combinado y se publicó el
merge `5f5c1a6` a `origin/main` sin force-push.
