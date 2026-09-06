# Supabase Migration Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establecer una línea canónica y trazable de migraciones Supabase a partir del esquema remoto vigente, sin volver a ejecutar el historial legado ni modificar datos de negocio.

**Architecture:** El CLI opera desde `infra/supabase`, donde vive un baseline timestamped generado por `db pull`. `supabase/migrations` se conserva como archivo histórico y fixture de pruebas. Un validador impide versiones no canónicas, duplicadas o scripts destructivos en la línea activa. El remoto recibe solo una fila de historial mediante `migration repair`; no se ejecuta el baseline sobre el esquema existente.

**Tech Stack:** Supabase CLI 2.111.0, PostgreSQL, Docker Desktop, Node.js, pnpm, Vitest y PowerShell en Windows.

**Spec:** `docs/superpowers/specs/2026-09-06-supabase-migration-baseline-design.md`

**Global Constraints:** No imprimir credenciales ni URLs con contraseña. No usar `db reset --linked`. No copiar filas remotas. No ejecutar ningún archivo de `supabase/migrations` contra producción. Si falla la validación posterior al repair, revertir únicamente la fila del baseline y detenerse.

---

## Task 1: Añadir el contrato automatizado de la línea activa

**Files:**
- Create: `scripts/lib/supabase-migration-workdir.mjs`
- Create: `scripts/__tests__/supabase-migration-workdir.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Escribir tests que fallen**

Cubrir como mínimo:

- el workdir soportado es `infra`;
- los nombres activos cumplen `YYYYMMDDHHMMSS_nombre.sql`;
- dos archivos con la misma versión fallan;
- nombres con `rollback`, `reset` o `test_accounts` fallan;
- el comando construido siempre incluye `--workdir infra`.

Ejecutar:

```powershell
pnpm exec vitest run scripts/__tests__/supabase-migration-workdir.test.ts --maxWorkers=1
```

Resultado esperado: FAIL porque el módulo todavía no existe.

- [ ] **Step 2: Implementar el validador mínimo**

Exportar funciones puras para validar nombres/versiones y construir argumentos del CLI. Cuando
se ejecute como programa, inspeccionar `infra/supabase/migrations` y terminar distinto de cero
ante cualquier violación.

- [ ] **Step 3: Fijar el CLI y exponer comandos seguros**

Añadir `supabase@2.111.0` a `devDependencies` y scripts que pasen por el workdir activo:

```json
{
  "check:supabase-migrations": "node scripts/lib/supabase-migration-workdir.mjs",
  "supabase:migrations:list": "supabase migration list --workdir infra --linked",
  "supabase:migrations:dry-run": "supabase db push --workdir infra --linked --dry-run",
  "supabase:migrations:push": "supabase db push --workdir infra --linked"
}
```

Ejecutar `pnpm install --frozen-lockfile=false` para actualizar el lockfile y luego repetir el
test hasta obtener PASS.

- [ ] **Step 4: Commit de contrato**

```powershell
git add package.json pnpm-lock.yaml scripts/lib/supabase-migration-workdir.mjs scripts/__tests__/supabase-migration-workdir.test.ts
git commit -m "build(supabase): enforce canonical migration workdir"
```

## Task 2: Crear el workdir aislado

**Files:**
- Create: `infra/supabase/config.toml`
- Modify: `.gitignore`

- [ ] **Step 1: Inicializar configuración**

Con el CLI fijado:

```powershell
pnpm exec supabase init --workdir infra
```

Revisar `infra/supabase/config.toml`; no debe contener project ref, contraseñas ni tokens.

- [ ] **Step 2: Ignorar estado local**

Añadir `**/supabase/.temp/` a `.gitignore`. Confirmar con `git check-ignore` que el enlace local
queda fuera del índice.

- [ ] **Step 3: Enlazar de forma local y secreta**

Leer `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_DB_PASSWORD` desde el `.env.local` del checkout
principal sin imprimirlos. Derivar el project ref de la URL y ejecutar:

```powershell
pnpm exec supabase link --workdir infra --project-ref $projectRef --password $dbPassword
```

La versión 2.111.0 se fija porque 2.112.0 tiene una regresión confirmada al decodificar
`inserted_at` de API keys.

- [ ] **Step 4: Confirmar preestado remoto**

Ejecutar `migration list` y una consulta read-only. Deben confirmar que el ledger no contiene
versiones antes de crear el baseline. Si aparece cualquier versión, detenerse y reconciliar el
plan antes de escribir remotamente.

## Task 3: Extraer y revisar el baseline remoto

**Files:**
- Create: `infra/supabase/migrations/<timestamp>_remote_schema_baseline.sql`

- [ ] **Step 1: Arrancar Docker Desktop**

Iniciar Docker Desktop de forma oculta y esperar en intervalos cortos hasta que `docker info`
termine correctamente.

- [ ] **Step 2: Crear el baseline sin actualizar historial**

Con el directorio activo vacío, ejecutar:

```powershell
"n" | pnpm exec supabase db pull remote_schema_baseline --workdir infra --linked
```

Confirmar inmediatamente que el historial remoto sigue vacío.

- [ ] **Step 3: Auditar el SQL generado**

Verificar que:

- solo contiene esquema, funciones, triggers, RLS, grants y configuración declarativa;
- no incluye emails, UUIDs de usuarios, JWTs, contraseñas ni filas de tablas de negocio;
- no contiene `DELETE`, `TRUNCATE`, `DROP DATABASE`, `reset_test_accounts` ni los rollbacks
  históricos;
- conserva la función y el contrato de seguridad reportados por el preflight 59.

- [ ] **Step 4: Incorporar buckets como bootstrap idempotente**

Consultar de forma read-only la configuración remota de los buckets esperados. Añadir al final
del baseline únicamente los `INSERT ... ON CONFLICT` sanitizados necesarios para reproducir los
buckets de aplicación. No copiar objetos ni filas de usuario.

## Task 4: Probar reproducción local y equivalencia

**Files:**
- Test: `infra/supabase/migrations/<timestamp>_remote_schema_baseline.sql`
- Test: `scripts/__tests__/trainer-security-preflight.test.ts`
- Test: `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`

- [ ] **Step 1: Validar el árbol activo**

```powershell
pnpm run check:supabase-migrations
```

- [ ] **Step 2: Reconstruir una base local desechable**

```powershell
pnpm exec supabase start --workdir infra
pnpm exec supabase db reset --workdir infra --local
```

El reset debe aplicar exactamente una migración y completar sin error.

- [ ] **Step 3: Ejecutar verificaciones críticas**

Comprobar en local la existencia de tablas, políticas, funciones, triggers, grants y buckets
críticos. Ejecutar los tests de contrato:

```powershell
pnpm exec vitest run scripts/__tests__/trainer-security-preflight.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts --maxWorkers=1
```

- [ ] **Step 4: Comparar contra el remoto**

Comparar catálogos normalizados de objetos y el resultado del preflight crítico. Las diferencias
gestionadas por Supabase (`auth`, `storage`, extensiones o metadatos de plataforma) se documentan;
cualquier diferencia de aplicación bloquea el repair.

## Task 5: Registrar el baseline en el ledger remoto

**Files:**
- Remote only: `supabase_migrations.schema_migrations`

- [ ] **Step 1: Capturar snapshot previo**

Guardar localmente el resultado sanitizado de existencia/contenido del ledger y verificar otra
vez que sigue vacío. Calcular `$baselineVersion` desde el nombre del único SQL activo.

- [ ] **Step 2: Registrar solo la versión**

```powershell
pnpm exec supabase migration repair $baselineVersion --status applied --workdir infra --linked
```

Este comando no ejecuta el SQL del baseline.

- [ ] **Step 3: Verificar inmediatamente**

```powershell
pnpm run supabase:migrations:list
pnpm run supabase:migrations:dry-run
```

El listado debe contener exactamente la misma versión local/remota y el dry-run debe informar
que no hay nada pendiente.

- [ ] **Step 4: Revertir ante discrepancia**

Si cualquiera de las verificaciones falla:

```powershell
pnpm exec supabase migration repair $baselineVersion --status reverted --workdir infra --linked
```

Confirmar la reversión y detenerse; no tocar el esquema de aplicación.

## Task 6: Documentar el flujo operativo

**Files:**
- Modify: `README.md`
- Create: `infra/supabase/README.md`
- Modify: `docs/superpowers/specs/2026-09-06-supabase-migration-baseline-design.md`
- Modify: `docs/superpowers/plans/2026-09-06-supabase-migration-baseline.md`

- [ ] **Step 1: Rotular el historial legado**

Explicar que `supabase/migrations` es material histórico/fixtures y no se usa para `db push`.
Resaltar explícitamente que `009` y los rollbacks nunca entran en el flujo automático.

- [ ] **Step 2: Documentar el runbook activo**

Incluir creación, reset local, listado, dry-run, push y repair de emergencia. Aclarar qué deja
evidencia el ledger y qué no puede probar retrospectivamente.

- [ ] **Step 3: Marcar el plan ejecutado**

Actualizar las casillas conforme a la evidencia real. No marcar pasos remotos si solo se
comprobaron localmente.

## Task 7: Verificación final e integración Git

**Files:** Todos los archivos intencionales anteriores.

- [ ] **Step 1: Ejecutar controles frescos**

```powershell
pnpm run check:supabase-migrations
pnpm exec vitest run scripts/__tests__/supabase-migration-workdir.test.ts scripts/__tests__/trainer-security-preflight.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts --maxWorkers=1
pnpm type-check
pnpm lint
git diff --check
```

- [ ] **Step 2: Revisar alcance y secretos**

Inspeccionar `git status`, `git diff --stat`, el diff completo y buscar patrones de secretos.
Confirmar que no están staged `infra/supabase/.temp`, `.env.local`, `.artifacts` ni cambios
ajenos del checkout principal.

- [ ] **Step 3: Commit de implementación**

```powershell
git add .gitignore README.md package.json pnpm-lock.yaml infra scripts/lib/supabase-migration-workdir.mjs scripts/__tests__/supabase-migration-workdir.test.ts docs/superpowers
git commit -m "chore(supabase): establish tracked migration baseline"
```

- [ ] **Step 4: Integrar y publicar**

Verificar que `origin/main` no avanzó. Integrar los commits de la rama aislada sin sobrescribir
cambios concurrentes, volver a ejecutar los controles relevantes en `main` y hacer push normal
a `origin/main`. Nunca usar force-push.
