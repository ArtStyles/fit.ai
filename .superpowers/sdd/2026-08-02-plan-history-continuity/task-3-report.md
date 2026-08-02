# Task 3 — ciclo de vida atómico y versionado de planes

## Resultado

Se implementó el ciclo de vida de planes sin borrado físico. Cada regeneración o ajuste crea una versión nueva, conserva la familia del plan sustituido y cambia el plan activo dentro de una única transacción protegida por usuario. El commit de implementación es `2c057bd` (`feat(plans): make plan lifecycle atomic and versioned`).

## Decisiones de implementación

- Se añadió `037_atomic_plan_lifecycle.sql` con las RPC `create_engine_plan_v2`, `activate_plan_version`, `retire_plan_family` y `create_manual_plan_atomic`.
- Todas las transiciones validan `auth.uid()`, pertenencia del recurso y toman `pg_advisory_xact_lock` por usuario antes de modificar el plan activo.
- `create_engine_plan_v2` usa `generation_request_id` como clave idempotente, valida `expected_parent_plan_id`, hereda `family_id` en reemplazos y supersede la versión anterior sin eliminarla.
- La RPC anterior `create_engine_plan` queda revocada para usuarios autenticados, cerrando la ruta que podía saltarse las garantías nuevas.
- El límite free cuenta como máximo dos familias vigentes: las versiones supersedidas o familias retiradas no consumen cupo.
- Retirar una familia sólo marca sus versiones con `retired_at`; no borra planes, workouts, progreso ni logs. Si era la familia activa, activa de forma atómica otra cabeza vigente cuando existe.
- La aplicación consulta únicamente cabezas no retiradas/no supersedidas en biblioteca y límites. Los errores de consulta son fatales, no se interpretan como listas vacías.
- Cada intento persistente de UI genera un UUID estable una sola vez; preview no consume ID. Los ajustes quedan ligados al padre previsualizado para detectar carreras A→B.
- Tras una RPC exitosa, la acción nunca comunica fallo aunque falle la recarga de metadatos: devuelve éxito con el ID confirmado y evita un reintento con UUID nuevo que duplique la operación.
- Se sustituyó el borrado visual por una confirmación explícita de archivado que informa que el historial permanece intacto.

## TDD y revisión

Se observaron fallos antes de implementar para:

- resolución de familia/padre y conteo de entitlements;
- ausencia de la migración y contratos RPC;
- propagación estable de request ID en UI;
- carrera entre preview y aplicación de ajustes;
- bypass por la RPC heredada;
- replay bloqueado por precondiciones de aplicación;
- respuesta falsa de error después de un commit confirmado.

Todos quedaron verdes tras los cambios. La revisión independiente señaló primero el bypass heredado y el orden incorrecto del replay idempotente; ambos se corrigieron. Una segunda revisión detectó el posible falso fallo post-commit; también se corrigió. El veredicto final fue: sin hallazgos Critical o Important.

## Verificación final

- `pnpm exec vitest run src/lib/plans/__tests__/entitlements.test.ts src/lib/plans/__tests__/lifecycle.test.ts src/components/plan/__tests__/planStructure.test.ts`: 3 archivos, 31 pruebas pasadas.
- `pnpm test`: 107 archivos, 833 pruebas pasadas.
- `pnpm type-check`: correcto.
- `pnpm lint`: correcto.
- `pnpm build`: correcto; 37 páginas generadas. Sólo aparecieron avisos ya existentes de Browserslist/Tailwind.
- `git diff --check`: correcto.
- Escaneo de `037_atomic_plan_lifecycle.sql`: sin `DELETE FROM`, `TRUNCATE` ni alteraciones de `progress_logs`/`exercise_logs`.
- No se añadieron dependencias de runtime.

## Riesgo y despliegue

No fue posible ejecutar la migración contra una instancia local de Postgres/Supabase porque este entorno no tiene Supabase CLI/configuración local utilizable ni un daemon Docker activo. La migración quedó cubierta por pruebas de contrato estáticas y revisión de código, pero debe probarse en una base de staging antes de producción.

La migración y la aplicación deben desplegarse coordinadamente: `037` revoca la ejecución autenticada de la RPC v1 y la aplicación nueva consume exclusivamente `create_engine_plan_v2`.
