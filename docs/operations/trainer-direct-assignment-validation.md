# Validación de asignación directa — 7 de septiembre de 2026

La asignación incorpora una rutina a la biblioteca del cliente sin aceptación ni cambio automático de principal. La misma plantilla no se duplica mientras permanezca asignada; otras plantillas pueden coexistir y una rutina eliminada puede asignarse de nuevo mediante una solicitud nueva. Las versiones y sesiones históricas permanecen conservadas.

La selección y la eliminación se autorizan por propiedad del plan. La prescripción profesional mantiene sus bloqueos de edición, ajuste y regeneración. Crear un plan personal nuevo usa una familia independiente y la selección explícita ya autorizada, sin modificar la prescripción profesional. El cumplimiento usa los periodos reales de selección, no el tiempo que una rutina estuvo guardada sin utilizarse.

## Comprobaciones locales

| Comprobación | Resultado |
| --- | --- |
| `pnpm exec vitest run --maxWorkers=2` | 306 archivos y 2.838 pruebas correctas, incluidos los proyectos de unidad y navegador. |
| `pnpm test:db:direct-assignment` | 188 aserciones pgTAP correctas sobre el baseline y las migraciones activas en un PostgreSQL desechable. |
| Auditoría existente sobre el esquema activo | 38 garantías actuales correctas; dos casos del backfill histórico 045 se excluyeron explícitamente porque requieren fixtures anteriores al baseline consolidado. |
| `pnpm type-check` | Correcto. |
| `pnpm lint` | Sin errores; permanecen tres advertencias anteriores en archivos ajenos a este cambio. |
| Compilación Next.js con webpack | Compilación, TypeScript, datos de páginas y generación estática completados. |
| `pnpm check:supabase-migrations` | Tres migraciones activas válidas, exclusivamente en `infra/supabase/migrations`. |

Las pruebas SQL reproducen los fallos anteriores con `session_user=authenticator` y `current_user=authenticated`, sin sustituir al usuario por service role. Cubren permisos y consentimiento, duplicados concurrentes, eliminación simultánea con finalización/revocación, selección, creación personal, revisiones, continuidad de sesiones, limpieza de fixtures estrictamente delimitada y repetición de la migración con huellas de datos intactas.

Las capturas de 360 y 1280 px muestran los componentes reales de asignación y biblioteca, con y sin principal, incluyendo varias rutinas, selección y eliminación con confirmación/cancelación. Las pruebas verifican nombres visibles, ausencia de desbordamiento y controles de al menos 44 px. Los límites de navegación y acciones están simulados; estas capturas no sustituyen una prueba de cuentas reales.

La conexión HTTP de Node a Google Fonts devolvió `EACCES` en esta máquina. Para verificar la compilación se descargaron mediante curl las dos familias reales y se comprobaron los 16 archivos WOFF2; el mecanismo de respuestas locales de Next leyó esos bytes. No se modificó la configuración de fuentes de la aplicación ni se usaron fuentes ficticias. Las variables del proyecto se cargaron en memoria antes de lanzar el CLI normal, evitando propagar `--env-file` a los procesos de Next.

## Límite de la evidencia

Estas pruebas solo escriben fixtures locales. La aplicación remota se acredita por separado mediante el registro de migración, `trainer_security_preflight() = 60` bajo el rol autenticado y la comparación de los cuerpos y propietarios de las 19 funciones con la migración revisada. Un push de Git por sí solo no acredita el despliegue de la base de datos ni una prueba con clientes reales.

La limitación heredada de lectura de `plan_generation_events` se describe en el [procedimiento de migración](trainer-direct-assignment-migration.md); este cambio conserva esa política y no amplía permisos.
