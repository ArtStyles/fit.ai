# Migración de asignación directa de rutinas

La migración activa es `infra/supabase/migrations/20260907190000_trainer_direct_assignment.sql`. Se aplica sobre el baseline remoto consolidado y las migraciones posteriores de `infra`, nunca ejecutando el historial de `supabase/migrations` como despliegue.

## Contrato de la biblioteca

- `assign_trainer_program(relationship_id, template_id, change_summary, idempotency_key)` asigna una copia completa y disponible, sin cambiar `workout_plans.is_active`.
- `propose_trainer_assignment` conserva la firma anterior y delega a la asignación directa. La misma plantilla del mismo entrenador al mismo cliente tiene una sola copia retenida, incluyendo estados `active` y `frozen`.
- Cada clave de solicitud queda vinculada al destinatario, plantilla y resultado originales en `private.trainer_assignment_requests`, sin acceso de los roles de la API. Reutilizarla con otro destinatario o plantilla devuelve `TRAINER_ASSIGNMENT_IDEMPOTENCY_MISMATCH`. Incluso una clave alternativa que encontró una copia existente conserva ese resultado después de retirarla. Una solicitud nueva permite reasignar tras la retirada.
- `accept_trainer_assignment` es una entrada de compatibilidad de lectura: devuelve una asignación disponible del cliente, sin aceptación, notificación de aceptación ni selección automática. Una copia retirada devuelve `TRAINER_ASSIGNMENT_NOT_AVAILABLE`.
- `activate_plan_version` permite elegir planes personales y profesionales disponibles. La prescripción profesional sigue bloqueada para cambios directos.
- `remove_trainer_assignment(plan_id)` retira todas las versiones de la asignación, la cancela y conserva versiones, planes, entrenamientos, sesiones y auditoría. Si contenía la principal, elige otra disponible; si no existe, deja la biblioteca sin principal.
- La revisión conserva la elección principal de esa asignación. La pausa y la finalización congelan todas las asignaciones retenidas; la reanudación restaura todas sin cambiar la principal ni reabrir las canceladas. Las copias congeladas continúan disponibles para el cliente.
- Los informes calculan la programación desde los intervalos reales de selección guardados en `private.trainer_plan_selection_periods`. Una rutina recibida el lunes y elegida el viernes no prescribe lunes-jueves. Cambiar de principal cierra el intervalo anterior; volver a una rutina abre otro sin duplicar sus entrenamientos. La evidencia de sesiones se conserva para otras asignaciones y para las retiradas, siempre sujeta a relación y consentimiento activos. Para un plan profesional ya principal al migrar se recupera el inicio conocido por aceptación/revisión; no se inventan elecciones históricas de copias que nunca fueron aceptadas.

## Datos existentes y permisos

Las propuestas pendientes válidas se convierten utilizando sus copias existentes, sin activar planes ni rellenar `accepted_at` o `acceptance_idempotency_key`. Las inválidas y duplicadas se cancelan y retiran conservando evidencia. Se retiran también copias de propuestas históricamente canceladas que las versiones anteriores dejaron en la biblioteca. Si existen varias copias retenidas de la misma plantilla, se conserva primero la elegida como principal, después una activa y después la más antigua.

Las guardas `guard_plan_lifecycle_mutation` y `enforce_plan_family_limit` se ejecutan como `SECURITY INVOKER`. Esto permite comprobar el rol real de la operación: la autorización profesional exige `current_user = postgres` dentro del RPC validado y el actor de ciclo de vida correspondiente. Una bandera `app.*` establecida por `authenticated` no concede ese rol. El registro de selección deriva de cambios reales de `is_active`, ya validados por RLS y esas guardas; no acepta flags del cliente. No se utiliza un cliente service role para sustituir al usuario. Se mantienen RLS, integridad recíproca, consentimiento, cuentas activas y límites de familias personales.

## Verificación local reproducible

Requisitos: Node.js del proyecto, Docker Desktop operativo y la imagen `public.ecr.aws/supabase/postgres:17.6.1.121` disponible. No se necesita arrancar el stack completo de Supabase.

```powershell
pnpm test:db:direct-assignment
pnpm check:supabase-migrations
```

El runner crea un contenedor propio, carga el baseline como `postgres`, usa datos ficticios `@example.test` y elimina su contenedor al finalizar. No acepta URL de base de datos ni usa el proyecto enlazado. El bootstrap de `storage.buckets` satisface exclusivamente una dependencia del baseline dentro del contenedor.

En el mismo contenedor comprueba primero la regresión del baseline con `session_user = authenticator` y `current_user = authenticated`: `PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN`. Luego aplica las migraciones activas y prueba el flujo completo con esa misma identidad de API. Para ejecutar únicamente la reproducción roja:

```powershell
node scripts/test-trainer-direct-assignment-db.mjs --red-only
```

La suite incluye coexistencia, claves originales y alternativas, destinatario incorrecto, plantilla incompleta, duplicado concurrente con dos conexiones, selección, retirada/reasignación, revisiones, pausas, finalización/reanudación, cuentas inactivas, flags falsificadas, permisos anónimos, límites personales e informes. Una sesión iniciada antes de la revisión/retirada se completa mediante `save_session_log_atomic_v3` y permanece en los informes. La migración se ejecuta otra vez con asignaciones retenidas, retiradas y sesiones completas para comprobar su conservación.

## Aplicación y comprobación remota

Esta implementación y sus pruebas no aplican cambios al proyecto remoto. Cuando el despliegue de esta migración esté autorizado, usar el circuito activo existente:

```powershell
pnpm supabase:migrations:dry-run
pnpm supabase:migrations:push
```

Después, verificar como usuario autenticado `public.trainer_security_preflight() = 60` y el flujo de una cuenta de prueba autorizada: asignación disponible, principal conservada, selección explícita, retirada y solicitud nueva. Un commit, un push de Git o una prueba local no demuestran aplicación remota. Ante un incidente se corrige mediante otra migración hacia delante; no se borran asignaciones, versiones ni sesiones para revertir la biblioteca.
