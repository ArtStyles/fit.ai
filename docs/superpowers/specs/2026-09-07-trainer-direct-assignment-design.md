# Asignación directa de rutinas del entrenador

Diseño aprobado en la conversación: el entrenador asigna una rutina directamente a cualquiera de sus clientes activos; no hay aceptación de rutina. El cliente la recibe en su biblioteca sin cambiar su plan principal, puede elegir usarla y puede eliminarla. La misma rutina no se duplica mientras siga asignada; después de eliminarla se puede volver a asignar. Varias rutinas distintas pueden coexistir.

## Contrato

- La relación de acompañamiento y el consentimiento de datos siguen siendo necesarios. Eliminar la aceptación de una rutina no crea relaciones ni permisos de lectura nuevos.
- Una asignación disponible no equivale a `workout_plans.is_active`. Este último indica exclusivamente la elección principal del cliente.
- La identidad de duplicado es entrenador + cliente + plantilla de origen, no el nombre de la rutina, ni todas las rutinas del cliente. Debe protegerse en una operación atómica, incluyendo peticiones concurrentes.
- Reintentar la misma solicitud devuelve el mismo resultado. Eliminar y volver a asignar usa una nueva solicitud y crea una copia nueva. Un reintento antiguo no resucita una rutina eliminada.
- Eliminar significa retirar de la biblioteca, cerrar la asignación y conservar versiones, entrenamientos y pruebas históricas. Si era la principal se selecciona otra disponible, si existe; si no existe queda sin principal.
- El cliente puede elegir y cambiar entre planes personales y profesionales. La prescripción profesional sigue bloqueada para editar ejercicios; ese bloqueo no bloquea la biblioteca ni la eliminación.
- Crear un plan personal nuevo, manual o generado, crea una familia independiente incluso si la principal es profesional. Elegir activar ese nuevo plan conserva la copia del entrenador; regenerar o ajustar su prescripción continúa prohibido.
- Una revisión del entrenador conserva si esa rutina era principal. No debe apropiarse de la selección de otra rutina.
- El seguimiento de cumplimiento cuenta la programación solo durante los periodos en que el cliente eligió usar la rutina; recibirla y guardarla sin usar no genera incumplimientos. Cambiar de rutina no borra sesiones ya completadas.
- Pausar/finalizar/reactivar acompañamiento debe manejar varias asignaciones y conservar la selección del cliente. La cancelación por eliminación impide futuras revisiones sobre esa asignación.
- Compatibilidad: clientes antiguos que llaman al envío de propuestas deben recibir la misma asignación directa. Las propuestas pendientes válidas existentes se convierten en asignaciones disponibles sin activar planes. Las inválidas se cierran sin perder evidencia. No duplicar copias ni falsear aceptación del cliente.
- Mantener RLS, controles de cuenta/entrenador activo, integridad recíproca, historial de sesiones e idempotencia. No sustituir el cliente autenticado por service role.

## Causa reproducida

Con el baseline real y las funciones propiedad de postgres, el envío pasa usando `session_user=supabase_admin` y falla usando `session_user=authenticator`, `current_user=authenticated`, con `PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN`. `guard_plan_lifecycle_mutation` rechaza que el entrenador cree el plan del cliente. `enforce_plan_family_limit` también contiene una validación de propietario incompatible. La función remota coincide con la migración histórica 059 y las guardas se verificaron por lectura remota. La prueba usó únicamente datos ficticios en Docker.

## Validación

Pruebas PostgreSQL sobre el baseline activo, con conexión equivalente a PostgREST, cubren asignación, duplicados concurrentes, múltiples plantillas, retirar/reasignar, elección de principal, revisiones, pausas, clientes ajenos, falsificación de banderas y conservación de sesiones. Pruebas de acciones y navegador cubren envío directo, selección de cliente, mensajes, biblioteca con/sin principal y controles accesibles en móvil/escritorio.

No aplicar cambios de datos remotos durante las pruebas. La migración se añade solo a la línea activa de `infra/supabase/migrations`; no ejecutar el historial de migraciones como despliegue.
