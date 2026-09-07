# Migración de asignación directa de rutinas

La migración activa es `infra/supabase/migrations/20260907190000_trainer_direct_assignment.sql`. Se aplica sobre el baseline remoto consolidado y las migraciones posteriores de `infra`, nunca ejecutando el historial de `supabase/migrations` como despliegue.

## Contrato de la biblioteca

- `assign_trainer_program(relationship_id, template_id, change_summary, idempotency_key)` asigna una copia completa y disponible, sin cambiar `workout_plans.is_active`.
- `propose_trainer_assignment` conserva la firma anterior y delega a la asignación directa. La misma plantilla del mismo entrenador al mismo cliente tiene una sola copia retenida, incluyendo estados `active` y `frozen`.
- Cada clave de solicitud queda vinculada al destinatario, plantilla y resultado originales en `private.trainer_assignment_requests`, sin acceso de los roles de la API. Reutilizarla con otro destinatario o plantilla devuelve `TRAINER_ASSIGNMENT_IDEMPOTENCY_MISMATCH`. Incluso una clave alternativa que encontró una copia existente conserva ese resultado después de retirarla. Una solicitud nueva permite reasignar tras la retirada.
- `accept_trainer_assignment` es una entrada de compatibilidad de lectura: devuelve una asignación disponible del cliente, sin aceptación, notificación de aceptación ni selección automática. Una copia retirada devuelve `TRAINER_ASSIGNMENT_NOT_AVAILABLE`.
- `activate_plan_version` permite elegir planes personales y profesionales disponibles. La prescripción profesional sigue bloqueada para cambios directos.
- `create_manual_plan_atomic` y `create_engine_plan_v2` permiten crear una familia personal independiente mientras una copia profesional es principal. La creación manual con `p_make_active=true` y el contexto `first_plan` del motor seleccionan la nueva rutina mediante `activate_plan_version` dentro de la misma transacción; `p_make_active=false` conserva la principal y su intervalo de selección. Ambas RPC conservan su modo invocador, permisos, límites personales y validaciones. La regeneración semanal, la actualización y los ajustes no pueden modificar una prescripción profesional, incluso congelada.
- `remove_trainer_assignment(plan_id)` retira todas las versiones de la asignación, la cancela y conserva versiones, planes, entrenamientos, sesiones y auditoría. Si contenía la principal, elige otra disponible; si no existe, deja la biblioteca sin principal.
- La revisión conserva la elección principal de esa asignación. La pausa y la finalización congelan todas las asignaciones retenidas; la reanudación restaura todas sin cambiar la principal ni reabrir las canceladas. Las copias congeladas continúan disponibles para el cliente.
- Los informes calculan la programación desde los intervalos reales de selección guardados en `private.trainer_plan_selection_periods`. Una rutina recibida el lunes y elegida el viernes no prescribe lunes-jueves. Cambiar de principal cierra el intervalo anterior; volver a una rutina abre otro sin duplicar sus entrenamientos. La evidencia de sesiones se conserva para otras asignaciones y para las retiradas, siempre sujeta a relación y consentimiento activos. En la primera instalación se recuperan los intervalos conocidos de versiones heredadas aceptadas, incluidas las sustituidas y las retenidas congeladas: inicio por aceptación/revisión y final real `effective_to`. Solo una copia todavía principal y disponible permite recuperar un intervalo abierto. Una copia inactiva sin final conocido no permite reconstruir ese intervalo; una propuesta nunca aceptada no aporta elecciones históricas.

## Datos existentes y permisos

Las propuestas pendientes válidas se convierten utilizando sus copias existentes, sin activar planes ni rellenar `accepted_at` o `acceptance_idempotency_key`. Las inválidas y duplicadas se cancelan y retiran conservando evidencia. Se retiran también copias de propuestas históricamente canceladas que las versiones anteriores dejaron en la biblioteca. Si existen varias copias retenidas de la misma plantilla, se conserva primero la elegida como principal, después una activa y después la más antigua.

La creación de la tabla privada de selección y su backfill ocurren en la misma transacción y antes de reparar propuestas o duplicados. La existencia de esa tabla marca la primera instalación, incluso si contiene cero filas: repetir la migración conserva sus periodos y no vuelve a interpretar los tiempos de disponibilidad como elecciones. Esto incluye asignaciones directas nunca seleccionadas y revisiones posteriores sin selección de asignaciones heredadas aceptadas. El trigger de selección ya está instalado durante la reparación y cierra cualquier periodo abierto de una copia que se retire.

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

El total es de 207 aserciones pgTAP: las 188 originales y 19 de historia heredada. Tras las pruebas originales, el runner reinicia exclusivamente su contenedor desechable y carga otro baseline limpio. Crea versiones aceptadas/sustituidas y congeladas, guarda sesiones mediante las RPC reales bajo el rol de API y compara los informes antes/después de migrar. Otras 29 aserciones ejecutan los adaptadores reales de detalle/resumen y verifican denominadores, cumplimiento y clasificación prescrita. Las comparaciones de huellas comprueban las filas inmutables iniciales y, tras revisiones posteriores sin selección, todas las filas históricas y los payloads exactos de ambas RPC al repetir la migración. Un último caso vacía solo el registro del fixture para acreditar que su existencia, y no su número de filas, impide repetir el backfill. La reproducción aislada de estos casos usa:

```powershell
node scripts/test-trainer-direct-assignment-db.mjs --history-only
```

La fase de creación personal usa fixtures aislados y las RPC reales como `authenticator/authenticated`: comprueba familias sin padre profesional, selección opcional, límites e idempotencia, regeneración y ajustes personales, cuentas inactivas y rollback de entradas inválidas. Compara las prescripciones, entrenamientos, ejercicios, asignaciones y versiones profesionales antes y después, y verifica los intervalos privados con lecturas administrativas. También conserva exactamente propietario, modo invocador, `search_path`, ACL y valores predeterminados de ambas firmas respecto al baseline; el preflight rechaza convertirlas en `SECURITY DEFINER`.

Limitación heredada del baseline: `plan_generation_events` tiene RLS sin política de lectura para `authenticated`. Las RPC invocadoras conservan sus consultas originales de frecuencia, que no ven esos eventos bajo ese rol; esta integración no cambia esa política ni amplía permisos. La suite verifica administrativamente los eventos persistidos y prueba con el rol de API los límites de familias personales y la idempotencia.

## Aplicación y comprobación remota

Esta implementación y sus pruebas no aplican cambios al proyecto remoto. Cuando el despliegue de esta migración esté autorizado, usar el circuito activo existente:

```powershell
pnpm supabase:migrations:dry-run
pnpm supabase:migrations:push
```

Después, verificar como usuario autenticado `public.trainer_security_preflight() = 60` y el flujo de una cuenta de prueba autorizada: asignación disponible, principal conservada, selección explícita, retirada y solicitud nueva. Un commit, un push de Git o una prueba local no demuestran aplicación remota. Ante un incidente se corrige mediante otra migración hacia delante; no se borran asignaciones, versiones ni sesiones para revertir la biblioteca.
